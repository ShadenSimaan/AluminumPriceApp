// Hierarchical window layout: frame splits → panels (fixed lights / sashes / leaves) → glazing splits → glass.
// All sizes are nominal shares of the OVERALL frame dimensions in cm. They are not glass, sash or cut sizes:
// no profile deductions are known or applied.

import type {
  DecorativeBars,
  FrameNode,
  FrameSplit,
  GlassNode,
  GlassSpec,
  GlassSplit,
  GlazingNode,
  PanelNode,
  PanelOperation,
  RfqPanel,
  RfqUnit,
  SizedChild,
  SplitDirection,
} from "./types";

export type LayoutNode = FrameNode | GlazingNode;
export type SplitNode = FrameSplit | GlassSplit;

const ID_CHARS = "abcdefghijkmnpqrstuvwxyz23456789";

export function newNodeId(prefix: "p" | "g" | "s"): string {
  let out = "";
  const c = globalThis.crypto as Crypto | undefined;
  const bytes = new Uint8Array(8);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  for (const b of bytes) out += ID_CHARS[b % ID_CHARS.length];
  return `${prefix}-${out}`;
}

export function newGlass(override?: GlassSpec): GlassNode {
  return override ? { kind: "glass", id: newNodeId("g"), override: clone(override) } : { kind: "glass", id: newNodeId("g") };
}

