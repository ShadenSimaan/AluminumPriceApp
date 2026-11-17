import type { CavityFill, GlassAppearance, GlassCoating, GlassPerformance, GlassSpec, GlassTreatment, GlazingConstruction, RfqItem, RfqLanguage, SupplierProfile } from "../types";
import { APPEARANCES, CAVITY_FILLS, COATINGS, CONSTRUCTIONS, PERFORMANCE_KEYS, TREATMENTS, glassGaps, setConstruction, withPaneCount } from "../glass";
import { numberedGlass, setGlassOverride, mapGlass } from "../layout";
import { dict, describeGlass, fmt } from "../i18n";
import { Btn, Field, Select, TextInput } from "../ui";
import { NumberInput, OptionAvailability, Section } from "./common";

export type AskProps = {
  profile: SupplierProfile | undefined;
  /** linkKey prefix for glass option questions, e.g. "<itemId>:opt:" */
  optionLinkPrefix: string;
  asked: (linkKey: string) => boolean;
  onAsk: (linkKey: string) => void;
};

function PerfFields({ lang, value, onChange }: { lang: RfqLanguage; value: GlassPerformance; onChange: (v: GlassPerformance) => void }) {
  const d = dict(lang);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {PERFORMANCE_KEYS.map((k) => (
        <Field key={k} label={<span className="text-xs">{d.perf[k]}</span>}>
          <TextInput dir="ltr" value={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} />
        </Field>
      ))}
    </div>
  );
}

