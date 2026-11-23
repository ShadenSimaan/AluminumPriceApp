// Turn a window schedule (CSV / Excel) into quotation lines with a real opening layout.
import type { Addon, LineItem, Profile } from "../types";
import type { ImportRow, RowMessage } from "../rfq/import/importer";
import {
  analyzeSheet,
  buildImportRows,
  firstNonEmptyRow,
  ImportFileError,
  MAX_FILE_MB,
  MAX_ROWS,
  parseImportBytes,
  validateImportRows,
} from "../rfq/import/importer";
import { FIELD_LABELS, normKey, parseOpeningType, type ImportField } from "../rfq/import/schema";
import { parseMakeup } from "../rfq/glass";
import { dict, fmt } from "../rfq/i18n";
import { createRfqItem, OPENING_TYPE_DEFS } from "../rfq/presets";
import { rfqUuid } from "../rfq/rfqState";
import type { RfqItem, RfqUnit } from "../rfq/types";
import { lineItemFromWindow, withSubtotal } from "./windowLine";

export type WindowImportDraft = {
  line: LineItem;
  /** Add-on names from the file that are not in the price list. They are not written into פרטים. */
  unmatchedAddons: string[];
  /** Opening-type text from the file when it could not be applied. The preview lets you choose one. */
  rawOpening?: string;
};

export type WindowImportResult = {
  lines: LineItem[];
  drafts: WindowImportDraft[];
  skipped: string[];
  /** Unit used when the file itself does not name one. Null when the file could not be read. */
  unit: RfqUnit | null;
  /** Open the column-mapping dialog: nothing could be added, but the file itself is readable. */
  needsReview: boolean;
  message: string;
};

const QUOTE_REQUIRED: ImportField[] = ["openingType", "width", "height"];

/** Fill category, quantity and a glass make-up when the schedule leaves them implicit. */
export function relaxQuoteImportRows(rows: ImportRow[]): ImportRow[] {
  return rows.map((row) => {
    if (row.blank) return row;
    const values = { ...row.values };
    if (!(values.quantity ?? "").trim()) values.quantity = "1";
    if (!(values.category ?? "").trim() && values.openingType) {
      const parsed = parseOpeningType(values.openingType);
      const category = parsed.ok ? OPENING_TYPE_DEFS[parsed.value].category : null;
      if (category) values.category = category;
    }
    if (!(values.glassMakeup ?? "").trim() && values.glass && parseMakeup(values.glass)) {
      values.glassMakeup = values.glass;
    }
    return { ...row, values };
  });
}

