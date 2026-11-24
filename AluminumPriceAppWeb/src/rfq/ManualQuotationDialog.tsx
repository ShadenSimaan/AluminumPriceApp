import { useState } from "react";
import type { RfqLanguage, SupplierRequest } from "./types";
import { dict, dirOf, fmt } from "./i18n";
import { parseLooseNumber } from "../quote/pricing";
import { applyManualQuotation } from "./import/quotationImport";
import { formatDimension } from "./units";
import { Btn, Field, RfqModal, Segmented, TextInput } from "./ui";

const moneyIls = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });

type Currency = "ILS" | "USD";

async function fetchUsdIlsRate(): Promise<number> {
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=ILS");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { rates?: { ILS?: number } };
  const rate = data.rates?.ILS;
  if (!(typeof rate === "number" && rate > 0)) throw new Error("no ILS rate");
  return Math.round(rate * 10000) / 10000;
}

/** Empty field clears the price. Anything that is not a non-negative number is invalid. */
function parseAmount(text: string): number | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/\d/.test(trimmed)) return "invalid";
  const n = parseLooseNumber(trimmed);
  if (!isFinite(n) || n < 0) return "invalid";
  return n;
}

function moneyText(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "";
  return String(n);
}

function initialCurrency(req: SupplierRequest): Currency {
  return req.supplierQuotation?.currency?.toUpperCase() === "USD" ? "USD" : "ILS";
}

