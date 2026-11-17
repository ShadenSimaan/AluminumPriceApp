import type {
  Accessory,
  AccessoryKind,
  AccessoryMode,
  Availability,
  PanelOperation,
  Requirement,
  RfqItem,
  ShadingEntry,
  ShadingOperation,
  ShadingType,
} from "./types";
import { ACCESSORY_KINDS, AVAILABILITIES, SHADING_TYPES } from "./types";
import { numberedGlass, panelLeaves } from "./layout";
import { effectiveGlass, isSingleGlazing } from "./glass";

export const ACCESSORY_MODES: readonly AccessoryMode[] = ["unspecified", "included", "separate", "excluded", "ask"];

const BY_OPERATION: Record<PanelOperation, AccessoryKind[]> = {
  fixed: ["gaskets", "fixings"],
  sliding: ["handles", "rollers_tracks", "locks", "restrictors", "gaskets", "insect_screen", "fixings"],
  casement: ["handles", "hinges", "friction_stays", "locks", "restrictors", "gaskets", "insect_screen", "fixings"],
  tilt_turn: ["handles", "hinges", "locks", "restrictors", "gaskets", "insect_screen", "fixings"],
  top_hung: ["handles", "hinges", "friction_stays", "locks", "restrictors", "gaskets", "insect_screen", "fixings"],
  hinged: ["handles", "hinges", "locks", "restrictors", "gaskets", "insect_screen", "fixings"],
};

/** Accessory kinds that are typical for the operations present in the item (custom is always available). */
export function applicableAccessoryKinds(item: RfqItem): AccessoryKind[] {
  const ops = new Set(item.openingType === "custom" ? (["fixed", "sliding", "casement", "hinged"] as PanelOperation[]) : panelLeaves(item.layout).map((p) => p.operation));
  const kinds = new Set<AccessoryKind>();
  for (const op of ops) for (const k of BY_OPERATION[op]) kinds.add(k);
  return ACCESSORY_KINDS.filter((k) => k !== "custom" && kinds.has(k));
}

export function newAccessory(id: string, kind: AccessoryKind, mode: AccessoryMode = "unspecified"): Accessory {
  return { id, kind, customName: "", mode, quantity: null, model: "", finish: "", compatibility: "", appliesTo: [], notes: "", confirmation: "not_verified" };
}

export function newShading(id: string, type: ShadingType): ShadingEntry {
  return { id, type, appliesTo: [], customType: "", location: "", color: "", operation: "unspecified", control: "", dimensions: "", installation: "", notes: "", confirmation: "not_verified" };
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);
const ids = (v: unknown): string[] => (Array.isArray(v) ? (v as unknown[]).map(str).filter(Boolean) : []);

export function normalizeAccessory(raw: unknown, fallbackId: string): Accessory | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!ACCESSORY_KINDS.includes(o.kind as AccessoryKind)) return null;
  const q = typeof o.quantity === "number" && Number.isInteger(o.quantity) && o.quantity > 0 ? o.quantity : null;
  return {
    id: str(o.id) || fallbackId,
    kind: o.kind as AccessoryKind,
    customName: str(o.customName),
    mode: oneOf(o.mode, ACCESSORY_MODES, "unspecified"),
    quantity: q,
    model: str(o.model),
    finish: str(o.finish),
    compatibility: str(o.compatibility),
    appliesTo: ids(o.appliesTo),
    notes: str(o.notes),
    confirmation: oneOf(o.confirmation, AVAILABILITIES, "not_verified" as Availability),
  };
}

export function normalizeShading(raw: unknown, fallbackId: string): ShadingEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (!SHADING_TYPES.includes(o.type as ShadingType)) return null;
  return {
    id: str(o.id) || fallbackId,
    type: o.type as ShadingType,
    appliesTo: ids(o.appliesTo),
    customType: str(o.customType),
    location: str(o.location),
    color: str(o.color),
    operation: oneOf(o.operation, ["unspecified", "manual", "motorized"] as ShadingOperation[], "unspecified"),
    control: str(o.control),
    dimensions: str(o.dimensions),
    installation: str(o.installation),
    notes: str(o.notes),
    confirmation: oneOf(o.confirmation, AVAILABILITIES, "not_verified" as Availability),
  };
}

/** Drop links to panels/glass that no longer exist (e.g. after merging sections). */
export function pruneLinks(item: RfqItem): RfqItem {
  const panelIds = new Set(panelLeaves(item.layout).map((p) => p.id));
  const glassIds = new Set(numberedGlass(item.layout).map((g) => g.glass.id));
  const valid = (id: string) => panelIds.has(id) || glassIds.has(id);
  const shading = item.shading.map((s) => (s.appliesTo.every(valid) ? s : { ...s, appliesTo: s.appliesTo.filter(valid) }));
  const accessories = item.accessories.map((a) => (a.appliesTo.every(valid) ? a : { ...a, appliesTo: a.appliesTo.filter(valid) }));
  const same = shading.every((s, i) => s === item.shading[i]) && accessories.every((a, i) => a === item.accessories[i]);
  return same ? item : { ...item, shading, accessories };
}

/** Glass sections an entry applies to: explicit glass ids, glass of linked panels, or all sections. */
export function glassForEntry(item: RfqItem, appliesTo: string[]) {
  const all = numberedGlass(item.layout);
  if (!appliesTo.length) return all;
  return all.filter((g) => appliesTo.includes(g.glass.id) || appliesTo.includes(g.panel.id));
}

export type BlindConflict = { entryId: string; glassNumbers: number[]; glassIds: string[] };

/** Integrated blinds need an insulated glass unit; explicitly single glazing is a conflict. */
export function integratedBlindConflicts(item: RfqItem): BlindConflict[] {
  const out: BlindConflict[] = [];
  for (const s of item.shading) {
    if (s.type !== "integrated") continue;
    const bad = glassForEntry(item, s.appliesTo).filter((g) => isSingleGlazing(effectiveGlass(item, g.glass)));
    if (bad.length) out.push({ entryId: s.id, glassNumbers: bad.map((g) => g.number), glassIds: bad.map((g) => g.glass.id) });
  }
  return out;
}

/** Legacy insect-screen requirement ↔ insect-screen accessory (the accessory is the source of truth once present). */
export function insectScreenRequirement(item: Pick<RfqItem, "accessories">): Requirement | null {
  const a = item.accessories.find((x) => x.kind === "insect_screen");
  if (!a) return null;
  if (a.mode === "included" || a.mode === "separate") return "required";
  if (a.mode === "excluded") return "not_required";
  return "unspecified";
}

export function accessoryFromLegacyScreen(id: string, req: Requirement): Accessory | null {
  if (req === "required") return newAccessory(id, "insect_screen", "included");
  if (req === "not_required") return newAccessory(id, "insect_screen", "excluded");
  return null;
}

export function isAccessoryUsed(a: Accessory): boolean {
  return a.mode !== "unspecified" || a.quantity != null || [a.model, a.finish, a.compatibility, a.notes, a.customName].some((v) => v.trim()) || a.appliesTo.length > 0;
}
