import type { RfqItem, RfqPanel, RfqUnit } from "../types";
import { createRfqItem, nextReference, normalizeItemConfig, OPENING_TYPE_DEFS, validateItem, type ItemIssueCode } from "../presets";
import { parseStrictNumber, unitToCm } from "../units";
import { rfqUuid } from "../rfqState";
import { decodeText, parseCsv } from "./csv";
import { readXlsx, type Sheet } from "./xlsx";
import {
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  autoMapHeaders,
  parseCategory,
  parseOpeningType,
  parseRequirement,
  parseSide,
  parseSwing,
  parseUnit,
  unitFromHeader,
  type ImportField,
} from "./schema";

export const MAX_FILE_MB = 5;
export const MAX_ROWS = 1000;

export type ParsedFile = { kind: "csv" | "xlsx"; sheets: Sheet[]; encoding?: string };

export class ImportFileError extends Error {
  key: "tooLarge" | "tooManyRows" | "unsupported" | "readFailed" | "noRows";
  detail: string;
  constructor(key: ImportFileError["key"], detail = "") {
    super(key + (detail ? `: ${detail}` : ""));
    this.key = key;
    this.detail = detail;
  }
}

/** Parse file bytes locally. Only .xlsx and .csv are accepted. */
export function parseImportBytes(fileName: string, bytes: Uint8Array): ParsedFile {
  if (bytes.byteLength > MAX_FILE_MB * 1024 * 1024) throw new ImportFileError("tooLarge");
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt") {
    const { text, encoding } = decodeText(bytes);
    const rows = parseCsv(text);
    if (rows.length > MAX_ROWS + 1) throw new ImportFileError("tooManyRows");
    return { kind: "csv", encoding, sheets: [{ name: fileName, rows, formulaCells: 0 }] };
  }
  if (ext === "xlsx") {
    // Zip signature check prevents treating renamed files as workbooks.
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new ImportFileError("readFailed", "not a valid .xlsx file");
    try {
      return { kind: "xlsx", sheets: readXlsx(bytes, MAX_ROWS) };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/more than \d+ rows/.test(msg)) throw new ImportFileError("tooManyRows");
      throw new ImportFileError("readFailed", msg);
    }
  }
  throw new ImportFileError("unsupported");
}

export function firstNonEmptyRow(rows: string[][]): number {
  const i = rows.findIndex((r) => r.some((c) => c.trim() !== ""));
  return i < 0 ? 0 : i;
}

export type ColumnMapping = Partial<Record<ImportField, number>>;

export type SheetAnalysis = {
  headers: string[];
  mapping: ColumnMapping;
  /** Unit stated by width/height headers; null when the file does not say */
  detectedUnit: RfqUnit | null;
};

export function analyzeSheet(rows: string[][], headerRow: number): SheetAnalysis {
  const headers = (rows[headerRow] ?? []).map((h) => String(h ?? "").trim());
  const mapping = autoMapHeaders(headers);
  const wu = unitFromHeader(mapping.width != null ? headers[mapping.width] : undefined);
  const hu = unitFromHeader(mapping.height != null ? headers[mapping.height] : undefined);
  const detectedUnit = wu && (!hu || hu === wu) ? wu : hu && !wu ? hu : null;
  return { headers, mapping, detectedUnit };
}

/** Editable import row (raw strings, exactly what the preview shows). */
export type ImportRow = {
  key: string;
  rowNumber: number;
  values: Partial<Record<ImportField, string>>;
  include: boolean;
  blank: boolean;
  /** Non-empty cells beyond the header columns (usually an unquoted comma shifting columns) */
  extraCells: number;
};

