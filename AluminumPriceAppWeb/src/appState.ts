// Default app state and tolerant normalization of saved data (localStorage / Tauri data file).
/* eslint-disable @typescript-eslint/no-explicit-any -- saved data from older versions is untyped */
import type { AppState, Profile, Quote } from "./types";
import { documentTypeLabel, normalizeDocumentType } from "./types";
import { DEFAULT_RFQ_SETTINGS, normalizeRfqSlice } from "./rfq/rfqState";

export function uuid() {
  if ((crypto as any)?.randomUUID) return crypto.randomUUID();
  const buf = new Uint8Array(16);
  (crypto as any).getRandomValues?.(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return [...buf].map(toHex).join("");
}

export const defaultProfiles: Profile[] = [
  { id: uuid(), name: "1700 זכוכית ורשת", unitPrice: 1100 },
  { id: uuid(), name: "1700 זכוכית ורשת ותריס אור", unitPrice: 2200 },

  { id: uuid(), name: "7300 זכוכית ורשת", unitPrice: 1800 },
  { id: uuid(), name: "7300 זכוכית ורשת ותריס אור", unitPrice: 2600 },

  { id: uuid(), name: "4300 זכוכית ורשת", unitPrice: 1100 },
  { id: uuid(), name: "4300 זכוכית ורשת ותריס אור", unitPrice: 2300 },

  { id: uuid(), name: "7600 זכוכית", unitPrice: 3000 },
  { id: uuid(), name: "7600 זכוכית ותריס אור", unitPrice: 3800 },

  { id: uuid(), name: "5600 כנף ורשת", unitPrice: 1700 },
  { id: uuid(), name: "5600 כנף ורשת ותריס אור", unitPrice: 2700 },
];

export const defaultAddonsPreset = [
  { id: uuid(), name: "מנגנון דרי קיף", price: "650", checked: false },
  { id: uuid(), name: "מנוע חשמלי סמפי/נייס", price: "800", checked: false },
  { id: uuid(), name: "מנוע סיני", price: "300", checked: false },
];

/** ===== Default state ===== */
export const DEFAULT_STATE: AppState = {
  customers: [],
  quotes: [],
  profiles: defaultProfiles,
  addons: defaultAddonsPreset.map((a) => ({ ...a })),
  current: {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerNotes: "",
    title: "הצעת מחיר",
    documentType: "quote",
    documentNumber: undefined,
    items: [],
    freeFormAdditions: [],
    taxPercentText: "18",
    notes: "",
    showTotals: true,
  },
  ui: { tab: "quote", settingsOpen: false, profilesSettingsOpen: false },
  pdfSaveFolder: undefined,
  dimensionUnit: "cm",
  nextPaymentRequestNumber: 1,
  supplierRequests: [],
  rfqDraft: null,
  nextSupplierRequestNumber: 1,
  rfqSettings: DEFAULT_RFQ_SETTINGS,
};

/** ===== Normalize a raw object into valid AppState (for LS or data file) ===== */
export function normalizeState(obj: unknown): AppState {
  const o: Partial<AppState> =
    typeof obj === "object" && obj !== null ? (obj as Partial<AppState>) : {};
  const customers = Array.isArray(o.customers) ? o.customers : [];
  const quotesRaw = Array.isArray(o.quotes) ? o.quotes : [];
  const quotes: Quote[] = quotesRaw.map((q: any) => {
    const documentType = normalizeDocumentType(q?.documentType);
    const documentNumber =
      documentType === "payment_request" &&
      typeof q?.documentNumber === "number" &&
      isFinite(q.documentNumber) &&
      q.documentNumber > 0
        ? Math.floor(q.documentNumber)
        : undefined;
    return {
      ...q,
      documentType,
      documentNumber,
      title: q?.title || documentTypeLabel(documentType),
    };
  });
  const profiles =
    Array.isArray(o.profiles) && o.profiles.length > 0 ? o.profiles : defaultProfiles;
  const addons =
    Array.isArray(o.addons) && o.addons.length > 0
      ? o.addons
      : defaultAddonsPreset.map((a) => ({ ...a }));
  const currentRaw: any = o.current ?? {};
  const currentDocumentType = normalizeDocumentType(currentRaw.documentType);
  const currentDocumentNumber =
    typeof currentRaw.documentNumber === "number" &&
    isFinite(currentRaw.documentNumber) &&
    currentRaw.documentNumber > 0
      ? Math.floor(currentRaw.documentNumber)
      : undefined;
  const current = {
    quoteId:
      typeof currentRaw.quoteId === "string" && quotes.some((q) => q.id === currentRaw.quoteId)
        ? currentRaw.quoteId
        : undefined,
    customerName: String(currentRaw.customerName ?? ""),
    customerPhone: String(currentRaw.customerPhone ?? ""),
    customerEmail: String(currentRaw.customerEmail ?? ""),
    customerNotes: String(currentRaw.customerNotes ?? ""),
    title: String(currentRaw.title ?? documentTypeLabel(currentDocumentType)),
    documentType: currentDocumentType,
    documentNumber: currentDocumentNumber,
    items: Array.isArray(currentRaw.items) ? currentRaw.items : [],
    freeFormAdditions: Array.isArray(currentRaw.freeFormAdditions) ? currentRaw.freeFormAdditions : [],
    taxPercentText: String(currentRaw.taxPercentText ?? "18"),
    notes: String(currentRaw.notes ?? ""),
    showTotals: currentRaw.showTotals !== false,
  };
  const uiRaw: any = o.ui ?? {};
  const tab: AppState["ui"]["tab"] =
    uiRaw.tab === "customers" ? "customers" : uiRaw.tab === "rfq" ? "rfq" : "quote";
  const ui = {
    tab,
    settingsOpen: Boolean(uiRaw.settingsOpen ?? false),
    profilesSettingsOpen: Boolean(uiRaw.profilesSettingsOpen ?? false),
  };
  const pdfSaveFolder = typeof o.pdfSaveFolder === "string" ? o.pdfSaveFolder : undefined;
  const dimensionUnit = o.dimensionUnit === "mm" ? "mm" : "cm";

  const maxExistingNumber = quotes.reduce((max, q) => {
    const n = q.documentNumber;
    return typeof n === "number" && n > max ? n : max;
  }, 0);
  const storedNext =
    typeof o.nextPaymentRequestNumber === "number" &&
    isFinite(o.nextPaymentRequestNumber) &&
    o.nextPaymentRequestNumber > 0
      ? Math.floor(o.nextPaymentRequestNumber)
      : 1;
  const nextPaymentRequestNumber = Math.max(storedNext, maxExistingNumber + 1);

  return {
    customers,
    quotes,
    profiles,
    addons,
    current,
    ui,
    pdfSaveFolder,
    dimensionUnit,
    nextPaymentRequestNumber,
    ...normalizeRfqSlice(o as Record<string, unknown>),
  };
}
