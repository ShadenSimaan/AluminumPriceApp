import { useMemo, useState } from "react";
import type { RfqContact, RfqItem, RfqLanguage, RfqUnit, SupplierRequest } from "./types";
import { dict, dirOf, fmt, describeConfigurationShort } from "./i18n";
import { createRfqItem, nextReference, totalUnits, validateItems, type ItemIssue } from "./presets";
import {
  createSupplierRequest,
  deleteRequest,
  duplicateItem,
  duplicateRequest,
  formatRfqNumber,
  isDraftDirty,
  moveItem,
  openRequest,
  rfqUuid,
  saveDraft,
  type RfqSlice,
} from "./rfqState";
import { formatDimension } from "./units";
import RfqDiagram, { RfqLegend } from "./RfqDiagram";
import RfqItemEditor from "./RfqItemEditor";
import RfqImportDialog from "./RfqImportDialog";
import { exportRfqPdf, openRfqPdfFolder, printRfqPdf } from "./rfqExport";
import { Btn, Card, Field, Segmented, TextArea, TextInput } from "./ui";
import { confirmDestructive } from "../confirmDialog";
import { isTauri } from "../storage";

type Toast = (message: string, variant?: "success" | "error" | "info") => void;

export default function RfqPage({
  slice,
  onChange,
  appDimensionUnit,
  pdfSaveFolder,
  showToast,
}: {
  slice: RfqSlice;
  onChange: (fn: (s: RfqSlice) => RfqSlice) => void;
  appDimensionUnit: RfqUnit;
  pdfSaveFolder?: string;
  showToast: Toast;
}) {
  const lang = slice.rfqSettings.uiLanguage;
  const pdfLang = slice.rfqSettings.pdfLanguage;
  const d = dict(lang);
  const dir = dirOf(lang);
  const draft = slice.rfqDraft;
  const dirty = isDraftDirty(slice);
  const savedVersion = draft ? slice.supplierRequests.find((r) => r.id === draft.id) : undefined;

  const [editing, setEditing] = useState<{ item: RfqItem; isNew: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = (message: string) =>
    confirmDestructive(message, { title: d.ui.confirmTitle, okLabel: d.ui.confirmOk, cancelLabel: d.ui.cancel });

  const setSettings = (patch: Partial<RfqSlice["rfqSettings"]>) =>
    onChange((s) => ({ ...s, rfqSettings: { ...s.rfqSettings, ...patch } }));

  const updateDraft = (fn: (r: SupplierRequest) => SupplierRequest) =>
    onChange((s) => (s.rfqDraft ? { ...s, rfqDraft: fn(s.rfqDraft) } : s));

  const setField = <K extends keyof SupplierRequest>(key: K, value: SupplierRequest[K]) => updateDraft((r) => ({ ...r, [key]: value }));
  const setContact = (which: "company" | "supplier", key: keyof RfqContact, value: string) =>
    updateDraft((r) => ({ ...r, [which]: { ...r[which], [key]: value } }));

  const guardDiscard = async () => !dirty || (await confirm(d.ui.confirmDiscard));

  const newRequest = async () => {
    if (!(await guardDiscard())) return;
    onChange((s) => ({ ...s, rfqDraft: createSupplierRequest({ company: s.rfqSettings.companyDefaults, defaultUnit: appDimensionUnit }) }));
  };

  const open = async (id: string) => {
    if (draft?.id === id && !dirty) return;
    if (!(await guardDiscard())) return;
    onChange((s) => openRequest(s, id));
  };

  const save = () => {
    onChange((s) => saveDraft(s));
    showToast(d.ui.requestSaved, "success");
  };

  const duplicate = async (id: string) => {
    if (!(await guardDiscard())) return;
    onChange((s) => duplicateRequest(s, id, d.ui.copySuffix));
    showToast(d.ui.requestDuplicated, "success");
  };

  const remove = async (r: SupplierRequest) => {
    const name = r.projectName || formatRfqNumber(r.number) || d.ui.untitled;
    if (!(await confirm(fmt(d.ui.confirmDeleteRequest, { name })))) return;
    onChange((s) => deleteRequest(s, r.id));
    showToast(d.ui.requestDeleted, "info");
  };

  const issues = useMemo(() => (draft ? validateItems(draft.items) : new Map<string, ItemIssue[]>()), [draft]);

  const runPdf = async (kind: "export" | "print") => {
    if (!draft) return;
    if (!draft.items.length) return showToast(d.ui.needItems, "error");
    if (issues.size) return showToast(d.ui.needValidItems, "error");
    // Save first (allocates the RFQ number) so the PDF always matches a stored request.
    const savedSlice = saveDraft(slice);
    onChange((s) => saveDraft(s));
    const req = savedSlice.rfqDraft!;
    setBusy(true);
    try {
      const res = kind === "export" ? await exportRfqPdf(req, pdfLang, pdfSaveFolder) : await printRfqPdf(req, pdfLang);
      if (res.success === false) showToast(res.error, "error");
      else showToast(kind === "export" ? d.ui.pdfSaved : d.ui.pdfOpenedForPrint, "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const addItem = () => {
    if (!draft) return;
    const ref = nextReference("window", draft.items.map((i) => i.reference));
    setEditing({ item: createRfqItem({ id: rfqUuid(), openingType: "sliding_window", unit: draft.defaultUnit, reference: ref }), isNew: true });
  };

  const commitItem = (item: RfqItem) => {
    updateDraft((r) => {
      const exists = r.items.some((i) => i.id === item.id);
      return { ...r, items: exists ? r.items.map((i) => (i.id === item.id ? item : i)) : [...r.items, item] };
    });
    setEditing(null);
  };

  const deleteItem = async (item: RfqItem) => {
    if (!(await confirm(fmt(d.ui.confirmDeleteItem, { ref: item.reference })))) return;
    updateDraft((r) => ({ ...r, items: r.items.filter((i) => i.id !== item.id) }));
  };

  const unitLabel = (u: RfqUnit) => (lang === "he" ? (u === "mm" ? "מ״מ (mm)" : "ס״מ (cm)") : u);

  const contactFields = (which: "company" | "supplier") => (
    <div className="grid sm:grid-cols-2 gap-2">
      {(["name", "contactPerson", "phone", "email", "address"] as (keyof RfqContact)[]).map((k) => (
        <Field key={k} label={d.ui[k]} className={k === "address" ? "sm:col-span-2" : ""}>
          <TextInput dir={k === "phone" || k === "email" ? "ltr" : "auto"} value={draft![which][k]} onChange={(v) => setContact(which, k, v)} />
        </Field>
      ))}
    </div>
  );

  const sortedSaved = [...slice.supplierRequests].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div dir={dir} lang={lang} className="grid gap-4 w-full">
      {/* Header */}
      <section className="card p-4 w-full flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{d.featureTitle}</h2>
          <div className="text-xs text-slate-500">{d.ui.noPricing}</div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Field group label={d.ui.interfaceLanguage}>
            <Segmented<RfqLanguage> value={lang} onChange={(v) => setSettings({ uiLanguage: v })} options={[{ value: "he", label: "עברית" }, { value: "en", label: "English" }]} />
          </Field>
          <Btn variant="success" onClick={() => void newRequest()}>
            + {d.ui.newRequest}
          </Btn>
        </div>
      </section>

      {/* Saved requests */}
      <Card title={d.ui.savedRequests}>
        {sortedSaved.length === 0 ? (
          <div className="text-sm text-slate-500">{d.ui.noSavedRequests}</div>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sortedSaved.map((r) => (
              <li key={r.id} className={`rounded-lg border p-3 grid gap-1 ${draft?.id === r.id ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white"}`}>
                <div className="flex justify-between gap-2 text-sm">
                  <bdi className="font-semibold">{formatRfqNumber(r.number)}</bdi>
                  <bdi className="text-slate-500">{r.requestDate}</bdi>
                </div>
                <bdi className="font-semibold break-words">{r.projectName || d.ui.untitled}</bdi>
                <div className="text-xs text-slate-600">
                  {fmt(d.ui.itemsCount, { n: r.items.length, u: totalUnits(r.items) })}
                  {r.supplier.name ? (
                    <>
                      {" · "}
                      <bdi>{r.supplier.name}</bdi>
                    </>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  <Btn small variant="primary" onClick={() => void open(r.id)}>
                    {d.ui.open}
                  </Btn>
                  <Btn small onClick={() => void duplicate(r.id)}>
                    {d.ui.duplicate}
                  </Btn>
                  <Btn small variant="danger" onClick={() => void remove(r)}>
                    {d.ui.delete}
                  </Btn>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!draft ? (
        <Card>
          <div className="text-center py-8 grid gap-3 justify-items-center">
            <div className="text-slate-600">{d.ui.emptyEditor}</div>
            <Btn variant="success" onClick={() => void newRequest()}>
              + {d.ui.newRequest}
            </Btn>
          </div>
        </Card>
      ) : (
        <>
          {/* Actions */}
          <section className="card p-4 w-full grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <span className="text-slate-500">{d.ui.rfqNumber}: </span>
                <bdi className="font-semibold">{formatRfqNumber(draft.number) || d.ui.numberOnSave}</bdi>
                <span className={`ms-3 inline-block rounded px-2 py-0.5 text-xs ${!savedVersion ? "bg-amber-100 text-amber-800" : dirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {!savedVersion ? d.ui.notSavedYet : dirty ? d.ui.unsaved : d.ui.saved}
                </span>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <Btn variant="primary" onClick={save}>
                  {d.ui.save}
                </Btn>
                {savedVersion && (
                  <>
                    <Btn onClick={() => void duplicate(draft.id)}>{d.ui.duplicate}</Btn>
                    <Btn variant="danger" onClick={() => void remove(savedVersion)}>
                      {d.ui.delete}
                    </Btn>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <Field group label={d.ui.pdfLanguage} hint={d.ui.exportHint}>
                <Segmented<RfqLanguage> value={pdfLang} onChange={(v) => setSettings({ pdfLanguage: v })} options={[{ value: "en", label: "English PDF" }, { value: "he", label: "PDF בעברית" }]} />
              </Field>
              <Btn variant="success" disabled={busy} onClick={() => void runPdf("export")}>
                {d.ui.exportPdf}
              </Btn>
              <Btn disabled={busy} onClick={() => void runPdf("print")}>
                {d.ui.printPdf}
              </Btn>
              {isTauri() && (
                <Btn
                  onClick={async () => {
                    const r = await openRfqPdfFolder(pdfSaveFolder);
                    if (!r.success) showToast(r.error || "", "error");
                  }}
                >
                  {d.ui.openFolder}
                </Btn>
              )}
            </div>
          </section>

          {/* Project info */}
          <Card title={d.ui.projectInfo}>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label={d.ui.projectName} className="lg:col-span-2">
                <TextInput value={draft.projectName} onChange={(v) => setField("projectName", v)} />
              </Field>
              <Field label={d.ui.projectReference}>
                <TextInput value={draft.projectReference} onChange={(v) => setField("projectReference", v)} />
              </Field>
              <Field label={d.ui.requestDate}>
                <TextInput type="date" dir="ltr" value={draft.requestDate} onChange={(v) => v && setField("requestDate", v)} />
              </Field>
              <Field group label={d.ui.dimensionBasis} className="lg:col-span-2" hint={d.basisStatement[draft.dimensionBasis]}>
                <Segmented value={draft.dimensionBasis} onChange={(v) => setField("dimensionBasis", v)} options={[{ value: "frame" as const, label: d.basis.frame }, { value: "opening" as const, label: d.basis.opening }]} />
              </Field>
              <Field group label={d.ui.defaultUnit}>
                <Segmented<RfqUnit> value={draft.defaultUnit} onChange={(v) => setField("defaultUnit", v)} options={(["mm", "cm"] as RfqUnit[]).map((u) => ({ value: u, label: unitLabel(u) }))} />
              </Field>
              <Field label={d.ui.deliveryDestination}>
                <TextInput value={draft.deliveryDestination} onChange={(v) => setField("deliveryDestination", v)} />
              </Field>
            </div>
          </Card>

          {/* Contacts */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card
              title={d.ui.ourCompany}
              actions={
                <Btn
                  small
                  onClick={() => {
                    setSettings({ companyDefaults: { ...draft.company } });
                    showToast(d.ui.saved, "success");
                  }}
                >
                  {d.ui.saveAsDefault}
                </Btn>
              }
            >
              {contactFields("company")}
            </Card>
            <Card title={d.ui.supplier}>{contactFields("supplier")}</Card>
          </div>

          {/* Items */}
          <Card
            title={
              <>
                {d.ui.items}{" "}
                <span className="text-sm font-normal text-slate-600">
                  · {d.ui.designs}: <b>{draft.items.length}</b> · {d.ui.totalUnits}: <b>{totalUnits(draft.items)}</b>
                </span>
              </>
            }
            actions={
              <>
                <Btn variant="primary" onClick={addItem}>
                  + {d.ui.addItem}
                </Btn>
                <Btn onClick={() => setImporting(true)}>{d.ui.importFile}</Btn>
              </>
            }
          >
            {draft.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
                <span className="text-slate-600">{d.ui.convertAllTo}:</span>
                {(["mm", "cm"] as RfqUnit[]).map((u) => (
                  <Btn key={u} small onClick={() => updateDraft((r) => ({ ...r, items: r.items.map((i) => ({ ...i, unit: u })) }))}>
                    {unitLabel(u)}
                  </Btn>
                ))}
              </div>
            )}
            {draft.items.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center">{d.ui.noItems}</div>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {draft.items.map((it, idx) => {
                  const itemIssues = issues.get(it.id) ?? [];
                  return (
                    <li key={it.id} className={`rounded-lg border p-3 grid gap-2 bg-white ${itemIssues.length ? "border-rose-300" : "border-slate-200"}`}>
                      <div className="flex justify-between gap-2">
                        <div className="min-w-0">
                          <bdi className="font-bold">{it.reference}</bdi> <span className="text-sm">— {d.openingType[it.openingType]}</span>
                          {it.location && (
                            <div className="text-xs text-slate-600">
                              <bdi>{it.location}</bdi>
                            </div>
                          )}
                        </div>
                        <div className="text-sm text-end shrink-0">
                          <div>
                            {d.ui.quantity}: <b>{it.quantity}</b>
                          </div>
                        </div>
                      </div>
                      <div className="rounded border border-slate-100 bg-slate-50">
                        <RfqDiagram item={it} lang={lang} width={260} height={200} />
                      </div>
                      <div className="text-xs text-slate-700 grid gap-0.5">
                        <div>
                          {d.ui.width} <bdi dir="ltr">{formatDimension(it.widthCm, it.unit)} {it.unit}</bdi> · {d.ui.height}{" "}
                          <bdi dir="ltr">{formatDimension(it.heightCm, it.unit)} {it.unit}</bdi>
                        </div>
                        <div className="text-slate-600">{describeConfigurationShort(lang, it)}</div>
                      </div>
                      {itemIssues.length > 0 && (
                        <ul className="text-xs text-rose-700 list-disc ps-4">
                          {itemIssues.map((i) => (
                            <li key={i.code}>{d.issue[i.code]}</li>
                          ))}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-1.5">
                        <Btn small variant="primary" onClick={() => setEditing({ item: it, isNew: false })}>
                          {d.ui.edit}
                        </Btn>
                        <Btn small onClick={() => updateDraft((r) => ({ ...r, items: duplicateItem(r.items, it.id) }))}>
                          {d.ui.duplicate}
                        </Btn>
                        <Btn small disabled={idx === 0} onClick={() => updateDraft((r) => ({ ...r, items: moveItem(r.items, it.id, -1) }))} aria-label={d.ui.moveUp} title={d.ui.moveUp}>
                          ▲
                        </Btn>
                        <Btn
                          small
                          disabled={idx === draft.items.length - 1}
                          onClick={() => updateDraft((r) => ({ ...r, items: moveItem(r.items, it.id, 1) }))}
                          aria-label={d.ui.moveDown}
                          title={d.ui.moveDown}
                        >
                          ▼
                        </Btn>
                        <Btn small variant="danger" onClick={() => void deleteItem(it)}>
                          {d.ui.delete}
                        </Btn>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* General specs and notes */}
          <Card title={`${d.ui.generalSpecifications} / ${d.ui.generalNotes}`}>
            <div className="grid lg:grid-cols-2 gap-3">
              <Field label={d.ui.generalSpecifications}>
                <TextArea rows={5} value={draft.generalSpecifications} onChange={(v) => setField("generalSpecifications", v)} />
              </Field>
              <Field label={d.ui.generalNotes} hint={d.ui.notesNotTranslated}>
                <TextArea rows={5} value={draft.notes} onChange={(v) => setField("notes", v)} />
              </Field>
            </div>
          </Card>

          <RfqLegend lang={lang} />
        </>
      )}

      {editing && draft && (
        <RfqItemEditor
          key={editing.item.id}
          initial={editing.item}
          isNew={editing.isNew}
          lang={lang}
          otherReferences={draft.items.filter((i) => i.id !== editing.item.id).map((i) => i.reference)}
          onCancel={() => setEditing(null)}
          onSave={commitItem}
        />
      )}
      {importing && draft && (
        <RfqImportDialog
          lang={lang}
          existingItems={draft.items}
          confirm={confirm}
          onCancel={() => setImporting(false)}
          onCommit={(items, mode) => {
            updateDraft((r) => ({ ...r, items: mode === "replace" ? items : [...r.items, ...items] }));
            setImporting(false);
            showToast(fmt(d.ui.itemsImported, { n: items.length }), "success");
          }}
        />
      )}
    </div>
  );
}
