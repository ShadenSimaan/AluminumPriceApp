import type {
  FrameNode,
  PanelNode,
  PanelOperation,
  RfqCategory,
  RfqItem,
  RfqOpeningType,
  RfqPanel,
  RfqUnit,
  Side,
  Swing,
} from "./types";
import { RFQ_OPENING_TYPES } from "./types";
import { equalColumnsLayout, isSimpleColumns, layoutFromPanels, mapPanels, newPanel, panelLeaves, toRfqPanel, validateLayout, type LayoutIssueCode } from "./layout";
import { emptyGlassSpec } from "./glass";
import { insectScreenRequirement, integratedBlindConflicts, pruneLinks } from "./accessories";

export type OpeningTypeDef = {
  id: RfqOpeningType;
  /** null = user chooses (custom) */
  category: RfqCategory | null;
  /** Operation used for operable panels; null = no operable panels */
  operableOp: Exclude<PanelOperation, "fixed"> | null;
  /** Whether individual panels may be switched to fixed (e.g. side lights or a fixed top light) */
  allowFixedPanels: boolean;
  minPanels: number;
  /** Exact number of operable leaves implied by the type (hinged doors); undefined = any */
  operableLeaves?: number;
  /** "choose" = user selects inward/outward; fixed value = implied by the type; null = not applicable */
  swing: "choose" | Swing | null;
  defaultPanels: () => RfqPanel[];
  defaultSizeCm: { width: number; height: number };
};

const towardCenter = (index: number, count: number): Side => (index < count / 2 ? "right" : "left");

// No panel maximum: any number of panels/subdivisions can be drawn and requested. Real system limits are
// unknown here and must be confirmed by the supplier.
export const OPENING_TYPE_DEFS: Record<RfqOpeningType, OpeningTypeDef> = {
  fixed_window: {
    id: "fixed_window",
    category: "window",
    operableOp: null,
    allowFixedPanels: true,
    minPanels: 1,
    swing: null,
    defaultPanels: () => [{ operation: "fixed" }],
    defaultSizeCm: { width: 100, height: 120 },
  },
  sliding_window: {
    id: "sliding_window",
    category: "window",
    operableOp: "sliding",
    allowFixedPanels: true,
    minPanels: 2,
    swing: null,
    defaultPanels: () => [
      { operation: "sliding", slideDirection: "right" },
      { operation: "sliding", slideDirection: "left" },
    ],
    defaultSizeCm: { width: 150, height: 120 },
  },
  casement_window: {
    id: "casement_window",
    category: "window",
    operableOp: "casement",
    allowFixedPanels: true,
    minPanels: 1,
    swing: "choose",
    defaultPanels: () => [{ operation: "casement", hingeSide: "left" }],
    defaultSizeCm: { width: 60, height: 120 },
  },
  tilt_turn_window: {
    id: "tilt_turn_window",
    category: "window",
    operableOp: "tilt_turn",
    allowFixedPanels: true,
    minPanels: 1,
    swing: "inward",
    defaultPanels: () => [{ operation: "tilt_turn", hingeSide: "left" }],
    defaultSizeCm: { width: 70, height: 130 },
  },
  top_hung_window: {
    id: "top_hung_window",
    category: "window",
    operableOp: "top_hung",
    allowFixedPanels: true,
    minPanels: 1,
    swing: "outward",
    defaultPanels: () => [{ operation: "top_hung" }],
    defaultSizeCm: { width: 60, height: 50 },
  },
  sliding_door: {
    id: "sliding_door",
    category: "door",
    operableOp: "sliding",
    allowFixedPanels: true,
    minPanels: 2,
    swing: null,
    defaultPanels: () => [
      { operation: "sliding", slideDirection: "right" },
      { operation: "sliding", slideDirection: "left" },
    ],
    defaultSizeCm: { width: 240, height: 220 },
  },
  hinged_door_single: {
    id: "hinged_door_single",
    category: "door",
    operableOp: "hinged",
    allowFixedPanels: true,
    minPanels: 1,
    operableLeaves: 1,
    swing: "choose",
    defaultPanels: () => [{ operation: "hinged", hingeSide: "left" }],
    defaultSizeCm: { width: 90, height: 210 },
  },
  hinged_door_double: {
    id: "hinged_door_double",
    category: "door",
    operableOp: "hinged",
    allowFixedPanels: true,
    minPanels: 2,
    operableLeaves: 2,
    swing: "choose",
    defaultPanels: () => [
      { operation: "hinged", hingeSide: "left" },
      { operation: "hinged", hingeSide: "right" },
    ],
    defaultSizeCm: { width: 140, height: 210 },
  },
  custom: {
    id: "custom",
    category: null,
    operableOp: null,
    allowFixedPanels: false,
    minPanels: 0,
    swing: null,
    defaultPanels: () => [],
    defaultSizeCm: { width: 100, height: 100 },
  },
};

