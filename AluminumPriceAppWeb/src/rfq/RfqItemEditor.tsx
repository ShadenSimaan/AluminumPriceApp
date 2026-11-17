import { useMemo, useRef, useState } from "react";
import type { FrameNode, RfqCategory, RfqItem, RfqLanguage, RfqOpeningType, RfqReferenceImage, RfqUnit, Side, SupplierProfile } from "./types";
import { RFQ_OPENING_TYPES } from "./types";
import { changeOpeningType, OPENING_TYPE_DEFS, normalizeItemConfig, validateItem, type ItemIssue } from "./presets";
import { dict, dirOf, fmt } from "./i18n";
import { cmToUnit, parseStrictNumber, unitToCm } from "./units";
import { findNode, glassLeavesOf, moveDivider, panelOf } from "./layout";
import RfqDiagram, { RfqLegend, type DividerDragPhase } from "./RfqDiagram";
import type { DiagramDivider, DiagramRegion } from "./diagram";
import { Btn, Field, RfqModal, Segmented, Select, TextArea, TextInput } from "./ui";
import LayoutEditor from "./editor/LayoutEditor";
import GlassEditor from "./editor/GlassEditor";
import SectionDialog from "./editor/SectionDialog";
import ShadingEditor from "./editor/ShadingEditor";
import HardwareEditor from "./editor/HardwareEditor";
import { Section } from "./editor/common";
import { rfqUuid } from "./rfqState";

function dimText(cm: number | null, unit: RfqUnit): string {
  return cm == null ? "" : String(cmToUnit(cm, unit));
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

async function loadReferenceImage(file: File): Promise<RfqReferenceImage> {
  if (!/^image\/(png|jpeg)$/.test(file.type) || file.size > MAX_IMAGE_BYTES) throw new Error("unsupported");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = rej;
      el.src = url;
    });
    // Downscale so saved data stays small (it is persisted with the request).
    const max = 1400;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { name: file.name, mime: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.85) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Tab = "design" | "glass" | "shading" | "hardware" | "more";

