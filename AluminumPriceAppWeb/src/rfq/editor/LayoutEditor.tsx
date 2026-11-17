import { useState } from "react";
import type { PanelNode, RfqItem, RfqLanguage, Side } from "../types";
import { OPENING_TYPE_DEFS, makePanelFor, setPanelCount } from "../presets";
import {
  equalizeSplit,
  gridLayout,
  isAdvancedLayout,
  layoutGeometry,
  panelLeaves,
  parentSplitOf,
  replaceNode,
  setChildSize,
  topLightLayout,
  walk,
  type LayoutNode,
} from "../layout";
import { dict, fmt, panelTitles } from "../i18n";
import { cmToUnit, unitToCm } from "../units";
import { Btn, Field, Segmented } from "../ui";
import { NumberInput, Section } from "./common";

type Change = (fn: (it: RfqItem) => RfqItem) => void;

const dimsOf = (it: RfqItem) => ({
  widthCm: it.widthCm && isFinite(it.widthCm) ? it.widthCm : null,
  heightCm: it.heightCm && isFinite(it.heightCm) ? it.heightCm : null,
});

/** "P1", "G3" or "P2–P4" for a child of a split. */
function childLabel(node: LayoutNode, panelNo: Map<string, number>, glassNo: Map<string, number>): string {
  const ps: number[] = [];
  const gs: number[] = [];
  walk(node, (n) => {
    if (n.kind === "panel") ps.push(panelNo.get(n.id) ?? 0);
    if (n.kind === "glass") gs.push(glassNo.get(n.id) ?? 0);
  });
  if (node.kind === "panel" || (node.kind !== "glass" && node.kind !== "glassSplit")) {
    return ps.length === 1 ? `P${ps[0]}` : `P${Math.min(...ps)}–P${Math.max(...ps)}`;
  }
  return gs.length === 1 ? `G${gs[0]}` : `G${Math.min(...gs)}–G${Math.max(...gs)}`;
}

export function PanelSettings({ item, lang, panel, change }: { item: RfqItem; lang: RfqLanguage; panel: PanelNode; change: Change }) {
  const d = dict(lang);
  const def = OPENING_TYPE_DEFS[item.openingType];
  const set = (fn: (p: PanelNode) => PanelNode) => change((it) => ({ ...it, layout: replaceNode(it.layout, panel.id, (n) => fn(n as PanelNode)) }));
  const sideOptions = [
    { value: "left" as Side, label: `◧ ${d.side.left}` },
    { value: "right" as Side, label: `${d.side.right} ◨` },
  ];
  return (
    <div className="grid gap-2 content-start">
      {def.allowFixedPanels && def.operableOp ? (
        <Segmented<string>
          value={panel.operation === "fixed" ? "fixed" : "operable"}
          onChange={(v) =>
            set((p) => (v === "fixed" ? { kind: "panel", id: p.id, operation: "fixed", glazing: p.glazing } : { kind: "panel", id: p.id, operation: def.operableOp!, glazing: p.glazing }))
          }
          options={[
            { value: "operable", label: d.panelOp[def.operableOp] },
            { value: "fixed", label: d.panelOp.fixed },
          ]}
        />
      ) : (
        <div className="text-sm text-slate-600">{d.panelOp[panel.operation]}</div>
      )}
      {panel.operation === "sliding" && (
        <Field group label={d.ui.slideDirection}>
          <Segmented<Side>
            dir="ltr"
            value={panel.slideDirection}
            onChange={(v) => set((p) => ({ ...p, slideDirection: v }))}
            options={[
              { value: "left", label: `← ${d.side.left}` },
              { value: "right", label: `${d.side.right} →` },
            ]}
          />
        </Field>
      )}
      {(panel.operation === "casement" || panel.operation === "tilt_turn" || (panel.operation === "hinged" && item.openingType !== "hinged_door_double")) && (
        <Field group label={d.ui.hingeSide}>
          <Segmented<Side> dir="ltr" value={panel.hingeSide} onChange={(v) => set((p) => ({ ...p, hingeSide: v }))} options={sideOptions} />
        </Field>
      )}
      {panel.operation === "hinged" && item.openingType === "hinged_door_double" && (
        <div className="text-xs text-slate-600">
          {d.ui.hingeSide}: {d.side[panel.hingeSide ?? "left"]}
        </div>
      )}
    </div>
  );
}

