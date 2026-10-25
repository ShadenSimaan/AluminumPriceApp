import { useMemo } from "react";
import type { DiagramShape, DiagramSpec, LegendSymbol } from "./diagram";
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

export default function RfqDiagram({
  item,
  lang,
  width = 260,
  height = 220,
  showDimensions = true,
  className,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  width?: number;
  height?: number;
  showDimensions?: boolean;
  className?: string;
}) {
  const placeholder = dict(lang).pdf.customPlaceholder;
  const spec = useMemo(
    () => buildDiagram(item, { width, height, customPlaceholder: placeholder, showDimensions }),
    [item, width, height, placeholder, showDimensions]
  );
  return <DiagramSvg spec={spec} className={className} title={`${item.reference} — ${dict(lang).openingType[item.openingType]}`} />;
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
