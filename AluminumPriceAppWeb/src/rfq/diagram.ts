// Single diagram definition shared by the on-screen SVG (editor, overview, import preview) and the PDF renderer.
// Coordinates: origin top-left, y grows downward, units = output units (px on screen, pt in PDF).
// Geometry depends only on the item, never on UI language: everything is drawn as viewed from outside.

import type { GlassNode, PanelNode, RfqItem } from "./types";
import { formatDimension } from "./units";
import { layoutGeometry, type CmRect } from "./layout";

export type Pt = [number, number];

export type DiagramShape =
  | { kind: "rect"; x: number; y: number; w: number; h: number; stroke?: string; fill?: string; strokeWidth?: number; dash?: number[] }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; strokeWidth: number; dash?: number[] }
  | { kind: "poly"; points: Pt[]; closed: boolean; stroke?: string; fill?: string; strokeWidth?: number; dash?: number[] }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      anchor: "start" | "middle" | "end";
      /** -90 = reads bottom-to-top */
      rotate?: 0 | -90;
      bold?: boolean;
      color: string;
    }
  | { kind: "image"; x: number; y: number; w: number; h: number; dataUrl: string; mime: "image/png" | "image/jpeg" };

/** Clickable areas for the editor (not drawn). */
export type DiagramRegion = { id: string; kind: "panel" | "glass"; panelId: string; x: number; y: number; w: number; h: number };

/** Draggable dividers for the editor (not drawn). `pxPerCm` converts pointer movement into centimetres. */
export type DiagramDivider = {
  splitId: string;
  index: number;
  level: "frame" | "glass";
  orientation: "vertical" | "horizontal";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  pxPerCm: number;
};

export type DiagramSpec = { width: number; height: number; shapes: DiagramShape[]; regions?: DiagramRegion[]; dividers?: DiagramDivider[] };

export type DiagramOptions = {
  width: number;
  height: number;
  /** Localized text for the custom-item placeholder (the only language-dependent text in a diagram) */
  customPlaceholder: string;
  showDimensions?: boolean;
  showReference?: boolean;
  /** Panel (P1…) and glass-section (G1…) numbers; default true */
  showLabels?: boolean;
  /** Editor selection outline */
  highlightId?: string;
  /** Running dimensions of every division (above for widths, right for heights) */
  showDivisionDims?: boolean;
};

const C = {
  frame: "#1e293b",
  sash: "#334155",
  glass: "#e0f2fe",
  glassOverride: "#cfe8fb",
  symbol: "#0f172a",
  dim: "#475569",
  hinge: "#0f172a",
  muted: "#94a3b8",
  bar: "#334155",
  deco: "#64748b",
  label: "#0369a1",
  highlight: "#0ea5e9",
};

/** Symbol style shared by diagrams and legend: inward = dashed (away from viewer), outward = solid. */
export const SWING_DASH = [4, 3];
/** Decorative (non-structural) bars: thin dotted line. Physical glazing bars are solid. */
export const DECO_DASH = [1.5, 1.5];

export function buildDiagram(item: RfqItem, opts: DiagramOptions): DiagramSpec {
  const shapes: DiagramShape[] = [];
  const showDims = opts.showDimensions !== false;
  const showRef = opts.showReference !== false;
  const fontSize = Math.max(7, Math.min(11, Math.min(opts.width, opts.height) / 18));

  const wCm = item.widthCm && item.widthCm > 0 ? item.widthCm : 100;
  const hCm = item.heightCm && item.heightCm > 0 ? item.heightCm : 100;
  const cuts = showDims && opts.showDivisionDims && item.openingType !== "custom" && item.widthCm && item.heightCm ? divisionCuts(item, wCm, hCm) : { x: [], y: [] };
  const chainTop = cuts.x.length ? fontSize * 1.9 : 0;
  const chainRight = cuts.y.length ? fontSize * 2.1 : 0;

  const padTop = (showRef ? fontSize * 2 : 4) + chainTop;
  const padBottom = showDims ? fontSize * 2.6 : 4;
  const padLeft = showDims ? fontSize * 2.6 : 4;
  const padRight = 6 + chainRight;
  const availW = Math.max(10, opts.width - padLeft - padRight);
  const availH = Math.max(10, opts.height - padTop - padBottom);

  const scale = Math.min(availW / wCm, availH / hCm);
  const fw = wCm * scale;
  const fh = hCm * scale;
  const fx = padLeft + (availW - fw) / 2;
  const fy = padTop + (availH - fh) / 2;

  if (showRef) {
    shapes.push({ kind: "text", x: fx + fw / 2, y: fy - chainTop - fontSize * 0.7, text: item.reference || "?", size: fontSize * 1.15, anchor: "middle", bold: true, color: C.symbol });
  }

  const spec: DiagramSpec = { width: opts.width, height: opts.height, shapes };
  let inner: R | null = null;
  if (item.openingType === "custom") {
    drawCustom(shapes, item, opts, { fx, fy, fw, fh, fontSize });
  } else {
    inner = drawFrameAndLayout(spec, item, { fx, fy, fw, fh, fontSize }, wCm, hCm, opts);
  }

  if (showDims) {
    drawDimensions(shapes, item, { fx, fy, fw, fh, fontSize });
    if (inner && (cuts.x.length || cuts.y.length)) drawDivisionChains(shapes, item, { fx, fy, fw, fh, fontSize }, inner, wCm, hCm, cuts);
  }

  return spec;
}