export function GlassSpecEditor({ lang, spec, onChange, ask }: { lang: RfqLanguage; spec: GlassSpec; onChange: (s: GlassSpec) => void; ask: AskProps }) {
  const d = dict(lang);
  const G = d.glass;
  const set = (patch: Partial<GlassSpec>) => onChange({ ...spec, ...patch });
  const avail = (key: string | null) =>
    key ? <OptionAvailability lang={lang} profile={ask.profile} optionKey={key} linkKey={ask.optionLinkPrefix + key} asked={ask.asked} onAsk={ask.onAsk} /> : null;
  const keyFor = (group: string, v: string, skip: string[]) => (skip.includes(v) ? null : `glass.${group}.${v}`);
  const gaps = glassGaps(spec);
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label={G.construction} hint={avail(keyFor("construction", spec.construction, ["unspecified", "supplier", "custom"]))}>
          <Select<GlazingConstruction> value={spec.construction} onChange={(v) => onChange(setConstruction(spec, v))} options={CONSTRUCTIONS.map((c) => ({ value: c, label: d.construction[c] }))} />
        </Field>
        <Field label={G.treatment} hint={avail(keyFor("treatment", spec.treatment, ["unspecified", "supplier"]))}>
          <Select<GlassTreatment> value={spec.treatment} onChange={(v) => set({ treatment: v })} options={TREATMENTS.map((t) => ({ value: t, label: d.treatment[t] }))} />
        </Field>
        <Field label={G.appearance} hint={avail(keyFor("appearance", spec.appearance, ["unspecified", "custom"]))}>
          <Select<GlassAppearance> value={spec.appearance} onChange={(v) => set({ appearance: v })} options={APPEARANCES.map((a) => ({ value: a, label: d.appearance[a] }))} />
        </Field>
      </div>
      {(spec.construction === "custom" || spec.appearance === "tinted" || spec.appearance === "custom" || spec.appearance === "patterned") && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {spec.construction === "custom" && (
            <Field label={G.constructionNote}>
              <TextInput value={spec.constructionNote} onChange={(v) => set({ constructionNote: v })} />
            </Field>
          )}
          {spec.appearance === "tinted" && (
            <Field label={G.tintColor}>
              <TextInput value={spec.tintColor} onChange={(v) => set({ tintColor: v })} />
            </Field>
          )}
          {(spec.appearance === "custom" || spec.appearance === "patterned") && (
            <Field label={G.appearanceNote}>
              <TextInput value={spec.appearanceNote} onChange={(v) => set({ appearanceNote: v })} />
            </Field>
          )}
        </div>
      )}

      <div role="group" className="grid gap-1.5">
        <span className="text-sm text-slate-700">{G.coatings}</span>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {COATINGS.map((c: GlassCoating) => {
            const on = spec.coatings.includes(c);
            return (
              <span key={c} className="inline-flex flex-wrap items-center gap-1.5 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={on} onChange={(e) => set({ coatings: e.target.checked ? COATINGS.filter((x) => x === c || spec.coatings.includes(x)) : spec.coatings.filter((x) => x !== c) })} />
                  {d.coating[c]}
                </label>
                {on && c !== "custom" ? avail(`glass.coating.${c}`) : null}
              </span>
            );
          })}
        </div>
        {spec.coatings.includes("custom") && (
          <Field label={G.customRequirement}>
            <TextInput value={spec.customRequirement} onChange={(v) => set({ customRequirement: v })} />
          </Field>
        )}
        {spec.coatings.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={G.coatingProduct}>
              <TextInput value={spec.coatingProduct} onChange={(v) => set({ coatingProduct: v })} />
            </Field>
            <Field label={G.coatingSurface}>
              <TextInput dir="ltr" value={spec.coatingSurface} onChange={(v) => set({ coatingSurface: v })} />
            </Field>
          </div>
        )}
      </div>

      {spec.panes.length > 0 && (
        <div className="grid gap-2 rounded-md border border-slate-200 bg-white p-2">
          <div className="text-sm font-medium">{G.makeup}</div>
          <div className="flex flex-wrap items-end gap-2" dir="ltr">
            {spec.panes.map((p, i) => (
              <span key={i} className="contents">
                <label className="grid gap-0.5 text-xs w-28">
                  {fmt(G.pane, { n: i + 1 })}
                  <NumberInput value={p.thicknessMm} onChange={(v) => set({ panes: spec.panes.map((x, j) => (j === i ? { ...x, thicknessMm: v } : x)) })} />
                  <input
                    dir="auto"
                    className="w-full rounded-md bg-white border border-slate-300 px-2 py-1 text-xs"
                    placeholder={fmt(G.paneNote, { n: i + 1 })}
                    aria-label={fmt(G.paneNote, { n: i + 1 })}
                    value={p.note}
                    onChange={(e) => set({ panes: spec.panes.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })}
                  />
                </label>
                {i < spec.cavities.length && (
                  <label className="grid gap-0.5 text-xs w-32 bg-slate-50 rounded p-1">
                    {fmt(G.cavity, { n: i + 1 })}
                    <NumberInput value={spec.cavities[i].widthMm} onChange={(v) => set({ cavities: spec.cavities.map((x, j) => (j === i ? { ...x, widthMm: v } : x)) })} />
                    <select
                      className="w-full rounded-md bg-white border border-slate-300 px-1 py-1 text-xs"
                      aria-label={fmt(G.cavityFill, { n: i + 1 })}
                      value={spec.cavities[i].fill}
                      onChange={(e) => set({ cavities: spec.cavities.map((x, j) => (j === i ? { ...x, fill: e.target.value as CavityFill } : x)) })}
                    >
                      {CAVITY_FILLS.map((f) => (
                        <option key={f} value={f}>
                          {d.fill[f]}
                        </option>
                      ))}
                    </select>
                    {spec.cavities[i].fill === "other" && (
                      <input
                        dir="auto"
                        className="w-full rounded-md bg-white border border-slate-300 px-2 py-1 text-xs"
                        placeholder={G.fillNote}
                        aria-label={G.fillNote}
                        value={spec.cavities[i].fillNote}
                        onChange={(e) => set({ cavities: spec.cavities.map((x, j) => (j === i ? { ...x, fillNote: e.target.value } : x)) })}
                      />
                    )}
                  </label>
                )}
              </span>
            ))}
            {spec.construction === "custom" && (
              <span className="inline-flex gap-1">
                <Btn small onClick={() => onChange(withPaneCount(spec, spec.panes.length + 1))}>
                  + {G.addPane}
                </Btn>
                <Btn small disabled={spec.panes.length <= 1} onClick={() => onChange(withPaneCount(spec, spec.panes.length - 1))}>
                  − {G.removePane}
                </Btn>
              </span>
            )}
          </div>
          <Field label={G.interlayer}>
            <TextInput value={spec.interlayer} onChange={(v) => set({ interlayer: v })} />
          </Field>
        </div>
      )}

      <details className="rounded-md border border-slate-200 p-2">
        <summary className="cursor-pointer text-sm">
          {G.requiredPerf} / {G.declaredPerf}
        </summary>
        <div className="grid gap-3 mt-2">
          <div className="text-xs text-slate-500">{G.perfHint}</div>
          <div className="text-sm font-medium">{G.requiredPerf}</div>
          <PerfFields lang={lang} value={spec.required} onChange={(v) => set({ required: v })} />
          <div className="text-sm font-medium">{G.declaredPerf}</div>
          <PerfFields lang={lang} value={spec.declared} onChange={(v) => set({ declared: v })} />
        </div>
      </details>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={spec.askRecommendation} onChange={(e) => set({ askRecommendation: e.target.checked })} />
        {G.askRecommendation}
      </label>
      <Field label={G.notes}>
        <TextInput value={spec.notes} onChange={(v) => set({ notes: v })} />
      </Field>
      {gaps.length > 0 && <div className="text-xs text-amber-700">{fmt(G.missing, { list: gaps.map((g) => d.gap[g]).join(", ") })}</div>}
    </div>
  );
}

