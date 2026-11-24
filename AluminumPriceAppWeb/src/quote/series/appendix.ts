import type { PdfLineItem } from "../../pdfExporter";
import { dict } from "../../rfq/i18n";
import type { SeriesAppendixSettings } from "../../types";
import { essentialProductSpecRows } from "../customerSpecs";
import { ACCESSORIES, BRANDS, findSeries, seriesLabel, type AccessoryRecord, type SeriesBrand, type SeriesRecord } from "./catalog";
import { matchItemSeries, normalizeText, type ItemSeriesMatch } from "./matching";
import { findSwatch, PALETTES, type ManufacturerPalette, type PaletteSwatch } from "./palettes";
import { normalizeSeriesAppendix } from "./settings";

export type ConfigLine = { label: string; value: string };

/** One distinct quoted configuration of a series, with the quote items that share it. */
export type QuotedConfig = { itemNumbers: number[]; lines: ConfigLine[] };

export type QuotedFinish = {
  /** As recorded on the quote, or "גוון טרם נבחר". */
  text: string;
  recorded: boolean;
  swatches: { code: string; group: string; swatch: PaletteSwatch }[];
  itemNumbers: number[];
};

export type GlassExplainer = { formula: string; text: string; itemNumbers: number[] };

export type SheetItemRef = { number: number; location: string; label: string };

export type SheetPlan = {
  record: SeriesRecord;
  items: SheetItemRef[];
  configs: QuotedConfig[];
  finishes: QuotedFinish[];
  glass: GlassExplainer[];
  accessories: { record: AccessoryRecord; itemNumbers: number[] }[];
};

export type ChartPlan = {
  brand: SeriesBrand;
  palette: ManufacturerPalette;
  /** False when the complete chart could not be bundled; only the official link is printed. */
  available: boolean;
  /** Quoted finish codes, highlighted on the chart. */
  quoted: string[];
};

export type RecognizedSeries = { key: string; record: SeriesRecord; count: number; selected: boolean };

export type ItemIssue = { itemNumber: number; itemIndex: number; label: string; match: ItemSeriesMatch };

export type AppendixPlan = {
  settings: SeriesAppendixSettings;
  recognized: RecognizedSeries[];
  sheets: SheetPlan[];
  charts: ChartPlan[];
  /** Lines whose series could not be determined safely (shown in the editor only). */
  issues: ItemIssue[];
  /** Internal estimator remarks (never printed). */
  reviewFlags: { itemNumber: number; text: string }[];
  /** Missing photos / exact sections for the selected sheets (editor only). */
  missingAssets: string[];
  matches: ItemSeriesMatch[];
};

const FORMULA_RE = /(?<![\d.])(\d{1,2}(?:\.\d)?)\s?\+\s?(\d{1,2}(?:\.\d)?)(?:\s?\+\s?(\d{1,2}(?:\.\d)?))?(?![\d.+])/g;