/** Positions (cm from the left / top) of every mullion and transom between main panels. */
export function divisionCuts(item: RfqItem, wCm: number, hCm: number): { x: number[]; y: number[] } {
  const geo = layoutGeometry(item.layout, wCm, hCm);
  const uniq = (vals: number[]) => {
    const out: number[] = [];
    for (const v of [...vals].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > 0.05) out.push(v);
    return out;
  };
  const frame = geo.dividers.filter((d) => d.level === "frame");
  return {
    x: uniq(frame.filter((d) => d.orientation === "vertical").map((d) => d.pos)),
    y: uniq(frame.filter((d) => d.orientation === "horizontal").map((d) => d.pos)),
  };
}

/** Running dimensions: segment widths above the frame, segment heights to its right. */
function drawDivisionChains(shapes: DiagramShape[], item: RfqItem, b: Box, inner: R, wCm: number, hCm: number, cuts: { x: number[]; y: number[] }) {
  const { fx, fy, fw, fh, fontSize } = b;
  const size = fontSize * 0.78;
  const tick = 2.5;
  const textW = (s: string) => s.length * size * 0.56;
  if (cuts.x.length) {
    const stops = [0, ...cuts.x, wCm];
    const px = (cm: number, i: number) => (i === 0 ? fx : i === stops.length - 1 ? fx + fw : inner.x + (cm / wCm) * inner.w);
    const y = fy - fontSize * 0.75;
    shapes.push({ kind: "line", x1: fx, y1: y, x2: fx + fw, y2: y, stroke: C.dim, strokeWidth: 0.5 });
    stops.forEach((cm, i) => {
      const x = px(cm, i);
      shapes.push({ kind: "line", x1: x, y1: fy - 1, x2: x, y2: y - tick, stroke: C.dim, strokeWidth: 0.4 });
      shapes.push({ kind: "line", x1: x - tick, y1: y + tick, x2: x + tick, y2: y - tick, stroke: C.dim, strokeWidth: 0.8 });
    });
    for (let i = 0; i < stops.length - 1; i++) {
      const x0 = px(stops[i], i);
      const x1 = px(stops[i + 1], i + 1);
      const text = formatDimension(stops[i + 1] - stops[i], item.unit);
      if (x1 - x0 >= textW(text) + 2) shapes.push({ kind: "text", x: (x0 + x1) / 2, y: y - size * 0.35, text, size, anchor: "middle", color: C.symbol });
    }
  }
  if (cuts.y.length) {
    const stops = [0, ...cuts.y, hCm];
    const py = (cm: number, i: number) => (i === 0 ? fy : i === stops.length - 1 ? fy + fh : inner.y + (cm / hCm) * inner.h);
    const x = fx + fw + fontSize * 0.75;
    shapes.push({ kind: "line", x1: x, y1: fy, x2: x, y2: fy + fh, stroke: C.dim, strokeWidth: 0.5 });
    stops.forEach((cm, i) => {
      const y = py(cm, i);
      shapes.push({ kind: "line", x1: fx + fw + 1, y1: y, x2: x + tick, y2: y, stroke: C.dim, strokeWidth: 0.4 });
      shapes.push({ kind: "line", x1: x - tick, y1: y + tick, x2: x + tick, y2: y - tick, stroke: C.dim, strokeWidth: 0.8 });
    });
    for (let i = 0; i < stops.length - 1; i++) {
      const y0 = py(stops[i], i);
      const y1 = py(stops[i + 1], i + 1);
      const text = formatDimension(stops[i + 1] - stops[i], item.unit);
      if (y1 - y0 >= textW(text) + 2) shapes.push({ kind: "text", x: x + size * 1.05, y: (y0 + y1) / 2, text, size, anchor: "middle", rotate: -90, color: C.symbol });
    }
  }
}

