// Structured, combinable glass requirements. These are general glass options; nothing here claims that a
// supplier offers a given combination. Unknown values stay blank and are exported as "supplier to propose/confirm".

import type {
  CavityFill,
  GlassAppearance,
  GlassCavity,
  GlassCoating,
  GlassNode,
  GlassPane,
  GlassPerformance,
  GlassSpec,
  GlassTreatment,
  GlazingConstruction,
  RfqItem,
} from "./types";

export const CONSTRUCTIONS: readonly GlazingConstruction[] = ["unspecified", "single", "double", "triple", "custom", "supplier"];
export const TREATMENTS: readonly GlassTreatment[] = ["unspecified", "annealed", "heat_strengthened", "tempered", "laminated", "tempered_laminated", "supplier"];
export const APPEARANCES: readonly GlassAppearance[] = ["unspecified", "clear", "low_iron", "tinted", "reflective", "frosted", "patterned", "custom"];
export const COATINGS: readonly GlassCoating[] = ["low_e", "solar_control", "uv", "acoustic", "custom"];
export const CAVITY_FILLS: readonly CavityFill[] = ["unspecified", "air", "argon", "other"];
export const PERFORMANCE_KEYS: readonly (keyof GlassPerformance)[] = ["uValue", "gValue", "lightTransmission", "uv", "acoustic"];

export function emptyPerformance(): GlassPerformance {
  return { uValue: "", gValue: "", lightTransmission: "", uv: "", acoustic: "" };
}

export function emptyGlassSpec(): GlassSpec {
  return {
    construction: "unspecified",
    constructionNote: "",
    treatment: "unspecified",
    appearance: "unspecified",
    tintColor: "",
    appearanceNote: "",
    coatings: [],
    coatingProduct: "",
    coatingSurface: "",
    customRequirement: "",
    panes: [],
    cavities: [],
    interlayer: "",
    required: emptyPerformance(),
    declared: emptyPerformance(),
    askRecommendation: false,
    notes: "",
  };
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const posOrNull = (v: unknown): number | null => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fb: T): T => (list.includes(v as T) ? (v as T) : fb);

function normalizePerformance(raw: unknown): GlassPerformance {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { uValue: str(o.uValue), gValue: str(o.gValue), lightTransmission: str(o.lightTransmission), uv: str(o.uv), acoustic: str(o.acoustic) };
}

export function fixedPaneCount(c: GlazingConstruction): number | null {
  return c === "single" ? 1 : c === "double" ? 2 : c === "triple" ? 3 : c === "custom" ? null : 0;
}

/** Resize panes/cavities to the construction while keeping already entered values. */
export function withPaneCount(spec: GlassSpec, count: number): GlassSpec {
  const n = Math.max(0, Math.floor(count));
  const panes: GlassPane[] = Array.from({ length: n }, (_, i) => spec.panes[i] ?? { thicknessMm: null, note: "" });
  const cavities: GlassCavity[] = Array.from({ length: Math.max(0, n - 1) }, (_, i) => spec.cavities[i] ?? { widthMm: null, fill: "unspecified", fillNote: "" });
  return { ...spec, panes, cavities };
}

export function setConstruction(spec: GlassSpec, construction: GlazingConstruction): GlassSpec {
  const fixed = fixedPaneCount(construction);
  const count = fixed ?? Math.max(1, spec.panes.length || 2);
  return withPaneCount({ ...spec, construction }, count);
}

export function normalizeGlassSpec(raw: unknown): GlassSpec {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const construction = oneOf(o.construction, CONSTRUCTIONS, "unspecified");
  const panes: GlassPane[] = Array.isArray(o.panes)
    ? (o.panes as unknown[]).map((p) => {
        const po = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
        return { thicknessMm: posOrNull(po.thicknessMm), note: str(po.note) };
      })
    : [];
  const cavities: GlassCavity[] = Array.isArray(o.cavities)
    ? (o.cavities as unknown[]).map((c) => {
        const co = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
        return { widthMm: posOrNull(co.widthMm), fill: oneOf(co.fill, CAVITY_FILLS, "unspecified"), fillNote: str(co.fillNote) };
      })
    : [];
  const coatings = Array.isArray(o.coatings) ? COATINGS.filter((c) => (o.coatings as unknown[]).includes(c)) : [];
  const spec: GlassSpec = {
    construction,
    constructionNote: str(o.constructionNote),
    treatment: oneOf(o.treatment, TREATMENTS, "unspecified"),
    appearance: oneOf(o.appearance, APPEARANCES, "unspecified"),
    tintColor: str(o.tintColor),
    appearanceNote: str(o.appearanceNote),
    coatings,
    coatingProduct: str(o.coatingProduct),
    coatingSurface: str(o.coatingSurface),
    customRequirement: str(o.customRequirement),
    panes,
    cavities,
    interlayer: str(o.interlayer),
    required: normalizePerformance(o.required),
    declared: normalizePerformance(o.declared),
    askRecommendation: o.askRecommendation === true,
    notes: str(o.notes),
  };
  const fixed = fixedPaneCount(construction);
  return withPaneCount(spec, fixed ?? Math.max(1, panes.length));
}

const blankPerf = (p: GlassPerformance) => PERFORMANCE_KEYS.every((k) => !p[k].trim());