export function newPanel(operation: PanelOperation, extra: Partial<Pick<PanelNode, "hingeSide" | "slideDirection">> = {}): PanelNode {
  return { kind: "panel", id: newNodeId("p"), operation, ...extra, glazing: newGlass() };
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const isSplit = (n: LayoutNode): n is SplitNode => n.kind === "frameSplit" || n.kind === "glassSplit";

// ---------- Legacy panels <-> layout ----------

export function panelFromLegacy(p: RfqPanel): PanelNode {
  const out = newPanel(p.operation);
  if (p.hingeSide) out.hingeSide = p.hingeSide;
  if (p.slideDirection) out.slideDirection = p.slideDirection;
  return out;
}

/** One-to-N legacy panels become N equal columns (exactly how they were drawn before). */
export function layoutFromPanels(panels: RfqPanel[]): FrameNode {
  const list = panels.length ? panels : [{ operation: "fixed" as const }];
  if (list.length === 1) return panelFromLegacy(list[0]);
  return { kind: "frameSplit", id: newNodeId("s"), direction: "columns", children: list.map((p) => ({ sizeCm: null, node: panelFromLegacy(p) })) };
}

export function toRfqPanel(p: PanelNode): RfqPanel {
  const out: RfqPanel = { operation: p.operation };
  if (p.hingeSide) out.hingeSide = p.hingeSide;
  if (p.slideDirection) out.slideDirection = p.slideDirection;
  return out;
}

// ---------- Traversal ----------

export function childNodes(n: LayoutNode): LayoutNode[] {
  if (n.kind === "frameSplit" || n.kind === "glassSplit") return n.children.map((c) => c.node);
  if (n.kind === "panel") return [n.glazing];
  return [];
}

export function walk(root: LayoutNode, fn: (n: LayoutNode, parent: SplitNode | PanelNode | null) => void, parent: SplitNode | PanelNode | null = null) {
  fn(root, parent);
  if (root.kind === "frameSplit" || root.kind === "glassSplit") for (const c of root.children) walk(c.node, fn, root);
  else if (root.kind === "panel") walk(root.glazing, fn, root);
}

/** Panel leaves in reading order (depth first: columns left → right, rows top → bottom). */
export function panelLeaves(root: FrameNode): PanelNode[] {
  const out: PanelNode[] = [];
  walk(root, (n) => {
    if (n.kind === "panel") out.push(n);
  });
  return out;
}

export function glassLeavesOf(glazing: GlazingNode): GlassNode[] {
  const out: GlassNode[] = [];
  walk(glazing, (n) => {
    if (n.kind === "glass") out.push(n);
  });
  return out;
}

export type NumberedGlass = { glass: GlassNode; panel: PanelNode; number: number; panelNumber: number };

export function numberedGlass(root: FrameNode): NumberedGlass[] {
  const out: NumberedGlass[] = [];
  panelLeaves(root).forEach((panel, pi) => {
    for (const glass of glassLeavesOf(panel.glazing)) out.push({ glass, panel, number: out.length + 1, panelNumber: pi + 1 });
  });
  return out;
}

export function findNode(root: LayoutNode, id: string): LayoutNode | null {
  let found: LayoutNode | null = null;
  walk(root, (n) => {
    if (!found && n.id === id) found = n;
  });
  return found;
}

/** Path of nodes from the root to `id` (inclusive), or null. */
export function findPath(root: LayoutNode, id: string): LayoutNode[] | null {
  if (root.id === id) return [root];
  for (const c of childNodes(root)) {
    const p = findPath(c, id);
    if (p) return [root, ...p];
  }
  return null;
}

export function parentSplitOf(root: LayoutNode, id: string): { split: SplitNode; index: number } | null {
  const path = findPath(root, id);
  if (!path || path.length < 2) return null;
  const parent = path[path.length - 2];
  if (!isSplit(parent)) return null;
  const index = parent.children.findIndex((c) => c.node.id === id);
  return { split: parent, index };
}

export function panelOf(root: FrameNode, id: string): PanelNode | null {
  const path = findPath(root, id);
  if (!path) return null;
  for (let i = path.length - 1; i >= 0; i--) {
    const n = path[i];
    if (n.kind === "panel") return n;
  }
  return null;
}

/** Immutable replace of the node with `id` (searches frame and glazing trees). */
export function replaceNode<T extends LayoutNode>(root: T, id: string, fn: (n: LayoutNode) => LayoutNode): T {
  if (root.id === id) return fn(root) as T;
  if (root.kind === "frameSplit") {
    return { ...root, children: root.children.map((c) => ({ ...c, node: replaceNode(c.node, id, fn) as FrameNode })) } as T;
  }
  if (root.kind === "glassSplit") {
    return { ...root, children: root.children.map((c) => ({ ...c, node: replaceNode(c.node, id, fn) as GlazingNode })) } as T;
  }
  if (root.kind === "panel") {
    const g = replaceNode(root.glazing, id, fn) as GlazingNode;
    return g === root.glazing ? root : ({ ...root, glazing: g } as T);
  }
  return root;
}

export function mapPanels(root: FrameNode, fn: (p: PanelNode, index: number, count: number) => PanelNode): FrameNode {
  const leaves = panelLeaves(root);
  const byId = new Map(leaves.map((p, i) => [p.id, i]));
  const rec = (n: FrameNode): FrameNode => {
    if (n.kind === "panel") return fn(n, byId.get(n.id)!, leaves.length);
    return { ...n, children: n.children.map((c) => ({ ...c, node: rec(c.node) })) };
  };
  return rec(root);
}

export function mapGlass(root: FrameNode, fn: (g: GlassNode, panel: PanelNode) => GlassNode): FrameNode {
  const recG = (n: GlazingNode, panel: PanelNode): GlazingNode =>
    n.kind === "glass" ? fn(n, panel) : { ...n, children: n.children.map((c) => ({ ...c, node: recG(c.node, panel) })) };
  return mapPanels(root, (p) => ({ ...p, glazing: recG(p.glazing, p) }));
}

/** Top level is one panel or one row of side-by-side panels without further subdivision of the frame. */
export function isSimpleColumns(root: FrameNode): boolean {
  if (root.kind === "panel") return true;
  return root.direction === "columns" && root.children.every((c) => c.node.kind === "panel");
}

export function hasGlassSubdivisions(root: FrameNode): boolean {
  return panelLeaves(root).some((p) => p.glazing.kind === "glassSplit");
}

export function hasDecorativeBars(root: FrameNode): boolean {
  return numberedGlass(root).some(({ glass }) => !!glass.decorativeBars && (glass.decorativeBars.columns > 0 || glass.decorativeBars.rows > 0));
}

/** Anything beyond the legacy "N equal columns, one glass each" design. */
export function isAdvancedLayout(root: FrameNode): boolean {
  if (!isSimpleColumns(root) || hasGlassSubdivisions(root) || hasDecorativeBars(root)) return true;
  return root.kind === "frameSplit" && root.children.some((c) => c.sizeCm != null);
}

// ---------- Geometry ----------

export type CmRect = { x: number; y: number; w: number; h: number };

/** Resolve child lengths along a split. `exact` is false when fixed sizes do not add up to the total. */
export function resolveSizes(sizes: (number | null)[], total: number): { sizes: number[]; exact: boolean } {
  const fixed = sizes.reduce<number>((s, v) => s + (v != null && v > 0 ? v : 0), 0);
  const autos = sizes.filter((v) => v == null).length;
  let out: number[];
  let exact = true;
  if (autos > 0) {
    const remaining = total - fixed;
    if (remaining <= 0.05) exact = false;
    const share = Math.max(0, remaining) / autos;
    out = sizes.map((v) => (v == null ? share : Math.max(0, v)));
  } else {
    out = sizes.map((v) => Math.max(0, v ?? 0));
    if (Math.abs(fixed - total) > 0.05) exact = false;
  }
  const sum = out.reduce((a, b) => a + b, 0);
  // Drawing must always fill the frame; inconsistent sizes are reported by validation instead.
  if (!exact && sum > 0) out = out.map((v) => (v * total) / sum);
  if (sum <= 0) out = sizes.map(() => total / Math.max(1, sizes.length));
  return { sizes: out, exact };
}

export type GeoDivider = {
  splitId: string;
  /** Divider between child `index` and `index + 1` */
  index: number;
  level: "frame" | "glass";
  panelId?: string;
  /** "vertical" = a vertical line (between columns) */
  orientation: "vertical" | "horizontal";
  pos: number;
  start: number;
  end: number;
};

export type LayoutGeometry = {
  panels: { node: PanelNode; rect: CmRect; number: number }[];
  glass: { node: GlassNode; rect: CmRect; panelId: string; number: number }[];
  splits: { node: SplitNode; rect: CmRect; level: "frame" | "glass"; panelId?: string; sizes: number[]; exact: boolean }[];
  dividers: GeoDivider[];
};

export function layoutGeometry(root: FrameNode, widthCm: number, heightCm: number): LayoutGeometry {
  const geo: LayoutGeometry = { panels: [], glass: [], splits: [], dividers: [] };
  const splitRect = (node: SplitNode, rect: CmRect, level: "frame" | "glass", panelId: string | undefined, visit: (child: LayoutNode, r: CmRect) => void) => {
    const cols = node.direction === "columns";
    const { sizes, exact } = resolveSizes(node.children.map((c) => c.sizeCm), cols ? rect.w : rect.h);
    geo.splits.push({ node, rect, level, panelId, sizes, exact });
    let off = 0;
    node.children.forEach((c, i) => {
      const r: CmRect = cols ? { x: rect.x + off, y: rect.y, w: sizes[i], h: rect.h } : { x: rect.x, y: rect.y + off, w: rect.w, h: sizes[i] };
      off += sizes[i];
      if (i < node.children.length - 1) {
        geo.dividers.push(
          cols
            ? { splitId: node.id, index: i, level, panelId, orientation: "vertical", pos: rect.x + off, start: rect.y, end: rect.y + rect.h }
            : { splitId: node.id, index: i, level, panelId, orientation: "horizontal", pos: rect.y + off, start: rect.x, end: rect.x + rect.w }
        );
      }
      visit(c.node, r);
    });
  };
  const visitGlazing = (n: GlazingNode, r: CmRect, panelId: string) => {
    if (n.kind === "glass") geo.glass.push({ node: n, rect: r, panelId, number: geo.glass.length + 1 });
    else splitRect(n, r, "glass", panelId, (c, cr) => visitGlazing(c as GlazingNode, cr, panelId));
  };
  const visitFrame = (n: FrameNode, r: CmRect) => {
    if (n.kind === "panel") {
      geo.panels.push({ node: n, rect: r, number: geo.panels.length + 1 });
      visitGlazing(n.glazing, r, n.id);
    } else splitRect(n, r, "frame", undefined, (c, cr) => visitFrame(c as FrameNode, cr));
  };
  visitFrame(root, { x: 0, y: 0, w: widthCm, h: heightCm });
  return geo;
}

// ---------- Validation ----------

export type LayoutIssueCode = "layout_size_invalid" | "layout_sizes_exceed" | "layout_sizes_mismatch" | "layout_decorative_invalid";
export type LayoutIssue = { code: LayoutIssueCode; nodeId: string };

const TOL = 0.05;

export function validateLayout(root: FrameNode, widthCm: number | null, heightCm: number | null): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  walk(root, (n) => {
    if (isSplit(n)) {
      for (const c of n.children) {
        if (c.sizeCm != null && !(c.sizeCm > 0 && isFinite(c.sizeCm))) issues.push({ code: "layout_size_invalid", nodeId: n.id });
      }
    }
    if (n.kind === "glass" && n.decorativeBars) {
      const b = n.decorativeBars;
      if (!Number.isInteger(b.columns) || !Number.isInteger(b.rows) || b.columns < 0 || b.rows < 0) issues.push({ code: "layout_decorative_invalid", nodeId: n.id });
    }
  });
  if (issues.length || !(widthCm && widthCm > 0) || !(heightCm && heightCm > 0)) return dedupe(issues);
  for (const s of layoutGeometry(root, widthCm, heightCm).splits) {
    const total = s.node.direction === "columns" ? s.rect.w : s.rect.h;
    const sizes = s.node.children.map((c) => c.sizeCm);
    const fixed = sizes.reduce<number>((a, v) => a + (v ?? 0), 0);
    const autos = sizes.filter((v) => v == null).length;
    if (autos > 0 && fixed >= total - TOL) issues.push({ code: "layout_sizes_exceed", nodeId: s.node.id });
    else if (autos === 0 && Math.abs(fixed - total) > TOL) issues.push({ code: "layout_sizes_mismatch", nodeId: s.node.id });
  }
  return dedupe(issues);
}