type Box = { fx: number; fy: number; fw: number; fh: number; fontSize: number };
type R = { x: number; y: number; w: number; h: number };

function drawFrameAndLayout(spec: DiagramSpec, item: RfqItem, b: Box, wCm: number, hCm: number, opts: DiagramOptions): R {
  const shapes = spec.shapes;
  const { fx, fy, fw, fh, fontSize } = b;
  const t = Math.max(2.5, Math.min(7, Math.min(fw, fh) * 0.045));
  const isDoor = item.category === "door";
  const showLabels = opts.showLabels !== false;

  shapes.push({ kind: "rect", x: fx, y: fy, w: fw, h: fh, stroke: C.frame, fill: "#f8fafc", strokeWidth: 1.4 });
  const ix = fx + t;
  const iy = fy + t;
  const iw = fw - 2 * t;
  const ih = fh - (isDoor ? t : 2 * t);
  shapes.push({ kind: "rect", x: ix, y: iy, w: iw, h: ih, stroke: C.frame, strokeWidth: 0.8 });

  if (isDoor) {
    // Floor line identifies doors without implying a threshold detail.
    shapes.push({ kind: "line", x1: fx - t * 2, y1: fy + fh, x2: fx + fw + t * 2, y2: fy + fh, stroke: C.dim, strokeWidth: 1.2 });
  }

  // Layout shares of the overall frame are mapped proportionally onto the drawn inner frame.
  const sx = iw / wCm;
  const sy = ih / hCm;
  const map = (r: CmRect): R => ({ x: ix + r.x * sx, y: iy + r.y * sy, w: r.w * sx, h: r.h * sy });
  const geo = layoutGeometry(item.layout, wCm, hCm);
  const regions: DiagramRegion[] = [];
  const dividers: DiagramDivider[] = [];

  // Mullions / transoms between main panels
  for (const dv of geo.dividers.filter((d) => d.level === "frame")) {
    const line =
      dv.orientation === "vertical"
        ? { x1: ix + dv.pos * sx, y1: iy + dv.start * sy, x2: ix + dv.pos * sx, y2: iy + dv.end * sy }
        : { x1: ix + dv.start * sx, y1: iy + dv.pos * sy, x2: ix + dv.end * sx, y2: iy + dv.pos * sy };
    shapes.push({ kind: "line", ...line, stroke: C.frame, strokeWidth: 1.2 });
    dividers.push({ splitId: dv.splitId, index: dv.index, level: "frame", orientation: dv.orientation, ...line, pxPerCm: dv.orientation === "vertical" ? sx : sy });
  }

  const panelCount = geo.panels.length;
  const glassCount = geo.glass.length;
  const hinged = geo.panels.filter((p) => p.node.operation === "hinged").map((p) => p.node.id);
  const labelSize = Math.max(5.5, fontSize * 0.72);
  const pending: DiagramShape[] = [];

  for (const gp of geo.panels) {
    const panel = gp.node;
    const r = map(gp.rect);
    const operable = panel.operation !== "fixed";
    const inset = operable ? Math.max(1.5, t * 0.6) : 1;
    const s: R = { x: r.x + inset, y: r.y + inset, w: Math.max(1, r.w - 2 * inset), h: Math.max(1, r.h - 2 * inset) };
    regions.push({ id: panel.id, kind: "panel", panelId: panel.id, ...r });

    // Glass sections are mapped into the sash/light opening so subdivisions move with the sash.
    const inPanel = (g: CmRect): R => ({
      x: s.x + ((g.x - gp.rect.x) / gp.rect.w) * s.w,
      y: s.y + ((g.y - gp.rect.y) / gp.rect.h) * s.h,
      w: (g.w / gp.rect.w) * s.w,
      h: (g.h / gp.rect.h) * s.h,
    });
    const glass = geo.glass.filter((g) => g.panelId === panel.id);
    if (glass.length === 1 && !glass[0].node.override) {
      shapes.push({ kind: "rect", x: s.x, y: s.y, w: s.w, h: s.h, fill: C.glass, stroke: operable ? C.sash : undefined, strokeWidth: operable ? 0.9 : undefined });
    } else {
      for (const g of glass) {
        const gr = inPanel(g.rect);
        shapes.push({ kind: "rect", x: gr.x, y: gr.y, w: gr.w, h: gr.h, fill: g.node.override ? C.glassOverride : C.glass });
      }
      if (operable) shapes.push({ kind: "rect", x: s.x, y: s.y, w: s.w, h: s.h, stroke: C.sash, strokeWidth: 0.9 });
    }
    for (const g of glass) {
      const gr = inPanel(g.rect);
      drawDecorativeBars(shapes, g.node, gr);
      regions.push({ id: g.node.id, kind: "glass", panelId: panel.id, ...gr });
    }
    // Physical glazing bars (separate glass units)
    for (const dv of geo.dividers.filter((d) => d.level === "glass" && d.panelId === panel.id)) {
      const kx = s.w / gp.rect.w;
      const ky = s.h / gp.rect.h;
      const line =
        dv.orientation === "vertical"
          ? { x1: s.x + (dv.pos - gp.rect.x) * kx, y1: s.y + (dv.start - gp.rect.y) * ky, x2: s.x + (dv.pos - gp.rect.x) * kx, y2: s.y + (dv.end - gp.rect.y) * ky }
          : { x1: s.x + (dv.start - gp.rect.x) * kx, y1: s.y + (dv.pos - gp.rect.y) * ky, x2: s.x + (dv.end - gp.rect.x) * kx, y2: s.y + (dv.pos - gp.rect.y) * ky };
      shapes.push({ kind: "line", ...line, stroke: C.bar, strokeWidth: 1.1 });
      dividers.push({ splitId: dv.splitId, index: dv.index, level: "glass", orientation: dv.orientation, ...line, pxPerCm: dv.orientation === "vertical" ? kx : ky });
    }

    const largest = glass.map((g) => inPanel(g.rect)).sort((a, z) => z.w * z.h - a.w * a.h)[0] ?? s;
    drawOpening(shapes, item, panel, s, largest, t, fontSize, gp.number - 1, panelCount, hinged.indexOf(panel.id));

    if (showLabels) {
      if (glassCount > 1) {
        for (const g of glass) drawTag(pending, inPanel(g.rect), `G${g.number}`, labelSize, "start");
      }
      if (panelCount > 1) drawTag(pending, s, `P${gp.number}`, labelSize, "end");
    }
  }
  shapes.push(...pending);

  if (opts.highlightId) {
    const reg = regions.find((r) => r.id === opts.highlightId);
    if (reg) shapes.push({ kind: "rect", x: reg.x + 1, y: reg.y + 1, w: Math.max(1, reg.w - 2), h: Math.max(1, reg.h - 2), stroke: C.highlight, strokeWidth: 2, dash: [4, 2] });
  }
  spec.regions = regions;
  spec.dividers = dividers;
  return { x: ix, y: iy, w: iw, h: ih };
}

