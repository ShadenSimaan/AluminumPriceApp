import { describe, expect, it } from "vitest";
import { buildDiagram } from "../../rfq/diagram";
import { createRfqItem } from "../../rfq/presets";

function fingerprint(openingType: "sliding_window" | "casement_window" | "fixed_window" | "sliding_door") {
  const item = createRfqItem({ id: openingType, openingType, unit: "cm", reference: openingType, withDefaultSize: true });
  const spec = buildDiagram(item, { width: 280, height: 220, customPlaceholder: "?", showDivisionDims: true });
  return JSON.stringify(spec.shapes.filter((shape) => shape.kind !== "text"));
}

describe("quotation drawings", () => {
  it("draws different configurations as different front views", () => {
    const sliding = fingerprint("sliding_window");
    const casement = fingerprint("casement_window");
    const fixed = fingerprint("fixed_window");
    const door = fingerprint("sliding_door");
    expect(new Set([sliding, casement, fixed, door]).size).toBe(4);
  });

  it("keeps an imported supplier image instead of inventing panels", () => {
    const item = createRfqItem({ id: "img", openingType: "custom", unit: "mm", reference: "W-01", withDefaultSize: false });
    item.referenceImage = { name: "w.png", mime: "image/png", dataUrl: "data:image/png;base64,abc" };
    item.widthCm = 160;
    item.heightCm = 112.5;
    const spec = buildDiagram(item, { width: 210, height: 188, customPlaceholder: "שרטוט מצורף", showDivisionDims: false });
    expect(spec.shapes.some((shape) => shape.kind === "image" && shape.dataUrl.includes("abc"))).toBe(true);
    expect(spec.shapes.some((shape) => shape.kind === "poly")).toBe(false);
  });
});