export default function RfqItemEditor({
  initial,
  isNew,
  lang,
  otherReferences,
  profile,
  askedKeys,
  confirm,
  onSave,
  onCancel,
  saveLabel,
}: {
  initial: RfqItem;
  isNew: boolean;
  lang: RfqLanguage;
  otherReferences: string[];
  /** Selected supplier (catalog hints only — never changes the design) */
  profile: SupplierProfile | undefined;
  /** Link keys of questions already in the request */
  askedKeys: string[];
  confirm: (message: string) => Promise<boolean>;
  /** `askKeys`: linked questions the user asked to add while editing */
  onSave: (item: RfqItem, askKeys: string[]) => void;
  onCancel: () => void;
  /** Overrides the RFQ wording when this editor is used inside a customer quotation. */
  saveLabel?: string;
}) {
  const d = dict(lang);
  const dir = dirOf(lang);
  const [item, setItem] = useState<RfqItem>(initial);
  const [wText, setWText] = useState(dimText(initial.widthCm, initial.unit));
  const [hText, setHText] = useState(dimText(initial.heightCm, initial.unit));
  const [qtyText, setQtyText] = useState(String(initial.quantity));
  const [imageError, setImageError] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [tab, setTab] = useState<Tab>("design");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [sectionOpen, setSectionOpen] = useState(false);
  const [askKeys, setAskKeys] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragBase = useRef<FrameNode | null>(null);
  const def = OPENING_TYPE_DEFS[item.openingType];

  const update = (patch: Partial<RfqItem>) => setItem((it) => normalizeItemConfig({ ...it, ...patch }));
  const change = (fn: (it: RfqItem) => RfqItem) => setItem((it) => normalizeItemConfig(fn(it)));

  const asked = (k: string) => askedKeys.includes(k) || askKeys.includes(k);
  const onAsk = (k: string) => setAskKeys((ks) => (ks.includes(k) ? ks : [...ks, k]));
  const ask = { profile, optionLinkPrefix: `${item.id}:opt:`, asked, onAsk };

  const setDim = (which: "w" | "h", text: string) => {
    (which === "w" ? setWText : setHText)(text);
    const n = parseStrictNumber(text);
    const cm = text.trim() === "" ? null : n == null ? NaN : unitToCm(n, item.unit);
    update(which === "w" ? { widthCm: cm } : { heightCm: cm });
  };

  const setUnit = (unit: RfqUnit) => {
    // Same physical size, shown in another unit.
    setItem((it) => ({ ...it, unit }));
    if (item.widthCm != null && isFinite(item.widthCm)) setWText(dimText(item.widthCm, unit));
    if (item.heightCm != null && isFinite(item.heightCm)) setHText(dimText(item.heightCm, unit));
  };

  const setQty = (text: string) => {
    setQtyText(text);
    const n = parseStrictNumber(text);
    update({ quantity: n == null ? NaN : n });
  };

  const issues: ItemIssue[] = useMemo(() => validateItem(item, otherReferences), [item, otherReferences]);
  const issueFor = (field: keyof RfqItem) => issues.find((i) => i.field === field);
  const err = (field: keyof RfqItem) => (showIssues || field === "reference" ? issueFor(field) : undefined);
  const errText = (field: keyof RfqItem) => {
    const i = err(field);
    return i ? d.issue[i.code] : undefined;
  };

  const save = () => {
    setShowIssues(true);
    if (issues.length) return;
    onSave(item, askKeys);
  };

  const notify = (m: string) => {
    setNotice(m);
    window.setTimeout(() => setNotice((cur) => (cur === m ? null : cur)), 4000);
  };

  const openSection = (id: string | undefined) => {
    setSelectedId(id);
    setSectionOpen(!!id);
  };

  const onSelectRegion = (r: DiagramRegion) => {
    if (tab === "glass" && r.kind === "panel") {
      const p = panelOf(item.layout, r.id);
      const first = p ? glassLeavesOf(p.glazing)[0] : undefined;
      openSection(first?.id ?? r.id);
      return;
    }
    openSection(r.id);
  };

  const onDividerDrag = (div: DiagramDivider, deltaCm: number, phase: DividerDragPhase) => {
    if (phase === "start") {
      dragBase.current = item.layout;
      return;
    }
    const base = dragBase.current;
    if (!base) return;
    const step = item.unit === "mm" ? 0.1 : 0.5;
    const delta = Math.round(deltaCm / step) * step;
    setItem((it) => normalizeItemConfig({ ...it, layout: moveDivider(base, it, div.splitId, div.index, delta) }));
    if (phase === "end") dragBase.current = null;
  };

  const unitLabel = (u: RfqUnit) => (lang === "he" ? (u === "mm" ? "מ״מ (mm)" : "ס״מ (cm)") : u);
  const sideOptions = [
    { value: "left" as Side, label: `◧ ${d.side.left}` },
    { value: "right" as Side, label: `${d.side.right} ◨` },
  ];

  const previewItem = { ...item, widthCm: item.widthCm && isFinite(item.widthCm) ? item.widthCm : null, heightCm: item.heightCm && isFinite(item.heightCm) ? item.heightCm : null };
  const interactive = item.openingType !== "custom" && (tab === "design" || tab === "glass");
  const selected = selectedId && findNode(item.layout, selectedId) ? selectedId : undefined;

  const tabs: { id: Tab; label: string; bad?: boolean }[] = [
    { id: "design", label: d.ui.tabDesign, bad: showIssues && issues.some((i) => i.field === "layout" || i.field === "panels" || i.field === "customDescription") },
    { id: "glass", label: d.ui.tabGlass },
    { id: "shading", label: d.ui.tabShading, bad: issues.some((i) => i.field === "shading") },
    { id: "hardware", label: d.ui.tabHardware },
    { id: "more", label: d.ui.tabMore },
  ];

  return (
    <RfqModal
      dir={dir}
      wide
      title={`${isNew ? d.ui.newItemTitle : d.ui.itemEditorTitle} ${item.reference ? `— ${item.reference}` : ""}`}
      onClose={onCancel}
      footer={
        <>
          {showIssues && issues.length > 0 && <span className="text-sm text-rose-600 me-auto self-center">{d.ui.fixIssues}</span>}
          <Btn onClick={onCancel}>{d.ui.cancel}</Btn>
          <Btn variant="primary" onClick={save}>
            {saveLabel ?? (isNew ? d.ui.addToRequest : d.ui.saveItem)}
          </Btn>
        </>
      }
    >
      {sectionOpen && selected ? (
        <SectionDialog
          key={selected}
          item={item}
          lang={lang}
          selectedId={selected}
          onSelect={setSelectedId}
          onClose={() => openSection(undefined)}
          change={change}
          ask={ask}
        />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="grid gap-4 min-w-0 content-start">
          {/* Presets */}
          <div>
            <div className="text-sm text-slate-700 mb-1.5">{d.ui.preset}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RFQ_OPENING_TYPES.map((t: RfqOpeningType) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    if (t === item.openingType) return;
                    setItem((it) => changeOpeningType(it, t));
                    setSelectedId(undefined);
                    setSectionOpen(false);
                  }}
                  className={`rounded-lg border px-2 py-2 text-sm text-start ${item.openingType === t ? "border-sky-500 bg-sky-50 ring-1 ring-sky-400" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  aria-pressed={item.openingType === t}
                >
                  {d.openingType[t]}
                </button>
              ))}
            </div>
            {issueFor("openingType") && <div className="text-xs text-rose-600 mt-1">{d.issue[issueFor("openingType")!.code]}</div>}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label={d.ui.reference} error={errText("reference")}>
              <TextInput dir="ltr" value={item.reference} onChange={(v) => update({ reference: v })} invalid={!!err("reference")} />
            </Field>
            <Field group={!!def.category} label={d.ui.category}>
              {def.category ? (
                <div className="px-3 py-2 rounded-md bg-slate-50 border border-slate-200">{d.category[def.category]}</div>
              ) : (
                <Select<RfqCategory>
                  value={item.category}
                  onChange={(v) => update({ category: v })}
                  options={(["window", "door"] as RfqCategory[]).map((c) => ({ value: c, label: d.category[c] }))}
                />
              )}
            </Field>
            <Field label={d.ui.quantity} error={errText("quantity")}>
              <TextInput dir="ltr" inputMode="numeric" value={qtyText} onChange={setQty} invalid={!!err("quantity")} />
            </Field>
            <Field label={d.ui.location}>
              <TextInput value={item.location} onChange={(v) => update({ location: v })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-3 items-start">
            <Field label={`${d.ui.width} (${item.unit})`} error={errText("widthCm")}>
              <TextInput dir="ltr" inputMode="decimal" value={wText} onChange={(v) => setDim("w", v)} invalid={!!err("widthCm")} />
            </Field>
            <Field label={`${d.ui.height} (${item.unit})`} error={errText("heightCm")}>
              <TextInput dir="ltr" inputMode="decimal" value={hText} onChange={(v) => setDim("h", v)} invalid={!!err("heightCm")} />
            </Field>
            <Field group label={d.ui.unit}>
              <Segmented<RfqUnit> value={item.unit} onChange={setUnit} options={(["mm", "cm"] as RfqUnit[]).map((u) => ({ value: u, label: unitLabel(u) }))} />
            </Field>
          </div>

          <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === t.id ? "border-sky-500 text-sky-700 font-semibold" : "border-transparent text-slate-600 hover:text-slate-900"}`}
              >
                {t.label}
                {t.bad ? <span className="text-rose-600"> ●</span> : null}
              </button>
            ))}
          </div>
          {notice && <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">{notice}</div>}

          {tab === "design" &&
            (item.openingType !== "custom" ? (
              <>
                <LayoutEditor item={item} lang={lang} selectedId={selected} onSelect={openSection} change={change} confirm={confirm} />
                {issueFor("panels") && <div className="text-xs text-rose-600">{d.issue[issueFor("panels")!.code]}</div>}
                {(def.swing || item.openingType === "hinged_door_double") && (
                  <Section title={d.ui.configuration}>
                    <div className="flex flex-wrap gap-4">
                      {def.swing === "choose" && (
                        <Field group label={d.ui.swing}>
                          <Segmented value={item.swing} onChange={(v) => update({ swing: v })} options={[{ value: "inward" as const, label: d.swing.inward }, { value: "outward" as const, label: d.swing.outward }]} />
                        </Field>
                      )}
                      {def.swing && def.swing !== "choose" && (
                        <Field group label={d.ui.swing}>
                          <div className="px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200 text-sm">{d.swing[def.swing]}</div>
                        </Field>
                      )}
                      {item.openingType === "hinged_door_double" && (
                        <Field group label={d.ui.activeLeaf}>
                          <Segmented<Side> dir="ltr" value={item.activeLeaf} onChange={(v) => update({ activeLeaf: v })} options={sideOptions} />
                        </Field>
                      )}
                    </div>
                  </Section>
                )}
              </>
            ) : (
              <Section title={d.openingType.custom}>
                <Field label={d.ui.customDescription} error={issueFor("customDescription") && showIssues ? d.issue.custom_description_required : undefined}>
                  <TextArea value={item.customDescription} onChange={(v) => update({ customDescription: v })} invalid={showIssues && !!issueFor("customDescription")} />
                </Field>
                <Field group label={d.ui.referenceImage} error={imageError ? d.ui.imageTooLarge : undefined}>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        e.target.value = "";
                        if (!f) return;
                        try {
                          setImageError(false);
                          update({ referenceImage: await loadReferenceImage(f) });
                        } catch {
                          setImageError(true);
                        }
                      }}
                    />
                    <Btn onClick={() => fileRef.current?.click()}>{d.ui.uploadImage}</Btn>
                    {item.referenceImage && (
                      <>
                        <span className="text-xs text-slate-600 break-all">{item.referenceImage.name}</span>
                        <Btn variant="ghost" small onClick={() => update({ referenceImage: undefined })}>
                          {d.ui.removeImage}
                        </Btn>
                      </>
                    )}
                  </div>
                </Field>
              </Section>
            ))}

          {tab === "glass" && (
            <GlassEditor item={item} lang={lang} change={change} selectedId={selected} onSelect={setSelectedId} confirm={confirm} notify={notify} ask={ask} suppressSpecId={sectionOpen ? selected : undefined} />
          )}
          {tab === "shading" && <ShadingEditor item={item} lang={lang} change={change} profile={profile} asked={asked} onAsk={onAsk} />}
          {tab === "hardware" && <HardwareEditor item={item} lang={lang} change={change} profile={profile} asked={asked} onAsk={onAsk} />}
          {tab === "more" && (
            <div className="grid gap-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={d.ui.frameFinish} hint={d.ui.unspecifiedHint}>
                  <TextInput value={item.frameFinish} onChange={(v) => update({ frameFinish: v })} />
                </Field>
                <Field label={d.ui.otherRequirements} hint={d.ui.unspecifiedHint}>
                  <TextInput value={item.otherRequirements} onChange={(v) => update({ otherRequirements: v })} />
                </Field>
                <Field label={d.ui.itemNotes} className="sm:col-span-2" hint={d.ui.notesNotTranslated}>
                  <TextArea value={item.notes} onChange={(v) => update({ notes: v })} />
                </Field>
              </div>
              <Section title={d.ui.alternatives}>
                <div className="text-xs text-slate-500">{d.ui.alternativesHint}</div>
                {item.alternatives.map((a, i) => (
                  <div key={a.id} className="grid gap-1">
                    <div className="flex items-center justify-between gap-2 text-sm font-medium">
                      {fmt(d.ui.alternativeN, { n: i + 1 })}
                      <Btn small variant="ghost" onClick={() => update({ alternatives: item.alternatives.filter((x) => x.id !== a.id) })}>
                        {d.ui.remove}
                      </Btn>
                    </div>
                    <TextArea rows={2} value={a.description} onChange={(v) => update({ alternatives: item.alternatives.map((x) => (x.id === a.id ? { ...x, description: v } : x)) })} />
                  </div>
                ))}
                <div>
                  <Btn small onClick={() => update({ alternatives: [...item.alternatives, { id: rfqUuid(), description: "" }] })}>
                    + {d.ui.addAlternative}
                  </Btn>
                </div>
              </Section>
            </div>
          )}
        </div>

        {/* Live preview — same diagram definition as the overview and the PDF */}
        <aside className="grid gap-3 content-start lg:sticky lg:top-0">
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="text-xs text-slate-500 mb-1 flex justify-between gap-2">
              <span>{d.ui.preview}</span>
              <span className="font-semibold">{d.ui.viewedFromOutside}</span>
            </div>
            <RfqDiagram
              item={previewItem}
              lang={lang}
              width={340}
              height={300}
              interaction={interactive ? { selectedId: selected, onSelect: onSelectRegion, onDividerDrag: tab === "design" ? onDividerDrag : undefined } : undefined}
            />
            <div className="text-[11px] text-slate-500 mt-1">{d.ui.schematicNote}</div>
          </div>
          <RfqLegend lang={lang} compact />
          {issues.length > 0 && (showIssues || issues.some((i) => i.field === "shading" || i.field === "layout")) && (
            <ul className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 list-disc ps-5">
              {issues
                .filter((i) => showIssues || i.field === "shading" || i.field === "layout")
                .map((i) => (
                  <li key={`${i.code}-${i.nodeId ?? ""}`}>{fmt(d.issue[i.code])}</li>
                ))}
            </ul>
          )}
        </aside>
      </div>
    </RfqModal>
  );
}
