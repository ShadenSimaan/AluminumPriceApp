import { useMemo, useRef, useState, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from "react";
import type { DiagramDivider, DiagramRegion, DiagramShape, DiagramSpec, LegendSymbol } from "./diagram";
import { buildDiagram, buildLegendSymbol } from "./diagram";
import type { RfqItem, RfqLanguage } from "./types";
import { dict } from "./i18n";

function dashAttr(dash?: number[]) {
  return dash && dash.length ? dash.join(" ") : undefined;
}

function Shape({ s }: { s: DiagramShape }) {
  switch (s.kind) {
    case "rect":
      return (
        <rect
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          fill={s.fill ?? "none"}
          stroke={s.stroke ?? "none"}
          strokeWidth={s.strokeWidth ?? 0}
          strokeDasharray={dashAttr(s.dash)}
        />
      );
    case "line":
      return (
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeDasharray={dashAttr(s.dash)} />
      );
    case "poly": {
      const pts = s.points.map((p) => p.join(",")).join(" ");
      const common = {
        points: pts,
        fill: s.fill ?? "none",
        stroke: s.stroke ?? "none",
        strokeWidth: s.strokeWidth ?? 0,
        strokeDasharray: dashAttr(s.dash),
        strokeLinejoin: "round" as const,
      };
      return s.closed ? <polygon {...common} /> : <polyline {...common} />;
    }
    case "text":
      return (
        <text
          x={s.x}
          y={s.y}
          fontSize={s.size}
          fontWeight={s.bold ? 700 : 500}
          textAnchor={s.anchor}
          fill={s.color}
          transform={s.rotate ? `rotate(${s.rotate} ${s.x} ${s.y})` : undefined}
          style={{ fontFamily: "Arial, 'Noto Sans Hebrew', sans-serif" }}
        >
          {s.text}
        </text>
      );
    case "image":
      return <image href={s.dataUrl} x={s.x} y={s.y} width={s.w} height={s.h} preserveAspectRatio="xMidYMid meet" />;
  }
}

export function DiagramSvg({ spec, className, title }: { spec: DiagramSpec; className?: string; title?: string }) {
  return (
    <svg
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      width="100%"
      className={className}
      // Physical geometry must never be mirrored by an RTL page.
      direction="ltr"
      style={{ direction: "ltr", display: "block", maxHeight: spec.height * 1.6 }}
      role="img"
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {spec.shapes.map((s, i) => (
        <Shape key={i} s={s} />
      ))}
    </svg>
  );
}

export type DividerDragPhase = "start" | "move" | "end";

export type DiagramInteraction = {
  selectedId?: string;
  /** Called with the clicked panel or glass-section id */
  onSelect: (region: DiagramRegion) => void;
  /** `deltaCm` is cumulative since the drag started */
  onDividerDrag?: (divider: DiagramDivider, deltaCm: number, phase: DividerDragPhase) => void;
};

function InteractiveDiagramSvg({ spec, title, interaction }: { spec: DiagramSpec; title: string; interaction: DiagramInteraction }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ div: DiagramDivider; start: number; pointerId: number } | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const toSvg = (e: RPointerEvent | RMouseEvent): [number, number] | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  };

  // Smallest region under the pointer; a single-glass panel selects the panel itself.
  const regionAt = (x: number, y: number): DiagramRegion | null => {
    const hits = (spec.regions ?? []).filter((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
    if (!hits.length) return null;
    hits.sort((a, b) => a.w * a.h - b.w * b.h);
    const best = hits[0];
    if (best.kind === "glass") {
      const siblings = (spec.regions ?? []).filter((r) => r.kind === "glass" && r.panelId === best.panelId).length;
      if (siblings <= 1) return hits.find((r) => r.kind === "panel" && r.id === best.panelId) ?? best;
    }
    return best;
  };

  const along = (div: DiagramDivider, p: [number, number]) => (div.orientation === "vertical" ? p[0] : p[1]);

  const onDown = (e: RPointerEvent, div: DiagramDivider) => {
    const p = toSvg(e);
    if (!p || !interaction.onDividerDrag) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { div, start: along(div, p), pointerId: e.pointerId };
    interaction.onDividerDrag(div, 0, "start");
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = toSvg(e);
    if (p) interaction.onDividerDrag?.(d.div, (along(d.div, p) - d.start) / d.div.pxPerCm, "move");
  };
  const onUp = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    drag.current = null;
    const p = toSvg(e);
    interaction.onDividerDrag?.(d.div, p ? (along(d.div, p) - d.start) / d.div.pxPerCm : 0, "end");
  };

  const hoverRegion = hover ? (spec.regions ?? []).find((r) => r.id === hover) : undefined;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${spec.width} ${spec.height}`}
      width="100%"
      direction="ltr"
      style={{ direction: "ltr", display: "block", maxHeight: spec.height * 1.6, touchAction: "none", cursor: "pointer" }}
      role="img"
      aria-label={title}
      onClick={(e) => {
        const p = toSvg(e);
        const r = p && regionAt(p[0], p[1]);
        if (r) interaction.onSelect(r);
      }}
      onPointerMove={(e) => {
        onMove(e);
        if (drag.current) return;
        const p = toSvg(e);
        const r = p && regionAt(p[0], p[1]);
        setHover(r ? r.id : null);
      }}
      onPointerLeave={() => setHover(null)}
    >
      <title>{title}</title>
      {spec.shapes.map((s, i) => (
        <Shape key={i} s={s} />
      ))}
      {hoverRegion && hoverRegion.id !== interaction.selectedId ? (
        <rect x={hoverRegion.x} y={hoverRegion.y} width={hoverRegion.w} height={hoverRegion.h} fill="#0ea5e9" fillOpacity={0.08} stroke="#0ea5e9" strokeOpacity={0.5} strokeWidth={1} pointerEvents="none" />
      ) : null}
      {interaction.onDividerDrag
        ? (spec.dividers ?? []).map((div) => (
            <line
              key={`${div.splitId}-${div.index}`}
              x1={div.x1}
              y1={div.y1}
              x2={div.x2}
              y2={div.y2}
              stroke="#0ea5e9"
              strokeOpacity={0.001}
              strokeWidth={9}
              style={{ cursor: div.orientation === "vertical" ? "ew-resize" : "ns-resize" }}
              onPointerDown={(e) => onDown(e, div)}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onClick={(e) => e.stopPropagation()}
            >
              <title>↔</title>
            </line>
          ))
        : null}
    </svg>
  );
}

export default function RfqDiagram({
  item,
  lang,
  width = 260,
  height = 220,
  showDimensions = true,
  showLabels = true,
  className,
  interaction,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  width?: number;
  height?: number;
  showDimensions?: boolean;
  showLabels?: boolean;
  className?: string;
  interaction?: DiagramInteraction;
}) {
  const placeholder = dict(lang).pdf.customPlaceholder;
  const highlightId = interaction?.selectedId;
  const spec = useMemo(
    () => buildDiagram(item, { width, height, customPlaceholder: placeholder, showDimensions, showLabels, highlightId }),
    [item, width, height, placeholder, showDimensions, showLabels, highlightId]
  );
  const title = `${item.reference} — ${dict(lang).openingType[item.openingType]}`;
  if (interaction && item.openingType !== "custom") return <InteractiveDiagramSvg spec={spec} title={title} interaction={interaction} />;
  return <DiagramSvg spec={spec} className={className} title={title} />;
}

export function LegendIcon({ symbol, size = 26 }: { symbol: LegendSymbol; size?: number }) {
  const spec = useMemo(() => buildLegendSymbol(symbol, size), [symbol, size]);
  return (
    <span style={{ width: size, height: size, display: "inline-block", flexShrink: 0 }}>
      <DiagramSvg spec={spec} />
    </span>
  );
}

export function RfqLegend({ lang, compact }: { lang: RfqLanguage; compact?: boolean }) {
  const d = dict(lang).ui;
  const entries: { symbol: LegendSymbol; text: string }[] = [
    { symbol: "fixed", text: d.legendFixed },
    { symbol: "sliding", text: d.legendSliding },
    { symbol: "hinged_out", text: d.legendHingedOut },
    { symbol: "hinged_in", text: d.legendHingedIn },
    { symbol: "tilt_turn", text: d.legendTilt },
    { symbol: "hinges", text: d.legendHinges },
    { symbol: "mullion", text: d.legendMullion },
    { symbol: "glazing_bar", text: d.legendGlazingBar },
    { symbol: "decorative_bar", text: d.legendDecorative },
    { symbol: "labels", text: d.legendLabels },
  ];
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
      <div className="font-semibold mb-2">
        {d.legend} — {d.viewedFromOutside}
      </div>
      <ul className={`grid gap-1.5 ${compact ? "" : "sm:grid-cols-2"}`}>
        {entries.map((e) => (
          <li key={e.symbol} className="flex items-center gap-2">
            <LegendIcon symbol={e.symbol} />
            <span>{e.text}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 text-slate-500">{d.sideHint}</div>
    </div>
  );
}
