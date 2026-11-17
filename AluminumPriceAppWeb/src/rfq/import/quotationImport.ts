import { canonicalCurrency, roundMoney } from "../../quote/pricing";
import type { RfqItem, RfqItemSupplierPrice, SupplierQuotationInfo, SupplierRequest } from "../types";
import { ImportFileError, parseImportBytes } from "./importer";
import type { Sheet } from "./xlsx";

export type QuotationLine = {
  reference: string;
  productType: string;
  profileSeries: string;
  widthMm: number | null;
  heightMm: number | null;
  quantity: number | null;
  unitPriceOriginal: number;
  screenPriceOriginal: number;
  lineTotalOriginal: number;
  remarks: string;
  currency: string;
};

export type QuotationSummary = {
  quotationNumber: string;
  quotationDate: string;
  customer: string;
  project: string;
  currency: string;
  validityDays: number | null;
  productSubtotalOriginal: number | null;
  packagingOriginal: number | null;
  inlandTransportOriginal: number | null;
  grandTotalOriginal: number | null;
};

export type ParsedSupplierQuotation = {
  lines: QuotationLine[];
  summary: QuotationSummary;
  currency: string;
  itemsSheetName: string;
};

export type QuotationMatchResult = {
  request: SupplierRequest;
  matched: string[];
  unmatchedFile: string[];
  unmatchedRequest: string[];
};

const num = (v: string | undefined): number | null => {
  if (v == null || !String(v).trim()) return null;
  const cleaned = String(v).replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : null;
};

const cell = (row: string[], idx: number | undefined): string => (idx == null ? "" : String(row[idx] ?? "").trim());

function headerMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/\s+/g, "_");
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

function pick(map: Map<string, number>, ...aliases: string[]): number | undefined {
  for (const a of aliases) {
    const i = map.get(a.toLowerCase());
    if (i != null) return i;
  }
  return undefined;
}

function findItemsSheet(sheets: Sheet[]): Sheet {
  const byName = sheets.find((s) => /^items$/i.test(s.name.trim()));
  if (byName) return byName;
  const withRef = sheets.find((s) => {
    const hdr = s.rows.find((r) => r.some((c) => c.trim())) ?? [];
    const map = headerMap(hdr);
    return pick(map, "item_reference", "reference") != null;
  });
  if (withRef) return withRef;
  throw new ImportFileError("noRows", "no Items sheet with item_reference");
}

function findSummarySheet(sheets: Sheet[]): Sheet | undefined {
  return sheets.find((s) => /^quotation$/i.test(s.name.trim()));
}

function parseSummarySheet(sheet: Sheet | undefined, fallbackCurrency: string): QuotationSummary {
  const empty: QuotationSummary = {
    quotationNumber: "",
    quotationDate: "",
    customer: "",
    project: "",
    currency: fallbackCurrency,
    validityDays: null,
    productSubtotalOriginal: null,
    packagingOriginal: null,
    inlandTransportOriginal: null,
    grandTotalOriginal: null,
  };
  if (!sheet) return empty;
  const values = new Map<string, string>();
  for (const row of sheet.rows) {
    const key = String(row[0] ?? "")
      .trim()
      .toLowerCase();
    if (!key || key === "field") continue;
    values.set(key, String(row[1] ?? "").trim());
  }
  const currency = canonicalCurrency(values.get("currency") || fallbackCurrency) || fallbackCurrency;
  return {
    quotationNumber: values.get("quotation_number") ?? "",
    quotationDate: values.get("quotation_date") ?? "",
    customer: values.get("customer") ?? "",
    project: values.get("project") ?? "",
    currency,
    validityDays: num(values.get("validity_days")),
    productSubtotalOriginal: num(values.get("quoted_product_subtotal_usd") ?? values.get("product_subtotal")),
    packagingOriginal: num(values.get("packaging_usd") ?? values.get("packaging")),
    inlandTransportOriginal: num(values.get("inland_transport_usd") ?? values.get("inland_transport")),
    grandTotalOriginal: num(values.get("quoted_grand_total_usd") ?? values.get("grand_total")),
  };
}

