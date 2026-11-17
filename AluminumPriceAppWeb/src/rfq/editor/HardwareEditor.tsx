import type { Accessory, AccessoryKind, AccessoryMode, Availability, RfqItem, RfqLanguage, SupplierProfile } from "../types";
import { AVAILABILITIES } from "../types";
import { ACCESSORY_MODES, applicableAccessoryKinds, newAccessory } from "../accessories";
import { panelLeaves } from "../layout";
import { dict } from "../i18n";
import { rfqUuid } from "../rfqState";
import { Btn, Field, Select, TextInput } from "../ui";
import { LinkPicker, NumberInput, OptionAvailability, Section } from "./common";

type Change = (fn: (it: RfqItem) => RfqItem) => void;

function AccessoryRow({
  item,
  lang,
  kind,
  acc,
  typical,
  change,
  profile,
  asked,
  onAsk,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  kind: AccessoryKind;
  acc: Accessory | undefined;
  typical: boolean;
  change: Change;
  profile: SupplierProfile | undefined;
  asked: (linkKey: string) => boolean;
  onAsk: (linkKey: string) => void;
}) {
  const d = dict(lang);
  const H = d.hw;
  const panels = panelLeaves(item.layout);
  // Edits create the accessory on first use; untouched kinds are not stored.
  const upsert = (patch: Partial<Accessory>) =>
    change((it) => {
      const existing = acc && it.accessories.find((a) => a.id === acc.id);
      if (existing) return { ...it, accessories: it.accessories.map((a) => (a.id === existing.id ? { ...a, ...patch } : a)) };
      return { ...it, accessories: [...it.accessories, { ...newAccessory(rfqUuid(), kind), ...patch }] };
    });
  const remove = () => acc && change((it) => ({ ...it, accessories: it.accessories.filter((a) => a.id !== acc.id) }));
  const mode = acc?.mode ?? "unspecified";
  const linkKey = acc ? `${item.id}:acc:${acc.id}` : "";
  const isAsked = !!acc && (mode === "ask" || asked(linkKey));
  const expanded = !!acc && (mode !== "unspecified" || kind === "custom");
  const name = kind === "custom" ? acc?.customName.trim() || d.accKind.custom : d.accKind[kind];

  return (
    <li className="rounded-md border border-slate-200 p-2 grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm min-w-[12rem]">{name}</span>
        {kind !== "custom" && <OptionAvailability lang={lang} profile={profile} optionKey={`hardware.${kind}`} asked={asked} />}
        {!typical && <span className="text-xs text-amber-700">{H.notTypical}</span>}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <div className="min-w-[13rem]">
            <Select<AccessoryMode> ariaLabel={name} value={mode} onChange={(v) => upsert({ mode: v })} options={ACCESSORY_MODES.map((m) => ({ value: m, label: d.accMode[m] }))} />
          </div>
          {isAsked ? (
            <span className="text-xs text-emerald-700">✓ {H.asked}</span>
          ) : (
            <Btn
              small
              variant="ghost"
              className="text-sky-700 underline"
              onClick={() => {
                if (!acc || mode === "unspecified") upsert({ mode: "ask" });
                else onAsk(linkKey);
              }}
            >
              {H.ask}
            </Btn>
          )}
          {acc && (kind === "custom" || !typical) && (
            <Btn small variant="ghost" onClick={remove}>
              {d.ui.remove}
            </Btn>
          )}
        </div>
      </div>
      {expanded && acc && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {kind === "custom" && (
            <Field label={H.customName}>
              <TextInput value={acc.customName} onChange={(v) => upsert({ customName: v })} />
            </Field>
          )}
          <Field label={H.quantity}>
            <NumberInput integer value={acc.quantity} onChange={(v) => upsert({ quantity: v })} />
          </Field>
          <Field label={H.model}>
            <TextInput value={acc.model} onChange={(v) => upsert({ model: v })} />
          </Field>
          <Field label={H.finish}>
            <TextInput value={acc.finish} onChange={(v) => upsert({ finish: v })} />
          </Field>
          <Field label={H.compatibility}>
            <TextInput value={acc.compatibility} onChange={(v) => upsert({ compatibility: v })} />
          </Field>
          <Field label={H.confirmation}>
            <Select<Availability> value={acc.confirmation} onChange={(v) => upsert({ confirmation: v })} options={AVAILABILITIES.map((a) => ({ value: a, label: d.availability[a] }))} />
          </Field>
          <Field label={H.notes}>
            <TextInput value={acc.notes} onChange={(v) => upsert({ notes: v })} />
          </Field>
          {panels.length > 1 && (
            <Field group label={H.appliesTo} className="sm:col-span-3">
              <LinkPicker options={panels.map((p, i) => ({ id: p.id, label: `P${i + 1}` }))} value={acc.appliesTo} onChange={(v) => upsert({ appliesTo: v })} wholeLabel={d.shade.wholeItem} />
            </Field>
          )}
        </div>
      )}
    </li>
  );
}

export default function HardwareEditor({
  item,
  lang,
  change,
  profile,
  asked,
  onAsk,
}: {
  item: RfqItem;
  lang: RfqLanguage;
  change: Change;
  profile: SupplierProfile | undefined;
  asked: (linkKey: string) => boolean;
  onAsk: (linkKey: string) => void;
}) {
  const d = dict(lang);
  const H = d.hw;
  const typical = applicableAccessoryKinds(item);
  const others = item.accessories.filter((a) => a.kind !== "custom" && !typical.includes(a.kind));
  const customs = item.accessories.filter((a) => a.kind === "custom");
  return (
    <Section title={H.title}>
      <div className="text-xs text-slate-500">
        {H.adapts} {H.noAuto}
      </div>
      <label className="inline-flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={item.completeHardwareSet} onChange={(e) => change((it) => ({ ...it, completeHardwareSet: e.target.checked }))} />
        {H.completeSet}
      </label>
      <ul className="grid gap-2">
        {typical
          .filter((k) => k !== "custom")
          .map((k) => (
            <AccessoryRow key={k} item={item} lang={lang} kind={k} acc={item.accessories.find((a) => a.kind === k)} typical change={change} profile={profile} asked={asked} onAsk={onAsk} />
          ))}
        {others.map((a) => (
          <AccessoryRow key={a.id} item={item} lang={lang} kind={a.kind} acc={a} typical={false} change={change} profile={profile} asked={asked} onAsk={onAsk} />
        ))}
        {customs.map((a) => (
          <AccessoryRow key={a.id} item={item} lang={lang} kind="custom" acc={a} typical change={change} profile={profile} asked={asked} onAsk={onAsk} />
        ))}
      </ul>
      <div>
        <Btn small onClick={() => change((it) => ({ ...it, accessories: [...it.accessories, newAccessory(rfqUuid(), "custom")] }))}>
          + {H.addCustom}
        </Btn>
      </div>
      <Field label={H.generalNotes} hint={d.ui.unspecifiedHint}>
        <TextInput value={item.hardware} onChange={(v) => change((it) => ({ ...it, hardware: v }))} />
      </Field>
    </Section>
  );
}