function QuickLayouts({ item, lang, change, confirm }: { item: RfqItem; lang: RfqLanguage; change: Change; confirm: (m: string) => Promise<boolean> }) {
  const L = dict(lang).layout;
  const def = OPENING_TYPE_DEFS[item.openingType];
  const [cols, setCols] = useState<number | null>(3);
  const [rows, setRows] = useState<number | null>(2);
  const [lower, setLower] = useState<number | null>(2);
  const [topH, setTopH] = useState<number | null>(null);
  const advanced = isAdvancedLayout(item.layout);
  const guard = async (fn: () => void) => {
    if (advanced && !(await confirm(L.confirmReplace))) return;
    fn();
  };
  const maker = (total: number) => {
    let made = 0;
    return (i: number) => makePanelFor(def, i, total, made++);
  };
  return (
    <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
      <summary className="cursor-pointer text-sm font-semibold">{L.quick}</summary>
      <div className="grid gap-2 mt-2 text-sm">
        <div className="flex flex-wrap items-end gap-2">
          <span className="min-w-[12rem]">{L.equalPanels}</span>
          <div className="w-20">
            <NumberInput integer value={cols} onChange={setCols} ariaLabel={L.equalPanels} />
          </div>
          <Btn small disabled={!cols} onClick={() => guard(() => change((it) => setPanelCount(it, cols!)))}>
            {L.apply}
          </Btn>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <span className="min-w-[12rem]">{L.grid}</span>
          <div className="w-16">
            <NumberInput integer value={cols} onChange={setCols} ariaLabel={L.divisionColumns} />
          </div>
          <span>×</span>
          <div className="w-16">
            <NumberInput integer value={rows} onChange={setRows} ariaLabel={L.divisionRows} />
          </div>
          <Btn
            small
            disabled={!cols || !rows}
            onClick={() => guard(() => change((it) => ({ ...it, layout: gridLayout(panelLeaves(it.layout), cols!, rows!, maker(cols! * rows!)) })))}
          >
            {L.apply}
          </Btn>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <span className="min-w-[12rem]">{L.topLight}</span>
          <div className="w-16">
            <NumberInput integer value={lower} onChange={setLower} ariaLabel={L.panelCount} />
          </div>
          <div className="w-28">
            <NumberInput value={topH} onChange={setTopH} placeholder={fmt(L.topHeight, { unit: item.unit })} ariaLabel={fmt(L.topHeight, { unit: item.unit })} />
          </div>
          <Btn
            small
            disabled={!lower}
            onClick={() =>
              guard(() =>
                change((it) => ({
                  ...it,
                  layout: topLightLayout(panelLeaves(it.layout), lower!, topH != null ? unitToCm(topH, it.unit) : null, (i) => makePanelFor(def, i, lower!, i)),
                }))
              )
            }
          >
            {L.apply}
          </Btn>
        </div>
      </div>
    </details>
  );
}