/** Small number tag; shrinks for narrow sections and is skipped only when it still cannot be read. */
function drawTag(shapes: DiagramShape[], r: R, text: string, preferred: number, corner: "start" | "end") {
  const fits = (s: number) => r.w >= text.length * s * 0.62 + s * 0.5 + 3 && r.h >= s * 1.25 * 2.2;
  let size = preferred;
  while (!fits(size) && size > 4.5) size -= 0.5;
  if (!fits(size)) return;
  const w = text.length * size * 0.62 + size * 0.5;
  const h = size * 1.25;
  const x = corner === "start" ? r.x + 1.5 : r.x + r.w - w - 1.5;
  const y = corner === "start" ? r.y + 1.5 : r.y + r.h - h - 1.5;
  shapes.push({ kind: "rect", x, y, w, h, fill: "#ffffff", stroke: C.muted, strokeWidth: 0.4 });
  shapes.push({ kind: "text", x: x + w / 2, y: y + h * 0.78, text, size, anchor: "middle", bold: true, color: corner === "start" ? C.label : C.dim });
}

function drawDecorativeBars(shapes: DiagramShape[], g: GlassNode, r: R) {
  const b = g.decorativeBars;
  if (!b) return;
  for (let k = 1; k <= b.columns; k++) {
    const x = r.x + (r.w * k) / (b.columns + 1);
    shapes.push({ kind: "line", x1: x, y1: r.y, x2: x, y2: r.y + r.h, stroke: C.deco, strokeWidth: 0.6, dash: DECO_DASH });
  }
  for (let k = 1; k <= b.rows; k++) {
    const y = r.y + (r.h * k) / (b.rows + 1);
    shapes.push({ kind: "line", x1: r.x, y1: y, x2: r.x + r.w, y2: y, stroke: C.deco, strokeWidth: 0.6, dash: DECO_DASH });
  }
}

