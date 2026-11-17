import { useMemo, useRef, useState } from "react";
import type { RfqLanguage, SupplierRequest } from "./types";
import { dict, dirOf, fmt } from "./i18n";
import { parseLooseNumber } from "../quote/pricing";
import {
  applyQuotationToRequest,
  parseSupplierQuotationFile,
  type ParsedSupplierQuotation,
} from "./import/quotationImport";
import { ImportFileError } from "./import/importer";
import { Btn, Field, RfqModal, TextInput } from "./ui";

const moneyIls = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
const moneyUsd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

async function fetchUsdIlsRate(): Promise<number> {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { rates?: { ILS?: number } };
  const rate = data.rates?.ILS;
  if (!(typeof rate === "number" && rate > 0)) throw new Error("no ILS rate");
  return Math.round(rate * 10000) / 10000;
}

export default function QuotationImportDialog({
  lang,
  draft,
  onCancel,
  onCommit,
}: {
  lang: RfqLanguage;
  draft: SupplierRequest;
  onCancel: () => void;
  onCommit: (next: SupplierRequest, summary: { matched: number; unmatched: number }) => void;
}) {
  const d = dict(lang);
  const dir = dirOf(lang);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedSupplierQuotation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rateText, setRateText] = useState("");
  const [rateBusy, setRateBusy] = useState(false);
  const [rateHint, setRateHint] = useState("");

  const rate = parseLooseNumber(rateText);
  const needsRate = Boolean(parsed && parsed.currency && parsed.currency !== "ILS");
  const rateOk = !needsRate || rate > 0;

  const preview = useMemo(() => {
    if (!parsed) return null;
    const effectiveRate = needsRate ? rate : 1;
    if (!(effectiveRate > 0)) return null;
    try {
      return applyQuotationToRequest(draft, parsed, {
        exchangeRateToIls: effectiveRate,
        sourceFileName: fileName,
        now: Date.now(),
      });
    } catch {
      return null;
    }
  }, [parsed, draft, rate, needsRate, fileName]);

  const onFile = async (file: File) => {
    setError(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const result = parseSupplierQuotationFile(file.name, bytes);
      setParsed(result);
      if (result.currency === "ILS") setRateText("1");
    } catch (e) {
      if (e instanceof ImportFileError) {
        const table = d.imp as Record<string, string>;
        setError(fmt(table[e.key] ?? e.key, { detail: e.detail }));
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  };

  const fetchRate = async () => {
    setRateBusy(true);
    setRateHint("");
    try {
      const r = await fetchUsdIlsRate();
      setRateText(String(r));
      setRateHint(d.ui.rateFetched);
    } catch {
      setRateHint(d.ui.rateFetchFailed);
    } finally {
      setRateBusy(false);
    }
  };

  const commit = () => {
    if (!parsed || !preview || !rateOk) return;
    onCommit(preview.request, {
      matched: preview.matched.length,
      unmatched: preview.unmatchedRequest.length,
    });
  };

  return (
    <RfqModal title={d.ui.importQuotation} onClose={onCancel} dir={dir} wide>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{d.ui.importQuotationHint}</p>

        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="primary" onClick={() => fileRef.current?.click()}>
            {d.ui.chooseQuotationFile}
          </Btn>
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
          {fileName && (
            <span className="text-sm text-slate-700">
              <bdi>{fileName}</bdi>
            </span>
          )}
        </div>

        {error && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}

        {parsed && (
          <>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm grid gap-1">
              <div>
                {d.ui.quotationNumber}: <bdi className="font-semibold">{parsed.summary.quotationNumber || "—"}</bdi>
              </div>
              <div>
                {d.ui.quotationDate}: <bdi>{parsed.summary.quotationDate || "—"}</bdi>
              </div>
              <div>
                {d.ui.projectName}: <bdi>{parsed.summary.project || "—"}</bdi>
              </div>
              <div>
                {d.ui.currency}: <bdi className="font-semibold">{parsed.currency}</bdi> · {fmt(d.ui.quotationLinesCount, { n: parsed.lines.length })}
              </div>
              {parsed.summary.grandTotalOriginal != null && (
                <div>
                  {d.ui.grandTotalOriginal}:{" "}
                  <bdi className="font-semibold">
                    {parsed.currency === "USD" ? moneyUsd.format(parsed.summary.grandTotalOriginal) : `${parsed.summary.grandTotalOriginal} ${parsed.currency}`}
                  </bdi>
                </div>
              )}
            </div>

            {needsRate && (
              <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                <Field label={fmt(d.ui.exchangeRateLabel, { currency: parsed.currency })} hint={d.ui.exchangeRateHint}>
                  <TextInput dir="ltr" value={rateText} onChange={setRateText} placeholder="3.65" invalid={rateText !== "" && !(rate > 0)} />
                </Field>
                <Btn disabled={rateBusy} onClick={() => void fetchRate()}>
                  {rateBusy ? d.ui.fetchingRate : d.ui.fetchTodayRate}
                </Btn>
              </div>
            )}
            {rateHint && <div className="text-xs text-slate-600">{rateHint}</div>}

            {preview && (
              <div className="rounded-md border border-slate-200 overflow-auto max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="p-2 text-start">{d.ui.reference}</th>
                      <th className="p-2 text-start">{d.ui.match}</th>
                      <th className="p-2 text-end">{d.ui.priceOriginal}</th>
                      <th className="p-2 text-end">{d.ui.priceIls}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.items.map((it) => {
                      const matched = preview.matched.includes(it.reference);
                      const price = preview.request.items.find((x) => x.id === it.id)?.supplierPrice;
                      return (
                        <tr key={it.id} className="border-t border-slate-100">
                          <td className="p-2">
                            <bdi className="font-semibold">{it.reference}</bdi>
                          </td>
                          <td className="p-2">
                            <span className={matched ? "text-emerald-700" : "text-amber-700"}>{matched ? d.ui.matched : d.ui.unmatched}</span>
                          </td>
                          <td className="p-2 text-end" dir="ltr">
                            {price ? (price.currency === "USD" ? moneyUsd.format(price.lineTotalOriginal) : `${price.lineTotalOriginal} ${price.currency}`) : "—"}
                          </td>
                          <td className="p-2 text-end" dir="ltr">
                            {price ? moneyIls.format(price.lineTotalIls) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {preview && preview.unmatchedFile.length > 0 && (
              <div className="text-xs text-amber-800">
                {d.ui.extraInFile}: <bdi>{preview.unmatchedFile.join(", ")}</bdi>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Btn onClick={onCancel}>{d.ui.cancel}</Btn>
          <Btn variant="success" disabled={!preview || !rateOk || !preview.matched.length} onClick={commit}>
            {d.ui.applyQuotationPrices}
          </Btn>
        </div>
      </div>
    </RfqModal>
  );
}