export function SizesEditor({ item, lang, nodeId, change }: { item: RfqItem; lang: RfqLanguage; nodeId: string; change: Change }) {
  const L = dict(lang).layout;
  const parent = parentSplitOf(item.layout, nodeId);
  if (!parent) return null;
  const dims = dimsOf(item);
  const geo = layoutGeometry(item.layout, dims.widthCm ?? 100, dims.heightCm ?? 100);
  const g = geo.splits.find((s) => s.node.id === parent.split.id);
  if (!g) return null;
  const panelNo = new Map(geo.panels.map((p) => [p.node.id, p.number]));
  const glassNo = new Map(geo.glass.map((x) => [x.node.id, x.number]));
  const known = dims.widthCm != null && dims.heightCm != null;
  const toUnit = (cm: number) => Math.round(cmToUnit(cm, item.unit) * 10) / 10;
  return (
    <div className="grid gap-1.5">
      <div className="text-sm font-medium">{fmt(L.sizesOf, { dir: parent.split.direction === "columns" ? L.columns : L.rows })}</div>
      <div className="flex flex-wrap gap-2 items-end" dir="ltr">
        {parent.split.children.map((c, i) => (
          <label key={c.node.id} className={`grid gap-0.5 w-24 text-xs ${c.node.id === nodeId ? "font-semibold text-sky-700" : "text-slate-600"}`}>
            <span>{childLabel(c.node, panelNo, glassNo)}</span>
            <NumberInput
              value={c.sizeCm != null ? toUnit(c.sizeCm) : null}
              placeholder={known ? `${L.auto} ${toUnit(g.sizes[i])}` : L.auto}
              onChange={(v) => change((it) => ({ ...it, layout: setChildSize(it.layout, parent.split.id, i, v == null ? null : unitToCm(v, it.unit)) }))}
              ariaLabel={childLabel(c.node, panelNo, glassNo)}
            />
          </label>
        ))}
        <span className="text-xs text-slate-500 pb-2">{item.unit}</span>
        <Btn small onClick={() => change((it) => ({ ...it, layout: equalizeSplit(it.layout, parent.split.id) }))}>
          {L.equalize}
        </Btn>
      </div>
      <div className="text-xs text-slate-500">{L.sizesHint}</div>
    </div>
  );
}

export default function LayoutEditor({
  item,
  lang,
  selectedId,
  onSelect,
  change,
  confirm,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  change: Change;
  confirm: (message: string) => Promise<boolean>;
}) {
  const d = dict(lang);
  const L = d.layout;
  const def = OPENING_TYPE_DEFS[item.openingType];
  const advanced = isAdvancedLayout(item.layout);
  const leaves = panelLeaves(item.layout);
  const titles = panelTitles(lang, item);
  const minPanels = Math.max(1, def.minPanels);
  return (
    <Section title={L.title}>
      <div className="text-xs text-slate-500">{L.hint}</div>
      {!advanced ? (
        <Field group label={L.panelCount}>
          <div className="flex items-center gap-2" dir="ltr">
            <Btn small disabled={leaves.length <= minPanels} onClick={() => change((it) => setPanelCount(it, leaves.length - 1))} aria-label="−">
              −
            </Btn>
            <span className="min-w-[2rem] text-center font-semibold tabular-nums">{leaves.length}</span>
            <Btn small onClick={() => change((it) => setPanelCount(it, leaves.length + 1))} aria-label="+">
              +
            </Btn>
          </div>
        </Field>
      ) : (
        <div className="text-xs text-slate-600">{L.advancedNote}</div>
      )}
      <QuickLayouts item={item} lang={lang} change={change} confirm={confirm} />
      <div className="grid gap-2">
        <div className="text-sm font-semibold">{L.panelsList}</div>
        <div className="text-xs text-slate-500">
          {d.ui.viewedFromOutside} — {d.ui.sideHint}
        </div>
        {/* Panels are always listed in reading order (left → right, top → bottom) as seen from outside. */}
        <div dir="ltr" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {leaves.map((p) => (
            <div
              key={p.id}
              dir={lang === "he" ? "rtl" : "ltr"}
              className={`rounded-md border p-2 grid gap-2 content-start ${p.id === selectedId ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-slate-50"}`}
            >
              <button type="button" className="text-sm font-semibold text-start hover:underline" onClick={() => onSelect(p.id)}>
                {titles.get(p.id)}
              </button>
              <PanelSettings item={item} lang={lang} panel={p} change={change} />
            </div>
          ))}
        </div>
      </div>
      <div className="text-xs text-slate-500">{L.supplierConfirm}</div>
    </Section>
  );
}