export function buildImportRows(rows: string[][], headerRow: number, mapping: ColumnMapping): ImportRow[] {
  const out: ImportRow[] = [];
  const width = (rows[headerRow] ?? []).length;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const src = rows[r] ?? [];
    const values: Partial<Record<ImportField, string>> = {};
    for (const f of IMPORT_FIELDS) {
      const col = mapping[f];
      if (col != null) values[f] = String(src[col] ?? "").trim();
    }
    const extraCells = src.slice(width).filter((c) => String(c ?? "").trim()).length;
    const blank = !Object.values(values).some((v) => v) && extraCells === 0;
    out.push({ key: `r${r}`, rowNumber: r + 1, values, include: !blank, blank, extraCells });
  }
  // Trailing blank rows are just the end of the sheet
  while (out.length && out[out.length - 1].blank) out.pop();
  return out;
}

export type RowMessage = {
  field?: ImportField;
  /** key in dict().imp or dict().issue */
  key: string;
  source: "imp" | "issue";
  params?: Record<string, string | number>;
};

export type RowResult = { errors: RowMessage[]; warnings: RowMessage[]; item: RfqItem | null; autoRef: boolean };

export type ValidationContext = {
  unit: RfqUnit | null;
  existingReferences: string[];
  mode: "append" | "replace";
};

const ISSUE_FIELD: Partial<Record<ItemIssueCode, ImportField>> = {
  reference_required: "reference",
  reference_duplicate: "reference",
  width_invalid: "width",
  height_invalid: "height",
  width_required: "width",
  height_required: "height",
  quantity_invalid: "quantity",
  category_mismatch: "openingType",
  needs_operable_panel: "fixedPanels",
  custom_description_required: "description",
};

function parseDimension(raw: string, unit: RfqUnit | null): { cm: number | null; err?: RowMessage; unit?: RfqUnit } {
  const m = /^\s*([^a-zA-Z\u0590-\u05FF"״]*?)\s*([a-zA-Z\u0590-\u05FF"״]+)?\s*$/.exec(raw);
  const numPart = (m?.[1] ?? raw).trim();
  const suffix = m?.[2];
  let effective = unit;
  if (suffix) {
    const su = parseUnit(suffix);
    if (!su.ok) return { cm: null, err: { key: "invalidNumber", source: "imp", params: { v: raw } } };
    if (unit && su.value !== unit) return { cm: null, err: { key: "unitConflict", source: "imp", params: { v: raw, unit } } };
    effective = su.value;
  }
  const n = parseStrictNumber(numPart);
  if (n == null) return { cm: null, err: { key: "invalidNumber", source: "imp", params: { v: raw } } };
  if (!effective) return { cm: null, err: { key: "unitRequired", source: "imp" } };
  return { cm: unitToCm(n, effective), unit: effective };
}