export function isOpeningType(v: unknown): v is RfqOpeningType {
  return typeof v === "string" && (RFQ_OPENING_TYPES as readonly string[]).includes(v);
}

export function openingTypesForCategory(category: RfqCategory): RfqOpeningType[] {
  return RFQ_OPENING_TYPES.filter((t) => {
    const c = OPENING_TYPE_DEFS[t].category;
    return c === null || c === category;
  });
}

export function referencePrefix(category: RfqCategory): "W" | "D" {
  return category === "door" ? "D" : "W";
}

/** Next free reference (W-01, W-02 …) that does not collide with `taken` (case-insensitive). */
export function nextReference(category: RfqCategory, taken: Iterable<string>): string {
  const used = new Set<string>();
  for (const r of taken) used.add(r.trim().toUpperCase());
  const prefix = referencePrefix(category);
  for (let n = 1; n < 10000; n++) {
    const candidate = `${prefix}-${String(n).padStart(2, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${prefix}-${Date.now()}`;
}

/** A new panel for this type: operable unless the type's operable-leaf count is already reached. */
export function makePanelFor(def: OpeningTypeDef, index: number, count: number, operableSoFar = 0): PanelNode {
  const op = def.operableOp;
  if (!op || (def.operableLeaves != null && operableSoFar >= def.operableLeaves)) return newPanel("fixed");
  if (op === "sliding") return newPanel("sliding", { slideDirection: towardCenter(index, count) });
  if (op === "top_hung") return newPanel("top_hung");
  return newPanel(op, { hingeSide: index < count / 2 ? "left" : "right" });
}

function normalizePanelNode(p: PanelNode, index: number, count: number, def: OpeningTypeDef): PanelNode {
  const base = { kind: "panel" as const, id: p.id, glazing: p.glazing };
  const op = def.operableOp;
  if (!op) return { ...base, operation: "fixed" };
  if (p.operation === "fixed" && def.allowFixedPanels) return { ...base, operation: "fixed" };
  if (op === "sliding") {
    const dir = p.slideDirection === "left" || p.slideDirection === "right" ? p.slideDirection : towardCenter(index, count);
    return { ...base, operation: "sliding", slideDirection: dir };
  }
  if (op === "top_hung") return { ...base, operation: "top_hung" };
  const hinge = p.hingeSide === "left" || p.hingeSide === "right" ? p.hingeSide : index < count / 2 ? "left" : "right";
  return { ...base, operation: op, hingeSide: hinge };
}

/** Add top-level panels until the type's minimum is reached (existing panels keep their ids and settings). */
function padLayout(layout: FrameNode, def: OpeningTypeDef): FrameNode {
  const leaves = panelLeaves(layout);
  if (leaves.length >= def.minPanels) return layout;
  const extra = Array.from({ length: def.minPanels - leaves.length }, (_, i) => makePanelFor(def, leaves.length + i, def.minPanels));
  if (isSimpleColumns(layout)) return equalColumnsLayout([...leaves, ...extra], def.minPanels, (i) => makePanelFor(def, i, def.minPanels));
  return { kind: "frameSplit", id: `${layout.id}-pad`, direction: "columns", children: [{ sizeCm: null, node: layout }, ...extra.map((node) => ({ sizeCm: null, node }))] };
}

/**
 * Makes the layout, derived `panels`, `swing` and `activeLeaf` valid for the opening type (used after every edit).
 * The layout is the source of truth; an item without a layout (saved before layouts existed) gets one built from
 * its legacy `panels`, which reproduces the old one-to-N equal-column drawing exactly.
 */
export function normalizeItemConfig(item: RfqItem): RfqItem {
  const def = OPENING_TYPE_DEFS[item.openingType];
  const category = def.category ?? item.category;
  let layout: FrameNode = item.layout ?? layoutFromPanels(Array.isArray(item.panels) && item.panels.length ? item.panels : def.defaultPanels());
  layout = padLayout(layout, def);
  layout = mapPanels(layout, (p, i, n) => normalizePanelNode(p, i, n, def));

  if (item.openingType === "hinged_door_double") {
    // The pair of leaves meets in the middle: the first hinges left, the second right (viewed from outside).
    let k = 0;
    layout = mapPanels(layout, (p) => (p.operation === "hinged" ? { ...p, hingeSide: k++ === 0 ? "left" : "right" } : p));
  }

  let swing: Swing | undefined;
  if (def.swing === "choose") swing = item.swing === "outward" ? "outward" : "inward";
  else if (def.swing) swing = def.swing;

  const activeLeaf: Side | undefined =
    item.openingType === "hinged_door_double" ? (item.activeLeaf === "left" ? "left" : "right") : undefined;

  const panels = item.openingType === "custom" ? [] : panelLeaves(layout).map(toRfqPanel);
  const accessories = Array.isArray(item.accessories) ? item.accessories : [];
  const screen = insectScreenRequirement({ accessories });
  const next: RfqItem = {
    ...item,
    category,
    layout,
    panels,
    swing,
    activeLeaf,
    glassSpec: item.glassSpec ?? emptyGlassSpec(),
    shading: Array.isArray(item.shading) ? item.shading : [],
    accessories,
    completeHardwareSet: item.completeHardwareSet === true,
    alternatives: Array.isArray(item.alternatives) ? item.alternatives : [],
    insectScreen: screen ?? item.insectScreen ?? "unspecified",
  };
  return pruneLinks(next);
}

/** Replace the panels' operations in reading order (keeps ids/glass); a different count rebuilds equal columns. */
export function withPanels(item: RfqItem, panels: RfqPanel[]): RfqItem {
  const leaves = item.layout ? panelLeaves(item.layout) : [];
  if (item.layout && leaves.length === panels.length) {
    const layout = mapPanels(item.layout, (p, i) => {
      const src = panels[i];
      const out: PanelNode = { kind: "panel", id: p.id, operation: src.operation, glazing: p.glazing };
      if (src.hingeSide) out.hingeSide = src.hingeSide;
      if (src.slideDirection) out.slideDirection = src.slideDirection;
      return out;
    });
    return normalizeItemConfig({ ...item, layout, panels });
  }
  return normalizeItemConfig({ ...item, layout: layoutFromPanels(panels), panels });
}

/**
 * Change the number of side-by-side panels (simple layouts). Existing panels keep their ids and settings;
 * sizes return to equal shares. No upper limit is imposed.
 */
export function setPanelCount(item: RfqItem, count: number): RfqItem {
  const def = OPENING_TYPE_DEFS[item.openingType];
  const n = Math.max(def.minPanels, Math.max(1, Math.floor(count)));
  const leaves = panelLeaves(item.layout);
  const operable = leaves.slice(0, n).filter((p) => p.operation !== "fixed").length;
  let made = 0;
  const layout = equalColumnsLayout(leaves.slice(0, n), n, (i) => makePanelFor(def, i, n, operable + made++));
  return normalizeItemConfig({ ...item, layout });
}

/** Switch opening type; resets configuration to the type's defaults (never carries invalid controls over). */
export function changeOpeningType(item: RfqItem, openingType: RfqOpeningType): RfqItem {
  const def = OPENING_TYPE_DEFS[openingType];
  return normalizeItemConfig({
    ...item,
    openingType,
    category: def.category ?? item.category,
    layout: layoutFromPanels(def.defaultPanels()),
    panels: def.defaultPanels(),
    swing: undefined,
    activeLeaf: undefined,
  });
}

export function createRfqItem(opts: {
  id: string;
  openingType: RfqOpeningType;
  category?: RfqCategory;
  unit: RfqUnit;
  reference: string;
  withDefaultSize?: boolean;
}): RfqItem {
  const def = OPENING_TYPE_DEFS[opts.openingType];
  const panels = def.defaultPanels();
  return normalizeItemConfig({
    id: opts.id,
    reference: opts.reference,
    category: def.category ?? opts.category ?? "window",
    openingType: opts.openingType,
    widthCm: opts.withDefaultSize === false ? null : def.defaultSizeCm.width,
    heightCm: opts.withDefaultSize === false ? null : def.defaultSizeCm.height,
    unit: opts.unit,
    quantity: 1,
    location: "",
    layout: layoutFromPanels(panels),
    panels,
    customDescription: "",
    glassSpec: emptyGlassSpec(),
    glass: "",
    frameFinish: "",
    insectScreen: "unspecified",
    shutter: "unspecified",
    shading: [],
    accessories: [],
    completeHardwareSet: false,
    hardware: "",
    alternatives: [],
    otherRequirements: "",
    notes: "",
  });
}

export type ItemIssueCode =
  | "reference_required"
  | "reference_duplicate"
  | "width_required"
  | "height_required"
  | "width_invalid"
  | "height_invalid"
  | "quantity_invalid"
  | "category_mismatch"
  | "needs_operable_panel"
  | "hinged_leaf_count"
  | "custom_description_required"
  | "integrated_blind_single_glazing"
  | LayoutIssueCode;

export type ItemIssue = { code: ItemIssueCode; field: keyof RfqItem; nodeId?: string };

export function validateItem(item: RfqItem, otherReferences: Iterable<string> = []): ItemIssue[] {
  const issues: ItemIssue[] = [];
  const ref = item.reference.trim();
  if (!ref) issues.push({ code: "reference_required", field: "reference" });
  else {
    const upper = ref.toUpperCase();
    for (const r of otherReferences) {
      if (r.trim().toUpperCase() === upper) {
        issues.push({ code: "reference_duplicate", field: "reference" });
        break;
      }
    }
  }
  if (item.widthCm == null) issues.push({ code: "width_required", field: "widthCm" });
  else if (!(item.widthCm > 0) || !isFinite(item.widthCm)) issues.push({ code: "width_invalid", field: "widthCm" });
  if (item.heightCm == null) issues.push({ code: "height_required", field: "heightCm" });
  else if (!(item.heightCm > 0) || !isFinite(item.heightCm)) issues.push({ code: "height_invalid", field: "heightCm" });
  if (!Number.isInteger(item.quantity) || item.quantity < 1) issues.push({ code: "quantity_invalid", field: "quantity" });
  const def = OPENING_TYPE_DEFS[item.openingType];
  if (def.category && def.category !== item.category) issues.push({ code: "category_mismatch", field: "openingType" });
  if (item.openingType !== "custom") {
    const operable = item.panels.filter((p) => p.operation !== "fixed").length;
    if (def.operableLeaves != null) {
      if (operable !== def.operableLeaves) issues.push({ code: "hinged_leaf_count", field: "panels" });
    } else if (def.operableOp && def.allowFixedPanels && operable === 0) {
      issues.push({ code: "needs_operable_panel", field: "panels" });
    }
    const w = item.widthCm != null && isFinite(item.widthCm) ? item.widthCm : null;
    const h = item.heightCm != null && isFinite(item.heightCm) ? item.heightCm : null;
    for (const li of validateLayout(item.layout, w, h)) issues.push({ code: li.code, field: "layout", nodeId: li.nodeId });
  }
  if (item.openingType === "custom" && !item.customDescription.trim()) {
    issues.push({ code: "custom_description_required", field: "customDescription" });
  }
  if (integratedBlindConflicts(item).length) issues.push({ code: "integrated_blind_single_glazing", field: "shading" });
  return issues;
}

export function validateItems(items: RfqItem[]): Map<string, ItemIssue[]> {
  const out = new Map<string, ItemIssue[]>();
  items.forEach((it, idx) => {
    const others = items.filter((_, j) => j !== idx).map((o) => o.reference);
    const issues = validateItem(it, others);
    if (issues.length) out.set(it.id, issues);
  });
  return out;
}

export function totalUnits(items: RfqItem[]): number {
  return items.reduce((s, it) => s + (Number.isInteger(it.quantity) && it.quantity > 0 ? it.quantity : 0), 0);
}