function parseLines(sheet: Sheet): QuotationLine[] {
  const headerIdx = sheet.rows.findIndex((r) => r.some((c) => c.trim()));
  if (headerIdx < 0) return [];
  const map = headerMap(sheet.rows[headerIdx]);
  const refCol = pick(map, "item_reference", "reference", "ref");
  if (refCol == null) throw new ImportFileError("readFailed", "missing item_reference column");
  const unitCol = pick(map, "quoted_unit_price_usd", "unit_price_usd", "unit_price", "quoted_unit_price");
  const screenCol = pick(map, "screen_price_usd", "screen_price");
  const totalCol = pick(map, "line_total_usd", "line_total");
  const currencyCol = pick(map, "currency");
  const productCol = pick(map, "product_type");
  const profileCol = pick(map, "profile_series");
  const widthCol = pick(map, "width_mm", "width");
  const heightCol = pick(map, "height_mm", "height");
  const qtyCol = pick(map, "quantity", "qty");
  const remarksCol = pick(map, "remarks", "notes");

  const lines: QuotationLine[] = [];
  for (let i = headerIdx + 1; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    const reference = cell(row, refCol);
    if (!reference) continue;
    const currency = canonicalCurrency(cell(row, currencyCol) || "USD") || "USD";
    const unitPriceOriginal = num(cell(row, unitCol)) ?? 0;
    const screenPriceOriginal = num(cell(row, screenCol)) ?? 0;
    let lineTotalOriginal = num(cell(row, totalCol));
    if (lineTotalOriginal == null) lineTotalOriginal = unitPriceOriginal + screenPriceOriginal;
    lines.push({
      reference,
      productType: cell(row, productCol),
      profileSeries: cell(row, profileCol),
      widthMm: num(cell(row, widthCol)),
      heightMm: num(cell(row, heightCol)),
      quantity: num(cell(row, qtyCol)),
      unitPriceOriginal,
      screenPriceOriginal,
      lineTotalOriginal,
      remarks: cell(row, remarksCol),
      currency,
    });
  }
  return lines;
}

/** Parse a supplier quotation CSV/XLSX (Items + optional Quotation summary). */
export function parseSupplierQuotationFile(fileName: string, bytes: Uint8Array): ParsedSupplierQuotation {
  const file = parseImportBytes(fileName, bytes);
  const itemsSheet = findItemsSheet(file.sheets);
  const lines = parseLines(itemsSheet);
  if (!lines.length) throw new ImportFileError("noRows", "no quotation lines");
  const currency = canonicalCurrency(lines[0]?.currency || "USD") || "USD";
  const summary = parseSummarySheet(findSummarySheet(file.sheets), currency);
  if (!summary.currency) summary.currency = currency;
  return { lines, summary, currency: summary.currency || currency, itemsSheetName: itemsSheet.name };
}

export function normalizeReferenceKey(ref: string): string {
  return ref.trim().toUpperCase().replace(/\s+/g, "");
}

function toIls(amount: number, rate: number): number {
  return roundMoney(amount * rate);
}

function priceFromLine(line: QuotationLine, rate: number): RfqItemSupplierPrice {
  return {
    currency: line.currency || "USD",
    unitPriceOriginal: line.unitPriceOriginal,
    screenPriceOriginal: line.screenPriceOriginal,
    lineTotalOriginal: line.lineTotalOriginal,
    unitPriceIls: toIls(line.unitPriceOriginal, rate),
    screenPriceIls: toIls(line.screenPriceOriginal, rate),
    lineTotalIls: toIls(line.lineTotalOriginal, rate),
    profileSeries: line.profileSeries || undefined,
    remarks: line.remarks || undefined,
  };
}

