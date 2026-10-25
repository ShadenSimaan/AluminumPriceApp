import { useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { Customer } from "../types";
import { Btn, RfqModal } from "../rfq/ui";
import {
  CUSTOMER_FIELDS,
  CUSTOMER_FIELD_LABELS,
  CustomerImportError,
  analyzeCustomerSheet,
  buildDraftRows,
  readCustomerFile,
  type CustomerField,
  type CustomerMapping,
  type CustomerSheet,
  type DraftRow,
  type DraftStatus,
} from "./customerImport";

type Loaded = {
  fileName: string;
  sheets: CustomerSheet[];
  sheetIndex: number;
  hasHeader: boolean;
  headerRow: number;
  headers: string[];
  mapping: CustomerMapping;
  fromHeaders: boolean;
};

const STATUS_LABEL: Record<DraftStatus, string> = {
  new: "חדש",
  update: "עדכון",
  same: "קיים",
  duplicate: "כפול",
  invalid: "שגיאה",
};

const STATUS_CLS: Record<DraftStatus, string> = {
  new: "bg-emerald-100 text-emerald-800",
  update: "bg-sky-100 text-sky-800",
  same: "bg-slate-100 text-slate-600",
  duplicate: "bg-amber-100 text-amber-800",
  invalid: "bg-red-100 text-red-700",
};

function loadSheet(fileName: string, sheets: CustomerSheet[], sheetIndex: number): Loaded {
  const a = analyzeCustomerSheet(sheets[sheetIndex]?.rows ?? []);
  return {
    fileName,
    sheets,
    sheetIndex,
    hasHeader: a.fromHeaders,
    headerRow: a.headerRow,
    headers: a.headers,
    mapping: a.mapping,
    fromHeaders: a.fromHeaders,
  };
}

export default function CustomerImportDialog({
  customers,
  onClose,
  onImport,
}: {
  customers: Customer[];
  onClose: () => void;
  onImport: (rows: DraftRow[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sheets = readCustomerFile(file.name, bytes);
      const firstWithData = Math.max(0, sheets.findIndex((s) => s.rows.some((r) => r.some((c) => c.trim()))));
      if (!sheets.length || !sheets[firstWithData].rows.some((r) => r.some((c) => c.trim()))) {
        throw new CustomerImportError("לא נמצאו נתונים בקובץ");
      }
      setLoaded(loadSheet(file.name, sheets, firstWithData));
      setExcluded(new Set());
    } catch (e) {
      setError(e instanceof CustomerImportError ? e.message : `שגיאה בקריאת הקובץ: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const rows = loaded?.sheets[loaded.sheetIndex]?.rows ?? [];
  const effectiveHeaderRow = loaded ? (loaded.hasHeader ? loaded.headerRow : loaded.fromHeaders ? loaded.headerRow - 1 : loaded.headerRow) : -1;
  const columnNames = useMemo(() => {
    if (!loaded) return [];
    const width = Math.max(0, ...rows.map((r) => r.length));
    return Array.from({ length: width }, (_, i) => {
      const h = loaded.hasHeader && loaded.fromHeaders ? (loaded.headers[i] ?? "").trim() : "";
      const sample = rows.slice(Math.max(0, effectiveHeaderRow + 1)).find((r) => (r[i] ?? "").trim())?.[i]?.trim() ?? "";
      const label = h || `עמודה ${i + 1}`;
      return sample ? `${label} — לדוגמה: ${sample.length > 24 ? sample.slice(0, 24) + "…" : sample}` : label;
    });
  }, [loaded, rows, effectiveHeaderRow]);

  const drafts = useMemo(
    () => (loaded ? buildDraftRows(rows, effectiveHeaderRow, loaded.mapping, customers) : []),
    [loaded, rows, effectiveHeaderRow, customers]
  );
  const actionable = drafts.filter((d) => (d.status === "new" || d.status === "update") && !excluded.has(d.line));
  const counts = drafts.reduce<Record<DraftStatus, number>>(
    (acc, d) => ({ ...acc, [d.status]: acc[d.status] + 1 }),
    { new: 0, update: 0, same: 0, duplicate: 0, invalid: 0 }
  );
  const hasNameColumn =
    !!loaded && (loaded.mapping.name !== undefined || loaded.mapping.firstName !== undefined || loaded.mapping.lastName !== undefined || loaded.mapping.company !== undefined);

  function setField(field: CustomerField, value: string) {
    if (!loaded) return;
    const next: CustomerMapping = { ...loaded.mapping };
    if (value === "") delete next[field];
    else {
      const col = Number(value);
      for (const f of CUSTOMER_FIELDS) if (next[f] === col) delete next[f];
      next[field] = col;
    }
    setLoaded({ ...loaded, mapping: next });
  }

  function toggleRow(line: number) {
    setExcluded((cur) => {
      const n = new Set(cur);
      if (n.has(line)) n.delete(line);
      else n.add(line);
      return n;
    });
  }

  return (
    <RfqModal
      title="ייבוא לקוחות מקובץ"
      onClose={onClose}
      dir="rtl"
      wide
      footer={
        <>
          <Btn onClick={onClose}>ביטול</Btn>
          <Btn variant="primary" disabled={!actionable.length} onClick={() => onImport(actionable)}>
            {actionable.length ? `ייבוא ${actionable.length} לקוחות` : "ייבוא"}
          </Btn>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 grid gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Btn variant="primary" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4" aria-hidden />
              {loaded ? "בחירת קובץ אחר" : "בחירת קובץ"}
            </Btn>
            <span className="text-sm text-slate-700 truncate min-w-0">{loaded ? loaded.fileName : busy ? "קורא את הקובץ…" : "לא נבחר קובץ"}</span>
          </div>
          <p className="text-xs text-slate-500">
            ניתן לייבא CSV, ‏Excel ‏(.xlsx) או קובץ אנשי קשר (.vcf) מהטלפון / Google / Outlook. הקובץ נקרא במחשב בלבד. העמודות מזוהות
            אוטומטית לפי הכותרות או לפי התוכן (שם, טלפון, אימייל, כתובת, הערות), ואפשר לתקן את הזיהוי לפני הייבוא.
          </p>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".csv,.txt,.tsv,.xlsx,.vcf,text/csv,text/vcard"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {error && <div className="text-sm text-red-700">{error}</div>}
        </div>

        {loaded && (
          <>
            <div className="grid gap-3">
              <div className="flex flex-wrap items-center gap-4">
                {loaded.sheets.length > 1 && (
                  <label className="flex items-center gap-2 text-sm">
                    גיליון:
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5"
                      value={loaded.sheetIndex}
                      onChange={(e) => {
                        setLoaded(loadSheet(loaded.fileName, loaded.sheets, Number(e.target.value)));
                        setExcluded(new Set());
                      }}
                    >
                      {loaded.sheets.map((s, i) => (
                        <option key={i} value={i}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {loaded.fromHeaders && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={loaded.hasHeader}
                      onChange={(e) => setLoaded({ ...loaded, hasHeader: e.target.checked })}
                    />
                    השורה הראשונה היא כותרות
                  </label>
                )}
              </div>
              <div className="text-sm font-medium text-slate-700">זיהוי עמודות</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {CUSTOMER_FIELDS.map((f) => (
                  <label key={f} className="grid gap-1 text-sm">
                    <span className="text-slate-600">{CUSTOMER_FIELD_LABELS[f]}</span>
                    <select
                      className={`rounded-lg border bg-white px-2 py-1.5 min-w-0 ${loaded.mapping[f] !== undefined ? "border-sky-400" : "border-slate-300 text-slate-400"}`}
                      value={loaded.mapping[f] ?? ""}
                      onChange={(e) => setField(f, e.target.value)}
                    >
                      <option value="">— לא בשימוש —</option>
                      {columnNames.map((n, i) => (
                        <option key={i} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              {!hasNameColumn && <div className="text-sm text-red-700">לא זוהתה עמודת שם — יש לבחור איזו עמודה מכילה את שם הלקוח.</div>}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className={`rounded-full px-2.5 py-1 ${STATUS_CLS.new}`}>{counts.new} לקוחות חדשים</span>
              <span className={`rounded-full px-2.5 py-1 ${STATUS_CLS.update}`}>{counts.update} יעודכנו (השלמת פרטים חסרים)</span>
              {counts.same > 0 && <span className={`rounded-full px-2.5 py-1 ${STATUS_CLS.same}`}>{counts.same} כבר קיימים ללא שינוי</span>}
              {counts.duplicate > 0 && <span className={`rounded-full px-2.5 py-1 ${STATUS_CLS.duplicate}`}>{counts.duplicate} כפולים בקובץ</span>}
              {counts.invalid > 0 && <span className={`rounded-full px-2.5 py-1 ${STATUS_CLS.invalid}`}>{counts.invalid} שורות ללא שם</span>}
            </div>

            <div className="table-scroll rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-2 py-2 w-8" />
                    <th className="px-2 py-2 text-right font-medium text-slate-700">שורה</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-700">סטטוס</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-700">שם</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-700">טלפון</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-700">אימייל</th>
                    <th className="px-2 py-2 text-right font-medium text-slate-700">הערות</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {drafts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        אין שורות לייבוא
                      </td>
                    </tr>
                  ) : (
                    drafts.map((d) => {
                      const selectable = d.status === "new" || d.status === "update";
                      return (
                        <tr key={d.line} className={selectable && !excluded.has(d.line) ? "bg-white" : "bg-slate-50 text-slate-500"}>
                          <td className="px-2 py-1.5 text-center">
                            {selectable && (
                              <input
                                type="checkbox"
                                checked={!excluded.has(d.line)}
                                onChange={() => toggleRow(d.line)}
                                aria-label={`ייבוא שורה ${d.line}`}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 tabular-nums">{d.line}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap">
                            <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[d.status]}`} title={d.message}>
                              {STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td className="px-2 py-1.5">
                            {d.draft.name || <span className="text-red-600">—</span>}
                            {d.message && <div className="text-xs text-slate-500">{d.message}</div>}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap" dir="ltr" style={{ textAlign: "right" }}>
                            {d.draft.phone}
                          </td>
                          <td className="px-2 py-1.5 max-w-[14rem] truncate" dir="ltr" style={{ textAlign: "right" }} title={d.draft.email}>
                            {d.draft.email}
                          </td>
                          <td className="px-2 py-1.5 max-w-[18rem] truncate" title={d.draft.notes}>
                            {d.draft.notes}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </RfqModal>
  );
}