function dedupe(issues: LayoutIssue[]): LayoutIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.code}:${i.nodeId}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- Editing operations ----------

type Dims = { widthCm: number | null; heightCm: number | null };

const dimsOrDefault = (d: Dims) => ({
  w: d.widthCm && d.widthCm > 0 && isFinite(d.widthCm) ? d.widthCm : 100,
  h: d.heightCm && d.heightCm > 0 && isFinite(d.heightCm) ? d.heightCm : 100,
  known: !!(d.widthCm && d.widthCm > 0 && d.heightCm && d.heightCm > 0),
});

const round2 = (n: number) => Math.round(n * 100) / 100;

function splitSize(size: number | null, parts: number): (number | null)[] {
  if (size == null) return Array.from({ length: parts }, () => null);
  const each = round2(size / parts);
  const out: number[] = Array.from({ length: parts }, () => each);
  out[parts - 1] = round2(size - each * (parts - 1));
  return out;
}

/**
 * Split a panel (into more panels) or a glass section (into more glass sections) into `parts` equal parts.
 * The original node keeps its id and settings as the first part. Splitting in the same direction as the
 * parent adds siblings instead of nesting.
 */
export function splitNode(root: FrameNode, id: string, direction: SplitDirection, parts: number): FrameNode {
  const n = Math.floor(parts);
  const target = findNode(root, id);
  if (!target || n < 2 || (target.kind !== "panel" && target.kind !== "glass")) return root;
  const makeSibling = (): LayoutNode => {
    if (target.kind === "panel") {
      const p: PanelNode = { ...newPanel(target.operation), glazing: newGlass(firstOverride(target.glazing)) };
      if (target.hingeSide) p.hingeSide = target.hingeSide;
      if (target.slideDirection) p.slideDirection = target.slideDirection;
      return p;
    }
    return newGlass(target.override);
  };
  const parent = parentSplitOf(root, id);
  if (parent && parent.split.direction === direction) {
    const sizes = splitSize(parent.split.children[parent.index].sizeCm, n);
    const added = Array.from({ length: n - 1 }, makeSibling);
    return replaceNode(root, parent.split.id, (s) => {
      const sp = s as SplitNode;
      const children = sp.children.slice() as SizedChild<LayoutNode>[];
      children.splice(parent.index, 1, { sizeCm: sizes[0], node: target }, ...added.map((node, i) => ({ sizeCm: sizes[i + 1], node })));
      return { ...sp, children } as SplitNode;
    });
  }
  return replaceNode(root, id, (t) => {
    const children = [t, ...Array.from({ length: n - 1 }, makeSibling)].map((node) => ({ sizeCm: null, node }));
    return t.kind === "panel"
      ? ({ kind: "frameSplit", id: newNodeId("s"), direction, children } as FrameSplit)
      : ({ kind: "glassSplit", id: newNodeId("s"), direction, children } as GlassSplit);
  });
}

/** Divide a panel's glass into `parts` sections separated by physical glazing bars. */
export function divideGlass(root: FrameNode, panelId: string, direction: SplitDirection, parts: number): FrameNode {
  const panel = findNode(root, panelId);
  if (!panel || panel.kind !== "panel") return root;
  if (panel.glazing.kind === "glass") return splitNode(root, panel.glazing.id, direction, parts);
  // Already divided: split the whole glazing tree as one block
  const n = Math.floor(parts);
  if (n < 2) return root;
  return replaceNode(root, panelId, (p) => {
    const pn = p as PanelNode;
    const override = firstOverride(pn.glazing);
    const children = [pn.glazing, ...Array.from({ length: n - 1 }, () => newGlass(override))].map((node) => ({ sizeCm: null, node }));
    return { ...pn, glazing: { kind: "glassSplit", id: newNodeId("s"), direction, children } };
  });
}

function firstOverride(g: GlazingNode): GlassSpec | undefined {
  return glassLeavesOf(g)[0]?.override;
}

export type MergeCheck = { ok: true } | { ok: false; reason: "no_neighbor" | "not_leaf" | "neighbor_subdivided" };

