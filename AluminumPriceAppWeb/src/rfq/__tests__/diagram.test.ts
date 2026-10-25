import { describe, expect, it } from "vitest";
import { buildDiagram, type DiagramShape } from "../diagram";
import { changeOpeningType, createRfqItem, normalizeItemConfig, setPanelCount, validateItem, OPENING_TYPE_DEFS } from "../presets";
import { cmToUnit, convertUnitValue, formatDimension, parseStrictNumber, unitToCm } from "../units";
import { RFQ_OPENING_TYPES } from "../types";
import { item } from "./fixtures";

const opts = { width: 300, height: 260, customPlaceholder: "Custom" };
const texts = (shapes: DiagramShape[]) => shapes.filter((s): s is Extract<DiagramShape, { kind: "text" }> => s.kind === "text").map((s) => s.text);
const frame = (shapes: DiagramShape[]) => shapes.find((s) => s.kind === "rect") as Extract<DiagramShape, { kind: "rect" }>;

describe("unit conversion", () => {
  it("1200 mm is 120 cm and the physical item does not change", () => {
    expect(unitToCm(1200, "mm")).toBe(120);
    expect(cmToUnit(120, "mm")).toBe(1200);
    expect(convertUnitValue(1200, "mm", "cm")).toBe(120);
    const mm = item("fixed_window", { widthCm: unitToCm(1200, "mm"), heightCm: 100, unit: "mm" });
    const cm = { ...mm, unit: "cm" as const };
    expect(cm.widthCm).toBe(mm.widthCm);
    expect(formatDimension(mm.widthCm, "mm")).toBe("1200");
    expect(formatDimension(cm.widthCm, "cm")).toBe("120");
    // Same geometry regardless of display unit
    const a = frame(buildDiagram(mm, opts).shapes);
    const b = frame(buildDiagram(cm, opts).shapes);
    expect(a).toEqual(b);
  });

  it("keeps mm precision without floating point noise", () => {
    expect(cmToUnit(unitToCm(1203, "mm"), "mm")).toBe(1203);
    expect(formatDimension(120.35, "cm")).toBe("120.35");
    expect(formatDimension(120.35, "mm")).toBe("1203.5");
  });

  it("parses numbers strictly", () => {
    expect(parseStrictNumber("1200")).toBe(1200);
    expect(parseStrictNumber("120,5")).toBe(120.5);
    expect(parseStrictNumber("1,200")).toBeNull();
    expect(parseStrictNumber("12O0")).toBeNull();
    expect(parseStrictNumber("")).toBeNull();
  });
});

