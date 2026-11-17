import type { GlassSpec, RfqItem } from "../types";
import { formatLayoutNotation, isAdvancedLayout } from "../layout";
import { makePanelFor, OPENING_TYPE_DEFS } from "../presets";
import { writeXlsx } from "./xlsx";
import { toCsv } from "./csv";
import { TEMPLATE_FIELDS, TEMPLATE_HEADERS } from "./template";
import type { ImportField } from "./schema";

const word = (key: string) => key.replace(/_/g, " ");
const round = (n: number) => Math.round(n * 100) / 100;

/** Dash-separated make-up the importer accepts; "" when any thickness or cavity is unknown. */
function makeupCell(s: GlassSpec): string {
  if (!s.panes.length) return "";
  const parts: string[] = [];
  for (let i = 0; i < s.panes.length; i++) {
    const p = s.panes[i];
    const t = p.thicknessMm != null ? String(round(p.thicknessMm)) : p.note.trim();
    if (!t || /[-/]/.test(t)) return "";
    parts.push(t);
    if (i < s.panes.length - 1) {
      const c = s.cavities[i];
      if (!c || c.widthMm == null) return "";
      parts.push(String(round(c.widthMm)));
    }
  }
  return parts.join("-");
}

/**
 * Whether the panels/fixedPanels/hingeSide columns reproduce every panel's side on import: hinge sides must be
 * one shared side or the positional default, and slide directions the default (toward the centre).
 */
function sidesFitColumns(item: RfqItem): { fits: boolean; hinge?: "left" | "right" } {
  const def = OPENING_TYPE_DEFS[item.openingType];
  const n = item.panels.length;
  const hinged = item.panels.map((p, i) => ({ p, i })).filter(({ p }) => p.hingeSide);
  const sides = new Set(hinged.map(({ p }) => p.hingeSide));
  const positional = hinged.every(({ p, i }) => p.hingeSide === makePanelFor(def, i, n).hingeSide);
  const slides = item.panels.every((p, i) => !p.slideDirection || p.slideDirection === makePanelFor(def, i, n).slideDirection);
  if (!slides) return { fits: false };
  if (sides.size === 1 && !(positional && n > 1)) return { fits: true, hinge: hinged[0].p.hingeSide };
  return { fits: sides.size === 0 || positional };
}

function rowFor(item: RfqItem): Partial<Record<ImportField, string | number>> {
  const g = item.glassSpec;
  const custom = item.openingType === "custom";
  const sides = custom ? { fits: true } : sidesFitColumns(item);
  const simple = !custom && !isAdvancedLayout(item.layout) && sides.fits;
  const fixed = item.panels.map((p, i) => (p.operation === "fixed" ? i + 1 : 0)).filter(Boolean);
  const hinge = simple ? sides.hinge : undefined;
  const fills = [...new Set(g.cavities.map((c) => c.fill).filter((f) => f !== "unspecified"))];
  const shade = item.shading[0];
  return {
    reference: item.reference,
    category: item.category,
    openingType: word(item.openingType),
    width: item.widthCm != null ? round(item.widthCm * 10) : "",
    height: item.heightCm != null ? round(item.heightCm * 10) : "",
    quantity: item.quantity,
    location: item.location,
    panels: custom || !simple ? "" : item.panels.length,
    fixedPanels: custom || !simple ? "" : fixed.join(","),
    layout: custom || simple ? "" : formatLayoutNotation(item.layout, "mm"),
    hingeSide: item.openingType === "hinged_door_double" ? "" : hinge ?? "",
    swing: item.swing ?? "",
    activeLeaf: item.activeLeaf ?? "",
    glass: item.glass,
    glassConstruction: g.construction === "unspecified" ? "" : g.construction === "supplier" ? "ask supplier" : word(g.construction),
    glassTreatment: g.treatment === "unspecified" ? "" : g.treatment === "supplier" ? "ask supplier" : word(g.treatment),
    glassAppearance: g.appearance === "unspecified" ? "" : word(g.appearance),
    glassTint: g.appearance === "tinted" ? g.tintColor : "",
    glassCoatings: g.coatings.map(word).join(", "),
    glassMakeup: makeupCell(g),
    cavityFill: fills.length === 1 ? fills[0] : "",
    frameFinish: item.frameFinish,
    insectScreen: item.insectScreen === "required" ? "yes" : item.insectScreen === "not_required" ? "no" : "",
    shutter: item.shutter === "required" ? "yes" : item.shutter === "not_required" ? "no" : "",
    shading: shade ? (shade.type === "supplier" ? "ask supplier" : word(shade.type)) : "",
    shadingOperation: shade && shade.operation !== "unspecified" ? shade.operation : "",
    shadingColor: shade?.color ?? "",
    hardwareSet: item.completeHardwareSet ? "yes" : "",
    hardware: item.hardware,
    alternatives: item.alternatives.map((a) => a.description.trim()).filter(Boolean).join("; "),
    otherRequirements: item.otherRequirements,
    description: item.customDescription,
    notes: item.notes,
  };
}

/**
 * Items in the import-template columns (dimensions in mm). Section-level glass overrides, extra blinds and
 * accessory details have no column; they are kept in the request file (.json) export instead.
 */
export function itemExportRows(items: RfqItem[]): (string | number)[][] {
  return [TEMPLATE_HEADERS, ...items.map((it) => {
    const r = rowFor(it);
    return TEMPLATE_FIELDS.map((f) => r[f] ?? "");
  })];
}

export function buildItemsXlsx(items: RfqItem[]): Uint8Array {
  const rows = itemExportRows(items);
  return writeXlsx([{ name: "Items", rows, colWidths: TEMPLATE_HEADERS.map((h) => Math.min(34, Math.max(12, h.length * 0.9))) }]);
}

export function buildItemsCsv(items: RfqItem[]): string {
  return toCsv(itemExportRows(items).map((r) => r.map(String)));
}