export default function GlassEditor({
  item,
  lang,
  change,
  selectedId,
  onSelect,
  confirm,
  notify,
  ask,
  suppressSpecId,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  change: (fn: (it: RfqItem) => RfqItem) => void;
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
  confirm: (message: string) => Promise<boolean>;
  notify: (message: string) => void;
  ask: AskProps;
  /** This section's glass is edited in the drawing window, so the list stays a summary. */
  suppressSpecId?: string;
}) {
  const d = dict(lang);
  const G = d.glass;
  const glass = item.openingType === "custom" ? [] : numberedGlass(item.layout);
  const overrides = glass.filter((g) => g.glass.override);

  const applyAll = async () => {
    if (!overrides.length) {
      notify(G.applyAllNone);
      return;
    }
    if (!(await confirm(fmt(G.applyAllConfirm, { n: overrides.length })))) {
      notify(fmt(G.overridesKept, { n: overrides.length }));
      return;
    }
    change((it) => ({ ...it, layout: mapGlass(it.layout, (g) => {
      if (!g.override) return g;
      const copy = { ...g };
      delete copy.override;
      return copy;
    }) }));
  };

  return (
    <div className="grid gap-4">
      <Section title={G.defaultTitle}>
        <div className="text-xs text-slate-500">{G.general}</div>
        <GlassSpecEditor lang={lang} spec={item.glassSpec} onChange={(s) => change((it) => ({ ...it, glassSpec: s }))} ask={ask} />
        <Field label={G.legacyText} hint={d.ui.unspecifiedHint}>
          <TextInput value={item.glass} onChange={(v) => change((it) => ({ ...it, glass: v }))} />
        </Field>
      </Section>

      {glass.length > 0 && (
        <Section
          title={`${G.sectionsTitle} (${glass.length})`}
          actions={
            glass.length > 1 ? (
              <Btn small onClick={applyAll}>
                {G.applyAll}
              </Btn>
            ) : undefined
          }
        >
          <ul className="grid gap-2">
            {glass.map((g) => {
              const own = g.glass.override;
              const selected = selectedId === g.glass.id;
              return (
                <li key={g.glass.id} className={`rounded-md border p-2 grid gap-2 ${selected ? "border-sky-400 bg-sky-50/60" : "border-slate-200"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="font-semibold text-sm hover:underline" onClick={() => onSelect(selected ? undefined : g.glass.id)}>
                      G{g.number} · P{g.panelNumber}
                    </button>
                    <span className={`text-xs rounded px-1.5 py-0.5 ${own ? "bg-sky-100 text-sky-800" : "bg-slate-100 text-slate-600"}`}>{own ? G.hasOverride : G.usesDefault}</span>
                    <span className="text-xs text-slate-600 min-w-0 flex-1 truncate">{describeGlass(lang, own ?? item.glassSpec)[0]}</span>
                    {own ? (
                      <Btn small variant="ghost" onClick={() => change((it) => ({ ...it, layout: setGlassOverride(it.layout, g.glass.id, undefined) }))}>
                        {G.removeOverride}
                      </Btn>
                    ) : (
                      <Btn
                        small
                        onClick={() => {
                          change((it) => ({ ...it, layout: setGlassOverride(it.layout, g.glass.id, structuredClone(it.glassSpec)) }));
                          onSelect(g.glass.id);
                        }}
                      >
                        {G.override}
                      </Btn>
                    )}
                  </div>
                  {own && selected && suppressSpecId !== g.glass.id && (
                    <GlassSpecEditor lang={lang} spec={own} onChange={(s) => change((it) => ({ ...it, layout: setGlassOverride(it.layout, g.glass.id, s) }))} ask={ask} />
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
