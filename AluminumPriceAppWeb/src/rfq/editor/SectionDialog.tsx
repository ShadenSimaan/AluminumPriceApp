import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { FrameNode, GlassNode, RfqItem, RfqLanguage, SplitDirection } from "../types";
import { effectiveGlass } from "../glass";
import {
  divideGlass,
  findNode,
  glassLeavesOf,
  layoutGeometry,
  mergeAdjacent,
  mergeOptions,
  numberedGlass,
  panelOf,
  parentSplitOf,
  setDecorativeBars,
  setGlassOverride,
  splitNode,
  type MergeDir,
} from "../layout";
import { describeGlass, dict, dirOf, fmt, panelCodes, panelTitles } from "../i18n";
import { cmToUnit } from "../units";
import { Btn } from "../ui";
import { NumberInput } from "./common";
import { GlassSpecEditor, type AskProps } from "./GlassEditor";
import { PanelSettings, SizesEditor } from "./LayoutEditor";

type Change = (fn: (it: RfqItem) => RfqItem) => void;

const dimsOf = (it: RfqItem) => ({
  widthCm: it.widthCm && isFinite(it.widthCm) ? it.widthCm : null,
  heightCm: it.heightCm && isFinite(it.heightCm) ? it.heightCm : null,
});

const SIDE_LABEL: Record<MergeDir, "mergeUp" | "mergeDown" | "mergeLeft" | "mergeRight"> = {
  top: "mergeUp",
  bottom: "mergeDown",
  left: "mergeLeft",
  right: "mergeRight",
};