function drawOpening(shapes: DiagramShape[], item: RfqItem, panel: PanelNode, s: R, fixedIn: R, t: number, fontSize: number, index: number, count: number, leafIndex: number) {
  const dash = item.swing === "inward" ? SWING_DASH : undefined;
  const hinge = panel.hingeSide ?? "left";

  switch (panel.operation) {
    case "fixed": {
      const fs = Math.max(6, Math.min(fontSize * 1.3, fixedIn.w * 0.35, fixedIn.h * 0.35));
      shapes.push({ kind: "text", x: fixedIn.x + fixedIn.w / 2, y: fixedIn.y + fixedIn.h / 2 + fs * 0.35, text: "F", size: fs, anchor: "middle", bold: true, color: C.symbol });
      break;
    }
    case "sliding":
      drawSlideArrow(shapes, s, panel.slideDirection ?? (index < count / 2 ? "right" : "left"));
      break;
    case "casement":
    case "hinged":
      drawSideHungTriangle(shapes, s, hinge, dash);
      drawHinges(shapes, s, hinge, t);
      if (item.category === "door" && (item.openingType !== "hinged_door_double" || item.activeLeaf === (leafIndex === 0 ? "left" : "right"))) {
        drawHandle(shapes, s, hinge);
      }
      break;
    case "tilt_turn":
      drawSideHungTriangle(shapes, s, hinge, SWING_DASH);
      drawTiltTriangle(shapes, s);
      drawHinges(shapes, s, hinge, t);
      break;
    case "top_hung":
      drawTopHungTriangle(shapes, s, item.swing === "inward" ? SWING_DASH : undefined);
      drawTopHinges(shapes, s, t);
      break;
  }
}

/** Apex on the hinge side (ISO/DIN elevation convention). */
function drawSideHungTriangle(shapes: DiagramShape[], s: R, hinge: "left" | "right", dash?: number[]) {
  const apexX = hinge === "left" ? s.x : s.x + s.w;
  const baseX = hinge === "left" ? s.x + s.w : s.x;
  shapes.push({ kind: "poly", closed: false, points: [[baseX, s.y], [apexX, s.y + s.h / 2], [baseX, s.y + s.h]], stroke: C.symbol, strokeWidth: 0.9, dash });
}

function drawTiltTriangle(shapes: DiagramShape[], s: R) {
  shapes.push({ kind: "poly", closed: false, points: [[s.x, s.y], [s.x + s.w / 2, s.y + s.h], [s.x + s.w, s.y]], stroke: C.symbol, strokeWidth: 0.7, dash: SWING_DASH });
}

function drawTopHungTriangle(shapes: DiagramShape[], s: R, dash?: number[]) {
  shapes.push({ kind: "poly", closed: false, points: [[s.x, s.y + s.h], [s.x + s.w / 2, s.y], [s.x + s.w, s.y + s.h]], stroke: C.symbol, strokeWidth: 0.9, dash });
}

function drawHinges(shapes: DiagramShape[], s: R, hinge: "left" | "right", t: number) {
  const len = Math.max(4, Math.min(s.h * 0.1, 14));
  const w = Math.max(1.6, t * 0.55);
  const x = hinge === "left" ? s.x - w / 2 : s.x + s.w - w / 2;
  for (const f of [0.18, 0.82]) {
    shapes.push({ kind: "rect", x, y: s.y + s.h * f - len / 2, w, h: len, fill: C.hinge });
  }
}

