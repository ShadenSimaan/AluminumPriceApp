import { useMemo, useRef, useState } from "react";
import type { RfqContact, RfqItem, RfqLanguage, RfqUnit, SupplierProfile, SupplierRequest } from "./types";
import { dict, dirOf, fmt, describeConfigurationShort, describeGlass } from "./i18n";
import { createRfqItem, nextReference, totalUnits, validateItems, type ItemIssue } from "./presets";
import {
  createSupplierRequest,
  deleteRequest,
  duplicateItem,
  duplicateRequest,
  formatRfqNumber,
  isDraftDirty,
  moveItem,
  normalizeSupplierRequest,
  openRequest,
  rfqUuid,
  saveDraft,
  supplierProfileFor,
  type RfqSlice,
} from "./rfqState";
import { formatDimension } from "./units";
import { addLinkedQuestions, syncQuestions } from "./questions";
import { contactFromProfile, safeExternalUrl } from "./suppliers";
import { isAccessoryUsed } from "./accessories";
import RfqDiagram, { RfqLegend } from "./RfqDiagram";
import RfqItemEditor from "./RfqItemEditor";
import RfqImportDialog from "./RfqImportDialog";
import QuotationImportDialog from "./QuotationImportDialog";
import ConvertToQuoteDialog from "./ConvertToQuoteDialog";
import SupplierDialog, { CatalogList } from "./SupplierDialog";
import { openWebsite } from "./supplierUi";
import QuestionsCard from "./QuestionsCard";
import { exportRfqPdf, openRfqPdfFolder, printRfqPdf, saveGeneratedFile } from "./rfqExport";
import { sumSupplierCostsIls } from "./import/quotationImport";
import type { ConvertToQuoteOptions } from "./toCustomerQuote";
import DocumentHeader from "../brand/DocumentHeader";
import { Btn, Card, Field, Segmented, TextArea, TextInput } from "./ui";
import { confirmDestructive } from "../confirmDialog";
import { isTauri } from "../storage";

const moneyIls = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
const moneyUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Toast = (message: string, variant?: "success" | "error" | "info") => void;

