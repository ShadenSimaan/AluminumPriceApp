import { useState } from "react";
import type { Availability, CatalogCategory, CatalogEntry, RfqContact, RfqLanguage, SupplierProfile } from "./types";
import { AVAILABILITIES } from "./types";
import { dict, dirOf, fmt, optionLabel } from "./i18n";
import { newSupplierProfile, safeExternalUrl } from "./suppliers";
import { rfqUuid, todayIso } from "./rfqState";
import { ALL_OPTION_KEYS, CATALOG_CATEGORIES as CATEGORIES, catLabel, openWebsite } from "./supplierUi";
import { AvailabilityBadge } from "./editor/common";
import { Btn, Field, RfqModal, Select, TextArea, TextInput } from "./ui";

/** Read-only catalog list (used on the page and in the dialog). */
export function CatalogList({ lang, profile, onError }: { lang: RfqLanguage; profile: SupplierProfile; onError: (m: string) => void }) {
  const S = dict(lang).sup;
  if (!profile.catalog.length) return <div className="text-sm text-slate-500">{S.noCatalog}</div>;
  return (
    <div className="grid gap-3">
      {CATEGORIES.filter((c) => profile.catalog.some((e) => e.category === c)).map((c) => (
        <div key={c} className="grid gap-1">
          <div className="text-sm font-semibold">{catLabel(lang, c)}</div>
          <ul className="grid gap-1">
            {profile.catalog
              .filter((e) => e.category === c)
              .map((e) => (
                <li key={e.id} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b border-slate-100 pb-1">
                  <bdi className="font-medium">{e.label}</bdi>
                  <AvailabilityBadge lang={lang} availability={e.availability} />
                  {e.productFamily && <bdi className="text-xs text-slate-600">{e.productFamily}</bdi>}
                  {e.checkedDate && (
                    <span className="text-xs text-slate-500">
                      {S.checked}: <bdi dir="ltr">{e.checkedDate}</bdi>
                    </span>
                  )}
                  {e.sourceUrls.map((u) => (
                    <button key={u} type="button" className="text-xs text-sky-700 underline break-all" dir="ltr" onClick={() => void openWebsite(u, onError)}>
                      {u.replace(/^https?:\/\//, "")}
                    </button>
                  ))}
                  {e.notes && <bdi className="text-xs text-slate-500 basis-full">{e.notes}</bdi>}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function EntryEditor({ lang, entry, onChange, onRemove }: { lang: RfqLanguage; entry: CatalogEntry; onChange: (e: CatalogEntry) => void; onRemove: () => void }) {
  const d = dict(lang);
  const S = d.sup;
  const set = (patch: Partial<CatalogEntry>) => onChange({ ...entry, ...patch });
  return (
    <div className="rounded-md border border-slate-200 p-2 grid gap-2">
      <div className="grid sm:grid-cols-3 gap-2">
        <Field label={S.label}>
          <TextInput value={entry.label} onChange={(v) => set({ label: v })} />
        </Field>
        <Field label={S.category}>
          <Select<CatalogCategory> value={entry.category} onChange={(v) => set({ category: v })} options={CATEGORIES.map((c) => ({ value: c, label: catLabel(lang, c) }))} />
        </Field>
        <Field label={S.availability}>
          <Select<Availability> value={entry.availability} onChange={(v) => set({ availability: v })} options={AVAILABILITIES.map((a) => ({ value: a, label: d.availability[a] }))} />
        </Field>
        <Field label={S.family}>
          <TextInput value={entry.productFamily} onChange={(v) => set({ productFamily: v })} />
        </Field>
        <Field label={S.checked}>
          <TextInput type="date" dir="ltr" value={entry.checkedDate} onChange={(v) => set({ checkedDate: v })} />
        </Field>
        <Field label={S.notes}>
          <TextInput value={entry.notes} onChange={(v) => set({ notes: v })} />
        </Field>
      </div>
      <Field label={S.sources}>
        <textarea
          dir="ltr"
          rows={2}
          className="w-full rounded-md bg-white border border-slate-300 px-3 py-2 text-sm"
          value={entry.sourceUrls.join("\n")}
          onChange={(e) => set({ sourceUrls: e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) })}
        />
      </Field>
      <details>
        <summary className="cursor-pointer text-sm">
          {S.optionKeys} ({entry.optionKeys.length})
        </summary>
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
          {ALL_OPTION_KEYS.map((k) => (
            <label key={k} className="inline-flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={entry.optionKeys.includes(k)} onChange={(e) => set({ optionKeys: e.target.checked ? [...entry.optionKeys, k] : entry.optionKeys.filter((x) => x !== k) })} />
              {optionLabel(lang, k)}
            </label>
          ))}
        </div>
      </details>
      <div>
        <Btn small variant="ghost" onClick={onRemove}>
          {d.ui.remove}
        </Btn>
      </div>
    </div>
  );
}

function ProfileEditor({ lang, profile, onChange }: { lang: RfqLanguage; profile: SupplierProfile; onChange: (p: SupplierProfile) => void }) {
  const d = dict(lang);
  const S = d.sup;
  const setContact = (k: keyof RfqContact, v: string) => onChange({ ...profile, contact: { ...profile.contact, [k]: v } });
  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-2">
        <Field label={S.displayName}>
          <TextInput value={profile.displayName} onChange={(v) => onChange({ ...profile, displayName: v })} />
        </Field>
        <Field label={S.website} error={profile.website && !safeExternalUrl(profile.website) ? "https://…" : undefined}>
          <TextInput dir="ltr" value={profile.website} onChange={(v) => onChange({ ...profile, website: v })} />
        </Field>
        {(["contactPerson", "phone", "email", "address"] as (keyof RfqContact)[]).map((k) => (
          <Field key={k} label={d.ui[k]}>
            <TextInput dir={k === "phone" || k === "email" ? "ltr" : "auto"} value={profile.contact[k]} onChange={(v) => setContact(k, v)} />
          </Field>
        ))}
      </div>
      <Field label={S.notes}>
        <TextArea rows={2} value={profile.notes} onChange={(v) => onChange({ ...profile, notes: v })} />
      </Field>
      <div className="grid gap-2">
        <div className="text-sm font-semibold">{S.catalog}</div>
        <div className="text-xs text-slate-500">{S.catalogHint}</div>
        {profile.catalog.map((e) => (
          <EntryEditor
            key={e.id}
            lang={lang}
            entry={e}
            onChange={(ne) => onChange({ ...profile, catalog: profile.catalog.map((x) => (x.id === e.id ? ne : x)) })}
            onRemove={() => onChange({ ...profile, catalog: profile.catalog.filter((x) => x.id !== e.id) })}
          />
        ))}
        <div>
          <Btn
            small
            onClick={() =>
              onChange({
                ...profile,
                catalog: [
                  ...profile.catalog,
                  { id: rfqUuid(), category: "glass", label: "", optionKeys: [], availability: "not_verified", productFamily: "", sourceUrls: [], checkedDate: todayIso(), notes: "" },
                ],
              })
            }
          >
            + {S.addEntry}
          </Btn>
        </div>
      </div>
    </div>
  );
}

export default function SupplierDialog({
  lang,
  suppliers,
  selectedId,
  onChangeSuppliers,
  onSelect,
  onClose,
  confirm,
  onError,
}: {
  lang: RfqLanguage;
  suppliers: SupplierProfile[];
  selectedId: string | undefined;
  onChangeSuppliers: (list: SupplierProfile[]) => void;
  onSelect: (p: SupplierProfile) => void;
  onClose: () => void;
  confirm: (message: string) => Promise<boolean>;
  onError: (message: string) => void;
}) {
  const d = dict(lang);
  const S = d.sup;
  const [editingId, setEditingId] = useState<string | null>(null);
  const update = (p: SupplierProfile) => onChangeSuppliers(suppliers.map((x) => (x.id === p.id ? p : x)));
  const add = () => {
    const p = newSupplierProfile(rfqUuid());
    onChangeSuppliers([...suppliers, p]);
    setEditingId(p.id);
  };
  const del = async (p: SupplierProfile) => {
    if (!(await confirm(fmt(S.confirmDelete, { name: p.displayName || S.unnamed })))) return;
    onChangeSuppliers(suppliers.filter((x) => x.id !== p.id));
    if (editingId === p.id) setEditingId(null);
  };
  return (
    <RfqModal
      dir={dirOf(lang)}
      wide
      title={S.title}
      onClose={onClose}
      footer={
        <>
          <Btn onClick={add}>+ {S.add}</Btn>
          <Btn variant="primary" onClick={onClose}>
            {S.done}
          </Btn>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="text-xs text-slate-500">{S.designUnchanged}</div>
        <ul className="grid gap-3">
          {suppliers.map((p) => {
            const inUse = p.id === selectedId;
            const editing = editingId === p.id;
            const site = safeExternalUrl(p.website);
            return (
              <li key={p.id} className={`rounded-lg border p-3 grid gap-2 ${inUse ? "border-sky-400 bg-sky-50/50" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  {p.logoUrl ? <img src={p.logoUrl} alt="" className="h-8 w-auto max-w-[7rem] object-contain bg-white rounded border border-slate-200 p-0.5" /> : null}
                  <bdi className="font-semibold">{p.displayName || S.unnamed}</bdi>
                  {p.website && (
                    <bdi dir="ltr" className="text-xs text-slate-600 break-all">
                      {p.website}
                    </bdi>
                  )}
                  <div className="ms-auto flex flex-wrap gap-1.5">
                    <Btn small variant={inUse ? "success" : "primary"} disabled={inUse} onClick={() => onSelect(p)}>
                      {inUse ? `✓ ${S.inUse}` : S.use}
                    </Btn>
                    <Btn small disabled={!site} onClick={() => site && void openWebsite(site, onError)}>
                      ↗ {S.openWebsite}
                    </Btn>
                    <Btn small onClick={() => setEditingId(editing ? null : p.id)}>
                      {editing ? S.done : S.edit}
                    </Btn>
                    <Btn small variant="danger" onClick={() => void del(p)}>
                      {S.delete}
                    </Btn>
                  </div>
                </div>
                {p.notes && !editing && <bdi className="text-xs text-slate-600">{p.notes}</bdi>}
                {editing ? (
                  <ProfileEditor lang={lang} profile={p} onChange={update} />
                ) : (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      {S.catalog} ({p.catalog.length})
                    </summary>
                    <div className="mt-2 grid gap-2">
                      <div className="text-xs text-slate-500">{S.catalogHint}</div>
                      <CatalogList lang={lang} profile={p} onError={onError} />
                    </div>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </RfqModal>
  );
}
