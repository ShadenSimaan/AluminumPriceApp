import { describe, expect, it } from "vitest";
import { validateItem } from "../presets";
import {
  divideGlass,
  glassLeavesOf,
  gridLayout,
  layoutGeometry,
  mergeAdjacent,
  mergeOptions,
  newPanel,
  panelLeaves,
  setChildSize,
  setGlassOverride,
  splitNode,
} from "../layout";
import type { FrameNode, GlassSpec, PanelNode } from "../types";
import { emptyGlassSpec, setConstruction } from "../glass";
import { item } from "./fixtures";

const dims = { widthCm: 120, heightCm: 80 };

function asPanel(root: FrameNode): PanelNode {
  if (root.kind !== "panel") throw new Error("expected a panel");
  return root;
}

function area(root: FrameNode) {
  const geo = layoutGeometry(root, dims.widthCm, dims.heightCm);
  return geo.glass.reduce((s, g) => s + g.rect.w * g.rect.h, 0);
}

describe("directional glass merge", () => {
  it("names the real side instead of only the previous or next sibling", () => {
    const panel = newPanel("fixed");
    const columns = divideGlass(panel, panel.id, "columns", 2);
    const [left, right] = glassLeavesOf(asPanel(columns).glazing);
    expect(mergeOptions(columns, left.id, dims).map((o) => o.dir)).toEqual(["right"]);
    expect(mergeOptions(columns, right.id, dims).map((o) => o.dir)).toEqual(["left"]);

    const rows = divideGlass(panel, panel.id, "rows", 2);
    const [top, bottom] = glassLeavesOf(asPanel(rows).glazing);
    expect(mergeOptions(rows, top.id, dims).map((o) => o.dir)).toEqual(["bottom"]);
    expect(mergeOptions(rows, bottom.id, dims).map((o) => o.dir)).toEqual(["top"]);
  });

  it("merges a glass section with the piece beside it and with the piece above or below", () => {
    let root: FrameNode = newPanel("fixed");
    root = divideGlass(root, root.id, "columns", 2);
    const pair = glassLeavesOf(asPanel(root).glazing);
    root = splitNode(root, pair[0].id, "rows", 2);
    root = splitNode(root, pair[1].id, "rows", 2);
    const [tl, bl, tr, br] = glassLeavesOf(asPanel(root).glazing);
    const dirs = mergeOptions(root, tl.id, dims).map((o) => `${o.dir}:${o.neighborId === tr.id ? "tr" : o.neighborId === bl.id ? "bl" : o.neighborId}`);
    expect(dirs.sort()).toEqual(["bottom:bl", "right:tr"]);

    const joined = mergeAdjacent(root, tl.id, tr.id, dims);
    const glass = glassLeavesOf(asPanel(joined).glazing);
    expect(glass.map((g) => g.id)).toContain(tl.id);
    expect(glass.map((g) => g.id)).not.toContain(tr.id);
    expect(glass).toHaveLength(3);
    const geo = layoutGeometry(joined, dims.widthCm, dims.heightCm);
    const top = geo.glass.find((g) => g.node.id === tl.id)!;
    expect(top.rect.w).toBeCloseTo(dims.widthCm, 1);
    expect(top.rect.h).toBeCloseTo(dims.heightCm / 2, 1);
    expect(area(joined)).toBeCloseTo(dims.widthCm * dims.heightCm, 1);
    expect(geo.glass.find((g) => g.node.id === bl.id)).toBeTruthy();
    expect(geo.glass.find((g) => g.node.id === br.id)).toBeTruthy();

    const down = mergeAdjacent(root, tl.id, bl.id, dims);
    expect(glassLeavesOf(asPanel(down).glazing)).toHaveLength(3);
    const left = layoutGeometry(down, dims.widthCm, dims.heightCm).glass.find((g) => g.node.id === tl.id)!;
    expect(left.rect.h).toBeCloseTo(dims.heightCm, 1);
    expect(left.rect.w).toBeCloseTo(dims.widthCm / 2, 1);
  });

  it("joins a short section with the part of a taller neighbor that lines up", () => {
    let root: FrameNode = newPanel("fixed");
    root = divideGlass(root, root.id, "columns", 2);
    const [left, right] = glassLeavesOf(asPanel(root).glazing);
    const frosted: GlassSpec = { ...setConstruction(emptyGlassSpec(), "double"), appearance: "frosted" };
    const clear: GlassSpec = { ...setConstruction(emptyGlassSpec(), "double"), appearance: "clear" };
    root = setGlassOverride(root, left.id, frosted);
    root = splitNode(root, right.id, "rows", 2);
    const split = parentSplit(root, right.id);
    root = setChildSize(root, split.id, 0, 30);
    const topRight = glassLeavesOf(asPanel(root).glazing).find((g) => g.id !== left.id && g.override == null)!;
    root = setGlassOverride(root, topRight.id, clear);
    const opt = mergeOptions(root, topRight.id, dims).find((o) => o.dir === "left");
    expect(opt?.aligned).toBe(false);
    expect(opt?.neighborId).toBe(left.id);

    const joined = mergeAdjacent(root, topRight.id, left.id, dims);
    const geo = layoutGeometry(joined, dims.widthCm, dims.heightCm);
    expect(geo.glass).toHaveLength(3);
    const kept = geo.glass.find((g) => g.node.id === topRight.id)!;
    expect(kept.node.override?.appearance).toBe("clear");
    expect(kept.rect.y).toBeCloseTo(0, 1);
    expect(kept.rect.h).toBeCloseTo(30, 1);
    expect(kept.rect.w).toBeCloseTo(dims.widthCm, 1);
    const leftover = geo.glass.find((g) => g.node.override?.appearance === "frosted");
    expect(leftover).toBeTruthy();
    expect(leftover!.rect.y).toBeCloseTo(30, 1);
    expect(area(joined)).toBeCloseTo(dims.widthCm * dims.heightCm, 0);
  });

  it("merges panels across a grid, and refuses a panel whose glass is still divided", () => {
    const root = gridLayout([newPanel("casement")], 2, 2, () => newPanel("fixed"));
    const panels = panelLeaves(root);
    const topLeft = panels[0];
    const topRight = panels[2];
    expect(mergeOptions(root, topLeft.id, dims).some((o) => o.dir === "right" && o.neighborId === topRight.id)).toBe(true);
    const joined = mergeAdjacent(root, topLeft.id, topRight.id, dims);
    expect(panelLeaves(joined)).toHaveLength(3);
    const wide = layoutGeometry(joined, dims.widthCm, dims.heightCm).panels.find((p) => p.node.id === topLeft.id)!;
    expect(wide.rect.w).toBeCloseTo(dims.widthCm, 1);
    expect(wide.node.operation).toBe("casement");

    const base = newPanel("fixed");
    const divided = divideGlass(base, base.id, "rows", 2) as PanelNode;
    const beside = gridLayout([divided, newPanel("fixed")], 2, 1, () => newPanel("fixed"));
    const [a, b] = panelLeaves(beside);
    const blocked = mergeOptions(beside, b.id, dims).find((o) => o.neighborId === a.id);
    expect(blocked?.blocked).toBe(true);
    expect(mergeAdjacent(beside, b.id, a.id, dims)).toBe(beside);
  });

  it("keeps a merged layout valid on an item", () => {
    let it = item("fixed_window", { widthCm: 100, heightCm: 140 });
    const panel = panelLeaves(it.layout)[0];
    it = { ...it, layout: divideGlass(it.layout, panel.id, "columns", 2) };
    const [left] = glassLeavesOf(asPanel(panelLeaves(it.layout)[0]).glazing);
    it = { ...it, layout: splitNode(it.layout, left.id, "rows", 2) };
    const glass = glassLeavesOf(asPanel(panelLeaves(it.layout)[0]).glazing);
    const right = mergeOptions(it.layout, glass[0].id, it).find((o) => o.dir === "right");
    expect(right).toBeTruthy();
    it = { ...it, layout: mergeAdjacent(it.layout, glass[0].id, right!.neighborId, it) };
    expect(validateItem(it)).toEqual([]);
  });
});

function parentSplit(root: FrameNode, id: string) {
  const geo = layoutGeometry(root, dims.widthCm, dims.heightCm);
  const split = geo.splits.find((s) => s.node.children.some((c) => c.node.id === id));
  if (!split) throw new Error("split");
  return split.node;
}
