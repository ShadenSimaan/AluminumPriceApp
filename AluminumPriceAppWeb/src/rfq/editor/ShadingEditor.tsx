import type { Availability, Requirement, RfqItem, RfqLanguage, ShadingEntry, ShadingOperation, ShadingType, SupplierProfile } from "../types";
import { AVAILABILITIES, SHADING_TYPES } from "../types";
import { integratedBlindConflicts, newShading } from "../accessories";
import { setConstruction } from "../glass";
import { mapGlass, numberedGlass, panelLeaves } from "../layout";
import { dict, fmt } from "../i18n";
import { rfqUuid } from "../rfqState";
import { Btn, Field, Select, TextInput } from "../ui";
import { LinkPicker, OptionAvailability, Section } from "./common";

const OPS: ShadingOperation[] = ["unspecified", "manual", "motorized"];

export default function ShadingEditor({
  item,
  lang,
  change,
  profile,
  asked,
  onAsk,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  change: (fn: (it: RfqItem) => RfqItem) => void;
  profile: SupplierProfile | undefined;
  asked: (linkKey: string) => boolean;
  onAsk: (linkKey: string) => void;
}) {
  const d = dict(lang);
  const S = d.shade;
  const conflicts = integratedBlindConflicts(item);
  const glass = numberedGlass(item.layout);
  const panels = panelLeaves(item.layout);
  const setEntry = (id: string, patch: Partial<ShadingEntry>) => change((it) => ({ ...it, shading: it.shading.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  const fixDouble = (glassIds: string[]) =>
    change((it) => {
      const ids = new Set(glassIds);
      const toDouble = (s: typeof it.glassSpec) => (s.construction === "single" || s.construction === "custom" ? setConstruction(s, "double") : s);
      const usesDefault = numberedGlass(it.layout).some((g) => ids.has(g.glass.id) && !g.glass.override);
      return {
        ...it,
        glassSpec: usesDefault || it.openingType === "custom" ? toDouble(it.glassSpec) : it.glassSpec,
        layout: mapGlass(it.layout, (g) => (ids.has(g.id) && g.override ? { ...g, override: toDouble(g.override) } : g)),
      };
    });
  const fixSupplier = (glassIds: string[]) =>
    change((it) => {
      const ids = new Set(glassIds);
      const toAsk = (s: typeof it.glassSpec) => (s.construction === "single" ? { ...setConstruction(s, "supplier"), askRecommendation: true } : s);
      const usesDefault = numberedGlass(it.layout).some((g) => ids.has(g.glass.id) && !g.glass.override);
      return {
        ...it,
        glassSpec: usesDefault || it.openingType === "custom" ? toAsk(it.glassSpec) : it.glassSpec,
        layout: mapGlass(it.layout, (g) => (ids.has(g.id) && g.override ? { ...g, override: toAsk(g.override) } : g)),
      };
    });

  return (
    <Section title={S.title}>
      <div className="text-xs text-slate-500">
        {S.separate} {S.requestable}
      </div>
      {item.shading.length === 0 && <div className="text-sm text-slate-500">{S.none}</div>}
      {item.shading.map((s, idx) => {
        const conflict = conflicts.find((c) => c.entryId === s.id);
        const linkOptions =
          s.type === "integrated"
            ? glass.map((g) => ({ id: g.glass.id, label: `G${g.number}` }))
            : panels.map((p, i) => ({ id: p.id, label: `P${i + 1}` }));
        return (
          <div key={s.id} className="rounded-md border border-slate-200 p-2 grid gap-2">
            <div className="flex flex-wrap items-end gap-3">
              <Field label={`${S.type} ${item.shading.length > 1 ? idx + 1 : ""}`} className="min-w-[14rem]" hint={<OptionAvailability lang={lang} profile={profile} optionKey={`shading.${s.type}`} linkKey={`${item.id}:shading:${s.id}`} asked={asked} onAsk={onAsk} />}>
                <Select<ShadingType> value={s.type} onChange={(v) => setEntry(s.id, { type: v, appliesTo: [] })} options={SHADING_TYPES.map((t) => ({ value: t, label: d.shadingType[t] }))} />
              </Field>
              <Field label={S.operation}>
                <Select<ShadingOperation> value={s.operation} onChange={(v) => setEntry(s.id, { operation: v })} options={OPS.map((o) => ({ value: o, label: d.shadingOp[o] }))} />
              </Field>
              <Field label={S.confirmation}>
                <Select<Availability> value={s.confirmation} onChange={(v) => setEntry(s.id, { confirmation: v })} options={AVAILABILITIES.map((a) => ({ value: a, label: d.availability[a] }))} />
              </Field>
              <Btn small variant="ghost" className="ms-auto" onClick={() => change((it) => ({ ...it, shading: it.shading.filter((x) => x.id !== s.id) }))}>
                {d.ui.remove}
              </Btn>
            </div>
            {s.type === "integrated" && <div className="text-xs text-slate-600">{S.integratedQuestion}</div>}
            {conflict && (
              <div className="rounded-md border border-rose-200 bg-rose-50 p-2 text-sm text-rose-800 grid gap-2">
                <div>{fmt(S.conflict, { list: conflict.glassNumbers.map((n) => `G${n}`).join(", ") })}</div>
                <div className="flex flex-wrap gap-2">
                  <Btn small onClick={() => fixDouble(conflict.glassIds)}>
                    {S.fixDouble}
                  </Btn>
                  <Btn small onClick={() => fixSupplier(conflict.glassIds)}>
                    {S.fixSupplier}
                  </Btn>
                </div>
              </div>
            )}
            {s.type === "other" && (
              <Field label={S.customType}>
                <TextInput value={s.customType} onChange={(v) => setEntry(s.id, { customType: v })} />
              </Field>
            )}
            {item.openingType !== "custom" && (
              <Field group label={s.type === "integrated" ? S.appliesGlass : S.appliesTo}>
                <LinkPicker options={linkOptions} value={s.appliesTo} onChange={(v) => setEntry(s.id, { appliesTo: v })} wholeLabel={S.wholeItem} />
              </Field>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label={S.color}>
                <TextInput value={s.color} onChange={(v) => setEntry(s.id, { color: v })} />
              </Field>
              <Field label={S.control}>
                <TextInput value={s.control} onChange={(v) => setEntry(s.id, { control: v })} />
              </Field>
              <Field label={S.location}>
                <TextInput value={s.location} onChange={(v) => setEntry(s.id, { location: v })} />
              </Field>
              <Field label={S.dimensions}>
                <TextInput value={s.dimensions} onChange={(v) => setEntry(s.id, { dimensions: v })} />
              </Field>
              <Field label={S.installation}>
                <TextInput value={s.installation} onChange={(v) => setEntry(s.id, { installation: v })} />
              </Field>
              <Field label={S.notes}>
                <TextInput value={s.notes} onChange={(v) => setEntry(s.id, { notes: v })} />
              </Field>
            </div>
          </div>
        );
      })}
      <div>
        <Btn small onClick={() => change((it) => ({ ...it, shading: [...it.shading, newShading(rfqUuid(), "interior")] }))}>
          + {S.add}
        </Btn>
      </div>
      <Field label={S.shutterLegacy}>
        <Select<Requirement>
          value={item.shutter}
          onChange={(v) => change((it) => ({ ...it, shutter: v }))}
          options={(["unspecified", "required", "not_required"] as Requirement[]).map((r) => ({ value: r, label: d.requirement[r] }))}
        />
      </Field>
    </Section>
  );
}
