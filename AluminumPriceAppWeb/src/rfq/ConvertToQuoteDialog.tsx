import { useMemo, useState } from "react";
import type { RfqLanguage, SupplierRequest } from "./types";
import { dict, dirOf, fmt } from "./i18n";
import { parseLooseNumber, roundMoney } from "../quote/pricing";
import { previewConvertToQuote, suggestedShippingIls, type ConvertToQuoteOptions } from "./toCustomerQuote";
import { Btn, Field, RfqModal, TextInput, TextArea } from "./ui";

const moneyIls = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });

export default function ConvertToQuoteDialog({
  lang,
  draft,
  onCancel,
  onConfirm,
  onImportPrices,
  onEnterPrices,
}: {
  lang: RfqLanguage;
  draft: SupplierRequest;
  onCancel: () => void;
  onConfirm: (opts: ConvertToQuoteOptions) => void;
  onImportPrices: () => void;
  onEnterPrices: () => void;
}) {
  const d = dict(lang);
  const dir = dirOf(lang);
  const [customerName, setCustomerName] = useState(draft.projectName.trim() || "");
  const [customerPhone, setCustomerPhone] = useState(draft.company.phone || "");
  const [customerEmail, setCustomerEmail] = useState(draft.company.email || "");
  const [markupText, setMarkupText] = useState("30");
  const [shippingText, setShippingText] = useState(() => {
    const suggested = suggestedShippingIls(draft, 30);
    return suggested > 0 ? String(suggested) : "";
  });
  const [deliveryText, setDeliveryText] = useState("");
  const [laborText, setLaborText] = useState("");
  const [notes, setNotes] = useState(draft.notes || "");

  const markupPercent = parseLooseNumber(markupText);
  const shippingIls = Math.max(0, parseLooseNumber(shippingText));
  const deliveryIls = Math.max(0, parseLooseNumber(deliveryText));
  const laborIls = Math.max(0, parseLooseNumber(laborText));

  const preview = useMemo(
    () => previewConvertToQuote(draft, { markupPercent, shippingIls, deliveryIls, laborIls }),
    [draft, markupPercent, shippingIls, deliveryIls, laborIls]
  );

  const canSubmit = customerName.trim().length > 0 && preview.pricedCount > 0 && markupPercent >= 0;

  const fillSuggestedShipping = () => {
    const suggested = suggestedShippingIls(draft, markupPercent);
    setShippingText(suggested > 0 ? String(suggested) : "");
  };

  return (
    <RfqModal title={d.ui.convertToQuote} onClose={onCancel} dir={dir} wide>
      <div className="grid gap-4">
        <p className="text-sm text-slate-600">{d.ui.convertToQuoteHint}</p>

        <div className="rounded-md border border-slate-200 p-3 grid gap-2">
          <div className="text-sm font-medium text-slate-800">{d.ui.priceSource}</div>
          <p className="text-sm text-slate-600">{d.ui.priceSourceHint}</p>
          <div className="flex flex-wrap gap-2">
            <Btn onClick={onImportPrices}>{d.ui.importQuotation}</Btn>
            <Btn onClick={onEnterPrices}>{d.ui.manualQuotation}</Btn>
          </div>
          {preview.pricedCount === 0 && <div className="text-sm text-amber-800">{d.ui.convertNeedsPrices}</div>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label={d.ui.customerName} className="sm:col-span-2">
            <TextInput value={customerName} onChange={setCustomerName} invalid={!customerName.trim()} />
          </Field>
          <Field label={d.ui.phone}>
            <TextInput dir="ltr" value={customerPhone} onChange={setCustomerPhone} />
          </Field>
          <Field label={d.ui.email}>
            <TextInput dir="ltr" value={customerEmail} onChange={setCustomerEmail} />
          </Field>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label={d.ui.markupPercent} hint={d.ui.markupPercentHint}>
            <TextInput dir="ltr" value={markupText} onChange={setMarkupText} placeholder="30" />
          </Field>
          <Field label={d.ui.shippingIls} hint={d.ui.shippingIlsHint}>
            <div className="flex gap-1">
              <TextInput dir="ltr" value={shippingText} onChange={setShippingText} placeholder="0" />
              <Btn small onClick={fillSuggestedShipping} title={d.ui.useSuggestedShipping}>
                {d.ui.suggest}
              </Btn>
            </div>
          </Field>
          <Field label={d.ui.deliveryIls}>
            <TextInput dir="ltr" value={deliveryText} onChange={setDeliveryText} placeholder="0" />
          </Field>
          <Field label={d.ui.laborIls}>
            <TextInput dir="ltr" value={laborText} onChange={setLaborText} placeholder="0" />
          </Field>
        </div>

        <Field label={d.ui.quoteNotes}>
          <TextArea rows={3} value={notes} onChange={setNotes} />
        </Field>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm grid gap-1">
          <div>
            {d.ui.pricedItems}: <b>{preview.pricedCount}</b>
            {preview.skippedRefs.length > 0 && (
              <span className="text-amber-800 ms-2">
                {fmt(d.ui.skippedUnpriced, { n: preview.skippedRefs.length })}: <bdi>{preview.skippedRefs.join(", ")}</bdi>
              </span>
            )}
          </div>
          <div>
            {d.ui.supplierCostIls}: <bdi dir="ltr">{moneyIls.format(preview.supplierItemsCostIls)}</bdi>
          </div>
          <div>
            {fmt(d.ui.afterMarkup, { pct: roundMoney(markupPercent) })}:{" "}
            <bdi className="font-semibold" dir="ltr">
              {moneyIls.format(preview.itemsSellSubtotalIls)}
            </bdi>
          </div>
          {preview.extrasIls > 0 && (
            <div>
              {d.ui.extrasIls}: <bdi dir="ltr">{moneyIls.format(preview.extrasIls)}</bdi>
            </div>
          )}
          <div>
            {d.ui.subtotalBeforeVat}:{" "}
            <bdi className="font-bold" dir="ltr">
              {moneyIls.format(preview.subtotalBeforeVatIls)}
            </bdi>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Btn onClick={onCancel}>{d.ui.cancel}</Btn>
          <Btn
            variant="success"
            disabled={!canSubmit}
            onClick={() =>
              onConfirm({
                customerName: customerName.trim(),
                customerPhone: customerPhone.trim() || undefined,
                customerEmail: customerEmail.trim() || undefined,
                markupPercent,
                shippingIls,
                deliveryIls,
                laborIls,
                notes: notes.trim() || undefined,
              })
            }
          >
            {d.ui.createCustomerQuote}
          </Btn>
        </div>
      </div>
    </RfqModal>
  );
}
