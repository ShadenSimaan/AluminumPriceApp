// Shared money rules for quotations. Supplier costs never enter this module's customer totals.

export type PriceBasis = "per_m2" | "per_unit";

export type PricedAddon = { price: string; checked: boolean };

export type PricedLine = {
  widthCm?: string;
  heightCm?: string;
  qty?: string;
  unitPrice?: string;
  manualUnitPrice?: string;
  priceBasis?: PriceBasis;
  addons?: PricedAddon[];
};

export function parseLooseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

/** Agorot. Display formatters may still round to whole shekels. */
export function roundMoney(n: number): number {
  if (!isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Accepts 18 or 0.18. Zero stays zero. */
export function normalizeTaxPercent(n: number): number {
  if (!isFinite(n) || n === 0) return 0;
  if (n > 1) return n / 100;
  return n;
}

export function priceBasisOf(line: PricedLine): PriceBasis {
  if (line.priceBasis === "per_unit" || line.priceBasis === "per_m2") return line.priceBasis;
  return (line.manualUnitPrice ?? "").trim() ? "per_unit" : "per_m2";
}

export function addonSum(line: PricedLine): number {
  return (line.addons ?? []).reduce((sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0), 0);
}

/**
 * Customer price for one unit, before VAT.
 * per_m2 uses width × height (cm) / 10_000 × the rate, unless a manual unit price is set.
 * per_unit uses the manual price, or the unit price field when no manual price is set.
 * The per-m² rate is never multiplied again by quantity here.
 */
export function lineUnitPrice(line: PricedLine): number {
  const addons = addonSum(line);
  const basis = priceBasisOf(line);
  const manual = (line.manualUnitPrice ?? "").trim();
  if (basis === "per_unit") {
    const unit = manual ? parseLooseNumber(manual) : parseLooseNumber(line.unitPrice);
    return unit + addons;
  }
  if (manual) return parseLooseNumber(manual) + addons;
  const area = (parseLooseNumber(line.widthCm) * parseLooseNumber(line.heightCm)) / 10000;
  return area * parseLooseNumber(line.unitPrice) + addons;
}

export function lineQuantity(line: PricedLine): number {
  return Math.max(0, parseLooseNumber(line.qty));
}

export function lineTotal(line: PricedLine): number {
  return lineUnitPrice(line) * lineQuantity(line);
}

/** A profile offered at a rate per square metre, before any window size is entered. */
export function isOpenAreaRate(line: PricedLine): boolean {
  return (
    priceBasisOf(line) === "per_m2" &&
    !(line.manualUnitPrice ?? "").trim() &&
    parseLooseNumber(line.widthCm) === 0 &&
    parseLooseNumber(line.heightCm) === 0 &&
    parseLooseNumber(line.unitPrice) > 0
  );
}

export type QuoteMoney = {
  sub: number;
  discountRate: number;
  discount: number;
  net: number;
  taxRate: number;
  tax: number;
  grand: number;
};

/** Discount is a percent of the subtotal, taken before VAT. It is not a markup. */
export function quoteMoney(input: {
  lines: PricedLine[];
  freeForm?: { price: string; qty: string }[];
  taxPercentText: string;
  discountPercentText?: string;
}): QuoteMoney {
  const subLines = input.lines.reduce((sum, line) => sum + lineTotal(line), 0);
  const subFree = (input.freeForm ?? []).reduce(
    (sum, add) => sum + parseLooseNumber(add.price) * Math.max(0, parseLooseNumber(add.qty)),
    0
  );
  const sub = roundMoney(subLines + subFree);
  const rawDiscount = parseLooseNumber(input.discountPercentText ?? "");
  const discountRate = Math.min(100, Math.max(0, rawDiscount)) / 100;
  const discount = roundMoney(sub * discountRate);
  const net = roundMoney(sub - discount);
  const taxRate = normalizeTaxPercent(parseLooseNumber(input.taxPercentText));
  const tax = roundMoney(net * taxRate);
  const grand = roundMoney(net + tax);
  return { sub, discountRate, discount, net, taxRate, tax, grand };
}

export type SupplierTaxTreatment = "exclusive" | "inclusive" | "not_stated";

/**
 * Markup on cost, not profit margin.
 * Customer unit before VAT = supplier cost before VAT × exchange rate × (1 + markup/100).
 * An inclusive supplier price is divided by (1 + VAT) once, before the markup.
 */
export function customerUnitFromSupplierCost(input: {
  supplierUnitCost: number | null;
  extraPerUnit: number | null;
  markupPercent: number;
  exchangeRate: number;
  taxTreatment: SupplierTaxTreatment;
  /** Decimal, e.g. 0.18. Used only when the supplier price already includes tax. */
  vatRate: number;
}): { costBeforeVat: number | null; customerUnit: number | null; warning: string | null } {
  if (input.supplierUnitCost == null || !isFinite(input.supplierUnitCost)) {
    return { costBeforeVat: null, customerUnit: null, warning: "missing_cost" };
  }
  const extra = input.extraPerUnit ?? 0;
  const gross = input.supplierUnitCost + extra;
  if (input.taxTreatment === "inclusive") {
    if (!(input.vatRate > 0)) {
      return { costBeforeVat: null, customerUnit: null, warning: "inclusive_tax_without_vat_rate" };
    }
    const costBeforeVat = roundMoney(gross / (1 + input.vatRate));
    return {
      costBeforeVat,
      customerUnit: roundMoney(costBeforeVat * input.exchangeRate * (1 + input.markupPercent / 100)),
      warning: null,
    };
  }
  const costBeforeVat = roundMoney(gross);
  return {
    costBeforeVat,
    customerUnit: roundMoney(costBeforeVat * input.exchangeRate * (1 + input.markupPercent / 100)),
    warning: input.taxTreatment === "not_stated" ? "supplier_tax_not_stated" : null,
  };
}

const CURRENCY_ALIASES: Record<string, string> = {
  "₪": "ILS",
  NIS: "ILS",
  "ש\"ח": "ILS",
  שח: "ILS",
  ILS: "ILS",
  USD: "USD",
  US$: "USD",
  $: "USD",
  EUR: "EUR",
  "€": "EUR",
  CNY: "CNY",
  RMB: "CNY",
  GBP: "GBP",
};

export function canonicalCurrency(raw: string | null | undefined): string {
  const text = (raw ?? "").trim().toUpperCase();
  if (!text) return "";
  if (CURRENCY_ALIASES[text]) return CURRENCY_ALIASES[text];
  if (text.includes("USD") || text.includes("US$") || text === "$") return "USD";
  if (text.includes("EUR") || text.includes("€")) return "EUR";
  if (text.includes("ILS") || text.includes("₪") || text.includes("NIS")) return "ILS";
  return text;
}

export function currenciesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = canonicalCurrency(a);
  const right = canonicalCurrency(b);
  return Boolean(left) && left === right;
}
