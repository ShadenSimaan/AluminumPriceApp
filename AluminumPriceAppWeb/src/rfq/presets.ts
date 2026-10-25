import type {
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

export type OpeningTypeDef = {
  id: RfqOpeningType;
  /** null = user chooses (custom) */
  category: RfqCategory | null;
  /** Operation used for operable panels; null = no operable panels */
  operableOp: Exclude<PanelOperation, "fixed"> | null;
  /** Whether individual panels may be switched to fixed */
  allowFixedPanels: boolean;
  minPanels: number;
  maxPanels: number;
  /** "choose" = user selects inward/outward; fixed value = implied by the type; null = not applicable */
  swing: "choose" | Swing | null;
  defaultPanels: () => RfqPanel[];
  defaultSizeCm: { width: number; height: number };
};

const towardCenter = (index: number, count: number): Side => (index < count / 2 ? "right" : "left");

export const OPENING_TYPE_DEFS: Record<RfqOpeningType, OpeningTypeDef> = {
  fixed_window: {
    id: "fixed_window",
    category: "window",
    operableOp: null,
    allowFixedPanels: true,
    minPanels: 1,
    maxPanels: 6,
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
    maxPanels: 6,
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
    maxPanels: 4,
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
    maxPanels: 3,
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
    maxPanels: 3,
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
    maxPanels: 6,
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
    allowFixedPanels: false,
    minPanels: 1,
    maxPanels: 1,
    swing: "choose",
    defaultPanels: () => [{ operation: "hinged", hingeSide: "left" }],
    defaultSizeCm: { width: 90, height: 210 },
  },
  hinged_door_double: {
    id: "hinged_door_double",
    category: "door",
    operableOp: "hinged",
    allowFixedPanels: false,
    minPanels: 2,
    maxPanels: 2,
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
    maxPanels: 0,
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

/** Makes `panels` / `swing` / `activeLeaf` valid for the item's opening type (used after every edit). */
export function normalizeItemConfig(item: RfqItem): RfqItem {
  const def = OPENING_TYPE_DEFS[item.openingType];
  const category = def.category ?? item.category;
  let panels: RfqPanel[] = Array.isArray(item.panels) ? item.panels.slice(0, def.maxPanels) : [];
  if (panels.length === 0) panels = def.defaultPanels();
  if (panels.length < def.minPanels) panels = padPanels(panels, def, def.minPanels);
  panels = panels.map((p, i) => normalizePanel(p, i, panels.length, def));

  if (item.openingType === "hinged_door_double") {
    panels = [
      { operation: "hinged", hingeSide: "left" },
      { operation: "hinged", hingeSide: "right" },
    ];
  }

  let swing: Swing | undefined;
  if (def.swing === "choose") swing = item.swing === "outward" ? "outward" : "inward";
  else if (def.swing) swing = def.swing;

  const activeLeaf: Side | undefined =
    item.openingType === "hinged_door_double" ? (item.activeLeaf === "left" ? "left" : "right") : undefined;

  return { ...item, category, panels, swing, activeLeaf };
}

function normalizePanel(p: RfqPanel, index: number, count: number, def: OpeningTypeDef): RfqPanel {
  const op = def.operableOp;
  if (!op) return { operation: "fixed" };
  const wantsFixed = p?.operation === "fixed" && def.allowFixedPanels;
  if (wantsFixed) return { operation: "fixed" };
  if (op === "sliding") {
    const dir = p?.slideDirection === "left" || p?.slideDirection === "right" ? p.slideDirection : towardCenter(index, count);
    return { operation: "sliding", slideDirection: dir };
  }
  if (op === "top_hung") return { operation: "top_hung" };
  const hinge = p?.hingeSide === "left" || p?.hingeSide === "right" ? p.hingeSide : index < count / 2 ? "left" : "right";
  return { operation: op, hingeSide: hinge };
}

function padPanels(panels: RfqPanel[], def: OpeningTypeDef, count: number): RfqPanel[] {
  const out = panels.slice();
  while (out.length < count) out.push({ operation: def.operableOp ?? "fixed" });
  return out;
}

/** Change the panel count while keeping the existing panels' configuration where possible. */
export function setPanelCount(item: RfqItem, count: number): RfqItem {
  const def = OPENING_TYPE_DEFS[item.openingType];
  const n = Math.max(def.minPanels, Math.min(def.maxPanels, Math.floor(count)));
  const panels = item.panels.slice(0, n);
  while (panels.length < n) panels.push({ operation: def.operableOp ?? "fixed" });
  // Re-derive default slide directions for newly added sliding panels
  const withDirs = panels.map((p, i) =>
    i >= item.panels.length && p.operation === "sliding" ? { ...p, slideDirection: towardCenter(i, n) } : p
  );
  return normalizeItemConfig({ ...item, panels: withDirs });
}

/** Switch opening type; resets configuration to the type's defaults (never carries invalid controls over). */
export function changeOpeningType(item: RfqItem, openingType: RfqOpeningType): RfqItem {
  const def = OPENING_TYPE_DEFS[openingType];
  return normalizeItemConfig({
    ...item,
    openingType,
    category: def.category ?? item.category,
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
    panels: def.defaultPanels(),
    customDescription: "",
    glass: "",
    frameFinish: "",
    insectScreen: "unspecified",
    shutter: "unspecified",
    hardware: "",
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
  | "custom_description_required";

export type ItemIssue = { code: ItemIssueCode; field: keyof RfqItem };

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
  if (def.operableOp && def.allowFixedPanels) {
    if (!item.panels.some((p) => p.operation !== "fixed")) issues.push({ code: "needs_operable_panel", field: "panels" });
  }
  if (item.openingType === "custom" && !item.customDescription.trim()) {
    issues.push({ code: "custom_description_required", field: "customDescription" });
  }
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