export default function SectionDialog({
  item,
  lang,
  selectedId,
  onSelect,
  onClose,
  change,
  ask,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  selectedId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  change: Change;
  ask: AskProps;
}) {
  const d = dict(lang);
  const L = d.layout;
  const G = d.glass;
  const [parts, setParts] = useState<number | null>(2);
  const node = findNode(item.layout, selectedId);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [onClose]);

  if (!node || (node.kind !== "panel" && node.kind !== "glass")) return null;
  const panel = node.kind === "panel" ? node : panelOf(item.layout, node.id);
  if (!panel) return null;

  const known = !!(item.widthCm && item.widthCm > 0 && item.heightCm && item.heightCm > 0);
  const geo = layoutGeometry(item.layout, known ? item.widthCm! : 100, known ? item.heightCm! : 100);
  const glassList = numberedGlass(item.layout);
  const titles = panelTitles(lang, item);
  const codes = panelCodes(item);
  const who = (id: string) => {
    const g = glassList.find((x) => x.glass.id === id);
    if (g) return `G${g.number}`;
    const p = geo.panels.find((x) => x.node.id === id);
    return p ? `P${p.number}` : id;
  };
  const glassNo = glassList.find((g) => g.glass.id === node.id)?.number;
  const title =
    node.kind === "panel"
      ? fmt(L.dialogPanel, { p: titles.get(panel.id) ?? who(panel.id) })
      : `${fmt(L.dialogGlass, { g: `G${glassNo ?? ""}` })} — ${fmt(L.inPanel, { p: codes.get(panel.id) ?? "" })}`;
  const rect = node.kind === "glass" ? geo.glass.find((g) => g.node.id === node.id)?.rect : geo.panels.find((p) => p.node.id === node.id)?.rect;
  const toUnit = (cm: number) => Math.round(cmToUnit(cm, item.unit) * 10) / 10;
  const options = mergeOptions(item.layout, node.id, dimsOf(item));
  const n = parts && parts >= 2 ? parts : 2;
  const op = (fn: (l: FrameNode) => FrameNode) => change((it) => ({ ...it, layout: fn(it.layout) }));
  const singleGlass: GlassNode | null = node.kind === "glass" ? node : panel.glazing.kind === "glass" ? panel.glazing : null;
  const panelGlasses = glassLeavesOf(panel.glazing);

  const side = (dir: MergeDir) => {
    const list = options.filter((o) => o.dir === dir);
    const name = L[SIDE_LABEL[dir]];
    if (!list.length) {
      return (
        <div dir={dirOf(lang)} className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-2 py-2 text-center text-xs text-slate-400 min-w-[8.5rem]">
          <div className="font-medium">{name}</div>
          <div>{L.mergeEmpty}</div>
        </div>
      );
    }
    return (
      <div className="grid gap-1 justify-items-stretch">
        {list.map((o) => (
          <Btn
            key={o.neighborId}
            small
            disabled={o.blocked}
            title={o.blocked ? L.mergeBlocked : o.aligned ? L.mergeKeeps : L.mergePartial}
            onClick={() => op((l) => mergeAdjacent(l, node.id, o.neighborId, dimsOf(item)))}
          >
            <span dir={dirOf(lang)} className="grid leading-tight text-start">
              <span>{fmt(L.mergeWithSide, { side: name, who: who(o.neighborId) })}</span>
              {!o.blocked && !o.aligned ? <span className="text-[10px] font-normal opacity-80">{L.mergePartial}</span> : null}
              {o.blocked ? <span className="text-[10px] font-normal opacity-80">{L.mergeBlocked}</span> : null}
            </span>
          </Btn>
        ))}
      </div>
    );
  };

  const splitButtons = (fn: (dir: SplitDirection) => void) => (
    <div className="grid grid-cols-2 gap-2">
      <Btn onClick={() => fn("columns")}>▯ ▯ {L.sideBySide}</Btn>
      <Btn onClick={() => fn("rows")}>☰ {L.stacked}</Btn>
    </div>
  );

  return createPortal(
    <div
      dir={dirOf(lang)}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      className="fixed z-[70] flex flex-col overflow-hidden rounded-xl border border-sky-200 bg-white shadow-2xl inset-x-2 bottom-2 max-h-[min(82vh,44rem)] lg:inset-x-auto lg:start-4 lg:top-4 lg:bottom-4 lg:w-[34rem] lg:max-h-none"
    >
      <div className="px-4 py-3 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0 bg-sky-50">
        <div className="min-w-0">
          <h3 className="text-base font-semibold truncate">{title}</h3>
          {known && rect ? (
            <div className="text-xs text-slate-600 tabular-nums" dir="ltr">
              {toUnit(rect.w)} × {toUnit(rect.h)} {item.unit}
            </div>
          ) : null}
        </div>
        <button type="button" className="px-3 py-1.5 rounded-md bg-white border hover:bg-slate-50 shrink-0" onClick={onClose}>
          {L.closeSection}
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 grid gap-4 content-start">
        <p className="text-xs text-slate-500">{L.dialogApplyNote}</p>

        <section className="grid gap-2">
          <h4 className="text-sm font-semibold">{L.mergeTitle}</h4>
          <div dir="ltr" className="grid grid-cols-[1fr_auto_1fr] items-center justify-items-center gap-2">
            <div className="col-start-2">{side("top")}</div>
            <div className="col-start-1 row-start-2">{side("left")}</div>
            <div className="col-start-2 row-start-2 rounded-lg border-2 border-sky-400 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-800 text-center min-w-[5.5rem]">
              {node.kind === "glass" ? `G${glassNo ?? ""}` : who(panel.id)}
            </div>
            <div className="col-start-3 row-start-2">{side("right")}</div>
            <div className="col-start-2 row-start-3">{side("bottom")}</div>
          </div>
          <p className="text-xs text-slate-500">{L.mergeKeeps}</p>
        </section>

        <section className="grid gap-2 rounded-lg border border-slate-200 p-3">
          <h4 className="text-sm font-semibold">{L.splitTitle}</h4>
          <div className="flex items-end gap-2">
            <div className="w-20">
              <NumberInput integer value={parts} onChange={setParts} ariaLabel={L.splitInto} />
            </div>
            <span className="text-sm pb-2">{L.splitInto}</span>
          </div>
          {node.kind === "panel" ? (
            <div className="grid gap-3">
              <div className="grid gap-1">
                <div className="text-sm">{L.splitPanel}</div>
                <div className="text-xs text-slate-500">{L.splitPanelHint}</div>
                {splitButtons((dir) => op((l) => splitNode(l, panel.id, dir, n)))}
              </div>
              <div className="grid gap-1">
                <div className="text-sm">{L.divideGlass}</div>
                <div className="text-xs text-slate-500">{L.divideGlassHint}</div>
                {splitButtons((dir) => op((l) => divideGlass(l, panel.id, dir, n)))}
              </div>
            </div>
          ) : (
            <div className="grid gap-1">
              <div className="text-xs text-slate-500">{L.splitGlass}</div>
              {splitButtons((dir) => op((l) => splitNode(l, node.id, dir, n)))}
            </div>
          )}
        </section>

        {parentSplitOf(item.layout, node.id) || (node.kind === "panel" && panel.glazing.kind === "glassSplit") ? (
          <section className="grid gap-2">
            <h4 className="text-sm font-semibold">{L.sizeTitle}</h4>
            {parentSplitOf(item.layout, node.id) ? <SizesEditor item={item} lang={lang} nodeId={node.id} change={change} /> : null}
            {node.kind === "panel" && panel.glazing.kind === "glassSplit" ? (
              <SizesEditor item={item} lang={lang} nodeId={panel.glazing.children[0].node.id} change={change} />
            ) : null}
          </section>
        ) : null}

        {singleGlass ? (
          <section className="grid gap-2 rounded-lg border border-slate-200 p-3">
            <h4 className="text-sm font-semibold">{L.glassForSection}</h4>
            <div className="text-sm text-slate-700">{describeGlass(lang, effectiveGlass(item, singleGlass))[0]}</div>
            {singleGlass.override ? (
              <>
                <Btn small variant="ghost" onClick={() => op((l) => setGlassOverride(l, singleGlass.id, undefined))}>
                  {G.removeOverride}
                </Btn>
                <GlassSpecEditor
                  lang={lang}
                  spec={singleGlass.override}
                  ask={ask}
                  onChange={(s) => op((l) => setGlassOverride(l, singleGlass.id, s))}
                />
              </>
            ) : (
              <div className="grid gap-2">
                <div className="text-xs text-slate-500">{G.usesDefault}</div>
                <div>
                  <Btn small onClick={() => op((l) => setGlassOverride(l, singleGlass.id, structuredClone(item.glassSpec)))}>
                    {G.override}
                  </Btn>
                </div>
              </div>
            )}
            <div className="grid gap-1">
              <div className="text-sm">{L.decorative}</div>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="grid gap-0.5 text-xs w-28">
                  {L.decoColumns}
                  <NumberInput
                    integer
                    allowZero
                    value={singleGlass.decorativeBars?.columns ?? 0}
                    onChange={(v) => op((l) => setDecorativeBars(l, singleGlass.id, { columns: v ?? 0, rows: singleGlass.decorativeBars?.rows ?? 0 }))}
                  />
                </label>
                <label className="grid gap-0.5 text-xs w-28">
                  {L.decoRows}
                  <NumberInput
                    integer
                    allowZero
                    value={singleGlass.decorativeBars?.rows ?? 0}
                    onChange={(v) => op((l) => setDecorativeBars(l, singleGlass.id, { columns: singleGlass.decorativeBars?.columns ?? 0, rows: v ?? 0 }))}
                  />
                </label>
              </div>
            </div>
          </section>
        ) : (
          <section className="grid gap-2">
            <h4 className="text-sm font-semibold">{L.glassInside}</h4>
            <div className="flex flex-wrap gap-2">
              {panelGlasses.map((g) => {
                const num = glassList.find((x) => x.glass.id === g.id)?.number;
                return (
                  <Btn key={g.id} small onClick={() => onSelect(g.id)}>
                    {fmt(L.openSection, { g: `G${num ?? ""}` })}
                  </Btn>
                );
              })}
            </div>
          </section>
        )}

        {node.kind === "glass" ? (
          <div>
            <Btn small variant="ghost" onClick={() => onSelect(panel.id)}>
              {L.selectPanel}
            </Btn>
          </div>
        ) : item.openingType !== "custom" ? (
          <section className="grid gap-2">
            <h4 className="text-sm font-semibold">{L.panelOpening}</h4>
            <PanelSettings item={item} lang={lang} panel={panel} change={change} />
          </section>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