/** Merging needs two adjacent leaves of the same kind; a panel neighbor with its own glass subdivisions is not merged silently. */
export function canMerge(root: FrameNode, id: string, side: "prev" | "next"): MergeCheck {
  const parent = parentSplitOf(root, id);
  if (!parent) return { ok: false, reason: "no_neighbor" };
  const j = side === "prev" ? parent.index - 1 : parent.index + 1;
  const neighbor = parent.split.children[j]?.node;
  if (!neighbor) return { ok: false, reason: "no_neighbor" };
  const self = parent.split.children[parent.index].node;
  if (self.kind !== neighbor.kind || (self.kind !== "panel" && self.kind !== "glass")) return { ok: false, reason: "not_leaf" };
  if (neighbor.kind === "panel" && neighbor.glazing.kind !== "glass") return { ok: false, reason: "neighbor_subdivided" };
  return { ok: true };
}

/** Remove the divider between `id` and its neighbor; `id` survives (stable id, settings kept). */
export function mergeWithNeighbor(root: FrameNode, id: string, side: "prev" | "next", dims: Dims): FrameNode {
  if (!canMerge(root, id, side).ok) return root;
  const parent = parentSplitOf(root, id)!;
  const j = side === "prev" ? parent.index - 1 : parent.index + 1;
  const { w, h, known } = dimsOrDefault(dims);
  const geoSplit = layoutGeometry(root, w, h).splits.find((s) => s.node.id === parent.split.id)!;
  const a = parent.split.children[parent.index];
  const b = parent.split.children[j];
  const bothAuto = a.sizeCm == null && b.sizeCm == null;
  const allAuto = parent.split.children.every((c) => c.sizeCm == null);
  let merged: number | null;
  if (allAuto && parent.split.children.length === 2) merged = null;
  else if (bothAuto && !known) merged = null;
  else merged = round2(geoSplit.sizes[parent.index] + geoSplit.sizes[j]);
  return replaceNode(root, parent.split.id, (s) => {
    const sp = s as SplitNode;
    const children = sp.children.filter((_, k) => k !== j) as SizedChild<LayoutNode>[];
    const at = children.findIndex((c) => c.node.id === id);
    children[at] = { sizeCm: merged, node: a.node };
    if (children.length === 1) return children[0].node;
    return { ...sp, children } as SplitNode;
  });
}

/** Side of a section as drawn: left/right are columns, above/below are rows. y grows downward. */
export type MergeDir = "left" | "right" | "top" | "bottom";

export type MergeOption = {
  dir: MergeDir;
  neighborId: string;
  /** The shared edge is the full side of both sections, so they join without cutting either one. */
  aligned: boolean;
  /** A panel on this side has its own glass divisions; joining it would throw those away. */
  blocked: boolean;
};

const EDGE = 0.2;

type GeoAtom = { id: string; rect: CmRect; node: LayoutNode };

function atomsTouching(root: FrameNode, id: string, dims: Dims): { self: GeoAtom; others: GeoAtom[] } | null {
  const box = dimsOrDefault(dims);
  const geo = layoutGeometry(root, box.w, box.h);
  const glass = geo.glass.find((g) => g.node.id === id);
  if (glass) {
    const group = geo.glass.filter((g) => g.panelId === glass.panelId).map((g) => ({ id: g.node.id, rect: g.rect, node: g.node as LayoutNode }));
    const self = group.find((g) => g.id === id);
    return self ? { self, others: group.filter((g) => g.id !== id) } : null;
  }
  const panel = geo.panels.find((p) => p.node.id === id);
  if (!panel) return null;
  const group = geo.panels.map((p) => ({ id: p.node.id, rect: p.rect, node: p.node as LayoutNode }));
  return { self: group.find((p) => p.id === id)!, others: group.filter((p) => p.id !== id) };
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** The direction from `a` toward `b` when they share a positive-length edge. */
function directionBetween(a: CmRect, b: CmRect): MergeDir | null {
  const v = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
  const h = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  if (v > EDGE && Math.abs(b.x - (a.x + a.w)) <= EDGE) return "right";
  if (v > EDGE && Math.abs(a.x - (b.x + b.w)) <= EDGE) return "left";
  if (h > EDGE && Math.abs(b.y - (a.y + a.h)) <= EDGE) return "bottom";
  if (h > EDGE && Math.abs(a.y - (b.y + b.h)) <= EDGE) return "top";
  return null;
}

function fullyAligned(a: CmRect, b: CmRect, dir: MergeDir): boolean {
  if (dir === "left" || dir === "right") return Math.abs(a.y - b.y) <= EDGE && Math.abs(a.h - b.h) <= EDGE;
  return Math.abs(a.x - b.x) <= EDGE && Math.abs(a.w - b.w) <= EDGE;
}

function panelIsDivided(n: LayoutNode): boolean {
  return n.kind === "panel" && n.glazing.kind !== "glass";
}

/**
 * Every glass (inside the same panel) or panel that shares an edge with `id`.
 * A side can have more than one neighbor when that side is itself split.
 */
export function mergeOptions(root: FrameNode, id: string, dims: Dims): MergeOption[] {
  const group = atomsTouching(root, id, dims);
  if (!group) return [];
  const out: MergeOption[] = [];
  for (const other of group.others) {
    const dir = directionBetween(group.self.rect, other.rect);
    if (!dir) continue;
    const aligned = fullyAligned(group.self.rect, other.rect, dir);
    const blocked = panelIsDivided(other.node) || (!aligned && panelIsDivided(group.self.node));
    out.push({ dir, neighborId: other.id, aligned, blocked });
  }
  const order: MergeDir[] = ["top", "left", "right", "bottom"];
  out.sort((a, b) => order.indexOf(a.dir) - order.indexOf(b.dir) || a.neighborId.localeCompare(b.neighborId));
  return out;
}

function cloneGlazing(g: GlazingNode): GlazingNode {
  if (g.kind === "glass") {
    const n: GlassNode = { kind: "glass", id: newNodeId("g") };
    if (g.override) n.override = clone(g.override);
    if (g.decorativeBars) n.decorativeBars = { ...g.decorativeBars };
    return n;
  }
  return { kind: "glassSplit", id: newNodeId("s"), direction: g.direction, children: g.children.map((c) => ({ sizeCm: c.sizeCm, node: cloneGlazing(c.node) })) };
}

function cloneLeaf(node: LayoutNode): LayoutNode {
  if (node.kind === "glass") return cloneGlazing(node);
  if (node.kind === "panel") {
    const p = newPanel(node.operation);
    if (node.hingeSide) p.hingeSide = node.hingeSide;
    if (node.slideDirection) p.slideDirection = node.slideDirection;
    p.glazing = cloneGlazing(node.glazing);
    return p;
  }
  return node;
}

/** Cut one leaf into strips. The strip that covers [keepFrom, keepTo] keeps `id` and its settings. */
function sliceLeaf(root: FrameNode, id: string, direction: SplitDirection, keepFrom: number, keepTo: number, dims: Dims): FrameNode {
  const target = findNode(root, id);
  if (!target || (target.kind !== "glass" && target.kind !== "panel")) return root;
  const box = dimsOrDefault(dims);
  const geo = layoutGeometry(root, box.w, box.h);
  const rect = geo.glass.find((g) => g.node.id === id)?.rect ?? geo.panels.find((p) => p.node.id === id)?.rect;
  if (!rect) return root;
  const start = direction === "rows" ? rect.y : rect.x;
  const end = start + (direction === "rows" ? rect.h : rect.w);
  const from = Math.max(start, keepFrom);
  const to = Math.min(end, keepTo);
  if (to - from <= EDGE || (from - start <= EDGE && end - to <= EDGE)) return root;
  const marks = [start, from, to, end].sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const m of marks) if (!uniq.length || m - uniq[uniq.length - 1] > EDGE) uniq.push(m);
  const parts: { size: number; keep: boolean }[] = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    const a = uniq[i];
    const b = uniq[i + 1];
    const mid = (a + b) / 2;
    parts.push({ size: b - a, keep: mid >= from - EDGE && mid <= to + EDGE });
  }
  if (parts.length < 2) return root;
  let kept = false;
  for (const p of parts) {
    if (!p.keep) continue;
    if (kept) p.keep = false;
    else kept = true;
  }
  if (!kept) parts[0].keep = true;
  return subdivideLeaf(root, target, direction, parts);
}

