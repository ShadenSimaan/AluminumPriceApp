import { useMemo, useRef, useState } from "react";
import type { RfqItem, RfqLanguage, RfqUnit } from "./types";
import { RFQ_OPENING_TYPES } from "./types";
import { dict, dirOf, fmt } from "./i18n";
import {
  analyzeSheet,
  buildImportRows,
  committableItems,
  firstNonEmptyRow,
  ImportFileError,
  importSummary,
  MAX_FILE_MB,
  MAX_ROWS,
  parseImportBytes,
  validateImportRows,
  type ColumnMapping,
  type ImportRow,
  type ParsedFile,
  type RowMessage,
} from "./import/importer";
import {
  FIELD_LABELS,
  IMPORT_FIELDS,
  OPENING_TYPE_VALUES,
  REQUIRED_FIELDS,
  parseCategory,
  parseOpeningType,
  type ImportField,
} from "./import/schema";
import { buildTemplateCsv, buildTemplateXlsx } from "./import/template";
import { saveGeneratedFile } from "./rfqExport";
import RfqDiagram from "./RfqDiagram";
import { Btn, Field, RfqModal, Select } from "./ui";

type Step = "file" | "mapping" | "review";

const TEXT_FIELDS: ImportField[] = [
  "location",
  "glass",
  "glassTint",
  "frameFinish",
  "shadingColor",
  "hardware",
  "otherRequirements",
  "alternatives",
  "description",
  "notes",
];