export default function ManualQuotationDialog({
  lang,
  request,
  onCancel,
  onCommit,
}: {
  lang: RfqLanguage;
  request: SupplierRequest;
  onCancel: () => void;
  onCommit: (next: SupplierRequest, priced: number) => void;
}) {
  const d = dict(lang);
  const dir = dirOf(lang);
  const [currency, setCurrency] = useState<Currency>(() => initialCurrency(request));
  const [rateText, setRateText] = useState(() => {
    const rate = request.supplierQuotation?.exchangeRateToIls;
    return request.supplierQuotation?.currency?.toUpperCase() === "USD" && rate && rate > 0 ? String(rate) : "";
  });
  const [rateBusy, setRateBusy] = useState(false);
  const [rateHint, setRateHint] = useState("");
  const [quotationNumber, setQuotationNumber] = useState(request.supplierQuotation?.quotationNumber ?? "");
  const [quotationDate, setQuotationDate] = useState(request.supplierQuotation?.quotationDate ?? "");
  const [packagingText, setPackagingText] = useState(() => {
    const q = request.supplierQuotation;
    if (!q) return "";
    return moneyText(initialCurrency(request) === "ILS" ? q.packagingIls : q.packagingOriginal);
  });
  const [transportText, setTransportText] = useState(() => {
    const q = request.supplierQuotation;
    if (!q) return "";
    return moneyText(initialCurrency(request) === "ILS" ? q.inlandTransportIls : q.inlandTransportOriginal);
  });
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const inIls = initialCurrency(request) === "ILS";
    const next: Record<string, string> = {};
    for (const item of request.items) {
      const price = item.supplierPrice;
      next[item.id] = price ? moneyText(inIls ? price.lineTotalIls : price.lineTotalOriginal) : "";
    }
    return next;
  });

  const rate = parseLooseNumber(rateText);
  const packaging = parseAmount(packagingText);
  const transport = parseAmount(transportText);
  const parsedLines = request.items.map((item) => ({ itemId: item.id, lineTotal: parseAmount(prices[item.id] ?? "") }));
  const invalid =
    parsedLines.some((line) => line.lineTotal === "invalid") || packaging === "invalid" || transport === "invalid";
  const needsRate = currency === "USD";
  const hasAmount =
    parsedLines.some((line) => typeof line.lineTotal === "number") ||
    typeof packaging === "number" ||
    typeof transport === "number";
  const rateOk = !needsRate || !hasAmount || rate > 0;

  let preview: ReturnType<typeof applyManualQuotation> | null = null;
  if (!invalid && rateOk) {
    try {
      preview = applyManualQuotation(request, {
        currency,
        exchangeRateToIls: needsRate ? rate : 1,
        quotationNumber,
        quotationDate,
        packaging: typeof packaging === "number" ? packaging : null,
        transport: typeof transport === "number" ? transport : null,
        lines: parsedLines.map((line) => ({
          itemId: line.itemId,
          lineTotal: typeof line.lineTotal === "number" ? line.lineTotal : null,
        })),
      });
    } catch {
      preview = null;
    }
  }

  const changeCurrency = (next: Currency) => {
    if (next === currency) return;
    const liveRate = parseLooseNumber(rateText);
    const convert = (text: string) => {
      const amount = parseAmount(text);
      if (typeof amount !== "number" || !(liveRate > 0)) return text;
      const converted = next === "ILS" ? amount * liveRate : amount / liveRate;
      return String(Math.round(converted * 100) / 100);
    };
    if (liveRate > 0) {
      setPrices((prev) => Object.fromEntries(Object.entries(prev).map(([id, text]) => [id, convert(text)])));
      setPackagingText((text) => convert(text));
      setTransportText((text) => convert(text));
    }
    setCurrency(next);
  };

  const fetchRate = async () => {
    setRateBusy(true);
    setRateHint("");
    try {
      const live = await fetchUsdIlsRate();
      setRateText(String(live));
      setRateHint(d.ui.rateFetched);
    } catch {
      setRateHint(d.ui.rateFetchFailed);
    } finally {
      setRateBusy(false);
    }
  };

  const commit = () => {
    if (!preview) return;
    onCommit(preview.request, preview.priced);
  };

  return (
    <RfqModal title={d.ui.manualQuotation} onClose={onCancel} dir={dir} wide>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{d.ui.manualQuotationHint}</p>

        <Field group label={d.ui.pricesCurrency}>
          <Segmented<Currency>
            value={currency}
            onChange={changeCurrency}
            options={[
              { value: "ILS", label: d.ui.currencyIls },
              { value: "USD", label: d.ui.currencyUsd },
            ]}
          />
        </Field>

        {needsRate && (
          <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
            <Field label={fmt(d.ui.exchangeRateLabel, { currency: "USD" })} hint={d.ui.exchangeRateHint}>
              <TextInput dir="ltr" value={rateText} onChange={setRateText} placeholder="3.65" invalid={rateText !== "" && !(rate > 0)} />
            </Field>
            <Btn disabled={rateBusy} onClick={() => void fetchRate()}>
              {rateBusy ? d.ui.fetchingRate : d.ui.fetchTodayRate}
            </Btn>
          </div>
        )}
        {rateHint && <div className="text-xs text-slate-600">{rateHint}</div>}

        <div className="grid sm:grid-cols-2 gap-2">
          <Field label={d.ui.quotationNumber}>
            <TextInput dir="ltr" value={quotationNumber} onChange={setQuotationNumber} />
          </Field>
          <Field label={d.ui.quotationDate}>
            <TextInput dir="ltr" type="date" value={quotationDate} onChange={setQuotationDate} />
          </Field>
          <Field label={d.ui.packagingAmount} hint={d.ui.optionalAmount}>
            <TextInput dir="ltr" inputMode="decimal" value={packagingText} onChange={setPackagingText} placeholder="0" invalid={packaging === "invalid"} />
          </Field>
          <Field label={d.ui.transportAmount} hint={d.ui.optionalAmount}>
            <TextInput dir="ltr" inputMode="decimal" value={transportText} onChange={setTransportText} placeholder="0" invalid={transport === "invalid"} />
          </Field>
        </div>

        <ul className="grid gap-2">
          {request.items.map((item) => {
            const text = prices[item.id] ?? "";
            const amount = parseAmount(text);
            const saved = preview?.request.items.find((it) => it.id === item.id)?.supplierPrice;
            return (
              <li key={item.id} className="grid sm:grid-cols-[minmax(0,1fr)_11rem] gap-2 items-center rounded-md border border-slate-200 p-2">
                <div className="min-w-0">
                  <div className="text-sm">
                    <bdi className="font-semibold">{item.reference}</bdi>
                    <span> — {d.openingType[item.openingType]}</span>
                  </div>
                  <div className="text-xs text-slate-600">
                    <bdi dir="ltr">
                      {formatDimension(item.widthCm, item.unit)} × {formatDimension(item.heightCm, item.unit)} {item.unit}
                    </bdi>
                    {" · "}
                    {d.ui.quantity}: <b>{item.quantity}</b>
                    {item.location ? (
                      <>
                        {" · "}
                        <bdi>{item.location}</bdi>
                      </>
                    ) : null}
                  </div>
                </div>
                <Field label={d.ui.pricePerWindow} error={amount === "invalid" ? d.ui.invalidPrice : undefined}>
                  <TextInput
                    dir="ltr"
                    inputMode="decimal"
                    value={text}
                    placeholder="0"
                    invalid={amount === "invalid"}
                    onChange={(value) => setPrices((prev) => ({ ...prev, [item.id]: value }))}
                  />
                  {needsRate && saved ? (
                    <span className="text-xs text-slate-500" dir="ltr">
                      {moneyIls.format(saved.lineTotalIls)}
                    </span>
                  ) : null}
                </Field>
              </li>
            );
          })}
        </ul>

        {preview?.request.supplierQuotation && (
          <div className="text-sm">
            {d.ui.manualTotalIls}:{" "}
            <bdi className="font-semibold" dir="ltr">
              {moneyIls.format(preview.request.supplierQuotation.grandTotalIls ?? 0)}
            </bdi>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Btn onClick={onCancel}>{d.ui.cancel}</Btn>
          <Btn variant="success" disabled={!preview} onClick={commit}>
            {d.ui.save}
          </Btn>
        </div>
      </div>
    </RfqModal>
  );
}