function buildQuotationInfo(
  summary: QuotationSummary,
  currency: string,
  rate: number,
  sourceFileName: string,
  now: number
): SupplierQuotationInfo {
  const convert = (v: number | null) => (v == null ? null : toIls(v, rate));
  return {
    quotationNumber: summary.quotationNumber,
    quotationDate: summary.quotationDate,
    currency,
    exchangeRateToIls: rate,
    productSubtotalOriginal: summary.productSubtotalOriginal,
    packagingOriginal: summary.packagingOriginal,
    inlandTransportOriginal: summary.inlandTransportOriginal,
    grandTotalOriginal: summary.grandTotalOriginal,
    productSubtotalIls: convert(summary.productSubtotalOriginal),
    packagingIls: convert(summary.packagingOriginal),
    inlandTransportIls: convert(summary.inlandTransportOriginal),
    grandTotalIls: convert(summary.grandTotalOriginal),
    importedAt: now,
    sourceFileName,
  };
}

/**
 * Match quotation lines onto request items by reference (W-01…).
 * Converts original currency amounts to ILS with the given rate and marks the request done when every item matches.
 */
export function applyQuotationToRequest(
  req: SupplierRequest,
  parsed: ParsedSupplierQuotation,
  opts: { exchangeRateToIls: number; sourceFileName: string; markDoneIfComplete?: boolean; now?: number }
): QuotationMatchResult {
  const rate = opts.exchangeRateToIls;
  if (!(rate > 0)) throw new Error("exchange rate must be positive");
  const now = opts.now ?? Date.now();
  const byRef = new Map<string, QuotationLine>();
  for (const line of parsed.lines) {
    const key = normalizeReferenceKey(line.reference);
    if (!byRef.has(key)) byRef.set(key, line);
  }

  const matched: string[] = [];
  const used = new Set<string>();
  const items: RfqItem[] = req.items.map((item) => {
    const key = normalizeReferenceKey(item.reference);
    const line = byRef.get(key);
    if (!line) return item;
    matched.push(item.reference);
    used.add(key);
    return { ...item, supplierPrice: priceFromLine(line, rate) };
  });

  const unmatchedFile = parsed.lines.filter((l) => !used.has(normalizeReferenceKey(l.reference))).map((l) => l.reference);
  const unmatchedRequest = items.filter((it) => !it.supplierPrice).map((it) => it.reference);
  // Mark done when at least one price was applied (quotation received). Full match is preferred but partial still counts as received.
  const markDone = opts.markDoneIfComplete === false ? matched.length > 0 && unmatchedRequest.length === 0 : matched.length > 0;

  const request: SupplierRequest = {
    ...req,
    items,
    supplierQuotation: buildQuotationInfo(parsed.summary, parsed.currency, rate, opts.sourceFileName, now),
    quotationStatus: markDone ? "done" : req.quotationStatus,
  };

  return { request, matched, unmatchedFile, unmatchedRequest };
}

export function requestHasSupplierPrices(req: Pick<SupplierRequest, "items" | "supplierQuotation" | "quotationStatus">): boolean {
  return req.quotationStatus === "done" || !!req.supplierQuotation || req.items.some((it) => it.supplierPrice != null);
}

/** Line totals are already for the quoted row (quantity included by the supplier). */
export function sumSupplierCostsIls(req: Pick<SupplierRequest, "items" | "supplierQuotation">): {
  itemsIls: number;
  packagingIls: number;
  transportIls: number;
  grandIls: number;
} {
  const itemsIls = roundMoney(req.items.reduce((s, it) => s + (it.supplierPrice?.lineTotalIls ?? 0), 0));
  const packagingIls = req.supplierQuotation?.packagingIls ?? 0;
  const transportIls = req.supplierQuotation?.inlandTransportIls ?? 0;
  const fromMeta = req.supplierQuotation?.grandTotalIls;
  return {
    itemsIls,
    packagingIls,
    transportIls,
    grandIls: fromMeta != null ? fromMeta : roundMoney(itemsIls + packagingIls + transportIls),
  };
}