function drawTopHinges(shapes: DiagramShape[], s: R, t: number) {
  const len = Math.max(4, Math.min(s.w * 0.1, 14));
  const h = Math.max(1.6, t * 0.55);
  for (const f of [0.18, 0.82]) {
    shapes.push({ kind: "rect", x: s.x + s.w * f - len / 2, y: s.y - h / 2, w: len, h, fill: C.hinge });
  }
}

function drawHandle(shapes: DiagramShape[], s: R, hinge: "left" | "right") {
  const x = hinge === "left" ? s.x + s.w - Math.max(3, s.w * 0.08) : s.x + Math.max(3, s.w * 0.08);
  const y = s.y + s.h * 0.52;
  const len = Math.max(4, s.w * 0.12);
  const dx = hinge === "left" ? -len : len;
  shapes.push({ kind: "line", x1: x, y1: y, x2: x + dx, y2: y, stroke: C.symbol, strokeWidth: 1.6 });
}

function drawSlideArrow(shapes: DiagramShape[], s: R, dir: "left" | "right") {
  const cy = s.y + s.h / 2;
  const len = s.w * 0.6;
  const x0 = s.x + (s.w - len) / 2;
  const x1 = x0 + len;
  const head = Math.max(3, Math.min(8, len * 0.22));
  shapes.push({ kind: "line", x1: x0, y1: cy, x2: x1, y2: cy, stroke: C.symbol, strokeWidth: 1.1 });
  const tipX = dir === "right" ? x1 : x0;
  const backX = dir === "right" ? x1 - head : x0 + head;
  shapes.push({ kind: "poly", closed: true, points: [[tipX, cy], [backX, cy - head * 0.55], [backX, cy + head * 0.55]], fill: C.symbol });
}

function drawCustom(shapes: DiagramShape[], item: RfqItem, opts: DiagramOptions, b: Box) {
  const { fx, fy, fw, fh, fontSize } = b;
  shapes.push({ kind: "rect", x: fx, y: fy, w: fw, h: fh, stroke: C.dim, strokeWidth: 1, dash: [5, 3] });
  const img = item.referenceImage;
  if (img) {
    shapes.push({ kind: "image", x: fx + 2, y: fy + 2, w: Math.max(1, fw - 4), h: Math.max(1, fh - 4), dataUrl: img.dataUrl, mime: img.mime });
    return;
  }
  shapes.push({ kind: "line", x1: fx, y1: fy, x2: fx + fw, y2: fy + fh, stroke: C.muted, strokeWidth: 0.6, dash: [3, 3] });
  shapes.push({ kind: "line", x1: fx + fw, y1: fy, x2: fx, y2: fy + fh, stroke: C.muted, strokeWidth: 0.6, dash: [3, 3] });
  const size = Math.max(6, Math.min(fontSize, fw / Math.max(8, opts.customPlaceholder.length * 0.55)));
  shapes.push({ kind: "rect", x: fx + fw * 0.06, y: fy + fh / 2 - size, w: fw * 0.88, h: size * 1.8, fill: "#ffffff" });
  shapes.push({ kind: "text", x: fx + fw / 2, y: fy + fh / 2 + size * 0.35, text: opts.customPlaceholder, size, anchor: "middle", color: C.dim });
}

