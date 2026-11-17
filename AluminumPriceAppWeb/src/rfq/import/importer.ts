import type { FrameNode, GlassSpec, RfqItem, RfqPanel, RfqUnit, ShadingEntry, Side } from "../types";
import { createRfqItem, makePanelFor, nextReference, normalizeItemConfig, OPENING_TYPE_DEFS, validateItem, withPanels, type ItemIssueCode } from "../presets";
import { parseStrictNumber, unitToCm } from "../units";
import { rfqUuid } from "../rfqState";
import { LayoutParseError, mapPanels, newPanel, parseLayoutNotation, toRfqPanel } from "../layout";
import { constructionForPaneCount, emptyGlassSpec, fixedPaneCount, parseMakeup, setConstruction } from "../glass";
import { accessoryFromLegacyScreen, newShading } from "../accessories";
import { decodeText, parseCsv } from "./csv";
import { readXlsx, type Sheet } from "./xlsx";
import {
  IMPORT_FIELDS,
  REQUIRED_FIELDS,
  autoMapHeaders,
  parseAppearance,
  parseCategory,
  parseCavityFill,
  parseCoatings,
  parseConstruction,
  parseOpeningType,
  parseRequirement,
  parseShading,
  parseShadingOperation,
  parseTreatment,
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
  hinged_leaf_count: "fixedPanels",
  custom_description_required: "description",
  integrated_blind_single_glazing: "shading",
  layout_size_invalid: "layout",
  layout_sizes_exceed: "layout",
  layout_sizes_mismatch: "layout",
  layout_decorative_invalid: "layout",
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

type Report = (field: ImportField, key: string, params?: Record<string, string | number>) => void;

/** Window-level glass from the glass columns. Unknown values are errors; missing values stay "supplier to confirm". */
function parseGlassColumns(v: Partial<Record<ImportField, string>>, err: Report, warn: Report): GlassSpec {
  let spec = emptyGlassSpec();
  const pick = <T,>(field: ImportField, parse: (raw: string) => { ok: true; value: T } | { ok: false }, apply: (val: T) => void) => {
    const raw = v[field];
    if (!raw) return;
    const r = parse(raw);
    if (r.ok) apply(r.value);
    else err(field, "unknownValue", { v: raw });
  };
  pick("glassConstruction", parseConstruction, (c) => (spec = setConstruction(spec, c)));
  pick("glassTreatment", parseTreatment, (t) => (spec = { ...spec, treatment: t }));
  pick("glassAppearance", parseAppearance, (a) => (spec = { ...spec, appearance: a }));
  pick("glassCoatings", parseCoatings, (c) => (spec = { ...spec, coatings: c }));
  if (v.glassTint) {
    spec = { ...spec, tintColor: v.glassTint };
    if (spec.appearance === "unspecified") spec = { ...spec, appearance: "tinted" };
    else if (spec.appearance !== "tinted") warn("glassTint", "notApplicable", { field: "glassTint" });
  }
  if (v.glassMakeup) {
    const m = parseMakeup(v.glassMakeup);
    if (!m) err("glassMakeup", "makeupInvalid", { v: v.glassMakeup });
    else {
      const fixed = fixedPaneCount(spec.construction);
      if (fixed != null && fixed !== m.panes.length) err("glassMakeup", "makeupConflict", { v: v.glassMakeup, n: m.panes.length });
      else {
        if (spec.construction === "unspecified") spec = setConstruction(spec, constructionForPaneCount(m.panes.length));
        spec = { ...spec, panes: m.panes, cavities: m.cavities };
      }
    }
  }
  pick("cavityFill", parseCavityFill, (f) => {
    if (!spec.cavities.length) warn("cavityFill", "notApplicable", { field: "cavityFill" });
    else spec = { ...spec, cavities: spec.cavities.map((c) => ({ ...c, fill: f })) };
  });
  return spec;
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

  const isCustom = type.value === "custom";
  const hingeApplies = def.operableOp === "casement" || def.operableOp === "tilt_turn" || type.value === "hinged_door_single";
  let hingeValue: Side | undefined;
  if (v.hingeSide) {
    const s = parseSide(v.hingeSide);
    if (!s.ok) err("hingeSide", "unknownValue", { v: v.hingeSide });
    else if (!hingeApplies) warn("hingeSide", "notApplicable", { field: "hingeSide" });
    else hingeValue = s.value;
  }

  // Layout: an explicit layout cell wins over the simple panel-count columns.
  let layout: FrameNode | null = null;
  if (v.layout) {
    if (isCustom) warn("layout", "notApplicable", { field: "layout" });
    else {
      const explicit = new Set<string>();
      try {
        const parsed = parseLayoutNotation(v.layout, itemUnit, ({ fixed, side }) => {
          const p = fixed || !def.operableOp ? newPanel("fixed") : makePanelFor(def, 0, 2);
          const s = side ?? hingeValue;
          if (s && p.operation === "sliding" && side) p.slideDirection = side;
          else if (s && p.operation !== "fixed" && p.operation !== "sliding" && p.operation !== "top_hung") p.hingeSide = s;
          else return p;
          explicit.add(p.id);
          return p;
        });
        // Unstated sides default by position: sliding panels toward the centre, hinges on the outer side.
        layout = mapPanels(parsed, (p, i, n) => {
          if (explicit.has(p.id) || p.operation === "fixed" || p.operation === "top_hung") return p;
          const outer: Side = i < n / 2 ? "left" : "right";
          return p.operation === "sliding" ? { ...p, slideDirection: outer === "left" ? "right" : "left" } : { ...p, hingeSide: outer };
        });
      } catch (e) {
        const pos = e instanceof LayoutParseError ? e.pos + 1 : 1;
        err("layout", "layoutInvalid", { v: v.layout, pos });
      }
      if (layout && (v.panels || v.fixedPanels)) warn("layout", "layoutOverridesPanels");
    }
  }

  let panels: RfqPanel[] = item.panels.slice();
  if (!layout) {
    let count = item.panels.length;
    if (v.panels) {
      const p = parseStrictNumber(v.panels);
      if (isCustom) warn("panels", "notApplicable", { field: "panels" });
      else if (p == null || !Number.isInteger(p) || p < Math.max(1, def.minPanels)) {
        err("panels", "panelsInvalid", { v: v.panels, min: Math.max(1, def.minPanels) });
      } else count = p;
    }
    if (count !== item.panels.length) {
      let made = 0;
      panels = Array.from({ length: count }, (_, i) => toRfqPanel(makePanelFor(def, i, count, made++)));
    }

    if (v.fixedPanels) {
      if (!def.allowFixedPanels || !def.operableOp) warn("fixedPanels", "notApplicable", { field: "fixedPanels" });
      else {
        const nums = v.fixedPanels.split(/[,;\s]+/).filter(Boolean).map((s) => parseStrictNumber(s));
        if (nums.some((n) => n == null || !Number.isInteger(n) || n < 1 || n > count)) {
          err("fixedPanels", "fixedPanelsInvalid", { v: v.fixedPanels });
        } else {
          panels = panels.map((p, i) => (nums.includes(i + 1) ? { operation: "fixed" } : p));
          if (def.operableLeaves != null) {
            // Re-assign leaves so the non-fixed panels are the operable ones.
            panels = panels.map((p, i) => (nums.includes(i + 1) ? p : { operation: def.operableOp!, hingeSide: i < count / 2 ? "left" : "right" }));
          }
        }
      }
    }
    if (hingeValue) panels = panels.map((p) => (p.operation === "fixed" || p.operation === "sliding" || p.operation === "top_hung" ? p : { ...p, hingeSide: hingeValue }));
  }
  if (hingeApplies && !v.hingeSide && !(layout && /[OF][LR]/i.test(v.layout ?? ""))) {
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

  const glassSpec = parseGlassColumns(v, err, warn);

  const shading: ShadingEntry[] = [];
  if (v.shading) {
    const s = parseShading(v.shading);
    if (!s.ok) err("shading", "unknownValue", { v: v.shading });
    else if (s.value) {
      const entry = newShading(rfqUuid(), s.value);
      if (v.shadingOperation) {
        const op = parseShadingOperation(v.shadingOperation);
        if (op.ok) entry.operation = op.value;
        else err("shadingOperation", "unknownValue", { v: v.shadingOperation });
      }
      entry.color = v.shadingColor ?? "";
      shading.push(entry);
    }
  } else {
    if (v.shadingOperation) warn("shadingOperation", "notApplicable", { field: "shadingOperation" });
    if (v.shadingColor) warn("shadingColor", "notApplicable", { field: "shadingColor" });
  }

  let completeHardwareSet = false;
  if (v.hardwareSet) {
    const r = parseRequirement(v.hardwareSet);
    if (r.ok) completeHardwareSet = r.value === "required";
    else err("hardwareSet", "unknownValue", { v: v.hardwareSet });
  }

  const alternatives = (v.alternatives ?? "")
    .split(/\s*;\s*|\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((description) => ({ id: rfqUuid(), description }));

  const screen = req("insectScreen");
  const screenAcc = accessoryFromLegacyScreen(rfqUuid(), screen);

  const category = item.category;
  const base: RfqItem = {
    ...item,
    swing,
    activeLeaf,
    location: v.location ?? "",
    glass: v.glass ?? "",
    glassSpec,
    frameFinish: v.frameFinish ?? "",
    insectScreen: screen,
    shutter: req("shutter"),
    shading,
    accessories: screenAcc ? [screenAcc] : [],
    completeHardwareSet,
    alternatives,
    hardware: v.hardware ?? "",
    otherRequirements: v.otherRequirements ?? "",
    customDescription: v.description ?? "",
    notes: v.notes ?? "",
  };
  item = layout ? normalizeItemConfig({ ...base, layout }) : withPanels(base, panels);
  item = { ...item, category };

  for (const issue of validateItem(item)) {
    if (issue.code === "reference_required") continue; // generated later
    if (issue.code.startsWith("layout_") && errors.some((e) => e.field === "layout")) continue;
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