export default function RfqPage({
  slice,
  onChange,
  appDimensionUnit,
  pdfSaveFolder,
  showToast,
  onConvertToCustomerQuote,
}: {
  slice: RfqSlice;
  onChange: (fn: (s: RfqSlice) => RfqSlice) => void;
  appDimensionUnit: RfqUnit;
  pdfSaveFolder?: string;
  showToast: Toast;
  onConvertToCustomerQuote?: (draft: SupplierRequest, opts: ConvertToQuoteOptions) => void;
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
  const [importingQuote, setImportingQuote] = useState(false);
  const [convertingQuote, setConvertingQuote] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = (message: string) =>
    confirmDestructive(message, { title: d.ui.confirmTitle, okLabel: d.ui.confirmOk, cancelLabel: d.ui.cancel });

  const setSettings = (patch: Partial<RfqSlice["rfqSettings"]>) =>
    onChange((s) => ({ ...s, rfqSettings: { ...s.rfqSettings, ...patch } }));

  // Linked supplier questions follow every change to the request (idempotent, so unchanged drafts stay clean).
  const updateDraft = (fn: (r: SupplierRequest) => SupplierRequest) =>
    onChange((s) => {
      if (!s.rfqDraft) return s;
      const next = fn(s.rfqDraft);
      return { ...s, rfqDraft: syncQuestions(next, supplierProfileFor(s.rfqSettings, next)) };
    });

  const profile = supplierProfileFor(slice.rfqSettings, draft);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const requestFileRef = useRef<HTMLInputElement>(null);

  const selectSupplier = (p: SupplierProfile) => {
    updateDraft((r) => ({ ...r, supplierProfileId: p.id, supplier: contactFromProfile(p) }));
    showToast(`${d.sup.selectedToast}: ${p.displayName || d.sup.unnamed}. ${d.sup.designUnchanged}`, "success");
  };

  const exportRequestFile = async () => {
    if (!draft) return;
    const name = `${formatRfqNumber(draft.number) || "RFQ"} ${draft.projectName || ""}`.trim().replace(/[\\/:*?"<>|]/g, "_");
    const ok = await saveGeneratedFile(JSON.stringify({ ...draft, exportedAt: new Date().toISOString() }, null, 2), `${name}.rfq.json`, "application/json");
    if (ok) showToast(d.ui.saved, "success");
  };

  const importRequestFile = async (file: File) => {
    try {
      const raw: unknown = JSON.parse(await file.text());
      const parsed = raw && typeof raw === "object" && (raw as { documentType?: unknown }).documentType === "supplier_rfq" ? normalizeSupplierRequest(raw) : null;
      if (!parsed) throw new Error("invalid");
      if (!(await guardDiscard())) return;
      // Opened as a new unsaved draft so it never overwrites a stored request or reuses its number.
      const now = Date.now();
      const fresh: SupplierRequest = { ...parsed, id: rfqUuid(), number: undefined, createdAt: now, updatedAt: now };
      onChange((s) => ({ ...s, rfqDraft: syncQuestions(fresh, supplierProfileFor(s.rfqSettings, fresh)) }));
      showToast(d.ui.requestFileImported, "success");
    } catch {
      showToast(d.ui.requestFileInvalid, "error");
    }
  };

  const exportItems = async () => {
    if (!draft?.items.length) return showToast(d.ui.needItems, "error");
    const { buildItemsXlsx } = await import("./import/itemExport");
    const name = `${formatRfqNumber(draft.number) || "RFQ"} items`.replace(/[\\/:*?"<>|]/g, "_");
    if (await saveGeneratedFile(buildItemsXlsx(draft.items), `${name}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
      showToast(d.ui.itemsExported, "success");
    }
  };

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
    const withQuestions = (s: RfqSlice): RfqSlice => (s.rfqDraft ? { ...s, rfqDraft: syncQuestions(s.rfqDraft, supplierProfileFor(s.rfqSettings, s.rfqDraft)) } : s);
    const savedSlice = saveDraft(withQuestions(slice));
    onChange((s) => saveDraft(withQuestions(s)));
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

  const commitItem = (item: RfqItem, askKeys: string[]) => {
    updateDraft((r) => {
      const exists = r.items.some((i) => i.id === item.id);
      const next = { ...r, items: exists ? r.items.map((i) => (i.id === item.id ? item : i)) : [...r.items, item] };
      const p = supplierProfileFor(slice.rfqSettings, next);
      return addLinkedQuestions(syncQuestions(next, p), p, askKeys);
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
      {(["name", "contactPerson", "phone", "email", "website", "address"] as (keyof RfqContact)[]).map((k) => (
        <Field key={k} label={d.ui[k]} className={k === "address" ? "sm:col-span-2" : ""}>
          <TextInput dir={k === "phone" || k === "email" || k === "website" ? "ltr" : "auto"} value={draft![which][k]} onChange={(v) => setContact(which, k, v)} />
        </Field>
      ))}
    </div>
  );

  const sortedSaved = [...slice.supplierRequests].sort((a, b) => b.updatedAt - a.updatedAt);
  const costSummary = draft ? sumSupplierCostsIls(draft) : null;
  const pricedCount = draft ? draft.items.filter((it) => it.supplierPrice).length : 0;

  return (
    <div dir={dir} lang={lang} className="grid gap-4 w-full">
      {/* Header */}
      <section className="card p-4 w-full flex flex-wrap items-center justify-between gap-3">
        <DocumentHeader title={d.featureTitle} subtitle={d.ui.noPricing} />
        <div className="flex flex-wrap items-center gap-3">
          <Field group label={d.ui.interfaceLanguage}>
            <Segmented<RfqLanguage> value={lang} onChange={(v) => setSettings({ uiLanguage: v })} options={[{ value: "he", label: "עברית" }, { value: "en", label: "English" }]} />
          </Field>
          <Btn variant="success" onClick={() => void newRequest()}>
            + {d.ui.newRequest}
          </Btn>
          <Btn onClick={() => requestFileRef.current?.click()}>{d.ui.importRequestFile}</Btn>
          <input
            ref={requestFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void importRequestFile(f);
            }}
          />
        </div>
      </section>

      {/* Saved requests — compact file list */}
      <Card title={d.ui.savedRequests}>
        {sortedSaved.length === 0 ? (
          <div className="text-sm text-slate-500">{d.ui.noSavedRequests}</div>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 bg-white overflow-hidden">
            {sortedSaved.map((r) => {
              const done = r.quotationStatus === "done";
              const active = draft?.id === r.id;
              const label = `${formatRfqNumber(r.number) || "RFQ"} — ${r.projectName || d.ui.untitled}`;
              return (
                <li key={r.id} className={active ? "bg-sky-50" : "bg-white hover:bg-slate-50"}>
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      className="flex-1 min-w-0 flex items-center gap-2 px-3 py-2 text-start"
                      onClick={() => void open(r.id)}
                      title={d.ui.openRequestFile}
                    >
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${done ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                        title={done ? d.ui.quotationStatusDone : d.ui.quotationStatusPending}
                      >
                        {done ? d.ui.quotationStatusDone.split("—")[0].trim() : d.ui.quotationStatusPending.split("—")[0].trim()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        <bdi className="font-semibold">{label}</bdi>
                        <span className="text-slate-500 ms-2">
                          {fmt(d.ui.itemsCount, { n: r.items.length, u: totalUnits(r.items) })}
                          {r.supplier.name ? (
                            <>
                              {" · "}
                              <bdi>{r.supplier.name}</bdi>
                            </>
                          ) : null}
                          {" · "}
                          <bdi>{r.requestDate}</bdi>
                        </span>
                      </span>
                    </button>
                    <div className="flex items-center gap-1 px-2 shrink-0">
                      <Btn small onClick={() => void duplicate(r.id)}>
                        {d.ui.duplicate}
                      </Btn>
                      <Btn small variant="danger" onClick={() => void remove(r)}>
                        {d.ui.delete}
                      </Btn>
                    </div>
                  </div>
                </li>
              );
            })}
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
              <div className="text-sm flex flex-wrap items-center gap-2">
                <span>
                  <span className="text-slate-500">{d.ui.rfqNumber}: </span>
                  <bdi className="font-semibold">{formatRfqNumber(draft.number) || d.ui.numberOnSave}</bdi>
                </span>
                <span className={`inline-block rounded px-2 py-0.5 text-xs ${!savedVersion ? "bg-amber-100 text-amber-800" : dirty ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {!savedVersion ? d.ui.notSavedYet : dirty ? d.ui.unsaved : d.ui.saved}
                </span>
                <span
                  className={`inline-block rounded px-2 py-0.5 text-xs ${draft.quotationStatus === "done" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}
                  title={draft.quotationStatus === "done" ? d.ui.quotationStatusDone : d.ui.quotationStatusPending}
                >
                  {draft.quotationStatus === "done" ? d.ui.quotationStatusDone : d.ui.quotationStatusPending}
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
              <Btn onClick={() => void exportRequestFile()}>{d.ui.exportRequestFile}</Btn>
              <Btn variant="primary" onClick={() => setImportingQuote(true)}>
                {d.ui.importQuotation}
              </Btn>
              <Btn
                variant="success"
                disabled={!onConvertToCustomerQuote || pricedCount === 0}
                title={pricedCount === 0 ? d.ui.convertNeedsPrices : d.ui.convertToQuote}
                onClick={() => {
                  if (pricedCount === 0) return showToast(d.ui.convertNeedsPrices, "error");
                  setConvertingQuote(true);
                }}
              >
                {d.ui.convertToQuote}
              </Btn>
              <Btn
                onClick={() =>
                  updateDraft((r) => ({
                    ...r,
                    quotationStatus: r.quotationStatus === "done" ? "pending" : "done",
                  }))
                }
              >
                {draft.quotationStatus === "done" ? d.ui.markPending : d.ui.markDone}
              </Btn>
            </div>
          </section>

          {draft.supplierQuotation && costSummary && (
            <Card title={d.ui.supplierCostIls}>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  {fmt(d.ui.exchangeRateShort, {
                    currency: draft.supplierQuotation.currency,
                    rate: String(draft.supplierQuotation.exchangeRateToIls),
                  })}
                </div>
                {draft.supplierQuotation.quotationNumber && (
                  <div>
                    {d.ui.quotationNumber}: <bdi className="font-semibold">{draft.supplierQuotation.quotationNumber}</bdi>
                  </div>
                )}
                <div>
                  {d.ui.lineTotalIls}: <bdi className="font-semibold" dir="ltr">{moneyIls.format(costSummary.itemsIls)}</bdi>
                  <span className="text-slate-500 ms-1">
                    ({pricedCount}/{draft.items.length})
                  </span>
                </div>
                {costSummary.packagingIls > 0 && (
                  <div>
                    {d.ui.packagingIls}: <bdi dir="ltr">{moneyIls.format(costSummary.packagingIls)}</bdi>
                  </div>
                )}
                {costSummary.transportIls > 0 && (
                  <div>
                    {d.ui.transportIls}: <bdi dir="ltr">{moneyIls.format(costSummary.transportIls)}</bdi>
                  </div>
                )}
                <div>
                  {d.ui.grandTotalIls}: <bdi className="font-bold" dir="ltr">{moneyIls.format(costSummary.grandIls)}</bdi>
                </div>
              </div>
            </Card>
          )}

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
            <Card
              title={d.ui.supplier}
              actions={
                <>
                  <Btn small variant="primary" onClick={() => setSupplierDialog(true)}>
                    {profile ? d.sup.change : d.sup.select}
                  </Btn>
                  {draft.supplier.website && safeExternalUrl(draft.supplier.website) && (
                    <Btn small onClick={() => void openWebsite(draft.supplier.website, (m) => showToast(m, "error"))}>
                      ↗ {d.sup.openWebsite}
                    </Btn>
                  )}
                  {profile && (
                    <Btn small variant="ghost" onClick={() => updateDraft((r) => ({ ...r, supplierProfileId: undefined }))}>
                      {d.sup.clear}
                    </Btn>
                  )}
                </>
              }
            >
              <div className="flex flex-wrap items-center gap-3 mb-3">
                {(profile?.logoUrl || "").trim() ? (
                  <img src={profile!.logoUrl} alt={profile!.displayName || "supplier"} className="h-10 w-auto max-w-[9rem] object-contain bg-white rounded border border-slate-200 p-1" />
                ) : null}
                <div className="text-xs text-slate-600">
                  {profile ? (
                    <>
                      {d.sup.selected}: <bdi className="font-semibold">{profile.displayName || d.sup.unnamed}</bdi>
                    </>
                  ) : (
                    d.sup.noneSelected
                  )}
                </div>
              </div>
              {contactFields("supplier")}
              {profile && (
                <details className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2">
                  <summary className="cursor-pointer text-sm font-semibold">{fmt(d.sup.catalogFor, { name: profile.displayName || d.sup.unnamed })}</summary>
                  <div className="mt-2 grid gap-2">
                    <div className="text-xs text-slate-500">{d.sup.catalogHint}</div>
                    <CatalogList lang={lang} profile={profile} onError={(m) => showToast(m, "error")} />
                  </div>
                </details>
              )}
            </Card>
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
                <Btn onClick={() => void exportItems()}>{d.ui.exportItems}</Btn>
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
                          <div className="flex flex-wrap items-center gap-2">
                            <bdi className="font-bold">{it.reference}</bdi>
                            <span className="text-sm">— {d.openingType[it.openingType]}</span>
                            {profile?.logoUrl && (profile.builtinKey === "ekleindoor" || /EKLIEN|Ekleindoor|KLEIN/i.test(profile.displayName)) ? (
                              <img src={profile.logoUrl} alt={profile.displayName} className="h-4 w-auto object-contain" />
                            ) : null}
                          </div>
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
                          {it.supplierPrice && (
                            <div className="text-xs text-emerald-800 mt-1" dir="ltr">
                              <div className="font-semibold">{moneyIls.format(it.supplierPrice.lineTotalIls)}</div>
                              <div className="text-slate-500">
                                {it.supplierPrice.currency === "USD"
                                  ? moneyUsd.format(it.supplierPrice.lineTotalOriginal)
                                  : `${it.supplierPrice.lineTotalOriginal} ${it.supplierPrice.currency}`}
                              </div>
                            </div>
                          )}
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
                        <div className="text-slate-600">
                          {d.ui.glass}: {describeGlass(lang, it.glassSpec)[0]}
                        </div>
                        {(it.shading.length > 0 || it.accessories.some(isAccessoryUsed) || it.completeHardwareSet || it.alternatives.some((a) => a.description.trim())) && (
                          <div className="text-slate-600">
                            {[
                              it.shading.length ? `${d.ui.tabShading}: ${it.shading.map((s) => d.shadingType[s.type]).join(", ")}` : "",
                              it.accessories.some(isAccessoryUsed) || it.completeHardwareSet ? `${d.ui.tabHardware}: ${it.accessories.filter(isAccessoryUsed).length}${it.completeHardwareSet ? " +" : ""}` : "",
                              it.alternatives.some((a) => a.description.trim()) ? `${d.ui.alternatives}: ${it.alternatives.filter((a) => a.description.trim()).length}` : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        )}
                        {draft.questions.some((q) => q.itemId === it.id && q.status === "open") && (
                          <div className="text-sky-700">{fmt(d.ui.questionsCount, { n: draft.questions.filter((q) => q.itemId === it.id && q.status === "open").length })}</div>
                        )}
                      </div>
                      {itemIssues.length > 0 && (
                        <ul className="text-xs text-rose-700 list-disc ps-4">
                          {itemIssues.map((i) => (
                            <li key={`${i.code}-${i.nodeId ?? ""}`}>{d.issue[i.code]}</li>
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

          <QuestionsCard lang={lang} draft={draft} profile={profile} updateDraft={updateDraft} />

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
          profile={profile}
          askedKeys={draft.questions.map((q) => q.linkKey).filter(Boolean)}
          confirm={confirm}
          onCancel={() => setEditing(null)}
          onSave={commitItem}
        />
      )}
      {supplierDialog && draft && (
        <SupplierDialog
          lang={lang}
          suppliers={slice.rfqSettings.suppliers}
          selectedId={draft.supplierProfileId}
          onChangeSuppliers={(list) => setSettings({ suppliers: list })}
          onSelect={(p) => {
            selectSupplier(p);
            setSupplierDialog(false);
          }}
          onClose={() => setSupplierDialog(false)}
          confirm={confirm}
          onError={(m) => showToast(m, "error")}
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
      {importingQuote && draft && (
        <QuotationImportDialog
          lang={lang}
          draft={draft}
          onCancel={() => setImportingQuote(false)}
          onCommit={(next, summary) => {
            onChange((s) => {
              const withDraft = { ...s, rfqDraft: syncQuestions(next, supplierProfileFor(s.rfqSettings, next)) };
              return saveDraft(withDraft);
            });
            setImportingQuote(false);
            showToast(
              summary.unmatched > 0
                ? fmt(d.ui.quotationPartial, { matched: summary.matched, unmatched: summary.unmatched })
                : fmt(d.ui.quotationApplied, { matched: summary.matched }),
              "success"
            );
          }}
        />
      )}
      {convertingQuote && draft && onConvertToCustomerQuote && (
        <ConvertToQuoteDialog
          lang={lang}
          draft={draft}
          onCancel={() => setConvertingQuote(false)}
          onConfirm={(opts) => {
            setConvertingQuote(false);
            onConvertToCustomerQuote(draft, opts);
          }}
        />
      )}
    </div>
  );
}
