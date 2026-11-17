import type { Addon, FreeFormAddition, LineItem } from "../types";
import { roundMoney } from "../quote/pricing";
import { lineItemFromWindow, withSubtotal } from "../quote/windowLine";
import { isEklienSupplierName } from "../quote/eklienLogo";
import type { SupplierRequest } from "./types";

export type ConvertToQuoteOptions = {
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  /** Markup on supplier cost (not profit margin). 30 means sell = cost × 1.30 */
  markupPercent: number;
  /** Customer-facing amounts in ₪ (already final selling prices) */
  shippingIls: number;
  deliveryIls: number;
  laborIls: number;
  notes?: string;
};

export type ConvertToQuotePreview = {
  pricedCount: number;
  skippedRefs: string[];
  supplierItemsCostIls: number;
  itemsSellSubtotalIls: number;
  extrasIls: number;
  subtotalBeforeVatIls: number;
};

function costPerUnitIls(item: NonNullable<SupplierRequest["items"][number]["supplierPrice"]>, qty: number): number {
  const fromParts = item.unitPriceIls + item.screenPriceIls;
  if (fromParts > 0) return fromParts;
  const q = qty > 0 ? qty : 1;
  return item.lineTotalIls / q;
}

function sellUnitIls(cost: number, markupPercent: number): number {
  return roundMoney(cost * (1 + Math.max(0, markupPercent) / 100));
}

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function freeForm(name: string, amountIls: number): FreeFormAddition | null {
  if (!(amountIls > 0)) return null;
  return { id: newId(), name, price: String(roundMoney(amountIls)), qty: "1" };
}

/** Suggested shipping (₪) from supplier packaging + inland transport, with markup. */
export function suggestedShippingIls(req: Pick<SupplierRequest, "supplierQuotation">, markupPercent: number): number {
  const pack = req.supplierQuotation?.packagingIls ?? 0;
  const transport = req.supplierQuotation?.inlandTransportIls ?? 0;
  const cost = pack + transport;
  if (!(cost > 0)) return 0;
  return sellUnitIls(cost, markupPercent);
}

export function previewConvertToQuote(req: SupplierRequest, opts: Pick<ConvertToQuoteOptions, "markupPercent" | "shippingIls" | "deliveryIls" | "laborIls">): ConvertToQuotePreview {
  const skippedRefs: string[] = [];
  let supplierItemsCostIls = 0;
  let itemsSellSubtotalIls = 0;
  let pricedCount = 0;
  for (const item of req.items) {
    if (!item.supplierPrice) {
      skippedRefs.push(item.reference);
      continue;
    }
    pricedCount += 1;
    const qty = item.quantity > 0 ? item.quantity : 1;
    const cost = costPerUnitIls(item.supplierPrice, qty);
    supplierItemsCostIls = roundMoney(supplierItemsCostIls + cost * qty);
    itemsSellSubtotalIls = roundMoney(itemsSellSubtotalIls + sellUnitIls(cost, opts.markupPercent) * qty);
  }
  const extrasIls = roundMoney(Math.max(0, opts.shippingIls) + Math.max(0, opts.deliveryIls) + Math.max(0, opts.laborIls));
  return {
    pricedCount,
    skippedRefs,
    supplierItemsCostIls,
    itemsSellSubtotalIls,
    extrasIls,
    subtotalBeforeVatIls: roundMoney(itemsSellSubtotalIls + extrasIls),
  };
}

/**
 * Build customer quote lines from a priced supplier request.
 * Window lines use per-unit selling prices (supplier ₪ cost × markup). Extras become free-form additions.
 */
export function buildCustomerQuoteFromRfq(
  req: SupplierRequest,
  opts: ConvertToQuoteOptions,
  addons: Addon[] = []
): { items: LineItem[]; freeFormAdditions: FreeFormAddition[]; skippedRefs: string[]; preview: ConvertToQuotePreview } {
  const preview = previewConvertToQuote(req, opts);
  const items: LineItem[] = [];
  for (const item of req.items) {
    if (!item.supplierPrice) continue;
    const qty = item.quantity > 0 ? item.quantity : 1;
    const cost = costPerUnitIls(item.supplierPrice, qty);
    const unitSell = sellUnitIls(cost, opts.markupPercent);
    // Drop supplier costs from the window model copied into the customer quote.
    // Keep פרטים empty — RFQ notes / profile / manufacturer belong on the line name, not in details.
    const { supplierPrice, ...windowWithoutCost } = item;
    const eklien = isEklienSupplierName(req.supplier.name) || req.supplierProfileId === "sup-ekleindoor";
    const series = supplierPrice.profileSeries || item.frameFinish || item.reference;
    const profileName = eklien ? `EKLIEN · ${series}` : series;
    const line = lineItemFromWindow(
      { ...windowWithoutCost, notes: "" },
      addons,
      {
        profileName,
        unitPrice: "0",
        priceBasis: "per_unit",
        details: "",
      }
    );
    items.push(
      withSubtotal({
        ...line,
        qty: String(qty),
        manualUnitPrice: String(unitSell),
        priceBasis: "per_unit",
        customerDescription: item.customDescription || undefined,
      })
    );
  }

  const freeFormAdditions = [
    freeForm("משלוח", opts.shippingIls),
    freeForm("הובלה", opts.deliveryIls),
    freeForm("עלות עבודה", opts.laborIls),
  ].filter((x): x is FreeFormAddition => !!x);

  return { items, freeFormAdditions, skippedRefs: preview.skippedRefs, preview };
}