function validateOne(row: ImportRow, ctx: ValidationContext): Omit<RowResult, "autoRef"> & { explicitRef: string } {
  const errors: RowMessage[] = [];
  const warnings: RowMessage[] = [];
  const v = row.values;
  const err = (field: ImportField, key: string, params?: Record<string, string | number>) =>
    errors.push({ field, key, source: "imp", params });
  const warn = (field: ImportField, key: string, params?: Record<string, string | number>) =>
    warnings.push({ field, key, source: "imp", params });

  if (row.extraCells > 0) errors.push({ key: "extraCells", source: "imp", params: { n: row.extraCells } });
  for (const f of REQUIRED_FIELDS) {
    if (!(v[f] ?? "").trim()) err(f, "missing", { field: f });
  }

  const cat = v.category ? parseCategory(v.category) : null;
  if (v.category && !cat?.ok) err("category", "unknownValue", { v: v.category });
  const type = v.openingType ? parseOpeningType(v.openingType) : null;
  if (v.openingType && !type?.ok) err("openingType", "unknownValue", { v: v.openingType });

  let rowUnit: RfqUnit | null = ctx.unit;
  if (v.unit) {
    const u = parseUnit(v.unit);
    if (u.ok) rowUnit = u.value;
    else err("unit", "unknownUnit", { v: v.unit });
  }
  const w = v.width ? parseDimension(v.width, rowUnit) : null;
  if (w?.err) errors.push({ ...w.err, field: "width" });
  const h = v.height ? parseDimension(v.height, rowUnit) : null;
  if (h?.err) errors.push({ ...h.err, field: "height" });
  const itemUnit = rowUnit ?? w?.unit ?? h?.unit ?? "mm";
  for (const [field, dim] of [["width", w], ["height", h]] as const) {
    if (dim?.cm != null && dim.cm > 0 && (dim.cm < 10 || dim.cm > 1500)) {
      warn(field, "implausibleSize", { v: v[field] ?? "", unit: itemUnit });
    }
  }

  let qty: number | null = null;
  if (v.quantity) {
    const q = parseStrictNumber(v.quantity);
    if (q == null) err("quantity", "invalidNumber", { v: v.quantity });
    else if (!Number.isInteger(q)) err("quantity", "notInteger", { v: v.quantity });
    else qty = q;
  }

  const explicitRef = (v.reference ?? "").trim();
  if (!cat?.ok || !type?.ok) return { errors, warnings, item: null, explicitRef };

  const def = OPENING_TYPE_DEFS[type.value];
  let item = createRfqItem({ id: rfqUuid(), openingType: type.value, category: cat.value, unit: itemUnit, reference: explicitRef });
  // Keep the category the file states, so a mismatch is reported instead of silently corrected.
  item = { ...item, category: cat.value, widthCm: w?.cm ?? null, heightCm: h?.cm ?? null, quantity: qty ?? 0 };

  // Panels
  let count = item.panels.length;
  if (v.panels) {
    const p = parseStrictNumber(v.panels);
    if (def.maxPanels === 0) warn("panels", "notApplicable", { field: "panels" });
    else if (p == null || !Number.isInteger(p) || p < def.minPanels || p > def.maxPanels) {
      err("panels", "panelsInvalid", { v: v.panels, min: def.minPanels, max: def.maxPanels });
    } else count = p;
  }
  let panels: RfqPanel[] =
    count === item.panels.length
      ? item.panels.slice()
      : Array.from({ length: count }, (_, i): RfqPanel =>
          def.operableOp === "sliding"
            ? { operation: "sliding", slideDirection: i < count / 2 ? "right" : "left" }
            : { operation: def.operableOp ?? "fixed" }
        );

  if (v.fixedPanels) {
    if (!def.allowFixedPanels || !def.operableOp) warn("fixedPanels", "notApplicable", { field: "fixedPanels" });
    else {
      const nums = v.fixedPanels.split(/[,;\s]+/).filter(Boolean).map((s) => parseStrictNumber(s));
      if (nums.some((n) => n == null || !Number.isInteger(n) || n < 1 || n > count)) {
        err("fixedPanels", "fixedPanelsInvalid", { v: v.fixedPanels });
      } else {
        panels = panels.map((p, i) => (nums.includes(i + 1) ? { operation: "fixed" } : p));
      }
    }
  }

  const hingeApplies = def.operableOp === "casement" || def.operableOp === "tilt_turn" || (def.operableOp === "hinged" && def.maxPanels === 1);
  if (v.hingeSide) {
    const s = parseSide(v.hingeSide);
    if (!s.ok) err("hingeSide", "unknownValue", { v: v.hingeSide });
    else if (!hingeApplies) warn("hingeSide", "notApplicable", { field: "hingeSide" });
    else panels = panels.map((p) => (p.operation === "fixed" ? p : { ...p, hingeSide: s.value }));
  } else if (hingeApplies) {
    warn("hingeSide", "defaulted", { field: "hingeSide" });
  }

  let swing = item.swing;
  if (v.swing) {
    const s = parseSwing(v.swing);
    if (!s.ok) err("swing", "unknownValue", { v: v.swing });
    else if (def.swing === "choose") swing = s.value;
    else if (def.swing && def.swing !== s.value) err("swing", "swingNotAllowed", { v: v.swing });
    else if (!def.swing) warn("swing", "notApplicable", { field: "swing" });
  } else if (def.swing === "choose") {
    warn("swing", "defaulted", { field: "swing" });
  }

  let activeLeaf = item.activeLeaf;
  if (v.activeLeaf) {
    const s = parseSide(v.activeLeaf);
    if (!s.ok) err("activeLeaf", "unknownValue", { v: v.activeLeaf });
    else if (type.value !== "hinged_door_double") warn("activeLeaf", "notApplicable", { field: "activeLeaf" });
    else activeLeaf = s.value;
  }

  const req = (field: "insectScreen" | "shutter") => {
    const raw = v[field];
    if (!raw) return "unspecified" as const;
    const r = parseRequirement(raw);
    if (!r.ok) {
      err(field, "unknownValue", { v: raw });
      return "unspecified" as const;
    }
    return r.value;
  };

  const category = item.category;
  item = normalizeItemConfig({
    ...item,
    panels,
    swing,
    activeLeaf,
    location: v.location ?? "",
    glass: v.glass ?? "",
    frameFinish: v.frameFinish ?? "",
    insectScreen: req("insectScreen"),
    shutter: req("shutter"),
    hardware: v.hardware ?? "",
    otherRequirements: v.otherRequirements ?? "",
    customDescription: v.description ?? "",
    notes: v.notes ?? "",
  });
  item = { ...item, category };

  for (const issue of validateItem(item)) {
    if (issue.code === "reference_required") continue; // generated later
    if ((issue.code === "width_required" || issue.code === "height_required") && errors.some((e) => e.field === ISSUE_FIELD[issue.code])) continue;
    if ((issue.code === "width_invalid" || issue.code === "height_invalid") && errors.some((e) => e.field === ISSUE_FIELD[issue.code])) continue;
    if (issue.code === "quantity_invalid" && errors.some((e) => e.field === "quantity")) continue;
    errors.push({ field: ISSUE_FIELD[issue.code], key: issue.code, source: "issue" });
  }
  return { errors, warnings, item, explicitRef };
}