function subdivideLeaf(root: FrameNode, target: GlassNode | PanelNode, direction: SplitDirection, parts: { size: number; keep: boolean }[]): FrameNode {
  const parent = parentSplitOf(root, target.id);
  const make = (keep: boolean) => (keep ? target : cloneLeaf(target));
  if (parent && parent.split.direction === direction) {
    // Explicit sizes that sum to this child's resolved share, so the other children stay put.
    const sizes = parts.map((p) => round2(p.size));
    const drift = round2(parts.reduce((s, p) => s + p.size, 0) - sizes.reduce((s, n) => s + n, 0));
    sizes[sizes.length - 1] = round2(sizes[sizes.length - 1] + drift);
    return replaceNode(root, parent.split.id, (s) => {
      const sp = s as SplitNode;
      const children = sp.children.slice() as SizedChild<LayoutNode>[];
      children.splice(parent.index, 1, ...parts.map((p, i) => ({ sizeCm: sizes[i], node: make(p.keep) })));
      return { ...sp, children } as SplitNode;
    });
  }
  const equal = parts.every((p) => Math.abs(p.size - parts[0].size) <= EDGE);
  const children = parts.map((p) => ({ sizeCm: equal ? null : round2(p.size), node: make(p.keep) }));
  const split: LayoutNode =
    target.kind === "panel"
      ? { kind: "frameSplit", id: newNodeId("s"), direction, children: children as SizedChild<FrameNode>[] }
      : { kind: "glassSplit", id: newNodeId("s"), direction, children: children as SizedChild<GlazingNode>[] };
  return replaceNode(root, target.id, () => split);
}

type Atom = { node: LayoutNode; rect: CmRect };

function throughCut(atoms: Atom[], bounds: CmRect, axis: "x" | "y"): number | null {
  const origin = axis === "x" ? bounds.x : bounds.y;
  const span = axis === "x" ? bounds.w : bounds.h;
  const coords: number[] = [];
  for (const a of atoms) {
    const a0 = axis === "x" ? a.rect.x : a.rect.y;
    const a1 = a0 + (axis === "x" ? a.rect.w : a.rect.h);
    if (a0 > origin + EDGE && a0 < origin + span - EDGE) coords.push(a0);
    if (a1 > origin + EDGE && a1 < origin + span - EDGE) coords.push(a1);
  }
  coords.sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const c of coords) if (!uniq.some((u) => Math.abs(u - c) <= EDGE)) uniq.push(c);
  for (const cut of uniq) {
    let before = 0;
    let after = 0;
    let across = 0;
    for (const a of atoms) {
      const a0 = axis === "x" ? a.rect.x : a.rect.y;
      const a1 = a0 + (axis === "x" ? a.rect.w : a.rect.h);
      if (a1 <= cut + EDGE) before++;
      else if (a0 >= cut - EDGE) after++;
      else across++;
    }
    if (!across && before > 0 && after > 0) return cut;
  }
  return null;
}

function rebuildAtoms(atoms: Atom[], bounds: CmRect, level: "frame" | "glass"): LayoutNode {
  if (atoms.length <= 1) return atoms[0].node;
  const vx = throughCut(atoms, bounds, "x");
  if (vx != null) return splitAtoms(atoms, bounds, "x", vx, level);
  const hy = throughCut(atoms, bounds, "y");
  if (hy != null) return splitAtoms(atoms, bounds, "y", hy, level);
  return atoms[0].node;
}

function splitAtoms(atoms: Atom[], bounds: CmRect, axis: "x" | "y", cut: number, level: "frame" | "glass"): LayoutNode {
  const before: Atom[] = [];
  const after: Atom[] = [];
  for (const a of atoms) {
    const a0 = axis === "x" ? a.rect.x : a.rect.y;
    const a1 = a0 + (axis === "x" ? a.rect.w : a.rect.h);
    if (a1 <= cut + EDGE) before.push(a);
    else after.push(a);
  }
  const extent = axis === "x" ? cut - bounds.x : cut - bounds.y;
  const rest = (axis === "x" ? bounds.w : bounds.h) - extent;
  const b1: CmRect = axis === "x" ? { ...bounds, w: extent } : { ...bounds, h: extent };
  const b2: CmRect = axis === "x" ? { x: cut, y: bounds.y, w: rest, h: bounds.h } : { x: bounds.x, y: cut, w: bounds.w, h: rest };
  const equal = Math.abs(extent - rest) <= EDGE;
  const child = (ext: number, rect: CmRect, group: Atom[]) => ({ sizeCm: equal ? null : round2(Math.max(ext, 0.01)), node: rebuildAtoms(group, rect, level) });
  const direction: SplitDirection = axis === "x" ? "columns" : "rows";
  if (level === "frame") return { kind: "frameSplit", id: newNodeId("s"), direction, children: [child(extent, b1, before), child(rest, b2, after)] } as FrameSplit;
  return { kind: "glassSplit", id: newNodeId("s"), direction, children: [child(extent, b1, before), child(rest, b2, after)] } as GlassSplit;
}