export function isGlassSpecBlank(s: GlassSpec): boolean {
  return (
    s.construction === "unspecified" &&
    s.treatment === "unspecified" &&
    s.appearance === "unspecified" &&
    s.coatings.length === 0 &&
    !s.askRecommendation &&
    ![s.constructionNote, s.tintColor, s.appearanceNote, s.coatingProduct, s.coatingSurface, s.customRequirement, s.interlayer, s.notes].some((v) => v.trim()) &&
    s.panes.every((p) => p.thicknessMm == null && !p.note.trim()) &&
    s.cavities.every((c) => c.widthMm == null && c.fill === "unspecified" && !c.fillNote.trim()) &&
    blankPerf(s.required) &&
    blankPerf(s.declared)
  );
}

export type GlassGap = "construction" | "treatment" | "appearance" | "thickness" | "cavity" | "fill" | "tint";

/** Parts the supplier must propose or confirm (never filled in by us). */
export function glassGaps(s: GlassSpec): GlassGap[] {
  const gaps: GlassGap[] = [];
  if (s.construction === "unspecified" || s.construction === "supplier") gaps.push("construction");
  if (s.treatment === "unspecified" || s.treatment === "supplier") gaps.push("treatment");
  if (s.appearance === "unspecified") gaps.push("appearance");
  if (s.appearance === "tinted" && !s.tintColor.trim()) gaps.push("tint");
  if (s.panes.some((p) => p.thicknessMm == null && !p.note.trim())) gaps.push("thickness");
  if (s.cavities.some((c) => c.widthMm == null)) gaps.push("cavity");
  if (s.cavities.some((c) => c.fill === "unspecified")) gaps.push("fill");
  return gaps;
}

export function effectiveGlass(item: Pick<RfqItem, "glassSpec">, glass: GlassNode): GlassSpec {
  return glass.override ?? item.glassSpec;
}

/** Option keys used for supplier availability and linked questions. */
export function glassOptionKeys(s: GlassSpec): string[] {
  const keys: string[] = [];
  if (s.construction !== "unspecified" && s.construction !== "supplier" && s.construction !== "custom") keys.push(`glass.construction.${s.construction}`);
  if (s.treatment !== "unspecified" && s.treatment !== "supplier") keys.push(`glass.treatment.${s.treatment}`);
  if (s.appearance !== "unspecified" && s.appearance !== "custom") keys.push(`glass.appearance.${s.appearance}`);
  for (const c of s.coatings) if (c !== "custom") keys.push(`glass.coating.${c}`);
  return keys;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** "6 / 16 / 6" style make-up (mm) with "?" for unknown values; "" when there are no panes or nothing is known. */
export function formatMakeup(s: GlassSpec, fillLabel: (f: CavityFill) => string): string {
  const known = s.panes.some((p) => p.thicknessMm != null || p.note.trim()) || s.cavities.some((c) => c.widthMm != null || c.fill !== "unspecified");
  if (!known) return "";
  const parts: string[] = [];
  s.panes.forEach((p, i) => {
    parts.push(p.thicknessMm != null ? num(p.thicknessMm) : p.note.trim() || "?");
    const c = s.cavities[i];
    if (c && i < s.panes.length - 1) {
      const fill = c.fill === "unspecified" ? "" : c.fill === "other" ? ` ${c.fillNote.trim() || fillLabel("other")}` : ` ${fillLabel(c.fill)}`;
      parts.push(`${c.widthMm != null ? num(c.widthMm) : "?"}${fill}`);
    }
  });
  return `${parts.join(" / ")} mm`;
}

/**
 * Parse a make-up such as "6-16-6", "4+4-12-6" or "6/16/4/16/6" (mm). Laminated groups ("4+4") are kept as
 * pane notes because the total thickness depends on the interlayer, which is not invented here.
 */
export function parseMakeup(raw: string): { panes: GlassPane[]; cavities: GlassCavity[] } | null {
  const tokens = raw
    .replace(/mm/gi, "")
    .split(/\s*[-/]\s*/)
    .map((t) => t.trim())
    .filter(Boolean);
  if (!tokens.length || tokens.length % 2 === 0) return null;
  const panes: GlassPane[] = [];
  const cavities: GlassCavity[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i].replace(",", ".");
    if (i % 2 === 0) {
      if (/^\d+(\.\d+)?$/.test(t) && Number(t) > 0) panes.push({ thicknessMm: Number(t), note: "" });
      else if (/^\d+(\.\d+)?(\s*\+\s*\d+(\.\d+)?)+(\s*\S+)?$/.test(t)) panes.push({ thicknessMm: null, note: tokens[i] });
      else return null;
    } else {
      const m = /^(\d+(?:\.\d+)?)\s*(air|argon|ar)?$/i.exec(t);
      if (!m || !(Number(m[1]) > 0)) return null;
      const fill: CavityFill = !m[2] ? "unspecified" : m[2].toLowerCase() === "air" ? "air" : "argon";
      cavities.push({ widthMm: Number(m[1]), fill, fillNote: "" });
    }
  }
  return { panes, cavities };
}

export function constructionForPaneCount(n: number): GlazingConstruction {
  return n === 1 ? "single" : n === 2 ? "double" : n === 3 ? "triple" : "custom";
}

/** True when the glass is explicitly single glazing (integrated blinds need an insulated glass unit). */
export function isSingleGlazing(s: GlassSpec): boolean {
  return s.construction === "single" || (s.construction === "custom" && s.panes.length === 1);
}
