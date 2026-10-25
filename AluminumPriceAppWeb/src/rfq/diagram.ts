// Single diagram definition shared by the on-screen SVG and the PDF renderer.
// Coordinates: origin top-left, y grows downward, units = output units (px on screen, pt in PDF).
// Geometry depends only on the item, never on UI language: panel index 0 is always drawn on the left
// (viewed from outside).

import type { RfqItem, RfqPanel } from "./types";
import { formatDimension } from "./units";

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

export type DiagramSpec = { width: number; height: number; shapes: DiagramShape[] };

export type DiagramOptions = {
  width: number;
  height: number;
  /** Localized text for the custom-item placeholder (the only language-dependent text in a diagram) */
  customPlaceholder: string;
  showDimensions?: boolean;
  showReference?: boolean;
};

const C = {
  frame: "#1e293b",
  sash: "#334155",
  glass: "#e0f2fe",
  symbol: "#0f172a",
  dim: "#475569",
  hinge: "#0f172a",
  muted: "#94a3b8",
};

/** Symbol style shared by diagrams and legend: inward = dashed (away from viewer), outward = solid. */
export const SWING_DASH = [4, 3];

export function buildDiagram(item: RfqItem, opts: DiagramOptions): DiagramSpec {
  const shapes: DiagramShape[] = [];
  const showDims = opts.showDimensions !== false;
  const showRef = opts.showReference !== false;
  const fontSize = Math.max(7, Math.min(11, Math.min(opts.width, opts.height) / 18));

  const padTop = showRef ? fontSize * 2 : 4;
  const padBottom = showDims ? fontSize * 2.6 : 4;
  const padLeft = showDims ? fontSize * 2.6 : 4;
  const padRight = 6;
  const availW = Math.max(10, opts.width - padLeft - padRight);
  const availH = Math.max(10, opts.height - padTop - padBottom);

  const wCm = item.widthCm && item.widthCm > 0 ? item.widthCm : 100;
  const hCm = item.heightCm && item.heightCm > 0 ? item.heightCm : 100;
  const scale = Math.min(availW / wCm, availH / hCm);
  const fw = wCm * scale;
  const fh = hCm * scale;
  const fx = padLeft + (availW - fw) / 2;
  const fy = padTop + (availH - fh) / 2;

  if (showRef) {
    shapes.push({ kind: "text", x: fx + fw / 2, y: fy - fontSize * 0.7, text: item.reference || "?", size: fontSize * 1.15, anchor: "middle", bold: true, color: C.symbol });
  }

  if (item.openingType === "custom") {
    drawCustom(shapes, item, opts, { fx, fy, fw, fh, fontSize });
  } else {
    drawFrameAndPanels(shapes, item, { fx, fy, fw, fh, fontSize });
  }

  if (showDims) {
    drawDimensions(shapes, item, { fx, fy, fw, fh, fontSize });
  }

  return { width: opts.width, height: opts.height, shapes };
}

type Box = { fx: number; fy: number; fw: number; fh: number; fontSize: number };

function drawFrameAndPanels(shapes: DiagramShape[], item: RfqItem, b: Box) {
  const { fx, fy, fw, fh, fontSize } = b;
  const t = Math.max(2.5, Math.min(7, Math.min(fw, fh) * 0.045));
  const isDoor = item.category === "door";

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

  const n = Math.max(1, item.panels.length);
  const pw = iw / n;
  item.panels.forEach((panel, i) => {
    const px = ix + i * pw;
    if (i > 0) {
      shapes.push({ kind: "line", x1: px, y1: iy, x2: px, y2: iy + ih, stroke: C.frame, strokeWidth: 1.2 });
    }
    drawPanel(shapes, item, panel, { x: px, y: iy, w: pw, h: ih }, t, fontSize, i, n);
  });
}

type R = { x: number; y: number; w: number; h: number };

function drawPanel(shapes: DiagramShape[], item: RfqItem, panel: RfqPanel, r: R, t: number, fontSize: number, index: number, count: number) {
  const operable = panel.operation !== "fixed";
  const inset = operable ? Math.max(1.5, t * 0.6) : 1;
  const s: R = { x: r.x + inset, y: r.y + inset, w: Math.max(1, r.w - 2 * inset), h: Math.max(1, r.h - 2 * inset) };
  shapes.push({ kind: "rect", x: s.x, y: s.y, w: s.w, h: s.h, fill: C.glass, stroke: operable ? C.sash : undefined, strokeWidth: operable ? 0.9 : undefined });

  const sym = Math.max(6, Math.min(fontSize * 1.3, s.w * 0.35, s.h * 0.35));
  const dash = item.swing === "inward" ? SWING_DASH : undefined;

  switch (panel.operation) {
    case "fixed":
      shapes.push({ kind: "text", x: s.x + s.w / 2, y: s.y + s.h / 2 + sym * 0.35, text: "F", size: sym, anchor: "middle", bold: true, color: C.symbol });
      break;
    case "sliding":
      drawSlideArrow(shapes, s, panel.slideDirection ?? (index < count / 2 ? "right" : "left"));
      break;
    case "casement":
    case "hinged":
      drawSideHungTriangle(shapes, s, panel.hingeSide ?? "left", dash);
      drawHinges(shapes, s, panel.hingeSide ?? "left", t);
      if (item.category === "door" && (item.openingType !== "hinged_door_double" || item.activeLeaf === (index === 0 ? "left" : "right"))) {
        drawHandle(shapes, s, panel.hingeSide ?? "left");
      }
      break;
    case "tilt_turn":
      drawSideHungTriangle(shapes, s, panel.hingeSide ?? "left", SWING_DASH);
      drawTiltTriangle(shapes, s);
      drawHinges(shapes, s, panel.hingeSide ?? "left", t);
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
export type LegendSymbol = "fixed" | "sliding" | "hinged_out" | "hinged_in" | "tilt_turn" | "hinges";

export function buildLegendSymbol(symbol: LegendSymbol, size: number): DiagramSpec {
  const shapes: DiagramShape[] = [];
  const s: R = { x: 1, y: 1, w: size - 2, h: size - 2 };
  shapes.push({ kind: "rect", x: s.x, y: s.y, w: s.w, h: s.h, fill: C.glass, stroke: C.sash, strokeWidth: 0.8 });
  const t = 3;
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
  }
  return { width: size, height: size, shapes };
}
