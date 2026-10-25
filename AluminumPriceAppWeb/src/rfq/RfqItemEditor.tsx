import { useMemo, useRef, useState } from "react";
import type { RfqCategory, RfqItem, RfqLanguage, RfqOpeningType, RfqPanel, RfqReferenceImage, RfqUnit, Requirement, Side } from "./types";
import { RFQ_OPENING_TYPES } from "./types";
import { changeOpeningType, OPENING_TYPE_DEFS, normalizeItemConfig, setPanelCount, validateItem, type ItemIssue } from "./presets";
import { dict, dirOf, fmt, panelTitle } from "./i18n";
import { cmToUnit, parseStrictNumber, unitToCm } from "./units";
import RfqDiagram, { RfqLegend } from "./RfqDiagram";
import { Btn, Field, RfqModal, Segmented, Select, TextArea, TextInput } from "./ui";

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

export default function RfqItemEditor({
  initial,
  isNew,
  lang,
  otherReferences,
  onSave,
  onCancel,
}: {
  initial: RfqItem;
  isNew: boolean;
  lang: RfqLanguage;
  otherReferences: string[];
  onSave: (item: RfqItem) => void;
  onCancel: () => void;
}) {
  const d = dict(lang);
  const dir = dirOf(lang);
  const [item, setItem] = useState<RfqItem>(initial);
  const [wText, setWText] = useState(dimText(initial.widthCm, initial.unit));
  const [hText, setHText] = useState(dimText(initial.heightCm, initial.unit));
  const [qtyText, setQtyText] = useState(String(initial.quantity));
  const [imageError, setImageError] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const def = OPENING_TYPE_DEFS[item.openingType];

  const update = (patch: Partial<RfqItem>) => setItem((it) => normalizeItemConfig({ ...it, ...patch }));

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

  const updatePanel = (index: number, patch: Partial<RfqPanel>) => {
    const panels = item.panels.map((p, i) => (i === index ? { ...p, ...patch } : p));
    update({ panels });
  };

  const save = () => {
    setShowIssues(true);
    if (issues.length) return;
    onSave(item);
  };

  const unitLabel = (u: RfqUnit) => (lang === "he" ? (u === "mm" ? "מ״מ (mm)" : "ס״מ (cm)") : u);
  const req3 = (value: Requirement, onChange: (v: Requirement) => void, label: string) => (
    <Field label={label}>
      <Select<Requirement>
        value={value}
        onChange={onChange}
        options={(["unspecified", "required", "not_required"] as Requirement[]).map((r) => ({ value: r, label: d.requirement[r] }))}
      />
    </Field>
  );

  const sideOptions = [
    { value: "left" as Side, label: `◧ ${d.side.left}` },
    { value: "right" as Side, label: `${d.side.right} ◨` },
  ];

  const previewItem = { ...item, widthCm: item.widthCm && isFinite(item.widthCm) ? item.widthCm : null, heightCm: item.heightCm && isFinite(item.heightCm) ? item.heightCm : null };

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
            {isNew ? d.ui.addToRequest : d.ui.saveItem}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4 min-w-0">
          {/* Presets */}
          <div>
            <div className="text-sm text-slate-700 mb-1.5">{d.ui.preset}</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {RFQ_OPENING_TYPES.map((t: RfqOpeningType) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setItem((it) => changeOpeningType(it, t))}
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

          {/* Configuration — only controls valid for this opening type */}
          {item.openingType !== "custom" ? (
            <fieldset className="rounded-lg border border-slate-200 p-3 grid gap-3">
              <legend className="px-1 text-sm font-semibold">{d.ui.configuration}</legend>
              {def.minPanels !== def.maxPanels && (
                <Field group label={d.ui.panels}>
                  <Segmented<string>
                    dir="ltr"
                    value={String(item.panels.length)}
                    onChange={(v) => setItem((it) => setPanelCount(it, Number(v)))}
                    options={Array.from({ length: def.maxPanels - def.minPanels + 1 }, (_, i) => String(def.minPanels + i)).map((n) => ({ value: n, label: n }))}
                  />
                </Field>
              )}
              <div className="text-xs text-slate-500">
                {d.ui.viewedFromOutside} — {d.ui.sideHint}
              </div>
              {/* Panels are always listed left → right as seen from outside, in every UI language. */}
              <div dir="ltr" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(item.panels.length, 3)}, minmax(0, 1fr))` }}>
                {item.panels.map((p, i) => (
                  <div key={i} dir={dir} className="rounded-md border border-slate-200 bg-slate-50 p-2 grid gap-2 content-start">
                    <div className="text-sm font-semibold">{panelTitle(lang, i, item.panels.length)}</div>
                    {def.allowFixedPanels && def.operableOp && (
                      <Segmented<string>
                        value={p.operation === "fixed" ? "fixed" : "operable"}
                        onChange={(v) => updatePanel(i, v === "fixed" ? { operation: "fixed" } : { operation: def.operableOp! })}
                        options={[
                          { value: "operable", label: d.panelOp[def.operableOp] },
                          { value: "fixed", label: d.panelOp.fixed },
                        ]}
                      />
                    )}
                    {!def.allowFixedPanels && <div className="text-sm text-slate-600">{d.panelOp[p.operation]}</div>}
                    {p.operation === "sliding" && (
                      <Field group label={d.ui.slideDirection}>
                        <Segmented<Side> dir="ltr" value={p.slideDirection} onChange={(v) => updatePanel(i, { slideDirection: v })} options={[{ value: "left", label: `← ${d.side.left}` }, { value: "right", label: `${d.side.right} →` }]} />
                      </Field>
                    )}
                    {(p.operation === "casement" || p.operation === "tilt_turn" || (p.operation === "hinged" && item.openingType === "hinged_door_single")) && (
                      <Field group label={d.ui.hingeSide}>
                        <Segmented<Side> dir="ltr" value={p.hingeSide} onChange={(v) => updatePanel(i, { hingeSide: v })} options={sideOptions} />
                      </Field>
                    )}
                    {item.openingType === "hinged_door_double" && (
                      <div className="text-xs text-slate-600">
                        {d.ui.hingeSide}: {d.side[p.hingeSide ?? "left"]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {issueFor("panels") && <div className="text-xs text-rose-600">{d.issue[issueFor("panels")!.code]}</div>}
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
            </fieldset>
          ) : (
            <fieldset className="rounded-lg border border-slate-200 p-3 grid gap-3">
              <legend className="px-1 text-sm font-semibold">{d.openingType.custom}</legend>
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
            </fieldset>
          )}

          {/* Optional specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={d.ui.glass} hint={d.ui.unspecifiedHint}>
              <TextInput value={item.glass} onChange={(v) => update({ glass: v })} />
            </Field>
            <Field label={d.ui.frameFinish} hint={d.ui.unspecifiedHint}>
              <TextInput value={item.frameFinish} onChange={(v) => update({ frameFinish: v })} />
            </Field>
            {req3(item.insectScreen, (v) => update({ insectScreen: v }), d.ui.insectScreen)}
            {req3(item.shutter, (v) => update({ shutter: v }), d.ui.shutter)}
            <Field label={d.ui.hardware} hint={d.ui.unspecifiedHint}>
              <TextInput value={item.hardware} onChange={(v) => update({ hardware: v })} />
            </Field>
            <Field label={d.ui.otherRequirements} hint={d.ui.unspecifiedHint}>
              <TextInput value={item.otherRequirements} onChange={(v) => update({ otherRequirements: v })} />
            </Field>
            <Field label={d.ui.itemNotes} className="sm:col-span-2" hint={d.ui.notesNotTranslated}>
              <TextArea value={item.notes} onChange={(v) => update({ notes: v })} />
            </Field>
          </div>
        </div>

        {/* Live preview — same diagram definition as the overview and the PDF */}
        <aside className="grid gap-3 content-start lg:sticky lg:top-0">
          <div className="rounded-lg border border-slate-200 bg-white p-2">
            <div className="text-xs text-slate-500 mb-1 flex justify-between gap-2">
              <span>{d.ui.preview}</span>
              <span className="font-semibold">{d.ui.viewedFromOutside}</span>
            </div>
            <RfqDiagram item={previewItem} lang={lang} width={320} height={280} />
            <div className="text-[11px] text-slate-500 mt-1">{d.ui.schematicNote}</div>
          </div>
          <RfqLegend lang={lang} compact />
          {showIssues && issues.length > 0 && (
            <ul className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-2 list-disc ps-5">
              {issues.map((i) => (
                <li key={i.code}>{fmt(d.issue[i.code])}</li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </RfqModal>
  );
}