function fmtMm(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** Customer explanation of a glass formula; undefined when the formula is not a known pattern. */
export function explainGlassFormula(formula: string): string | undefined {
  const parts = formula.split("+").map((p) => Number(p.trim()));
  if (parts.some((p) => !Number.isFinite(p) || p <= 0 || p > 30)) return undefined;
  if (parts.length === 2) {
    const [a, b] = parts;
    const plies = a === b ? `שני לוחות זכוכית בעובי ${fmtMm(a)} מ״מ כל אחד` : `לוח זכוכית ${fmtMm(a)} מ״מ ולוח ${fmtMm(b)} מ״מ`;
    return `זכוכית רבודה: ${plies}, המודבקים זה לזה בשכבת ביניים.`;
  }
  if (parts.length === 3) {
    const [a, gap, b] = parts;
    const panes = a === b ? `שני לוחות זכוכית בעובי ${fmtMm(a)} מ״מ` : `לוח ${fmtMm(a)} מ״מ ולוח ${fmtMm(b)} מ״מ`;
    return `זכוכית בידודית: ${panes} עם מרווח אטום של ${fmtMm(gap)} מ״מ ביניהם. עובי נומינלי כולל ${fmtMm(a + gap + b)} מ״מ.`;
  }
  return undefined;
}

function glassFormulas(item: PdfLineItem): string[] {
  const cfg = item.configuration;
  const texts = [
    cfg?.glass ?? "",
    item.profileName ?? "",
    item.customerDescription ?? "",
    item.details ?? "",
    ...(item.addons ?? []).filter((a) => a.checked).map((a) => a.name),
  ];
  const out: string[] = [];
  for (const t of texts) {
    for (const m of t.normalize("NFKC").matchAll(FORMULA_RE)) {
      const f = [m[1], m[2], m[3]].filter(Boolean).join("+");
      if (!out.includes(f)) out.push(f);
    }
  }
  const spec = cfg?.glassSpec;
  if (spec?.construction === "double" && spec.panes.length === 2 && spec.cavities.length === 1) {
    const [p1, p2] = spec.panes.map((p) => p.thicknessMm);
    const gap = spec.cavities[0].widthMm;
    if (p1 && p2 && gap) {
      const f = `${fmtMm(p1)}+${fmtMm(gap)}+${fmtMm(p2)}`;
      if (!out.includes(f)) out.push(f);
    }
  }
  return out;
}

type AddonSlot = "motor" | "box" | "screen" | "shutter" | "other";
const SLOT_LABEL: Record<AddonSlot, string> = { shutter: "תריס", box: "ארגז", motor: "מנוע", screen: "רשת", other: "תוספות" };

function addonSlot(name: string): AddonSlot {
  const n = normalizeText(name);
  if (/מנוע|MOTOR/.test(n)) return "motor";
  if (/ארגז|BOX|OPEN\s?-?ART|אופן\s?-?ארט/.test(n)) return "box";
  if (/רשת|SCREEN|יתוש/.test(n)) return "screen";
  if (/תריס|רפפה|שלב|SHUTTER|LOUVER/.test(n)) return "shutter";
  return "other";
}

function itemLabel(item: PdfLineItem): string {
  const d = dict("he");
  const cfg = item.configuration;
  return (item.customerDescription?.trim() || (cfg ? d.openingType[cfg.openingType] : "") || item.profileName?.trim() || "").trim();
}

function quotedConfigLines(item: PdfLineItem): ConfigLine[] {
  const d = dict("he");
  const cfg = item.configuration;
  const lines: ConfigLine[] = [];
  if (cfg) {
    for (const row of essentialProductSpecRows(cfg)) {
      if (row.label === "גמר מסגרת") continue;
      lines.push({ label: row.label, value: row.value });
    }
    if (item.customerDescription?.trim()) lines.unshift({ label: "תיאור בהצעה", value: item.customerDescription.trim() });
  } else {
    const wording = [item.customerDescription, item.profileName].map((t) => t?.trim()).filter(Boolean).join(" · ");
    if (wording) lines.push({ label: "כפי שצוין בהצעה", value: wording });
  }
  if (item.details?.trim()) lines.push({ label: "פרטים", value: item.details.trim() });

  const slots = new Map<AddonSlot, string[]>();
  for (const a of (item.addons ?? []).filter((x) => x.checked && x.name.trim())) {
    const slot = addonSlot(a.name);
    slots.set(slot, [...(slots.get(slot) ?? []), a.name.trim()]);
  }
  if (cfg?.shutter === "required" && !slots.has("shutter") && !cfg.shading.length) slots.set("shutter", [d.requirement.required]);
  if (cfg?.insectScreen === "required" && !slots.has("screen") && !cfg.accessories.some((a) => a.kind === "insect_screen")) {
    slots.set("screen", [d.requirement.required]);
  }
  for (const slot of ["shutter", "box", "motor", "screen", "other"] as AddonSlot[]) {
    const values = slots.get(slot);
    if (values?.length) lines.push({ label: SLOT_LABEL[slot], value: values.join(" · ") });
  }
  return lines;
}

const FINISH_CODE_RE = /(?<![A-Z0-9])(\d{2}[FI]|K\d{3})(?![A-Z0-9])/g;

function quotedFinish(item: PdfLineItem, brand: SeriesBrand): Omit<QuotedFinish, "itemNumbers"> {
  const recordedText = item.configuration?.frameFinish?.trim() ?? "";
  const scan = [recordedText, item.details ?? "", item.customerDescription ?? "", item.profileName ?? ""];
  const swatches: QuotedFinish["swatches"] = [];
  for (const t of scan) {
    for (const m of normalizeText(t).matchAll(FINISH_CODE_RE)) {
      const hit = findSwatch(brand, m[1]);
      if (hit && !swatches.some((s) => s.code === hit.swatch.code)) swatches.push({ code: hit.swatch.code, ...hit });
    }
  }
  if (recordedText) return { text: recordedText, recorded: true, swatches };
  if (swatches.length) {
    const text = swatches.map((s) => [s.swatch.nameHe ?? s.swatch.nameEn, s.code, s.swatch.texture].filter(Boolean).join(" ")).join(" · ");
    return { text, recorded: true, swatches };
  }
  return { text: "גוון טרם נבחר", recorded: false, swatches };
}

function pushNumber<T extends { itemNumbers: number[] }>(list: T[], same: (x: T) => boolean, make: () => T, n: number) {
  const found = list.find(same);
  if (found) {
    if (!found.itemNumbers.includes(n)) found.itemNumbers.push(n);
  } else {
    const fresh = make();
    fresh.itemNumbers = [n];
    list.push(fresh);
  }
}

/**
 * The appendix for the exact item list the PDF prints. Item numbers match the quotation table (1-based).
 * Prices, quantities and totals are never read.
 */
export function computeAppendixPlan(items: PdfLineItem[], rawSettings: SeriesAppendixSettings | undefined): AppendixPlan {
  const settings = normalizeSeriesAppendix(rawSettings);
  const matches = items.map((item) => matchItemSeries(item));

  const recognized: RecognizedSeries[] = [];
  const issues: ItemIssue[] = [];
  const reviewFlags: AppendixPlan["reviewFlags"] = [];
  matches.forEach((m, i) => {
    for (const key of m.seriesKeys) {
      const record = findSeries(key);
      if (!record) continue;
      const existing = recognized.find((r) => r.key === key);
      if (existing) existing.count++;
      else recognized.push({ key, record, count: 1, selected: !settings.excluded.includes(key) });
    }
    if (m.status === "ambiguous" || m.status === "conflict" || m.status === "unresolved") {
      issues.push({ itemNumber: i + 1, itemIndex: i, label: itemLabel(items[i]) || m.raw, match: m });
    }
    for (const text of m.reviewFlags) reviewFlags.push({ itemNumber: i + 1, text });
  });

  const sheets: SheetPlan[] = [];
  if (settings.enabled) {
    for (const r of recognized.filter((x) => x.selected)) {
      const sheet: SheetPlan = { record: r.record, items: [], configs: [], finishes: [], glass: [], accessories: [] };
      matches.forEach((m, i) => {
        if (!m.seriesKeys.includes(r.key)) return;
        const item = items[i];
        const n = i + 1;
        sheet.items.push({ number: n, location: (item.location || item.configuration?.location || "").trim(), label: itemLabel(item) });

        const lines = quotedConfigLines(item);
        const sig = JSON.stringify(lines);
        pushNumber(sheet.configs, (c) => JSON.stringify(c.lines) === sig, () => ({ itemNumbers: [], lines }), n);

        const finish = quotedFinish(item, r.record.brand);
        pushNumber(sheet.finishes, (f) => f.text === finish.text, () => ({ ...finish, itemNumbers: [] }), n);

        for (const formula of glassFormulas(item)) {
          const text = explainGlassFormula(formula);
          if (text) pushNumber(sheet.glass, (g) => g.formula === formula, () => ({ formula, text, itemNumbers: [] }), n);
        }
        for (const key of m.accessories) {
          const record = ACCESSORIES[key];
          pushNumber(sheet.accessories, (a) => a.record.key === key, () => ({ record, itemNumbers: [] }), n);
        }
      });
      sheets.push(sheet);
    }
  }

  const charts: ChartPlan[] = [];
  if (settings.content.colors) {
    for (const sheet of sheets) {
      const brand = sheet.record.brand;
      let chart = charts.find((c) => c.brand === brand);
      if (!chart) {
        const palette = PALETTES[brand];
        chart = { brand, palette, available: palette.status === "available" && palette.groups.length > 0, quoted: [] };
        charts.push(chart);
      }
      for (const f of sheet.finishes) for (const s of f.swatches) if (!chart.quoted.includes(s.code)) chart.quoted.push(s.code);
    }
  }

  const missingAssets: string[] = [];
  for (const sheet of sheets) {
    const label = seriesLabel(sheet.record);
    if (settings.content.photos) {
      if (!sheet.record.assets.some((a) => a.kind === "photo")) {
        missingAssets.push(`${label}: אין תמונת התקנה מאושרת — יודפס קישור לגלריה הרשמית`);
      }
      if (!sheet.record.assets.some((a) => a.kind === "section" && a.exactModel)) {
        missingAssets.push(`${label}: אין חתך פרופיל מדויק`);
      }
    }
  }
  for (const chart of charts) {
    if (!chart.available) missingAssets.push(`${BRANDS[chart.brand].nameLatin}: המניפה המלאה אינה זמינה — יודפס קישור רשמי`);
  }

  return { settings, recognized, sheets, charts, issues, reviewFlags, missingAssets, matches };
}

/** True when the PDF gets any appendix page. */
export function hasAppendix(plan: AppendixPlan): boolean {
  return plan.settings.enabled && plan.sheets.length > 0;
}

function chartCount(k: number): string {
  if (k === 1) return "מניפת צבעים אחת";
  if (k === 2) return "שתי מניפות צבעים";
  return `${k} מניפות צבעים`;
}

/** Live Hebrew summary for the editor, from the actual selection and the charts that can be printed. */
export function appendixSummary(plan: AppendixPlan): string {
  if (!plan.settings.enabled) return "";
  const n = plan.sheets.length;
  if (!n) return "אין סדרות לצירוף — תופק הצעת מחיר רגילה.";
  const sheetsPart = n === 1 ? "יצורף דף סדרה אחד" : `יצורפו ${n} דפי סדרה`;
  const available = plan.charts.filter((c) => c.available).length;
  const missing = plan.charts.filter((c) => !c.available).map((c) => BRANDS[c.brand].nameLatin);
  let text = available ? `${sheetsPart} ו${chartCount(available)}` : sheetsPart;
  if (missing.length) text += ` (למניפת ${missing.join(", ")} יודפס קישור רשמי)`;
  return `${text}.`;
}