describe("diagram configuration", () => {
  it("preserves the width-to-height proportion", () => {
    const f = frame(buildDiagram(item("fixed_window", { widthCm: 300, heightCm: 60 }), opts).shapes);
    expect(f.w / f.h).toBeCloseTo(5, 5);
    const g = frame(buildDiagram(item("hinged_door_single", { widthCm: 90, heightCm: 210 }), opts).shapes);
    expect(g.w / g.h).toBeCloseTo(90 / 210, 5);
  });

  it("labels width, height and reference", () => {
    const t = texts(buildDiagram(item("sliding_window", { reference: "W-07", widthCm: 180, heightCm: 130, unit: "mm" }), opts).shapes);
    expect(t).toEqual(expect.arrayContaining(["W-07", "1800 mm", "1300 mm"]));
  });

  it("updates when configuration changes", () => {
    const base = item("casement_window", { panels: [{ operation: "casement", hingeSide: "left" }] });
    const left = buildDiagram(base, opts);
    const right = buildDiagram(normalizeItemConfig({ ...base, panels: [{ operation: "casement", hingeSide: "right" }] }), opts);
    expect(left).not.toEqual(right);
    const three = buildDiagram(setPanelCount(base, 3), opts);
    expect(three.shapes.length).toBeGreaterThan(left.shapes.length);
  });

  it("draws the hinge-side triangle apex on the hinge side, and inward as dashed", () => {
    const it = item("casement_window", { swing: "inward", panels: [{ operation: "casement", hingeSide: "right" }] });
    const spec = buildDiagram(it, opts);
    const tri = spec.shapes.find((s) => s.kind === "poly" && !s.closed) as Extract<DiagramShape, { kind: "poly" }>;
    const [p0, apex, p2] = tri.points;
    expect(apex[0]).toBeGreaterThan(p0[0]);
    expect(p0[0]).toBe(p2[0]);
    expect(tri.dash).toBeDefined();
    const out = buildDiagram({ ...it, swing: "outward" }, opts).shapes.find((s) => s.kind === "poly" && !s.closed) as Extract<DiagramShape, { kind: "poly" }>;
    expect(out.dash).toBeUndefined();
  });

  it("points sliding arrows in the configured direction", () => {
    const it = item("sliding_window", { panels: [{ operation: "sliding", slideDirection: "right" }, { operation: "fixed" }] });
    const heads = buildDiagram(it, opts).shapes.filter((s) => s.kind === "poly" && s.closed) as Extract<DiagramShape, { kind: "poly" }>[];
    expect(heads).toHaveLength(1);
    const [tip, back] = heads[0].points;
    expect(tip[0]).toBeGreaterThan(back[0]);
    expect(texts(buildDiagram(it, opts).shapes)).toContain("F");
  });

  it("is identical for every UI language except the custom placeholder text", () => {
    for (const t of RFQ_OPENING_TYPES) {
      const it = item(t, { customDescription: "x" });
      const en = buildDiagram(it, { ...opts, customPlaceholder: "Custom item" });
      const he = buildDiagram(it, { ...opts, customPlaceholder: "פריט מותאם" });
      const strip = (s: DiagramShape[]) => s.map((x) => (x.kind === "text" && (x.text === "Custom item" || x.text === "פריט מותאם") ? { ...x, text: "", size: 0 } : x));
      expect(strip(he.shapes)).toEqual(strip(en.shapes));
    }
  });

  it("does not draw a standard opening diagram for custom items", () => {
    const shapes = buildDiagram(item("custom", { customDescription: "Arched" }), opts).shapes;
    expect(shapes.some((s) => s.kind === "poly")).toBe(false);
    expect(texts(shapes)).toContain("Custom");
    const withImg = buildDiagram(item("custom", { customDescription: "Arched", referenceImage: { name: "a.jpg", mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AA==" } }), opts).shapes;
    expect(withImg.some((s) => s.kind === "image")).toBe(true);
  });
});

describe("presets offer only valid configurations", () => {
  it("every preset creates a valid item", () => {
    for (const t of RFQ_OPENING_TYPES) {
      const it = createRfqItem({ id: t, openingType: t, unit: "mm", reference: "A-1" });
      const issues = validateItem(t === "custom" ? { ...it, customDescription: "x" } : it);
      expect(issues, t).toEqual([]);
    }
  });

  it("switching type resets configuration to that type's valid controls", () => {
    let it = item("sliding_door", { panels: [{ operation: "fixed" }, { operation: "sliding", slideDirection: "left" }, { operation: "fixed" }] });
    it = changeOpeningType(it, "hinged_door_double");
    expect(it.panels).toEqual([
      { operation: "hinged", hingeSide: "left" },
      { operation: "hinged", hingeSide: "right" },
    ]);
    expect(it.activeLeaf).toBe("right");
    it = changeOpeningType(it, "tilt_turn_window");
    expect(it.swing).toBe("inward");
    expect(it.category).toBe("window");
    it = changeOpeningType(it, "fixed_window");
    expect(it.swing).toBeUndefined();
    expect(it.panels.every((p) => p.operation === "fixed")).toBe(true);
  });

  it("clamps panel counts to the type's limits", () => {
    const def = OPENING_TYPE_DEFS.sliding_window;
    expect(setPanelCount(item("sliding_window"), 99).panels).toHaveLength(def.maxPanels);
    expect(setPanelCount(item("sliding_window"), 0).panels).toHaveLength(def.minPanels);
    expect(setPanelCount(item("hinged_door_single"), 3).panels).toHaveLength(1);
  });

  it("requires at least one opening panel for opening types", () => {
    const it = item("sliding_window", { panels: [{ operation: "fixed" }, { operation: "fixed" }] });
    expect(validateItem(it).map((i) => i.code)).toContain("needs_operable_panel");
  });
});