export default function RfqImportDialog({
  lang,
  existingItems,
  onCancel,
  onCommit,
  confirm,
}: {
  lang: RfqLanguage;
  existingItems: RfqItem[];
  onCancel: () => void;
  onCommit: (items: RfqItem[], mode: "append" | "replace") => void;
  confirm: (message: string) => Promise<boolean>;
}) {
  const d = dict(lang);
  const dir = dirOf(lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [detectedUnit, setDetectedUnit] = useState<RfqUnit | null>(null);
  const [unit, setUnit] = useState<RfqUnit | "">("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [rows, setRows] = useState<ImportRow[]>([]);

  const fieldLabel = (f: ImportField | string) => (f in FIELD_LABELS ? FIELD_LABELS[f as ImportField][lang] : f);
  const msg = (m: RowMessage) => {
    const params = { ...(m.params ?? {}) };
    if (typeof params.field === "string") params.field = fieldLabel(params.field);
    const table = (m.source === "issue" ? d.issue : d.imp) as Record<string, string>;
    return fmt(table[m.key] ?? m.key, params);
  };

  const sheet = parsed?.sheets[sheetIdx];

  const applySheet = (p: ParsedFile, idx: number, hdr?: number) => {
    const s = p.sheets[idx];
    const h = hdr ?? firstNonEmptyRow(s.rows);
    const a = analyzeSheet(s.rows, h);
    setSheetIdx(idx);
    setHeaderRow(h);
    setMapping(a.mapping);
    setDetectedUnit(a.detectedUnit);
    setUnit(a.detectedUnit ?? "");
  };

  const onFile = async (file: File) => {
    setFileError(null);
    setFileName(file.name);
    try {
      if (file.size > MAX_FILE_MB * 1024 * 1024) throw new ImportFileError("tooLarge");
      const bytes = new Uint8Array(await file.arrayBuffer());
      const p = parseImportBytes(file.name, bytes);
      const firstWithData = Math.max(0, p.sheets.findIndex((s) => s.rows.some((r) => r.some((c) => c.trim()))));
      if (!p.sheets.length || !p.sheets[firstWithData]?.rows.length) throw new ImportFileError("noRows");
      setParsed(p);
      applySheet(p, firstWithData);
      setStep("mapping");
    } catch (e) {
      if (e instanceof ImportFileError) {
        setFileError(fmt(d.imp[e.key], { mb: MAX_FILE_MB, rows: MAX_ROWS, msg: e.detail }));
      } else setFileError(fmt(d.imp.readFailed, { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const goReview = () => {
    if (!sheet) return;
    setRows(buildImportRows(sheet.rows, headerRow, mapping));
    setStep("review");
  };

  const ctx = useMemo(
    () => ({ unit: unit || null, existingReferences: existingItems.map((i) => i.reference), mode }),
    [unit, existingItems, mode]
  );
  const results = useMemo(() => validateImportRows(rows, ctx), [rows, ctx]);
  const summary = importSummary(rows, results);
  const items = committableItems(rows, results);
  const missingRequired = REQUIRED_FIELDS.filter((f) => mapping[f] == null);

  const editRow = (key: string, field: ImportField, value: string) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, blank: false, values: { ...r.values, [field]: value } } : r)));
  const toggleRow = (key: string, include: boolean) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, include } : r)));

  const commit = async () => {
    if (!items || !items.length) return;
    if (mode === "replace" && existingItems.length > 0) {
      const ok = await confirm(fmt(d.imp.confirmReplace, { existing: existingItems.length, n: items.length }));
      if (!ok) return;
    }
    onCommit(items, mode);
  };

  const headers = sheet ? (sheet.rows[headerRow] ?? []).map((h, i) => h || `#${i + 1}`) : [];
  const columnOptions = [{ value: "", label: d.imp.notMapped }, ...headers.map((h, i) => ({ value: String(i), label: `${i + 1}. ${h}` }))];

  const enumOptions = (field: ImportField, raw: string) => {
    if (field === "category") {
      const opts = [
        { value: "window", label: d.category.window },
        { value: "door", label: d.category.door },
      ];
      return withUnknown(opts, raw);
    }
    if (field === "openingType") {
      return withUnknown(RFQ_OPENING_TYPES.map((t) => ({ value: t, label: d.openingType[t] })), raw);
    }
    return null;
  };
  const withUnknown = (opts: { value: string; label: string }[], raw: string) => {
    const known = opts.some((o) => o.value === raw);
    return known ? opts : [{ value: raw, label: raw ? `⚠ ${raw}` : "—" }, ...opts];
  };
  /** Show the canonical id in the select when the raw value is a recognised alias; unknown values stay visible. */
  const canonical = (field: ImportField, raw: string): string => {
    if (field === "category") {
      const p = parseCategory(raw);
      return p.ok ? p.value : raw;
    }
    if (field === "openingType") {
      const p = parseOpeningType(raw);
      return p.ok ? p.value : raw;
    }
    return raw;
  };
  const previewFields = IMPORT_FIELDS.filter((f) => mapping[f] != null || f === "reference");

  return (
    <RfqModal
      dir={dir}
      wide
      title={d.imp.title}
      onClose={onCancel}
      footer={
        <>
          <span className="text-xs text-slate-500 me-auto self-center">{d.imp.cancelNote}</span>
          <Btn onClick={onCancel}>{d.ui.cancel}</Btn>
          {step === "mapping" && (
            <>
              <Btn onClick={() => setStep("file")}>{d.imp.back}</Btn>
              <Btn variant="primary" onClick={goReview} disabled={missingRequired.length > 0 || (!unit && mapping.unit == null)}>
                {d.imp.next}
              </Btn>
            </>
          )}
          {step === "review" && (
            <>
              <Btn onClick={() => setStep("mapping")}>{d.imp.back}</Btn>
              <Btn variant={mode === "replace" ? "danger" : "success"} onClick={commit} disabled={!items || items.length === 0}>
                {fmt(d.imp.confirmImport, { n: items?.length ?? 0 })}
              </Btn>
            </>
          )}
        </>
      }
    >
      <ol className="flex flex-wrap gap-2 text-sm mb-4">
        {(["file", "mapping", "review"] as Step[]).map((s) => (
          <li key={s} className={`px-2 py-1 rounded ${step === s ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600"}`}>
            {s === "file" ? d.imp.stepFile : s === "mapping" ? d.imp.stepMapping : d.imp.stepReview}
          </li>
        ))}
      </ol>

      {step === "file" && (
        <div className="grid gap-4">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFile(f);
              }}
            />
            <Btn variant="primary" onClick={() => fileRef.current?.click()}>
              {d.imp.chooseFile}
            </Btn>
            {fileName && <span className="text-sm text-slate-600 break-all">{fileName}</span>}
          </div>
          {fileError && <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-2 text-sm">{fileError}</div>}
          <p className="text-sm text-slate-600">{fmt(d.imp.supported, { mb: MAX_FILE_MB, rows: MAX_ROWS })}</p>
          <div className="rounded-lg border border-slate-200 p-3 grid gap-2 text-sm">
            <div className="font-semibold">{d.imp.templates}</div>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={() => void saveGeneratedFile(buildTemplateXlsx(), "rfq-import-template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>
                {d.imp.downloadXlsx}
              </Btn>
              <Btn onClick={() => void saveGeneratedFile(buildTemplateCsv(), "rfq-import-template.csv", "text/csv;charset=utf-8")}>{d.imp.downloadCsv}</Btn>
            </div>
            <p>{d.imp.requiredColumns}</p>
            <p>{d.imp.acceptedCategories}</p>
            <p>{d.imp.sidesHelp}</p>
            <details>
              <summary className="cursor-pointer">{d.imp.acceptedTypes}</summary>
              <table className="mt-2 text-xs w-full">
                <tbody>
                  {RFQ_OPENING_TYPES.map((t) => (
                    <tr key={t} className="border-t align-top">
                      <td className="py-1 pe-2 font-semibold whitespace-nowrap">{d.openingType[t]}</td>
                      <td className="py-1">
                        <bdi>{OPENING_TYPE_VALUES[t].join(", ")}</bdi>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </div>
      )}

      {step === "mapping" && parsed && sheet && (
        <div className="grid gap-4">
          <div className="grid sm:grid-cols-3 gap-3">
            {parsed.sheets.length > 1 && (
              <Field label={d.imp.sheet}>
                <Select<string>
                  value={String(sheetIdx)}
                  onChange={(v) => applySheet(parsed, Number(v))}
                  options={parsed.sheets.map((s, i) => ({ value: String(i), label: s.name }))}
                />
              </Field>
            )}
            <Field label={d.imp.headerRow}>
              <Select<string>
                value={String(headerRow)}
                onChange={(v) => applySheet(parsed, sheetIdx, Number(v))}
                options={sheet.rows.slice(0, 20).map((r, i) => ({ value: String(i), label: `${i + 1}: ${r.filter(Boolean).slice(0, 4).join(" | ").slice(0, 60)}` }))}
              />
            </Field>
            <Field
              label={d.imp.unitQuestion}
              error={!unit ? d.imp.unitRequired : undefined}
              hint={detectedUnit ? fmt(d.imp.unitFromFile, { unit: detectedUnit }) : d.imp.unitColumnNote}
            >
              <Select<RfqUnit | "">
                value={unit}
                onChange={setUnit}
                invalid={!unit}
                options={[
                  { value: "", label: d.imp.unitChoose },
                  { value: "mm", label: lang === "he" ? "מ״מ (mm)" : "mm" },
                  { value: "cm", label: lang === "he" ? "ס״מ (cm)" : "cm" },
                ]}
              />
            </Field>
          </div>
          {parsed.encoding && <div className="text-xs text-slate-500">{fmt(d.imp.encodingNote, { enc: parsed.encoding })}</div>}
          {sheet.formulaCells > 0 && (
            <div className="text-xs rounded border border-amber-200 bg-amber-50 p-2">{fmt(d.imp.formulaNote, { n: sheet.formulaCells })}</div>
          )}
          <div>
            <div className="font-semibold mb-2">{d.imp.columnMapping}</div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {IMPORT_FIELDS.map((f) => {
                const required = REQUIRED_FIELDS.includes(f);
                return (
                  <Field key={f} label={`${fieldLabel(f)}${required ? ` (${d.imp.required})` : ""}`} error={required && mapping[f] == null ? fmt(d.imp.missing, { field: fieldLabel(f) }) : undefined}>
                    <Select<string>
                      value={mapping[f] != null ? String(mapping[f]) : ""}
                      onChange={(v) => setMapping((m) => ({ ...m, [f]: v === "" ? undefined : Number(v) }))}
                      options={columnOptions}
                      invalid={required && mapping[f] == null}
                    />
                  </Field>
                );
              })}
            </div>
          </div>
          <Field group label={d.imp.mode}>
            <div className="grid gap-1 text-sm">
              <label className="flex gap-2 items-center">
                <input type="radio" checked={mode === "append"} onChange={() => setMode("append")} /> {d.imp.modeAppend}
              </label>
              <label className="flex gap-2 items-center">
                <input type="radio" checked={mode === "replace"} onChange={() => setMode("replace")} /> {d.imp.modeReplace}
              </label>
            </div>
          </Field>
        </div>
      )}

      {step === "review" && (
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-3 text-sm items-center">
            <span className="font-semibold">{fmt(d.imp.summary, summary)}</span>
            {summary.blank > 0 && <span className="text-slate-500">{fmt(d.imp.blankRowsIgnored, { n: summary.blank })}</span>}
            {!unit && <span className="text-rose-600">{d.imp.unitRequired}</span>}
            {summary.invalid > 0 && <span className="text-rose-600">{d.imp.invalidIncluded}</span>}
            {summary.valid === 0 && summary.invalid === 0 && <span className="text-rose-600">{d.imp.nothingToImport}</span>}
          </div>
          <div className="text-xs text-slate-500">{d.imp.editHint}</div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="text-sm w-full min-w-[900px]">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2 text-start">{d.imp.include}</th>
                  <th className="p-2 text-start">{d.imp.row}</th>
                  {previewFields.map((f) => (
                    <th key={f} className="p-2 text-start whitespace-nowrap">
                      {fieldLabel(f)}
                    </th>
                  ))}
                  <th className="p-2 text-start">{d.imp.status}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  if (r.blank) return null;
                  const res = results[i];
                  const bad = r.include && res.errors.length > 0;
                  const fieldErr = (f: ImportField) => r.include && res.errors.some((e) => e.field === f);
                  return (
                    <tr key={r.key} className={`border-t align-top ${!r.include ? "opacity-50" : bad ? "bg-rose-50" : ""}`}>
                      <td className="p-2">
                        <input type="checkbox" checked={r.include} onChange={(e) => toggleRow(r.key, e.target.checked)} aria-label={d.imp.include} />
                      </td>
                      <td className="p-2 tabular-nums">{r.rowNumber}</td>
                      {previewFields.map((f) => {
                        const raw = r.values[f] ?? "";
                        const opts = enumOptions(f, canonical(f, raw));
                        const cls = `w-full min-w-[6rem] rounded border px-2 py-1 bg-white ${fieldErr(f) ? "border-rose-400" : "border-slate-300"}`;
                        return (
                          <td key={f} className="p-1.5">
                            {opts ? (
                              <select className={cls} value={canonical(f, raw)} onChange={(e) => editRow(r.key, f, e.target.value)}>
                                {opts.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <input
                                className={cls}
                                dir={TEXT_FIELDS.includes(f) ? "auto" : "ltr"}
                                value={raw}
                                placeholder={f === "reference" && res.autoRef && res.item ? `${res.item.reference} (${d.imp.autoRef})` : ""}
                                onChange={(e) => editRow(r.key, f, e.target.value)}
                              />
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 min-w-[16rem]">
                        {!r.include ? (
                          <span className="text-slate-500">{d.imp.excluded}</span>
                        ) : res.errors.length ? (
                          <ul className="text-xs text-rose-700 list-disc ps-4">
                            {res.errors.map((e, k) => (
                              <li key={k}>
                                {e.field ? `${fieldLabel(e.field)}: ` : ""}
                                {msg(e)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="flex gap-2 items-start">
                            {res.item && (
                              <div className="w-16 shrink-0">
                                <RfqDiagram item={res.item} lang={lang} width={80} height={70} showDimensions={false} />
                              </div>
                            )}
                            <div className="text-xs">
                              <div className="text-emerald-700 font-semibold">{d.imp.ok}</div>
                              {res.warnings.map((w, k) => (
                                <div key={k} className="text-amber-700">
                                  {msg(w)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </RfqModal>
  );
}