/** Validate every row. Rows are independent except for reference uniqueness and generated references. */
export function validateImportRows(rows: ImportRow[], ctx: ValidationContext): RowResult[] {
  const partial = rows.map((r) => (r.blank ? null : validateOne(r, ctx)));
  const existing = ctx.mode === "append" ? ctx.existingReferences.map((r) => r.trim().toUpperCase()) : [];
  const counts = new Map<string, number>();
  rows.forEach((r, i) => {
    const p = partial[i];
    if (!p || !r.include || !p.explicitRef) return;
    const k = p.explicitRef.toUpperCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  const taken: string[] = [...existing, ...counts.keys()];
  return rows.map((r, i) => {
    const p = partial[i];
    if (!p) return { errors: [], warnings: [], item: null, autoRef: false };
    const errors = p.errors.slice();
    let autoRef = false;
    if (p.explicitRef) {
      const k = p.explicitRef.toUpperCase();
      if (r.include && (counts.get(k) ?? 0) > 1) errors.push({ field: "reference", key: "duplicateInFile", source: "imp", params: { v: p.explicitRef } });
      if (existing.includes(k)) errors.push({ field: "reference", key: "duplicateExisting", source: "imp", params: { v: p.explicitRef } });
    }
    let item = p.item;
    if (item && !p.explicitRef && r.include) {
      const ref = nextReference(item.category, taken);
      taken.push(ref);
      item = { ...item, reference: ref };
      autoRef = true;
    }
    return { errors, warnings: p.warnings, item: errors.length ? null : item, autoRef };
  });
}

export function importSummary(rows: ImportRow[], results: RowResult[]) {
  let valid = 0;
  let invalid = 0;
  let excluded = 0;
  let blank = 0;
  rows.forEach((r, i) => {
    if (r.blank) blank++;
    else if (!r.include) excluded++;
    else if (results[i].errors.length) invalid++;
    else valid++;
  });
  return { valid, invalid, excluded, blank };
}

/** Items to add; only when every included row is valid. */
export function committableItems(rows: ImportRow[], results: RowResult[]): RfqItem[] | null {
  const items: RfqItem[] = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].blank || !rows[i].include) continue;
    const res = results[i];
    if (res.errors.length || !res.item) return null;
    items.push(res.item);
  }
  return items;
}