function unionRect(a: CmRect, b: CmRect): CmRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Join two leaves whose union is one rectangle. `keepId` survives. */
function unionRebuild(root: FrameNode, keepId: string, dropId: string, dims: Dims): FrameNode {
  const box = dimsOrDefault(dims);
  const geo = layoutGeometry(root, box.w, box.h);
  const keepG = geo.glass.find((g) => g.node.id === keepId);
  const dropG = geo.glass.find((g) => g.node.id === dropId);
  if (keepG && dropG && keepG.panelId === dropG.panelId) {
    const panel = geo.panels.find((p) => p.node.id === keepG.panelId);
    if (!panel) return root;
    const atoms: Atom[] = geo.glass
      .filter((g) => g.panelId === keepG.panelId && g.node.id !== dropId)
      .map((g) => ({ node: g.node, rect: g.node.id === keepId ? unionRect(keepG.rect, dropG.rect) : g.rect }));
    const glazing = rebuildAtoms(atoms, panel.rect, "glass") as GlazingNode;
    return replaceNode(root, panel.node.id, (p) => ({ ...(p as PanelNode), glazing }));
  }
  const keepP = geo.panels.find((p) => p.node.id === keepId);
  const dropP = geo.panels.find((p) => p.node.id === dropId);
  if (!keepP || !dropP) return root;
  const atoms: Atom[] = geo.panels.filter((p) => p.node.id !== dropId).map((p) => ({ node: p.node, rect: p.node.id === keepId ? unionRect(keepP.rect, dropP.rect) : p.rect }));
  return rebuildAtoms(atoms, { x: 0, y: 0, w: box.w, h: box.h }, "frame") as FrameNode;
}

function alignForMerge(root: FrameNode, keepId: string, dropId: string, dir: MergeDir, dims: Dims): FrameNode {
  const box = dimsOrDefault(dims);
  const geo = layoutGeometry(root, box.w, box.h);
  const rectOf = (leafId: string) => geo.glass.find((g) => g.node.id === leafId)?.rect ?? geo.panels.find((p) => p.node.id === leafId)?.rect;
  const a = rectOf(keepId);
  const b = rectOf(dropId);
  if (!a || !b) return root;
  if (dir === "left" || dir === "right") {
    const y0 = Math.max(a.y, b.y);
    const y1 = Math.min(a.y + a.h, b.y + b.h);
    return sliceLeaf(sliceLeaf(root, keepId, "rows", y0, y1, dims), dropId, "rows", y0, y1, dims);
  }
  const x0 = Math.max(a.x, b.x);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  return sliceLeaf(sliceLeaf(root, keepId, "columns", x0, x1, dims), dropId, "columns", x0, x1, dims);
}

/**
 * Join `id` with the section `neighborId` (a side from {@link mergeOptions}).
 * The selected section keeps its id, glass and opening. When the neighbor is longer,
 * only the part that lines up is joined and the rest stays as its own section.
 */
export function mergeAdjacent(root: FrameNode, id: string, neighborId: string, dims: Dims): FrameNode {
  const opt = mergeOptions(root, id, dims).find((o) => o.neighborId === neighborId);
  if (!opt || opt.blocked) return root;
  const cur = opt.aligned ? root : alignForMerge(root, id, neighborId, opt.dir, dims);
  const parent = parentSplitOf(cur, id);
  const neighbor = parentSplitOf(cur, neighborId);
  if (parent && neighbor && parent.split.id === neighbor.split.id && Math.abs(parent.index - neighbor.index) === 1) {
    const side = neighbor.index < parent.index ? "prev" : "next";
    const merged = mergeWithNeighbor(cur, id, side, dims);
    if (merged !== cur) return merged;
  }
  return unionRebuild(cur, id, neighborId, dims);
}

export function setChildSize(root: FrameNode, splitId: string, index: number, sizeCm: number | null): FrameNode {
  return replaceNode(root, splitId, (s) => {
    const sp = s as SplitNode;
    const children = sp.children.map((c, i) => (i === index ? { ...c, sizeCm } : c));
    return { ...sp, children } as SplitNode;
  });
}

export function equalizeSplit(root: FrameNode, splitId: string): FrameNode {
  return replaceNode(root, splitId, (s) => {
    const sp = s as SplitNode;
    return { ...sp, children: sp.children.map((c) => ({ ...c, sizeCm: null })) } as SplitNode;
  });
}

/** Move the divider after child `index` by `deltaCm`; both neighbors become explicit sizes, others are untouched. */
export function moveDivider(root: FrameNode, dims: Dims, splitId: string, index: number, deltaCm: number, minCm = 1): FrameNode {
  const { w, h } = dimsOrDefault(dims);
  const g = layoutGeometry(root, w, h).splits.find((s) => s.node.id === splitId);
  if (!g || index < 0 || index >= g.node.children.length - 1) return root;
  const a = g.sizes[index];
  const b = g.sizes[index + 1];
  const d = Math.max(minCm - a, Math.min(b - minCm, deltaCm));
  if (!isFinite(d)) return root;
  return replaceNode(root, splitId, (s) => {
    const sp = s as SplitNode;
    const children = sp.children.map((c, i) => (i === index ? { ...c, sizeCm: round2(a + d) } : i === index + 1 ? { ...c, sizeCm: round2(b - d) } : c));
    return { ...sp, children } as SplitNode;
  });
}

