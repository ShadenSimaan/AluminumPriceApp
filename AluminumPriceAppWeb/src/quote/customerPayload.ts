import type { AppCurrentState, FreeFormAddition, LineItem, Manufacturer, Profile } from "../types";
import type { PdfFreeFormAddition, PdfLineItem, PdfManufacturer, PdfQuotePayload } from "../pdfExporter";
import type { RfqItem } from "../rfq/types";
import { lineManufacturer } from "./manufacturers";

/** Fields a customer document is allowed to contain. Supplier cost, markup and exchange rate are not among them. */
const LINE_KEYS = [
  "id",
  "widthCm",
  "heightCm",
  "qty",
  "location",
  "details",
  "unitPrice",
  "manualUnitPrice",
  "priceBasis",
  "customerDescription",
  "profileName",
  "subtotal",
] as const;

function customerConfiguration(configuration: RfqItem | undefined): RfqItem | undefined {
  if (!configuration) return undefined;
  const copy = { ...configuration };
  return copy;
}

export function toCustomerPdfItem(item: LineItem): PdfLineItem {
  const safe: PdfLineItem = {
    id: item.id,
    widthCm: item.widthCm,
    heightCm: item.heightCm,
    qty: item.qty,
    location: item.location,
    details: item.details,
    unitPrice: item.unitPrice,
    manualUnitPrice: item.manualUnitPrice,
    priceBasis: item.priceBasis,
    customerDescription: item.customerDescription,
    profileName: item.profileName,
    subtotal: item.subtotal,
    addons: (item.addons ?? []).map((addon) => ({ name: addon.name, price: addon.price, checked: addon.checked })),
    configuration: customerConfiguration(item.configuration),
  };
  for (const key of Object.keys(item) as (keyof LineItem)[]) {
    if (key === "addons" || key === "configuration" || key === "configurationNeedsReview") continue;
    if (!(LINE_KEYS as readonly string[]).includes(key)) {
      delete (safe as unknown as Record<string, unknown>)[key as string];
    }
  }
  return safe;
}

export function toCustomerAddition(add: FreeFormAddition): PdfFreeFormAddition {
  return { id: add.id, name: add.name, price: add.price, qty: add.qty };
}

function toPdfManufacturer(m: Manufacturer | undefined): PdfManufacturer | undefined {
  return m ? { id: m.id, name: m.name, logoUrl: m.logoUrl } : undefined;
}

export function toCustomerPdfPayload(
  current: AppCurrentState,
  extra: {
    pdfSaveFolder?: string;
    dimensionUnit?: "cm" | "mm";
    pdfDateMs?: number;
    quoteUnchanged?: boolean;
    profiles?: Profile[];
    manufacturers?: Manufacturer[];
  }
): PdfQuotePayload {
  const profiles = extra.profiles ?? [];
  const manufacturers = extra.manufacturers ?? [];
  return {
    title: current.title,
    documentType: current.documentType,
    documentNumber: current.documentNumber,
    quoteNumber: current.quoteNumber,
    customerName: current.customerName,
    customerPhone: current.customerPhone,
    customerEmail: current.customerEmail,
    notes: current.notes,
    taxPercentText: current.taxPercentText,
    discountPercentText: current.discountPercentText,
    validityText: current.validityText,
    paymentTerms: current.paymentTerms,
    installationTerms: current.installationTerms,
    items: current.items.map((item) => ({
      ...toCustomerPdfItem(item),
      manufacturer: toPdfManufacturer(lineManufacturer(item, profiles, manufacturers)),
    })),
    freeFormAdditions: current.freeFormAdditions.map(toCustomerAddition),
    pdfSaveFolder: extra.pdfSaveFolder,
    dimensionUnit: extra.dimensionUnit,
    showTotals: current.showTotals,
    includeProductDetails: current.includeProductDetails,
    pdfDateMs: extra.pdfDateMs,
    quoteUnchanged: extra.quoteUnchanged,
  };
}