function numericDimension(raw: string): number | null {
  const match = raw.trim().match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const n = Number(match[0].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** mm when a size is large enough that centimetres would be implausible; otherwise the quotation unit. */
export function inferDimensionUnit(rows: string[][], headerRow: number, widthCol: number | undefined, heightCol: number | undefined, fallback: RfqUnit): RfqUnit {
  const nums: number[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    for (const col of [widthCol, heightCol]) {
      if (col == null) continue;
      const n = numericDimension(String(rows[r]?.[col] ?? ""));
      if (n != null && n > 0) nums.push(n);
    }
  }
  if (nums.some((n) => n >= 400)) return "mm";
  return fallback;
}

function significantWords(raw: string): string[] {
  return normKey(raw).split(" ").filter((word) => word.length >= 2 && !/^\d+$/.test(word));
}

function matchAddon(raw: string, addons: Addon[]): Addon | undefined {
  const key = normKey(raw);
  if (key.length < 2) return undefined;
  const exact = addons.find((addon) => normKey(addon.name) === key);
  if (exact) return exact;
  const contains = addons.filter((addon) => {
    const name = normKey(addon.name);
    return name.length >= 2 && (name.includes(key) || key.includes(name));
  });
  if (contains.length === 1) return contains[0];
  const words = significantWords(raw);
  if (!words.length) return undefined;
  const byWords = addons.filter((addon) => {
    const nameWords = significantWords(addon.name);
    if (!nameWords.length) return false;
    const tokenInName = words.every((word) => nameWords.some((name) => name.includes(word) || word.includes(name)));
    const nameInToken = nameWords.every((name) => words.some((word) => word.includes(name) || name.includes(word)));
    return tokenInName || nameInToken;
  });
  return byWords.length === 1 ? byWords[0] : undefined;
}

function matchedAddonIds(addonText: string, rowText: string, addons: Addon[]): { ids: Set<string>; unmatched: string[] } {
  const ids = new Set<string>();
  const unmatched: string[] = [];
  for (const name of splitAddonNames(addonText)) {
    const addon = matchAddon(name, addons);
    if (addon) ids.add(addon.id);
    else unmatched.push(name);
  }
  const haystack = normKey(rowText);
  for (const addon of addons) {
    const name = normKey(addon.name);
    if (name.length >= 2 && haystack.includes(name)) ids.add(addon.id);
  }
  return { ids, unmatched };
}

function splitAddonNames(raw: string): string[] {
  return raw
    .split(/[,;|\n+]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function matchProfile(raw: string, profiles: Profile[]): Profile | undefined {
  const key = normKey(raw);
  if (!key) return undefined;
  const exact = profiles.find((profile) => normKey(profile.name) === key);
  if (exact) return exact;
  const hits = profiles.filter((profile) => normKey(profile.name).split(" ").includes(key));
  return hits.length === 1 ? hits[0] : undefined;
}

function reasonText(messages: RowMessage[]): string {
  const d = dict("he");
  return messages
    .slice(0, 2)
    .map((message) => {
      const params = { ...(message.params ?? {}) };
      if (typeof params.field === "string" && params.field in FIELD_LABELS) {
        params.field = FIELD_LABELS[params.field as ImportField].he;
      }
      const table = (message.source === "issue" ? d.issue : d.imp) as Record<string, string>;
      return fmt(table[message.key] ?? message.key, params);
    })
    .join("; ");
}

export function quoteLineFromWindow(
  item: RfqItem,
  addons: Addon[],
  profiles: Profile[],
  profileText = "",
  addonText = "",
  rowText = ""
): { line: LineItem; matchedProfile: boolean; unmatchedAddons: string[] } {
  const profile = matchProfile(profileText, profiles) ?? (profileText.trim() ? undefined : matchProfile(item.frameFinish, profiles));
  const matched = matchedAddonIds(addonText, rowText || addonText, addons);
  const base = lineItemFromWindow(item, addons, {
    profileId: profile?.id,
    profileName: profile?.name || profileText.trim() || item.frameFinish,
    unitPrice: profile ? String(profile.unitPrice) : "0",
    priceBasis: "per_m2",
    details: "",
  });
  const withAddons = withSubtotal({
    ...base,
    addons: base.addons.map((addon) => ({ ...addon, checked: matched.ids.has(addon.id) })),
  });
  return { line: withAddons, matchedProfile: Boolean(profile), unmatchedAddons: matched.unmatched };
}

function cmFromCell(raw: string | undefined, unit: RfqUnit): number | null {
  const n = numericDimension(raw ?? "");
  if (n == null || n <= 0) return null;
  return unit === "mm" ? Math.round((n / 10) * 1000) / 1000 : n;
}

/** A row the validator could not finish still becomes an editable preview line. */
function incompleteQuoteLine(
  row: ImportRow,
  unit: RfqUnit,
  addons: Addon[],
  profiles: Profile[],
  rawText = ""
): WindowImportDraft & { matchedProfile: boolean } {
  const values = row.values;
  const parsed = values.openingType ? parseOpeningType(values.openingType) : null;
  const opening = parsed?.ok ? parsed.value : null;
  const width = cmFromCell(values.width, unit);
  const height = cmFromCell(values.height, unit);
  const qtyRaw = numericDimension(values.quantity ?? "");
  const qty = qtyRaw != null && qtyRaw > 0 ? String(Math.round(qtyRaw)) : "1";
  const profileText = values.profile?.trim() ?? "";
  const profile = matchProfile(profileText, profiles);
  const rowText = `${Object.values(values).join("\n")}\n${rawText}`;
  const matched = matchedAddonIds(values.addons ?? "", rowText, addons);
  const pricedAddons = addons.map((addon) => ({ ...addon, checked: matched.ids.has(addon.id) }));
  if (!opening) {
    const line = withSubtotal({
      id: rfqUuid(),
      widthCm: width != null ? String(width) : "",
      heightCm: height != null ? String(height) : "",
      qty,
      profileId: profile?.id,
      profileName: profile?.name || profileText || undefined,
      unitPrice: profile ? String(profile.unitPrice) : "0",
      priceBasis: "per_m2",
      location: values.location ?? "",
      details: "",
      addons: pricedAddons,
      subtotal: 0,
    });
    return { line, unmatchedAddons: matched.unmatched, rawOpening: (values.openingType ?? "").trim(), matchedProfile: Boolean(profile) };
  }
  const item = createRfqItem({
    id: rfqUuid(),
    openingType: opening,
    category: OPENING_TYPE_DEFS[opening].category ?? "window",
    unit,
    reference: "",
    withDefaultSize: false,
  });
  item.widthCm = width;
  item.heightCm = height;
  item.quantity = Math.max(1, Math.round(qtyRaw ?? 1));
  item.location = values.location ?? "";
  const built = quoteLineFromWindow(item, addons, profiles, profileText, values.addons ?? "", rowText);
  return { line: built.line, unmatchedAddons: built.unmatchedAddons, matchedProfile: built.matchedProfile };
}

function fileErrorMessage(error: unknown): string {
  const d = dict("he");
  if (error instanceof ImportFileError) return fmt(d.imp[error.key], { mb: MAX_FILE_MB, rows: MAX_ROWS, msg: error.detail });
  return fmt(d.imp.readFailed, { msg: error instanceof Error ? error.message : String(error) });
}

export function importWindowsFromFile(input: {
  fileName: string;
  bytes: Uint8Array;
  profiles: Profile[];
  addons: Addon[];
  existingReferences: string[];
  dimensionUnit: RfqUnit;
}): WindowImportResult {
  let parsed;
  try {
    parsed = parseImportBytes(input.fileName, input.bytes);
  } catch (error) {
    return { lines: [], drafts: [], skipped: [], unit: null, needsReview: false, message: fileErrorMessage(error) };
  }
  const sheetIdx = Math.max(0, parsed.sheets.findIndex((sheet) => sheet.rows.some((row) => row.some((cell) => cell.trim()))));
  const sheet = parsed.sheets[sheetIdx];
  if (!sheet?.rows.length) {
    return { lines: [], drafts: [], skipped: [], unit: null, needsReview: false, message: dict("he").imp.noRows };
  }
  const headerRow = firstNonEmptyRow(sheet.rows);
  const analysis = analyzeSheet(sheet.rows, headerRow);
  const missing = QUOTE_REQUIRED.filter((field) => analysis.mapping[field] == null);
  if (missing.length) {
    const names = missing.map((field) => FIELD_LABELS[field].he).join(", ");
    return {
      lines: [],
      drafts: [],
      skipped: [],
      unit: null,
      needsReview: true,
      message: `לא זוהו העמודות: ${names}. אפשר למפות אותן בחלון שנפתח.`,
    };
  }
  const unit =
    analysis.detectedUnit ??
    inferDimensionUnit(sheet.rows, headerRow, analysis.mapping.width, analysis.mapping.height, input.dimensionUnit);
  const prepared = relaxQuoteImportRows(buildImportRows(sheet.rows, headerRow, analysis.mapping));
  if (!prepared.some((row) => !row.blank)) {
    return { lines: [], drafts: [], skipped: [], unit, needsReview: false, message: dict("he").imp.noRows };
  }
  const results = validateImportRows(prepared, { unit, existingReferences: input.existingReferences, mode: "append" });
  const drafts: WindowImportDraft[] = [];
  const skipped: string[] = [];
  let unmatchedProfiles = 0;
  let missingOpening = 0;
  prepared.forEach((row, index) => {
    if (row.blank || !row.include) return;
    const result = results[index];
    const profileText = row.values.profile?.trim() ?? "";
    const rawText = (sheet.rows[row.rowNumber - 1] ?? []).join("\n");
    const rowText = `${Object.values(row.values).join("\n")}\n${rawText}`;
    const built = result.item
      ? quoteLineFromWindow(result.item, input.addons, input.profiles, profileText, row.values.addons ?? "", rowText)
      : incompleteQuoteLine(row, unit, input.addons, input.profiles, rawText);
    if (!built.line.configuration) {
      missingOpening += 1;
      if (result.errors.length) skipped.push(`שורה ${row.rowNumber}: ${reasonText(result.errors)}`);
    }
    if (profileText && !built.matchedProfile) unmatchedProfiles += 1;
    drafts.push({ line: built.line, unmatchedAddons: built.unmatchedAddons, rawOpening: built.rawOpening });
  });
  const lines = drafts.map((draft) => draft.line);
  if (!lines.length) {
    const detail = skipped.slice(0, 3).join(" ");
    return {
      lines: [],
      drafts: [],
      skipped,
      unit,
      needsReview: true,
      message: detail ? `אף חלון לא יובא. ${detail}` : dict("he").imp.nothingToImport,
    };
  }
  const unitNote = analysis.detectedUnit ? "" : unit === "mm" ? " המידות נקראו במ״מ." : " המידות נקראו בס״מ.";
  const openingNote = missingOpening
    ? missingOpening === 1
      ? " שורה אחת בלי סוג פתיחה — אפשר לבחור אותו בתצוגה."
      : ` ${missingOpening} שורות בלי סוג פתיחה — אפשר לבחור אותו בתצוגה.`
    : "";
  const profileNote =
    unmatchedProfiles > 0 ? ` ${unmatchedProfiles} חלונות בלי פרופיל תואם במחירון.` : "";
  const noun = lines.length === 1 ? "חלון אחד מוכן" : `${lines.length} חלונות מוכנים`;
  return {
    lines,
    drafts,
    skipped,
    unit,
    needsReview: false,
    message: `${noun} לתצוגה המקדימה.${unitNote}${openingNote}${profileNote} אשר/י לפני ההוספה להצעה.`.replace(/\s+/g, " ").trim(),
  };
}

/** Header the quotation importer reads. Width and height are centimetres. */
export const WINDOW_IMPORT_CSV_HEADER =
  "מיקום,סוג פתיחה,רוחב (ס״מ),גובה (ס״מ),כמות,פרופיל,זכוכית,מספר חלקים,חלקים קבועים,צד צירים,כיוון פתיחה,תוספות";

/** Opening-type cells the importer accepts. Kept short so a generated file does not add extra words. */
export const WINDOW_IMPORT_OPENING_TYPES = [
  "חלון הזזה",
  "חלון פתיחה",
  "חלון דרי קיפ",
  "חלון ציר עליון",
  "חלון קבוע",
  "דלת הזזה",
  "דלת ציר",
  "דלת שתי כנפיים",
  "מותאם אישית",
] as const;

export function windowImportSampleCsv(profileNames: string[], addonNames: string[] = []): string {
  const profile = profileNames.find((name) => name.trim()) ?? "";
  const addon = addonNames.find((name) => name.trim()) ?? "";
  return [
    WINDOW_IMPORT_CSV_HEADER,
    `סלון,חלון הזזה,180,140,2,${profile},6-16-6,2,,,,${addon}`,
    `מטבח,חלון ציר עליון,80,50,1,${profile},,,,,,`,
    `כניסה,דלת הזזה,360,230,1,${profile},,,1,,,`,
  ].join("\n");
}

/** File name for the generated CSV: the customer, never a generic "windows" name. */
export function windowImportCsvFileName(customerName: string): string {
  const name = customerName
    .replace(/^לכבוד\s+/, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return name ? `${name}.csv` : "";
}

/** Instructions to paste into ChatGPT so it rewrites a raw list into this CSV. */
export function windowImportChatPrompt(profileNames: string[], addonNames: string[] = [], customerName = ""): string {
  const profiles = profileNames.map((name) => name.trim()).filter(Boolean);
  const addons = addonNames.map((name) => name.trim()).filter(Boolean);
  const fileName = windowImportCsvFileName(customerName);
  const fileRule = fileName
    ? `צור עכשיו קובץ CSV להורדה בשם "${fileName}" וצרף אותו כקובץ. זה שם הלקוח. אל תקרא לקובץ windows.csv.`
    : "צור עכשיו קובץ CSV להורדה וצרף אותו כקובץ. שם הקובץ הוא שם הלקוח כפי שהוא מופיע ברשימה או בקובץ, או אם השם נכתב בטקסט. אל תקרא לקובץ windows.csv ואל תמציא שם. אם לא מופיע שם לקוח, שאל מה השם לפני יצירת הקובץ.";
  const profileRule = profiles.length
    ? `פרופיל: אחד מהשמות הבאים, בדיוק כפי שהוא כתוב. אם אין התאמה, השאר את התא ריק.\n${profiles.map((name) => `- ${name}`).join("\n")}`
    : "פרופיל: השאר ריק, אלא אם הרשימה מציינת שם פרופיל מפורש.";
  const addonRule = addons.length
    ? `תוספות הן מחיר ליחידה, לא חלק מתיאור החלון. כתוב רק שמות מהרשימה, מופרדים בפסיק. אם אין תוספת, השאר ריק.\n${addons.map((name) => `- ${name}`).join("\n")}`
    : "תוספות: השאר ריק.";
  return [
    `${fileRule} אל תדביק טבלה ואל תסתפק בטקסט בתוך הצ׳אט. הקובץ צריך להיפתח ב-Excel.`,
    "השורה הראשונה בקובץ היא הכותרת, בדיוק כך:",
    WINDOW_IMPORT_CSV_HEADER,
    "",
    "כללים:",
    "- שורה אחת לכל חלון או דלת. אל תוסיף פריטים שלא מופיעים ברשימה, ואל תשנה מידות.",
    "- אין עמודת פרטים. אל תיצור עמודה כזו ואל תכתוב תיאור, הערה או הסבר בשום תא. אם משהו לא ברור, השאר את התא ריק.",
    "- רוחב וגובה הם מספרים בסנטימטרים בלבד, בלי לכתוב יחידה בתוך התא.",
    "- כמות היא מספר שלם. אם לא צוינה כמות, כתוב 1.",
    `- סוג פתיחה חייב להיות אחד מהערכים האלה, בלי מילים נוספות: ${WINDOW_IMPORT_OPENING_TYPES.join(" | ")}.`,
    "- מספר הכנפיים נכתב בעמודת מספר חלקים, לא בתוך סוג הפתיחה.",
    "- חלקים קבועים: מספרי החלקים משמאל במבט מבחוץ, למשל 1 או 1,4. השאר ריק אם אין.",
    "- צד צירים: ימין או שמאל. כיוון פתיחה: פנימה או החוצה. השאר ריק אם לא צוין.",
    "- זכוכית: רק הרכב במ״מ כמו 6-16-6. אם אין הרכב כזה, השאר ריק.",
    `- ${profileRule}`,
    `- ${addonRule}`,
    "- אל תכתוב מחירי תוספות בקובץ. רק את השם. המחיר מגיע מהמחירון.",
    "- מיקום: שם החדר. אם אין מיקום, השאר ריק.",
    "",
    "דוגמה לתוכן הקובץ:",
    windowImportSampleCsv(profiles, addons),
    "",
    "הרשימה שלי:",
  ].join("\n");
}
