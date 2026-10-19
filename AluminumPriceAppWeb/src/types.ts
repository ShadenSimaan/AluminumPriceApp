// FILE: src/types.ts

/** Document kind for PDF / saved file identity */
export type DocumentType = "quote" | "payment_request";

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  quote: "הצעת מחיר",
  payment_request: "חשבון עסקה",
};

export function documentTypeLabel(type: DocumentType | undefined): string {
  return DOCUMENT_TYPE_LABELS[type === "payment_request" ? "payment_request" : "quote"];
}

export function documentTypeFolderName(type: DocumentType | undefined): string {
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
  location?: string;
  details?: string;
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
  showTotals?: boolean;
  totals: { sub: number; tax: number; grand: number };
};

export type AppUIState = {
  tab: "quote" | "customers";
  settingsOpen: boolean;
  profilesSettingsOpen: boolean;
};

export type AppCurrentState = {
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
};