export function setDecorativeBars(root: FrameNode, glassId: string, bars: DecorativeBars | undefined): FrameNode {
  return replaceNode(root, glassId, (g) => {
    const gn = { ...(g as GlassNode) };
    if (!bars || (bars.columns === 0 && bars.rows === 0)) delete gn.decorativeBars;
    else gn.decorativeBars = bars;
    return gn;
  });
}

export function setGlassOverride(root: FrameNode, glassId: string, override: GlassSpec | undefined): FrameNode {
  return replaceNode(root, glassId, (g) => {
    const gn = { ...(g as GlassNode) };
    if (override) gn.override = override;
    else delete gn.override;
    return gn;
  });
}

// ---------- Quick layouts (reuse existing panels in order so ids and settings survive) ----------

function takePanels(existing: PanelNode[], count: number, make: (i: number) => PanelNode): PanelNode[] {
  return Array.from({ length: count }, (_, i) => existing[i] ?? make(i));
}

export function equalColumnsLayout(existing: PanelNode[], count: number, make: (i: number) => PanelNode): FrameNode {
  const panels = takePanels(existing, Math.max(1, Math.floor(count)), make);
  if (panels.length === 1) return panels[0];
  return { kind: "frameSplit", id: newNodeId("s"), direction: "columns", children: panels.map((node) => ({ sizeCm: null, node })) };
}

export function gridLayout(existing: PanelNode[], columns: number, rows: number, make: (i: number) => PanelNode): FrameNode {
  const c = Math.max(1, Math.floor(columns));
  const r = Math.max(1, Math.floor(rows));
  const panels = takePanels(existing, c * r, make);
  if (c * r === 1) return panels[0];
  const column = (ci: number): FrameNode => {
    const cells = Array.from({ length: r }, (_, ri) => panels[ci * r + ri]);
    return r === 1 ? cells[0] : { kind: "frameSplit", id: newNodeId("s"), direction: "rows", children: cells.map((node) => ({ sizeCm: null, node })) };
  };
  if (c === 1) return column(0);
  return { kind: "frameSplit", id: newNodeId("s"), direction: "columns", children: Array.from({ length: c }, (_, ci) => ({ sizeCm: null, node: column(ci) })) };
}

/** A fixed top light (optionally sized) above `count` panels side by side. */
export function topLightLayout(existing: PanelNode[], count: number, topHeightCm: number | null, makeOperable: (i: number) => PanelNode): FrameNode {
  const fixedExisting = existing.find((p) => p.operation === "fixed");
  const lower = existing.filter((p) => p !== fixedExisting);
  const top: PanelNode = fixedExisting ?? newPanel("fixed");
  const bottom = equalColumnsLayout(lower, count, makeOperable);
  return { kind: "frameSplit", id: newNodeId("s"), direction: "rows", children: [{ sizeCm: topHeightCm, node: top }, { sizeCm: null, node: bottom }] };
}

// ---------- Normalization of stored data ----------

const MAX_DEPTH = 24;

const posOrNull = (v: unknown): number | null => (typeof v === "number" && isFinite(v) && v > 0 ? v : null);
const dir = (v: unknown): SplitDirection => (v === "rows" ? "rows" : "columns");
const intOr0 = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);

export function normalizeLayout(raw: unknown, normalizeGlass: (raw: unknown) => GlassSpec): FrameNode | null {
  const ids = new Set<string>();
  const uid = (v: unknown, prefix: "p" | "g" | "s") => {
    const s = typeof v === "string" && /^[\w-]{1,64}$/.test(v) && !ids.has(v) ? v : newNodeId(prefix);
    ids.add(s);
    return s;
  };
  const glazing = (r: unknown, depth: number): GlazingNode => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    if (o.kind === "glassSplit" && Array.isArray(o.children) && depth < MAX_DEPTH) {
      const children = (o.children as unknown[])
        .map((c) => {
          const co = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
          return { sizeCm: posOrNull(co.sizeCm), node: glazing(co.node, depth + 1) };
        });
      if (children.length >= 2) return { kind: "glassSplit", id: uid(o.id, "s"), direction: dir(o.direction), children };
      if (children.length === 1) return children[0].node;
    }
    const g: GlassNode = { kind: "glass", id: uid(o.id, "g") };
    if (o.override && typeof o.override === "object") g.override = normalizeGlass(o.override);
    const b = (o.decorativeBars && typeof o.decorativeBars === "object" ? o.decorativeBars : null) as Record<string, unknown> | null;
    if (b && (intOr0(b.columns) || intOr0(b.rows))) g.decorativeBars = { columns: intOr0(b.columns), rows: intOr0(b.rows) };
    return g;
  };
  const frame = (r: unknown, depth: number): FrameNode | null => {
    if (!r || typeof r !== "object") return null;
    const o = r as Record<string, unknown>;
    if (o.kind === "frameSplit" && Array.isArray(o.children) && depth < MAX_DEPTH) {
      const children: SizedChild<FrameNode>[] = [];
      for (const c of o.children as unknown[]) {
        const co = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
        const node = frame(co.node, depth + 1);
        if (node) children.push({ sizeCm: posOrNull(co.sizeCm), node });
      }
      if (children.length >= 2) return { kind: "frameSplit", id: uid(o.id, "s"), direction: dir(o.direction), children };
      return children[0]?.node ?? null;
    }
    if (o.kind === "panel") {
      const ops: PanelOperation[] = ["fixed", "sliding", "casement", "tilt_turn", "top_hung", "hinged"];
      const p: PanelNode = {
        kind: "panel",
        id: uid(o.id, "p"),
        operation: ops.includes(o.operation as PanelOperation) ? (o.operation as PanelOperation) : "fixed",
        glazing: glazing(o.glazing, depth + 1),
      };
      if (o.hingeSide === "left" || o.hingeSide === "right") p.hingeSide = o.hingeSide;
      if (o.slideDirection === "left" || o.slideDirection === "right") p.slideDirection = o.slideDirection;
      return p;
    }
    return null;
  };
  return frame(raw, 0);
}

