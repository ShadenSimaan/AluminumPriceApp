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
import { describeConfigurationShort, dict, fmt } from "../rfq/i18n";
import { OPENING_TYPE_DEFS } from "../rfq/presets";
import type { RfqItem, RfqUnit } from "../rfq/types";
import { lineItemFromWindow } from "./windowLine";

export type WindowImportResult = {
  lines: LineItem[];
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
  profileText = ""
): { line: LineItem; matchedProfile: boolean } {
  const profile = matchProfile(profileText, profiles) ?? (profileText.trim() ? undefined : matchProfile(item.frameFinish, profiles));
  const d = dict("he");
  const details = [d.openingType[item.openingType], describeConfigurationShort("he", item), item.glass.trim(), item.notes.trim()]
    .filter(Boolean)
    .join(" · ");
  const line = lineItemFromWindow(item, addons, {
    profileId: profile?.id,
    profileName: profile?.name || profileText.trim() || item.frameFinish,
    unitPrice: profile ? String(profile.unitPrice) : "0",
    priceBasis: profile ? "per_m2" : "per_unit",
    details,
  });
  return { line, matchedProfile: Boolean(profile) };
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
    return { lines: [], unit: null, needsReview: false, message: fileErrorMessage(error) };
  }
  const sheetIdx = Math.max(0, parsed.sheets.findIndex((sheet) => sheet.rows.some((row) => row.some((cell) => cell.trim()))));
  const sheet = parsed.sheets[sheetIdx];
  if (!sheet?.rows.length) {
    return { lines: [], unit: null, needsReview: false, message: dict("he").imp.noRows };
  }
  const headerRow = firstNonEmptyRow(sheet.rows);
  const analysis = analyzeSheet(sheet.rows, headerRow);
  const missing = QUOTE_REQUIRED.filter((field) => analysis.mapping[field] == null);
  if (missing.length) {
    const names = missing.map((field) => FIELD_LABELS[field].he).join(", ");
    return {
      lines: [],
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
    return { lines: [], unit, needsReview: false, message: dict("he").imp.noRows };
  }
  const results = validateImportRows(prepared, { unit, existingReferences: input.existingReferences, mode: "append" });
  const lines: LineItem[] = [];
  const skipped: string[] = [];
  let unmatchedProfiles = 0;
  prepared.forEach((row, index) => {
    if (row.blank || !row.include) return;
    const result = results[index];
    if (result.errors.length || !result.item) {
      skipped.push(`שורה ${row.rowNumber}: ${reasonText(result.errors)}`);
      return;
    }
    const profileText = row.values.profile?.trim() ?? "";
    const built = quoteLineFromWindow(result.item, input.addons, input.profiles, profileText);
    if (profileText && !built.matchedProfile) unmatchedProfiles += 1;
    lines.push(built.line);
  });
  if (!lines.length) {
    const detail = skipped.slice(0, 3).join(" ");
    return {
      lines: [],
      unit,
      needsReview: true,
      message: detail ? `אף חלון לא יובא. ${detail}` : dict("he").imp.nothingToImport,
    };
  }
  const unitNote = analysis.detectedUnit ? "" : unit === "mm" ? " המידות נקראו במ״מ." : " המידות נקראו בס״מ.";
  const skipNote = skipped.length ? ` ${skipped.length} שורות דולגו (${skipped.slice(0, 2).join(" · ")}).` : "";
  const profileNote =
    unmatchedProfiles > 0 ? ` ${unmatchedProfiles} חלונות בלי פרופיל תואם במחירון — אפשר להחליף פרופיל אחר כך.` : "";
  const noun = lines.length === 1 ? "חלון אחד נוסף" : `${lines.length} חלונות נוספו`;
  return {
    lines,
    unit,
    needsReview: false,
    message: `${noun} להצעה.${unitNote}${skipNote}${profileNote}`.replace(/\s+/g, " ").trim(),
  };
}

/** Header the quotation importer reads. Width and height are centimetres. */
export const WINDOW_IMPORT_CSV_HEADER =
  "מיקום,סוג פתיחה,רוחב (ס״מ),גובה (ס״מ),כמות,פרופיל,זכוכית,מספר חלקים,חלקים קבועים,צד צירים,כיוון פתיחה";

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

export function windowImportSampleCsv(profileNames: string[]): string {
  const profile = profileNames.find((name) => name.trim()) ?? "";
  return [
    WINDOW_IMPORT_CSV_HEADER,
    `סלון,חלון הזזה,180,140,2,${profile},6-16-6,2,,,`,
    `מטבח,חלון ציר עליון,80,50,1,${profile},,,,`,
    `כניסה,דלת הזזה,360,230,1,${profile},,,1,`,
  ].join("\n");
}

/** Instructions to paste into ChatGPT so it rewrites a raw list into this CSV. */
export function windowImportChatPrompt(profileNames: string[]): string {
  const profiles = profileNames.map((name) => name.trim()).filter(Boolean);
  const profileRule = profiles.length
    ? `פרופיל: אחד מהשמות הבאים, בדיוק כפי שהוא כתוב. אם אין התאמה, השאר את התא ריק.\n${profiles.map((name) => `- ${name}`).join("\n")}`
    : "פרופיל: השאר ריק, אלא אם הרשימה מציינת שם פרופיל מפורש.";
  return [
    "סדר את רשימת החלונות והדלתות שאדביק בסוף לקובץ CSV לייבוא לתוכנת הצעת מחיר.",
    "החזר רק את תוכן ה-CSV, בלי הסבר ובלי טבלה. השורה הראשונה היא הכותרת, בדיוק כך:",
    WINDOW_IMPORT_CSV_HEADER,
    "",
    "כללים:",
    "- שורה אחת לכל חלון או דלת. אל תוסיף פריטים שלא מופיעים ברשימה, ואל תשנה מידות.",
    "- רוחב וגובה הם מספרים בסנטימטרים בלבד, בלי לכתוב יחידה בתוך התא.",
    "- כמות היא מספר שלם. אם לא צוינה כמות, כתוב 1.",
    `- סוג פתיחה חייב להיות אחד מהערכים האלה, בלי מילים נוספות: ${WINDOW_IMPORT_OPENING_TYPES.join(" | ")}.`,
    "- מספר הכנפיים נכתב בעמודת מספר חלקים, לא בתוך סוג הפתיחה.",
    "- חלקים קבועים: מספרי החלקים משמאל במבט מבחוץ, למשל 1 או 1,4. השאר ריק אם אין.",
    "- צד צירים: ימין או שמאל. כיוון פתיחה: פנימה או החוצה. השאר ריק אם לא צוין.",
    "- זכוכית: הרכב במ״מ כמו 6-16-6, או תיאור קצר. השאר ריק אם לא צוין.",
    `- ${profileRule}`,
    "- מיקום: שם החדר.",
    "",
    "דוגמה:",
    windowImportSampleCsv(profiles),
    "",
    "הרשימה שלי:",
  ].join("\n");
}