function drawDimensions(shapes: DiagramShape[], item: RfqItem, b: Box) {
  const { fx, fy, fw, fh, fontSize } = b;
  const tick = 3;
  const gap = fontSize * 0.9;
  const widthText = item.widthCm ? `${formatDimension(item.widthCm, item.unit)} ${item.unit}` : "?";
  const heightText = item.heightCm ? `${formatDimension(item.heightCm, item.unit)} ${item.unit}` : "?";

  // Width (below)
  const wy = fy + fh + gap;
  shapes.push({ kind: "line", x1: fx, y1: fy + fh + 2, x2: fx, y2: wy + tick, stroke: C.dim, strokeWidth: 0.5 });
  shapes.push({ kind: "line", x1: fx + fw, y1: fy + fh + 2, x2: fx + fw, y2: wy + tick, stroke: C.dim, strokeWidth: 0.5 });
  shapes.push({ kind: "line", x1: fx, y1: wy, x2: fx + fw, y2: wy, stroke: C.dim, strokeWidth: 0.7 });
  shapes.push({ kind: "line", x1: fx - tick, y1: wy + tick, x2: fx + tick, y2: wy - tick, stroke: C.dim, strokeWidth: 0.9 });
  shapes.push({ kind: "line", x1: fx + fw - tick, y1: wy + tick, x2: fx + fw + tick, y2: wy - tick, stroke: C.dim, strokeWidth: 0.9 });
  shapes.push({ kind: "text", x: fx + fw / 2, y: wy + fontSize * 1.25, text: widthText, size: fontSize, anchor: "middle", color: C.symbol });

  // Height (left), text reads bottom-to-top
  const hx = fx - gap;
  shapes.push({ kind: "line", x1: fx - 2, y1: fy, x2: hx - tick, y2: fy, stroke: C.dim, strokeWidth: 0.5 });
  shapes.push({ kind: "line", x1: fx - 2, y1: fy + fh, x2: hx - tick, y2: fy + fh, stroke: C.dim, strokeWidth: 0.5 });
  shapes.push({ kind: "line", x1: hx, y1: fy, x2: hx, y2: fy + fh, stroke: C.dim, strokeWidth: 0.7 });
  shapes.push({ kind: "line", x1: hx - tick, y1: fy + tick, x2: hx + tick, y2: fy - tick, stroke: C.dim, strokeWidth: 0.9 });
  shapes.push({ kind: "line", x1: hx - tick, y1: fy + fh + tick, x2: hx + tick, y2: fy + fh - tick, stroke: C.dim, strokeWidth: 0.9 });
  shapes.push({ kind: "text", x: hx - fontSize * 0.45, y: fy + fh / 2, text: heightText, size: fontSize, anchor: "middle", rotate: -90, color: C.symbol });
}

/** Small isolated symbols used by the legend (same primitives as the diagrams). */
export type LegendSymbol = "fixed" | "sliding" | "hinged_out" | "hinged_in" | "tilt_turn" | "hinges" | "mullion" | "glazing_bar" | "decorative_bar" | "labels";

export function buildLegendSymbol(symbol: LegendSymbol, size: number): DiagramSpec {
  const shapes: DiagramShape[] = [];
  const s: R = { x: 1, y: 1, w: size - 2, h: size - 2 };
  shapes.push({ kind: "rect", x: s.x, y: s.y, w: s.w, h: s.h, fill: C.glass, stroke: C.sash, strokeWidth: 0.8 });
  const t = 3;
  const mid = s.x + s.w / 2;
  switch (symbol) {
    case "fixed":
      shapes.push({ kind: "text", x: s.x + s.w / 2, y: s.y + s.h / 2 + size * 0.15, text: "F", size: size * 0.45, anchor: "middle", bold: true, color: C.symbol });
      break;
    case "sliding":
      drawSlideArrow(shapes, s, "right");
      break;
    case "hinged_out":
      drawSideHungTriangle(shapes, s, "left");
      break;
    case "hinged_in":
      drawSideHungTriangle(shapes, s, "left", SWING_DASH);
      break;
    case "tilt_turn":
      drawSideHungTriangle(shapes, s, "left", SWING_DASH);
      drawTiltTriangle(shapes, s);
      break;
    case "hinges":
      drawHinges(shapes, s, "left", t);
      break;
    case "mullion":
      shapes.push({ kind: "line", x1: mid, y1: s.y, x2: mid, y2: s.y + s.h, stroke: C.frame, strokeWidth: 1.6 });
      break;
    case "glazing_bar":
      shapes.push({ kind: "line", x1: mid, y1: s.y, x2: mid, y2: s.y + s.h, stroke: C.bar, strokeWidth: 1.1 });
      break;
    case "decorative_bar":
      shapes.push({ kind: "line", x1: mid, y1: s.y, x2: mid, y2: s.y + s.h, stroke: C.deco, strokeWidth: 0.6, dash: DECO_DASH });
      shapes.push({ kind: "line", x1: s.x, y1: s.y + s.h / 2, x2: s.x + s.w, y2: s.y + s.h / 2, stroke: C.deco, strokeWidth: 0.6, dash: DECO_DASH });
      break;
    case "labels":
      drawTag(shapes, s, "G1", Math.max(5.5, size * 0.28), "start");
      drawTag(shapes, s, "P1", Math.max(5.5, size * 0.28), "end");
      break;
  }
  return { width: size, height: size, shapes };
}