/** Give every node a new id (used when a whole item is duplicated as a new design). */
export function reassignIds(root: FrameNode): { layout: FrameNode; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const fresh = (old: string, prefix: "p" | "g" | "s") => {
    const id = newNodeId(prefix);
    idMap.set(old, id);
    return id;
  };
  const g = (n: GlazingNode): GlazingNode =>
    n.kind === "glass" ? { ...n, id: fresh(n.id, "g") } : { ...n, id: fresh(n.id, "s"), children: n.children.map((c) => ({ ...c, node: g(c.node) })) };
  const f = (n: FrameNode): FrameNode =>
    n.kind === "panel" ? { ...n, id: fresh(n.id, "p"), glazing: g(n.glazing) } : { ...n, id: fresh(n.id, "s"), children: n.children.map((c) => ({ ...c, node: f(c.node) })) };
  return { layout: f(root), idMap };
}

// ---------- Compact text notation (import/export) ----------
// layout  := group            group := term ("|" term)* | term ("/" term)*      ("|" = side by side, "/" = stacked)
// term    := ("(" group ")" | panel) (":" size)?
// panel   := ("F" | "O") ("L" | "R")? ("[" glazing "]")?   F = fixed, O = opening (type's operation); L/R = hinge side or slide direction
// glazing := gterm ("|" gterm)* | gterm ("/" gterm)*      gterm := ("(" glazing ")" | "G" ("#" int "x" int)?) (":" size)?
// Sizes use the row's unit; omitted sizes share the remaining length equally. Example: "F:400/(OL[G/G]|OR)"

export class LayoutParseError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

export type ParsedPanel = { fixed: boolean; side?: "left" | "right" };

export function parseLayoutNotation(
  text: string,
  unit: RfqUnit,
  makePanel: (p: ParsedPanel) => PanelNode
): FrameNode {
  const src = text.replace(/\s+/g, "").toUpperCase();
  let i = 0;
  const fail = (msg: string): never => {
    throw new LayoutParseError(msg, i);
  };
  const toCm = (v: number) => (unit === "mm" ? round2(v / 10) : round2(v));
  const size = (): number | null => {
    if (src[i] !== ":") return null;
    i++;
    const m = /^\d+(?:[.,]\d+)?/.exec(src.slice(i));
    if (!m) fail("size");
    i += m![0].length;
    const v = Number(m![0].replace(",", "."));
    if (!(v > 0)) fail("size");
    return toCm(v);
  };
  function group<T>(term: () => SizedChild<T>, make: (d: SplitDirection, children: SizedChild<T>[]) => T): SizedChild<T> {
    const first = term();
    const items = [first];
    let sep: string | null = null;
    while (src[i] === "|" || src[i] === "/") {
      if (sep && src[i] !== sep) fail("mixed");
      sep = src[i];
      i++;
      items.push(term());
    }
    if (items.length === 1) return first;
    return { sizeCm: null, node: make(sep === "|" ? "columns" : "rows", items) };
  }
  const gterm = (): SizedChild<GlazingNode> => {
    let node: GlazingNode;
    if (src[i] === "(") {
      i++;
      const inner = ggroup();
      if (src[i] !== ")") fail(")");
      i++;
      node = inner.node;
      if (inner.sizeCm != null) fail("size");
    } else if (src[i] === "G") {
      i++;
      const g = newGlass();
      const m = /^#(\d+)X(\d+)/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        const bars = { columns: Number(m[1]), rows: Number(m[2]) };
        if (bars.columns || bars.rows) g.decorativeBars = bars;
      }
      node = g;
    } else node = fail("G");
    return { sizeCm: size(), node };
  };
  const ggroup = (): SizedChild<GlazingNode> =>
    group(gterm, (direction, children) => ({ kind: "glassSplit", id: newNodeId("s"), direction, children }));
  const fterm = (): SizedChild<FrameNode> => {
    let node: FrameNode;
    if (src[i] === "(") {
      i++;
      const inner = fgroup();
      if (src[i] !== ")") fail(")");
      i++;
      node = inner.node;
      if (inner.sizeCm != null) fail("size");
    } else if (src[i] === "F" || src[i] === "O") {
      const fixed = src[i] === "F";
      i++;
      let side: "left" | "right" | undefined;
      if (src[i] === "L" || src[i] === "R") {
        side = src[i] === "L" ? "left" : "right";
        i++;
      }
      const p = makePanel({ fixed, side });
      if (src[i] === "[") {
        i++;
        const gl = ggroup();
        if (src[i] !== "]") fail("]");
        i++;
        p.glazing = gl.node;
      }
      node = p;
    } else node = fail("F/O");
    return { sizeCm: size(), node };
  };
  const fgroup = (): SizedChild<FrameNode> =>
    group(fterm, (direction, children) => ({ kind: "frameSplit", id: newNodeId("s"), direction, children }));
  if (!src) fail("empty");
  const root = fgroup();
  if (i !== src.length) fail("end");
  return root.node;
}

export function formatLayoutNotation(root: FrameNode, unit: RfqUnit): string {
  const sz = (v: number | null) => (v == null ? "" : `:${unit === "mm" ? round2(v * 10) : round2(v)}`);
  const g = (n: GlazingNode, nested: boolean): string => {
    if (n.kind === "glass") {
      const b = n.decorativeBars;
      return b && (b.columns || b.rows) ? `G#${b.columns}x${b.rows}` : "G";
    }
    const inner = n.children.map((c) => g(c.node, true) + sz(c.sizeCm)).join(n.direction === "columns" ? "|" : "/");
    return nested ? `(${inner})` : inner;
  };
  const f = (n: FrameNode, nested: boolean): string => {
    if (n.kind === "panel") {
      const side = n.operation === "fixed" ? "" : n.operation === "sliding" ? sideCode(n.slideDirection) : sideCode(n.hingeSide);
      const gl = n.glazing.kind === "glass" && !n.glazing.decorativeBars ? "" : `[${g(n.glazing, false)}]`;
      return `${n.operation === "fixed" ? "F" : "O"}${side}${gl}`;
    }
    const inner = n.children.map((c) => f(c.node, true) + sz(c.sizeCm)).join(n.direction === "columns" ? "|" : "/");
    return nested ? `(${inner})` : inner;
  };
  return f(root, false);
}

const sideCode = (s: "left" | "right" | undefined) => (s === "left" ? "L" : s === "right" ? "R" : "");
