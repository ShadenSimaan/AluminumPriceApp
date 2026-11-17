// FILE: src/types.ts
import type { RfqItem, RfqSettings, SupplierRequest } from "./rfq/types";
import type { PriceBasis } from "./quote/pricing";

/** Document kind for PDF / saved file identity (priced documents only) */
export type DocumentType = "quote" | "payment_request";

/** Every kind of exported PDF; supplier RFQs live in their own collection and are never quotes. */
export type PdfDocumentKind = DocumentType | "supplier_rfq";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  quote: "הצעת מחיר",
  payment_request: "חשבון עסקה",
};

export const SUPPLIER_RFQ_LABEL = "בקשה להצעת מחיר מספק";

export function documentTypeLabel(type: DocumentType | undefined): string {
  return DOCUMENT_TYPE_LABELS[type === "payment_request" ? "payment_request" : "quote"];
}

export function documentTypeFolderName(type: PdfDocumentKind | undefined): string {
  if (type === "supplier_rfq") return SUPPLIER_RFQ_LABEL;
  return documentTypeLabel(type);
}

export function normalizeDocumentType(raw: unknown): DocumentType {
  return raw === "payment_request" ? "payment_request" : "quote";
}

export type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: number;
};

export type Profile = {
  id: string;
  name: string;
  unitPrice: number; // price per m²
};

export type Addon = {
  id: string;
  name: string;
  price: string; // text input (per item)
  checked: boolean;
};

export type FreeFormAddition = {
  id: string;
  name: string;
  price: string; // text input
  qty: string; // text input
};

/** Shown in the profile column for free-form additions (quote table and PDF). */
export const ADDITION_PROFILE_LABEL = "תוספת";

export type LineItem = {
  id: string;
  widthCm: string; // text input
  heightCm: string; // text input
  qty: string; // text input
  profileId?: string;
  profileName?: string; // <-- חשוב בשביל ה-PDF והטבלה
  unitPrice: string; // from profile by default but editable (price per m²)
  /** When set, used as price per unit directly (no formula). Addons still added. */
  manualUnitPrice?: string;
  /** per_m2 is the legacy area rate. per_unit charges manualUnitPrice, or unitPrice, once per piece. */
  priceBasis?: PriceBasis;
  location?: string;
  details?: string;
  /** Customer-facing product name. Not a supplier cost. */
  customerDescription?: string;
  /** Same window model used by בקשה לספק, so the drawing stays consistent. */
  configuration?: RfqItem;
  /** Internal only: the drawing is a source image that was not converted into panels. */
  configurationNeedsReview?: boolean;
  addons: Addon[];
  subtotal: number; // computed
};

export type Quote = {
  id: string;
  customerId: string;
  title: string; // mirrors document type label (legacy / display)
  /** quote = הצעת מחיר; payment_request = חשבון עסקה */
  documentType?: DocumentType;
  /** Running number for חשבון עסקה only; assigned on first save as that type */
  documentNumber?: number;
  date: number; // epoch ms
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  profilesSignature?: string;
  items: LineItem[];
  freeFormAdditions?: FreeFormAddition[];
  taxPercent: number; // accepts 0.18 or 18
  /** Percent of the subtotal, taken before VAT. Empty/0 means no discount. */
  discountPercent?: number;
  validityText?: string;
  paymentTerms?: string;
  installationTerms?: string;
  /** Running number for הצעת מחיר. Independent from חשבון עסקה. */
  quoteNumber?: number;
  showTotals?: boolean;
  totals: { sub: number; tax: number; grand: number };
};

export type AppUIState = {
  tab: "quote" | "customers" | "rfq";
  settingsOpen: boolean;
  profilesSettingsOpen: boolean;
};

export type AppCurrentState = {
  /** Saved quote this document updates; unset until first save (a customer can own many quotes) */
  quoteId?: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  customerNotes: string;
  title: string;
  documentType: DocumentType;
  /** Set when current doc is/was a numbered חשבון עסקה */
  documentNumber?: number;
  items: LineItem[];
  freeFormAdditions: FreeFormAddition[]; // תוספות חופשיות
  taxPercentText: string;
  discountPercentText: string;
  validityText: string;
  paymentTerms: string;
  installationTerms: string;
  quoteNumber?: number;
  notes: string;
  /** When false, don't show or calculate overall totals (subtotal/מע״מ/grand) in UI & PDF box */
  showTotals: boolean;
};

/** Dimension unit for width/height (stored internally in cm) */
export type DimensionUnit = "cm" | "mm";

export type AppState = {
  customers: Customer[];
  quotes: Quote[];
  profiles: Profile[];
  addons: Addon[]; // Global addons that can be managed in settings
  current: AppCurrentState;
  ui: AppUIState;
  pdfSaveFolder?: string; // Custom folder path for PDF exports (optional, defaults to Desktop)
  dimensionUnit?: DimensionUnit; // ס״מ or מ״מ – display/input only; data always in cm
  /** Next serial for חשבון עסקה (increments when a new number is allocated) */
  nextPaymentRequestNumber?: number;
  /** Saved supplier requests for quotation (separate from priced quotes) */
  supplierRequests: SupplierRequest[];
  /** RFQ currently being edited (persisted so work survives restarts) */
  rfqDraft: SupplierRequest | null;
  /** Next serial for supplier RFQs; independent from payment-request numbering */
  nextSupplierRequestNumber: number;
  /** Next serial for הצעת מחיר */
  nextQuoteNumber: number;
  rfqSettings: RfqSettings;
};
