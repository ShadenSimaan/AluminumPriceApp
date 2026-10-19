// FILE: src/App.tsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { exportQuotePdf, openPdfSaveFolder, printQuotePdf } from "./pdfExporter";
import { AppCurrentState, AppState, Customer, LineItem, Profile, FreeFormAddition, Addon, Quote, DocumentType, documentTypeLabel, normalizeDocumentType } from "./types";
import { readStateFromFile, writeStateToFile, isTauri, getDataFilePath } from "./storage";
import QuotePage from "./QuotePage";
import CustomersPage from "./CustomersPage";

/** =========================
 *  Constants & Utilities
 *  ========================= */
const LS_KEY = "aluminum-quote-app:new-mobile-style-v1";

function uuid() {
  if ((crypto as any)?.randomUUID) return crypto.randomUUID();
  const buf = new Uint8Array(16);
  (crypto as any).getRandomValues?.(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return [...buf].map(toHex).join("");
}

function parseLooseNumber(s: string): number {
  if (!s || !s.trim()) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

/** Ask for confirmation before a destructive action (Tauri dialog or browser confirm). */
async function confirmDestructive(
  message: string,
  options?: { title?: string; okLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  const title = options?.title ?? "אישור מחיקה";
  const okLabel = options?.okLabel ?? "כן, מחק";
  const cancelLabel = options?.cancelLabel ?? "ביטול";
  if (isTauri()) {
    try {
      const dialogModule = await import("@tauri-apps/plugin-dialog");
      return await dialogModule.confirm(message, {
        title,
        kind: "warning",
        okLabel,
        cancelLabel,
      });
    } catch {
      return window.confirm(message);
    }
  }
  return window.confirm(message);
}

// Accept 0.18 or 18, return decimal (0.18)
function normalizeTaxPercent(n: number): number {
  if (n === 0) return 0;
  if (n > 1.0) return n / 100;
  return n;
}

const fmtCurrency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
});

const defaultProfiles: Profile[] = [
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

const defaultAddonsPreset = [
  { id: uuid(), name: "מנגנון דרי קיף", price: "650", checked: false },
  { id: uuid(), name: "מנוע חשמלי סמפי/נייס", price: "800", checked: false },
  { id: uuid(), name: "מנוע סיני", price: "300", checked: false },
];

// Helper to create addons from global addons list
function createAddonsFromGlobal(globalAddons: Addon[]): Addon[] {
  return globalAddons.map((a) => ({ ...a, checked: false }));
}

/** ===== Default state ===== */
const DEFAULT_STATE: AppState = {
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
};

/** ===== Normalize a raw object into valid AppState (for LS or data file) ===== */
function normalizeState(obj: unknown): AppState {
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
  const tab: "quote" | "customers" = uiRaw.tab === "customers" ? "customers" : "quote";
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
  };
}

/** ===== Validate + migrate any LS object to the proper shape ===== */
function hydrateState(): AppState {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return structuredClone(DEFAULT_STATE);
  try {
    return normalizeState(JSON.parse(raw));
  } catch (e) {
    try {
      localStorage.setItem(LS_KEY + ":backup", raw);
    } catch {}
    return structuredClone(DEFAULT_STATE);
  }
}

/** ========= Pure helpers for saving customer & quote ========= */

function upsertCustomerByName(
  s: AppState,
  name: string,
  phone?: string,
  email?: string,
  notes?: string
): { nextState: AppState; customer: Customer } {
  // Remove "לכבוד " prefix if present before saving
  const nameWithoutPrefix = name.trim().replace(/^לכבוד\s+/, "");
  const trimmed = nameWithoutPrefix.trim();
  const existing = s.customers.find((c) => c.name === trimmed);

  if (existing) {
    const updated: Customer = {
      ...existing,
      phone: phone || existing.phone,
      email: email || existing.email,
      notes: notes ?? existing.notes,
    };
    const customers =
      JSON.stringify(updated) === JSON.stringify(existing)
        ? s.customers
        : s.customers.map((c) => (c.id === updated.id ? updated : c));
    return { nextState: { ...s, customers }, customer: updated };
  }

  const created: Customer = {
    id: uuid(),
    name: trimmed,
    phone,
    email,
    notes,
    createdAt: Date.now(),
  };
  return {
    nextState: { ...s, customers: [...s.customers, created] },
    customer: created,
  };
}

function makeDuplicateCustomerName(s: AppState, baseName: string): string {
  let candidate = `${baseName} (עותק)`;
  let n = 1;
  while (s.customers.some((c) => c.name === candidate)) {
    n += 1;
    candidate = `${baseName} (עותק ${n})`;
  }
  return candidate;
}

function cloneLineItemForDuplicate(it: LineItem): LineItem {
  return {
    ...it,
    id: uuid(),
    addons: it.addons.map((a) => ({ ...a, id: uuid() })),
  };
}

function cloneQuoteForNewCustomer(
  q: Quote,
  newCustomerId: string,
  opts?: { documentNumber?: number }
): Quote {
  const documentType = normalizeDocumentType(q.documentType);
  return {
    ...q,
    id: uuid(),
    customerId: newCustomerId,
    documentType,
    documentNumber:
      documentType === "payment_request" ? opts?.documentNumber : undefined,
    title: documentTypeLabel(documentType),
    items: q.items.map(cloneLineItemForDuplicate),
    freeFormAdditions: (q.freeFormAdditions ?? []).map((add) => ({ ...add, id: uuid() })),
  };
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function normalizeLineItemForCompare(it: LineItem) {
  return {
    widthCm: it.widthCm,
    heightCm: it.heightCm,
    qty: it.qty,
    profileId: it.profileId ?? "",
    profileName: it.profileName ?? "",
    unitPrice: it.unitPrice,
    manualUnitPrice: it.manualUnitPrice ?? "",
    location: it.location ?? "",
    details: it.details ?? "",
    subtotal: roundMoney(it.subtotal),
    addons: (it.addons ?? []).map((a) => ({
      name: a.name,
      price: a.price,
      checked: a.checked,
    })),
  };
}

function normalizeFreeFormAdditionForCompare(add: FreeFormAddition) {
  return {
    name: add.name,
    price: add.price,
    qty: add.qty,
  };
}

function getProfilesSignature(profiles: Profile[]) {
  return JSON.stringify(
    profiles.map((p) => ({
      id: p.id,
      name: p.name,
      unitPrice: p.unitPrice,
    }))
  );
}

function buildQuoteContentSnapshotFromCurrent(current: AppCurrentState) {
  const documentType = normalizeDocumentType(current.documentType);
  return {
    title: current.title || documentTypeLabel(documentType),
    documentType,
    documentNumber: current.documentNumber ?? null,
    customerPhone: current.customerPhone ?? "",
    customerEmail: current.customerEmail ?? "",
    notes: current.notes ?? "",
    items: current.items.map(normalizeLineItemForCompare),
    freeFormAdditions: current.freeFormAdditions.map(normalizeFreeFormAdditionForCompare),
    taxPercent: parseLooseNumber(current.taxPercentText ?? "18"),
    showTotals: current.showTotals !== false,
  };
}

function buildQuoteContentSnapshotFromQuote(q: Quote) {
  const documentType = normalizeDocumentType(q.documentType);
  return {
    title: q.title || documentTypeLabel(documentType),
    documentType,
    documentNumber: q.documentNumber ?? null,
    customerPhone: q.customerPhone ?? "",
    customerEmail: q.customerEmail ?? "",
    notes: q.notes ?? "",
    items: (q.items ?? []).map(normalizeLineItemForCompare),
    freeFormAdditions: (q.freeFormAdditions ?? []).map(normalizeFreeFormAdditionForCompare),
    taxPercent: q.taxPercent,
    showTotals: q.showTotals !== false,
  };
}

/** True when quote line items / notes / tax / profiles did not change since last save. */
function quoteMatchesCurrentSnapshot(
  existing: Quote | undefined,
  current: AppCurrentState,
  profilesSignature: string
) {
  if (!existing) return false;

  const contentMatches =
    JSON.stringify(buildQuoteContentSnapshotFromQuote(existing)) ===
    JSON.stringify(buildQuoteContentSnapshotFromCurrent(current));
  if (!contentMatches) return false;

  const existingSig = existing.profilesSignature ?? "";
  // Legacy quotes without a stored signature: keep the date if content matches.
  if (!existingSig) return true;

  return existingSig === profilesSignature;
}

function saveQuoteToState(
  s: AppState
): { nextState: AppState; quote?: Quote; quoteUnchanged?: boolean; error?: string } {
  if (!s.current.customerName.trim()) {
    return { nextState: s, error: "אנא הזן/י שם לקוח" };
  }

  const { nextState: withCustomer, customer } = upsertCustomerByName(
    s,
    s.current.customerName,
    s.current.customerPhone,
    s.current.customerEmail,
    s.current.customerNotes
  );

  const subTotalItemsLocal = withCustomer.current.items.reduce(
    (a, it) => a + it.subtotal,
    0
  );
  const subTotalFreeFormLocal = withCustomer.current.freeFormAdditions.reduce((sum, add) => {
    const price = parseLooseNumber(add.price);
    const qty = Math.max(0, parseLooseNumber(add.qty));
    return sum + price * qty;
  }, 0);
  const subTotalLocal = subTotalItemsLocal + subTotalFreeFormLocal;
  const taxDecimalLocal = normalizeTaxPercent(
    parseLooseNumber(withCustomer.current.taxPercentText ?? "18")
  );
  const taxValueLocal = subTotalLocal * taxDecimalLocal;
  const grandTotalLocal = subTotalLocal + taxValueLocal;
  const totals = { sub: subTotalLocal, tax: taxValueLocal, grand: grandTotalLocal };
  const existingQuote = withCustomer.quotes.find((q) => q.customerId === customer.id);
  const profilesSignature = getProfilesSignature(withCustomer.profiles);
  let quoteUnchanged = quoteMatchesCurrentSnapshot(
    existingQuote,
    withCustomer.current,
    profilesSignature
  );
  const quoteDate = quoteUnchanged && existingQuote ? existingQuote.date : Date.now();

  const documentType = normalizeDocumentType(withCustomer.current.documentType);
  let nextPaymentRequestNumber =
    typeof withCustomer.nextPaymentRequestNumber === "number" &&
    withCustomer.nextPaymentRequestNumber > 0
      ? Math.floor(withCustomer.nextPaymentRequestNumber)
      : 1;
  let documentNumber =
    typeof withCustomer.current.documentNumber === "number" &&
    withCustomer.current.documentNumber > 0
      ? Math.floor(withCustomer.current.documentNumber)
      : existingQuote?.documentNumber && existingQuote.documentNumber > 0
        ? Math.floor(existingQuote.documentNumber)
        : undefined;

  if (documentType === "payment_request") {
    if (documentNumber == null) {
      documentNumber = nextPaymentRequestNumber;
      nextPaymentRequestNumber += 1;
      // Newly allocated serial must be written into the PDF
      // (content snapshot may have matched before the number existed).
      quoteUnchanged = false;
    }
  }

  const quote: Quote = {
    id: existingQuote?.id ?? uuid(),
    customerId: customer.id,
    title: documentTypeLabel(documentType),
    documentType,
    documentNumber: documentType === "payment_request" ? documentNumber : undefined,
    date: quoteDate,
    customerPhone: withCustomer.current.customerPhone,
    customerEmail: withCustomer.current.customerEmail,
    notes: withCustomer.current.notes,
    profilesSignature,
    items: withCustomer.current.items,
    freeFormAdditions: withCustomer.current.freeFormAdditions,
    taxPercent: parseLooseNumber(withCustomer.current.taxPercentText ?? "18"),
    showTotals: withCustomer.current.showTotals,
    totals,
  };

  const nextState: AppState = {
    ...withCustomer,
    nextPaymentRequestNumber,
    current: {
      ...withCustomer.current,
      title: documentTypeLabel(documentType),
      documentType,
      documentNumber: documentType === "payment_request" ? documentNumber : withCustomer.current.documentNumber,
    },
    quotes: [
      ...withCustomer.quotes.filter((q) => q.customerId !== customer.id),
      quote,
    ],
  };

  return { nextState, quote, quoteUnchanged };
}

/** =========================
 *  App Component
 *  ========================= */

type ToastVariant = "success" | "error" | "info";

type ToastState = {
  id: number;
  message: string;
  variant: ToastVariant;
};

export default function App() {
  const [state, setState] = useState<AppState>(() => hydrateState());

  /** ======= Item Editor (inline calculator) ======= */
  function initItemEditor(): LineItem {
    return {
      id: uuid(),
      widthCm: "",
      heightCm: "",
      qty: "1",
      profileId: undefined,
      profileName: undefined,
      unitPrice: "0",
      manualUnitPrice: "",
      location: "",
      details: "",
      addons: createAddonsFromGlobal(state.addons),
      subtotal: 0,
    };
  }

  const [itemEditor, setItemEditor] = useState<LineItem>(() =>
    initItemEditor()
  );
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(
    undefined
  );

  /** ===== Toast system ===== */
  const [toast, setToast] = useState<ToastState | null>(null);

  function showToast(message: string, variant: ToastVariant = "success") {
    const id = Date.now();
    setToast({ id, message, variant });
    setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, 2800);
  }

  // Persist on change: always localStorage; in Tauri also save to app data file (debounced)
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  const fileWriteTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isTauri()) return;
    if (fileWriteTimeoutRef.current) clearTimeout(fileWriteTimeoutRef.current);
    fileWriteTimeoutRef.current = setTimeout(() => {
      fileWriteTimeoutRef.current = null;
      writeStateToFile(state);
    }, 600);
    return () => {
      if (fileWriteTimeoutRef.current) clearTimeout(fileWriteTimeoutRef.current);
    };
  }, [state]);

  // On startup in Tauri: load from data file if present (overrides localStorage)
  const fileLoadDoneRef = useRef(false);
  useEffect(() => {
    if (!isTauri() || fileLoadDoneRef.current) return;
    fileLoadDoneRef.current = true;
    readStateFromFile().then((fileState) => {
      if (fileState != null && typeof fileState === "object") {
        setState(normalizeState(fileState));
      }
    });
  }, []);

  /** When loading a line into the item calculator for edit, skip one sync so מחיר למ״ר stays as on the line. */
  const skipProfileUnitPriceSyncRef = useRef(false);

  // Keep active profile valid when profiles change
  useEffect(() => {
    setActiveProfileId((prev) => {
      if (prev && state.profiles.some((p) => p.id === prev)) return prev;
      return undefined; // Default to nothing selected
    });
  }, [state.profiles]);

  // When active profile changes, sync to item editor (name + price)
  useEffect(() => {
    const p = state.profiles.find((pr) => pr.id === activeProfileId);
    const preserveUnitPrice = skipProfileUnitPriceSyncRef.current;
    skipProfileUnitPriceSyncRef.current = false;
    setItemEditor((e) => ({
      ...e,
      profileId: p?.id,
      profileName: p?.name ?? undefined,
      unitPrice: preserveUnitPrice ? e.unitPrice : p ? String(p.unitPrice) : "0",
    }));
  }, [activeProfileId, state.profiles]);

  const updateCurrent = useCallback(
    <K extends keyof AppState["current"]>(key: K, val: AppState["current"][K]) => {
      setState((s) => {
        const current = { ...s.current, [key]: val };
        if (key === "documentType") {
          const documentType = normalizeDocumentType(val);
          current.documentType = documentType;
          current.title = documentTypeLabel(documentType);
        }
        return { ...s, current };
      });
    },
    []
  );

  function addItem(currentDraft: LineItem) {
    const widthCm = currentDraft.widthCm ?? "";
    const heightCm = currentDraft.heightCm ?? "";
    const qtyText = currentDraft.qty ?? "";
    const unitPriceText = currentDraft.unitPrice ?? "0";
    const manualUnitPriceText = (currentDraft.manualUnitPrice ?? "").trim();
    const w = parseLooseNumber(widthCm);
    const h = parseLooseNumber(heightCm);
    const qty = Math.max(0, parseLooseNumber(qtyText));
    const area = (w * h) / 10000; // m²
    const addonsPerItem = (currentDraft.addons ?? []).reduce(
      (sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const perItemPrice = manualUnitPriceText
      ? parseLooseNumber(manualUnitPriceText) + addonsPerItem
      : parseLooseNumber(unitPriceText) * area + addonsPerItem;
    const subtotal = perItemPrice * qty;

    const item: LineItem = {
      id: uuid(),
      widthCm,
      heightCm,
      qty: qtyText,
      profileId: currentDraft.profileId,
      profileName: currentDraft.profileName,
      unitPrice: unitPriceText,
      manualUnitPrice: manualUnitPriceText || undefined,
      location: currentDraft.location ?? "",
      details: currentDraft.details ?? "",
      addons: (currentDraft.addons ?? []).map((a) => ({ ...a })),
      subtotal,
    };

    // Update state + auto-save quote (if there is a customer name)
    setState((s) => {
      const withItem: AppState = {
        ...s,
        current: { ...s.current, items: [...s.current.items, item] },
      };

      if (!withItem.current.customerName.trim()) {
        // No customer yet – just add the item
        return withItem;
      }

      // Auto-save silently to quotes so nothing is lost
      const { nextState } = saveQuoteToState(withItem);
      return nextState;
    });

    const newEditor = initItemEditor();
    setItemEditor(newEditor);
    setActiveProfileId(undefined); // Reset to nothing selected

    showToast("הפריט נוסף להצעה (הכל נשמר אוטומטית)", "success");
  }

  async function removeItem(id: string) {
    const item = state.current.items.find((it) => it.id === id);
    const label = (item?.profileName ?? "").trim() || "פריט זה";
    const confirmed = await confirmDestructive(
      `האם אתה בטוח שברצונך למחוק את "${label}" מההצעה?`
    );
    if (!confirmed) return;
    setState((s) => ({
      ...s,
      current: {
        ...s.current,
        items: s.current.items.filter((it) => it.id !== id),
      },
    }));
  }

  function editItem(id: string) {
    const item = state.current.items.find((it) => it.id === id);
    if (!item) return;
    skipProfileUnitPriceSyncRef.current = true;
    setItemEditor({ ...item });
    setActiveProfileId(item.profileId);
  }

  const updateItem = useCallback((id: string, updated: LineItem) => {
    setState((s) => ({
      ...s,
      current: {
        ...s.current,
        items: s.current.items.map((it) => (it.id === id ? updated : it)),
      },
    }));
  }, []);

  function moveItemUp(id: string) {
    setState((s) => {
      const items = [...s.current.items];
      const idx = items.findIndex((it) => it.id === id);
      if (idx <= 0) return s;
      [items[idx - 1], items[idx]] = [items[idx], items[idx - 1]];
      return {
        ...s,
        current: { ...s.current, items },
      };
    });
  }

  function moveItemDown(id: string) {
    setState((s) => {
      const items = [...s.current.items];
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0 || idx >= items.length - 1) return s;
      [items[idx], items[idx + 1]] = [items[idx + 1], items[idx]];
      return {
        ...s,
        current: { ...s.current, items },
      };
    });
  }

  const reorderFreeFormAdditions = useCallback((reordered: FreeFormAddition[]) => {
    setState((s) => ({
      ...s,
      current: { ...s.current, freeFormAdditions: reordered },
    }));
  }, []);

  const resetItemEditor = useCallback(() => {
    setItemEditor(initItemEditor());
    setActiveProfileId(undefined);
  }, [state.addons]);

  function addFreeFormAddition() {
    const newAddition: FreeFormAddition = {
      id: uuid(),
      name: "",
      price: "0",
      qty: "1",
    };
    setState((s) => ({
      ...s,
      current: {
        ...s.current,
        freeFormAdditions: [...s.current.freeFormAdditions, newAddition],
      },
    }));
  }

  function updateFreeFormAddition(id: string, updated: FreeFormAddition) {
    setState((s) => ({
      ...s,
      current: {
        ...s.current,
        freeFormAdditions: s.current.freeFormAdditions.map((a) =>
          a.id === id ? updated : a
        ),
      },
    }));
  }

  async function removeFreeFormAddition(id: string) {
    const row = state.current.freeFormAdditions.find((a) => a.id === id);
    const label = (row?.name ?? "").trim() || "שורה זו";
    const confirmed = await confirmDestructive(
      `האם אתה בטוח שברצונך למחוק את "${label}"?`
    );
    if (!confirmed) return;
    setState((s) => ({
      ...s,
      current: {
        ...s.current,
        freeFormAdditions: s.current.freeFormAdditions.filter((a) => a.id !== id),
      },
    }));
  }

  function clearCurrentForm() {
    setItemEditor(initItemEditor());
  }

  // Completely new empty quote: auto-save current quote to system (if has customer), then clear
  function startNewEmptyQuote() {
    setState((s) => {
      const { nextState } = saveQuoteToState(s);
      const emptyCurrent = {
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        customerNotes: "",
        title: "הצעת מחיר",
        documentType: "quote" as DocumentType,
        documentNumber: undefined as number | undefined,
        items: [] as LineItem[],
        freeFormAdditions: [] as FreeFormAddition[],
        notes: "",
        taxPercentText: "18",
        showTotals: true,
      };
      return {
        ...nextState,
        ui: { ...nextState.ui, tab: "quote" as const },
        current: emptyCurrent,
      };
    });
    clearCurrentForm();
    setActiveProfileId(undefined);
  }

  // ✅ On app load: ALWAYS start with a fresh new quote (not old one)
  useEffect(() => {
    startNewEmptyQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subTotalItems = state.current.items.reduce((a, it) => a + it.subtotal, 0);
  // Include free-form additions in subtotal
  const subTotalFreeForm = (state.current.freeFormAdditions || []).reduce((sum, add) => {
    const price = parseFloat(String(add.price).replace(/[^0-9,\.\-]/g, "").replace(",", ".")) || 0;
    const qty = Math.max(0, parseFloat(String(add.qty).replace(/[^0-9,\.\-]/g, "").replace(",", ".")) || 0);
    return sum + price * qty;
  }, 0);
  const subTotal = subTotalItems + subTotalFreeForm;
  const taxDecimal = normalizeTaxPercent(
    parseLooseNumber(state.current.taxPercentText ?? "18")
  );
  const taxValue = subTotal * taxDecimal;
  const grandTotal = subTotal + taxValue;

  function saveQuote(showFeedback = true) {
    setState((prev) => {
      const { nextState, error } = saveQuoteToState(prev);

      if (showFeedback) {
        if (error) {
          showToast(error, "error");
        } else {
          showToast("הצעה נשמרה ללקוח בהצלחה", "success");
        }
      }

      return nextState;
    });
  }

  function openLastQuoteForCustomer(customerId: string) {
    const q = [...state.quotes]
      .filter((x) => x.customerId === customerId)
      .sort((a, b) => b.date - a.date)[0];
    const customer = state.customers.find((c) => c.id === customerId);
    if (!q || !customer) {
      showToast("אין הצעה שמורה ללקוח זה", "error");
      return;
    }
    setState((s) => ({
      ...s,
      ui: { ...s.ui, tab: "quote" },
      current: {
        ...s.current,
        customerName: customer.name,
        customerPhone: q.customerPhone ?? customer.phone ?? "",
        customerEmail: q.customerEmail ?? customer.email ?? "",
        customerNotes: customer.notes ?? "",
        items: q.items.map((it) => ({ ...it, id: uuid() })), // clone
        title: q.title || documentTypeLabel(q.documentType),
        documentType: normalizeDocumentType(q.documentType),
        documentNumber: q.documentNumber,
        freeFormAdditions: (q.freeFormAdditions ?? []).map((add) => ({ ...add, id: uuid() })),
        taxPercentText: String(q.taxPercent ?? "18"),
        notes: q.notes ?? "",
        showTotals: q.showTotals !== false,
      },
    }));
    clearCurrentForm();
  }

  async function deleteCustomer(customerId: string) {
    const customer = state.customers.find((c) => c.id === customerId);
    const name = customer?.name ? ` "${customer.name}"` : "";
    const message = `האם אתה בטוח שברצונך למחוק את הלקוח${name}? פעולה זו תמחק גם את כל ההצעות השמורות של הלקוח.`;
    const confirmed = await confirmDestructive(message);
    if (!confirmed) return;
    setState((s) => ({
      ...s,
      customers: s.customers.filter((c) => c.id !== customerId),
      quotes: s.quotes.filter((q) => q.customerId !== customerId),
    }));
  }

  function duplicateCustomer(customerId: string) {
    const quoteCount = state.quotes.filter((q) => q.customerId === customerId).length;
    setState((s) => {
      const src = s.customers.find((c) => c.id === customerId);
      if (!src) return s;
      const created: Customer = {
        id: uuid(),
        name: makeDuplicateCustomerName(s, src.name),
        phone: src.phone,
        email: src.email,
        notes: src.notes,
        createdAt: Date.now(),
      };
      let nextNum =
        typeof s.nextPaymentRequestNumber === "number" && s.nextPaymentRequestNumber > 0
          ? Math.floor(s.nextPaymentRequestNumber)
          : 1;
      const clonedQuotes = s.quotes
        .filter((q) => q.customerId === src.id)
        .map((q) => {
          const documentType = normalizeDocumentType(q.documentType);
          if (documentType === "payment_request") {
            const assigned = nextNum;
            nextNum += 1;
            return cloneQuoteForNewCustomer(q, created.id, { documentNumber: assigned });
          }
          return cloneQuoteForNewCustomer(q, created.id);
        });
      return {
        ...s,
        customers: [...s.customers, created],
        quotes: [...s.quotes, ...clonedQuotes],
        nextPaymentRequestNumber: nextNum,
      };
    });
    showToast(
      quoteCount > 0
        ? "הלקוח וההצעות השמורות שוכפלו"
        : "הלקוח שוכפל (לא נמצאו הצעות שמורות ללקוח המקורי)",
      "success"
    );
  }

  // ======== PDF EXPORT =========
  const handleExportPdf = async () => {
    if (!state.current.customerName.trim()) {
      showToast("אנא הזן/י שם לקוח לפני יצוא PDF", "error");
      return;
    }
    if (!state.current.items.length && !state.current.freeFormAdditions.length) {
      showToast("ההצעה ריקה. הוסף/י פריטים לפני יצוא PDF.", "error");
      return;
    }

    try {
      // Save the current quote to the system behind the scenes before exporting
      const { nextState, quote, quoteUnchanged, error: saveError } = saveQuoteToState(state);
      if (saveError) {
        showToast(saveError, "error");
        return;
      }
      setState(nextState);

      const result = await exportQuotePdf({
        title: nextState.current.title || documentTypeLabel(nextState.current.documentType),
        documentType: nextState.current.documentType,
        documentNumber: nextState.current.documentNumber,
        customerName: nextState.current.customerName,
        customerPhone: nextState.current.customerPhone,
        customerEmail: nextState.current.customerEmail,
        notes: nextState.current.notes,
        taxPercentText: nextState.current.taxPercentText ?? "18",
        items: nextState.current.items,
        freeFormAdditions: nextState.current.freeFormAdditions,
        pdfSaveFolder: nextState.pdfSaveFolder,
        dimensionUnit: nextState.dimensionUnit ?? "cm",
        showTotals: nextState.current.showTotals,
        pdfDateMs: quote?.date,
        quoteUnchanged: quoteUnchanged === true,
      });

      if (result.success === false) {
        showToast(result.error, "error");
        return;
      }

      showToast(
        result.reusedExisting
          ? "נפתח הקובץ הקיים. התיקייה נפתחה עם הקובץ."
          : "ה-PDF נשמר בהצלחה. התיקייה נפתחה עם הקובץ.",
        "success"
      );
    } catch (err: any) {
      const msg = err?.message || String(err) || "שגיאה ביצוא PDF";
      showToast(msg, "error");
    }
  };

  const handlePrintPdf = async () => {
    if (!state.current.customerName.trim()) {
      showToast("אנא הזן/י שם לקוח לפני הדפסה", "error");
      return;
    }
    if (!state.current.items.length && !state.current.freeFormAdditions.length) {
      showToast("ההצעה ריקה. הוסף/י פריטים לפני הדפסה.", "error");
      return;
    }

    try {
      const { nextState, quote, error: saveError } = saveQuoteToState(state);
      if (saveError) {
        showToast(saveError, "error");
        return;
      }
      setState(nextState);

      const result = await printQuotePdf({
        title: nextState.current.title || documentTypeLabel(nextState.current.documentType),
        documentType: nextState.current.documentType,
        documentNumber: nextState.current.documentNumber,
        customerName: nextState.current.customerName,
        customerPhone: nextState.current.customerPhone,
        customerEmail: nextState.current.customerEmail,
        notes: nextState.current.notes,
        taxPercentText: nextState.current.taxPercentText ?? "18",
        items: nextState.current.items,
        freeFormAdditions: nextState.current.freeFormAdditions,
        pdfSaveFolder: nextState.pdfSaveFolder,
        dimensionUnit: nextState.dimensionUnit ?? "cm",
        showTotals: nextState.current.showTotals,
        pdfDateMs: quote?.date,
      });

      if (result.success === false) {
        showToast(result.error, "error");
        return;
      }

      showToast("ה-PDF נפתח — ניתן להדפיס ולבחור מדפסת מהתפריט.", "success");
    } catch (err: any) {
      const msg = err?.message || String(err) || "שגיאה בהדפסת PDF";
      showToast(msg, "error");
    }
  };

  const handleOpenPdfFolder = async () => {
    const result = await openPdfSaveFolder(
      state.pdfSaveFolder,
      state.current.documentType
    );
    if (result.success) {
      showToast("התיקייה נפתחה", "success");
    } else {
      showToast(result.error || "לא ניתן לפתוח את התיקייה", "error");
    }
  };

  // Export last quote for customer from לקוחות page
  function exportLastQuoteForCustomer(customerId: string) {
    const hasQuote = state.quotes.some((q) => q.customerId === customerId);
    if (!hasQuote) {
      showToast("אין הצעה שמורה ללקוח זה", "error");
      return;
    }
    openLastQuoteForCustomer(customerId);
    setTimeout(() => {
      handleExportPdf();
    }, 0);
  }

  /** ======= Settings dialog: profiles CRUD ======= */
  const profileFormRef = useRef<HTMLDivElement>(null);
  const addonFormRef = useRef<HTMLDivElement>(null);

  const [profileDraft, setProfileDraft] = useState<{
    id?: string;
    name: string;
    unitPrice: string;
  }>({ name: "", unitPrice: "" });

  /** Inline edit in profiles table: which cell (profile id + field) and draft value */
  const [editingProfileCell, setEditingProfileCell] = useState<{ id: string; field: "name" | "unitPrice" } | null>(null);
  const [editingProfileValue, setEditingProfileValue] = useState("");

  /** ======= Settings dialog: addons CRUD ======= */
  const [addonDraft, setAddonDraft] = useState<{
    id?: string;
    name: string;
    price: string;
  }>({ name: "", price: "" });

  /** Inline edit in addons table: which cell (addon id + field) and draft value */
  const [editingAddonCell, setEditingAddonCell] = useState<{ id: string; field: "name" | "price" } | null>(null);
  const [editingAddonValue, setEditingAddonValue] = useState("");

  function openSettings() {
    setState((s) => ({ ...s, ui: { ...s.ui, settingsOpen: true } }));
  }
  function closeSettings() {
    setState((s) => ({ ...s, ui: { ...s.ui, settingsOpen: false } }));
  }
  function openProfilesSettings() {
    setState((s) => ({ ...s, ui: { ...s.ui, profilesSettingsOpen: true } }));
  }
  function closeProfilesSettings() {
    setState((s) => ({ ...s, ui: { ...s.ui, profilesSettingsOpen: false } }));
    setProfileDraft({ name: "", unitPrice: "" });
    setAddonDraft({ name: "", price: "" });
    setEditingProfileCell(null);
    setEditingAddonCell(null);
  }

  function startProfileCellEdit(id: string, field: "name" | "unitPrice", currentValue: string | number) {
    setEditingProfileCell({ id, field });
    setEditingProfileValue(field === "unitPrice" ? String(currentValue) : String(currentValue));
  }

  function commitProfileCellEdit() {
    if (!editingProfileCell) return;
    const { id, field } = editingProfileCell;
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) =>
        p.id !== id
          ? p
          : field === "name"
            ? { ...p, name: editingProfileValue.trim() || p.name }
            : { ...p, unitPrice: parseLooseNumber(editingProfileValue) ?? p.unitPrice }
      ),
    }));
    setEditingProfileCell(null);
  }

  function cancelProfileCellEdit() {
    setEditingProfileCell(null);
  }

  function startAddonCellEdit(id: string, field: "name" | "price", currentValue: string) {
    setEditingAddonCell({ id, field });
    setEditingAddonValue(currentValue);
  }

  function commitAddonCellEdit() {
    if (!editingAddonCell) return;
    const { id, field } = editingAddonCell;
    setState((s) => ({
      ...s,
      addons: s.addons.map((a) =>
        a.id !== id
          ? a
          : field === "name"
            ? { ...a, name: editingAddonValue.trim() || a.name }
            : { ...a, price: editingAddonValue.trim() !== "" ? editingAddonValue : a.price }
      ),
    }));
    setEditingAddonCell(null);
  }

  function cancelAddonCellEdit() {
    setEditingAddonCell(null);
  }

  function addProfile() {
    const name = profileDraft.name.trim() || `פרופיל חדש`;
    const unitPrice = parseLooseNumber(profileDraft.unitPrice) || 0;
    setState((s) => ({
      ...s,
      profiles: [...s.profiles, { id: uuid(), name, unitPrice }],
    }));
    setProfileDraft({ name: "", unitPrice: "" });
  }

  /** Add a profile from the quote page dropdown; returns the new profile id and selects it. */
  function addProfileQuick(name: string, unitPrice: number): string {
    const trimmedName = name.trim() || `פרופיל חדש`;
    const price = parseLooseNumber(String(unitPrice)) || 0;
    const id = uuid();
    setState((s) => ({
      ...s,
      profiles: [...s.profiles, { id, name: trimmedName, unitPrice: price }],
    }));
    setActiveProfileId(id);
    setItemEditor((e) => ({
      ...e,
      profileId: id,
      profileName: trimmedName,
      unitPrice: String(price),
    }));
    return id;
  }

  /** Update an existing profile from the quote page profile popup; keeps row labels in sync by profile id. */
  function updateProfileQuick(id: string, name: string, unitPrice: number) {
    const trimmedName = name.trim() || `פרופיל חדש`;
    const price = parseLooseNumber(String(unitPrice)) || 0;
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) =>
        p.id === id ? { ...p, name: trimmedName, unitPrice: price } : p
      ),
      current: {
        ...s.current,
        items: s.current.items.map((it) =>
          it.profileId === id ? { ...it, profileName: trimmedName } : it
        ),
      },
    }));
    if (activeProfileId === id) {
      setItemEditor((e) => ({
        ...e,
        profileName: trimmedName,
        unitPrice: String(price),
      }));
    }
  }
  function editProfile(p: Profile) {
    setAddonDraft({ name: "", price: "" }); // exit addon edit mode
    setProfileDraft({ id: p.id, name: p.name, unitPrice: String(p.unitPrice) });
    setTimeout(() => profileFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function saveProfileEdit() {
    if (!profileDraft.id) return;
    setState((s) => ({
      ...s,
      profiles: s.profiles.map((p) =>
        p.id === profileDraft.id
          ? {
              ...p,
              name: profileDraft.name.trim() || p.name,
              unitPrice: parseLooseNumber(profileDraft.unitPrice),
            }
          : p
      ),
    }));
    setProfileDraft({ name: "", unitPrice: "" });
  }
  async function deleteProfile(id: string) {
    const p = state.profiles.find((x) => x.id === id);
    const label = p?.name ? ` "${p.name}"` : "";
    const confirmed = await confirmDestructive(
      `האם אתה בטוח שברצונך למחוק את הפרופיל${label}?`
    );
    if (!confirmed) return;
    setState((s) => ({
      ...s,
      profiles: s.profiles.filter((x) => x.id !== id),
    }));
    if (activeProfileId === id) setActiveProfileId(undefined);
  }

  function addAddon() {
    const name = addonDraft.name.trim() || `תוספת חדשה`;
    const price = addonDraft.price.trim() || "0";
    setState((s) => ({
      ...s,
      addons: [...s.addons, { id: uuid(), name, price, checked: false }],
    }));
    setAddonDraft({ name: "", price: "" });
  }

  function editAddon(a: Addon) {
    setProfileDraft({ name: "", unitPrice: "" }); // exit profile edit mode
    setAddonDraft({ id: a.id, name: a.name, price: a.price });
    setTimeout(() => addonFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function saveAddonEdit() {
    if (!addonDraft.id) return;
    setState((s) => ({
      ...s,
      addons: s.addons.map((a) =>
        a.id === addonDraft.id
          ? {
              ...a,
              name: addonDraft.name.trim() || a.name,
              price: addonDraft.price.trim() || a.price,
            }
          : a
      ),
    }));
    setAddonDraft({ name: "", price: "" });
  }

  async function deleteAddon(id: string) {
    const a = state.addons.find((x) => x.id === id);
    const label = a?.name ? ` "${a.name}"` : "";
    const confirmed = await confirmDestructive(
      `האם אתה בטוח שברצונך למחוק את התוספת${label}?`
    );
    if (!confirmed) return;
    setState((s) => ({
      ...s,
      addons: s.addons.filter((x) => x.id !== id),
    }));
  }

  /** ======= Settings: PDF Save Folder ======= */
  async function selectPdfSaveFolder() {
    if (!isTauri()) {
      showToast("פונקציה זו זמינה רק באפליקציה", "error");
      return;
    }

    try {
      const dialogModule = await import("@tauri-apps/plugin-dialog");
      const fsModule = await import("@tauri-apps/plugin-fs");
      
      const selected = await dialogModule.open({
        directory: true,
        multiple: false,
        title: "בחר תיקייה לשמירת קבצי PDF",
        defaultPath: state.pdfSaveFolder || undefined,
      });

      if (selected) {
        // Handle both string and array responses
        const folderPath = typeof selected === "string" ? selected : (Array.isArray(selected) && selected.length > 0 ? selected[0] : null);
        
        if (folderPath) {
          // Request permission for the selected folder
          try {
            // In Tauri 2.0, when a folder is selected via dialog, we need to scope it
            // The dialog should automatically grant permission, but let's explicitly scope it
            const exists = await fsModule.exists(folderPath);
            if (!exists) {
              showToast(`התיקייה לא קיימת: ${folderPath}`, "error");
              return;
            }
            
            // Request scope for the folder recursively (to allow subdirectories)
            try {
              console.log("Requesting scope for selected folder:", folderPath);
              console.log("Available fsModule methods:", Object.keys(fsModule));
              
              const fsModuleAny = fsModule as any;
              if (typeof fsModuleAny.scope === "function") {
                await fsModuleAny.scope(folderPath, { recursive: true });
                console.log("✓ Scope granted for folder:", folderPath);
              } else if (fsModuleAny.allowScope) {
                await fsModuleAny.allowScope(folderPath, { recursive: true });
                console.log("✓ Scope granted for folder (via allowScope):", folderPath);
              } else {
                console.warn("⚠ No scope method found. Available methods:", Object.keys(fsModule));
              }
            } catch (scopeError: any) {
              console.error("❌ Scope error in folder selection:", {
                message: scopeError?.message,
                name: scopeError?.name,
                stack: scopeError?.stack,
                fullError: JSON.stringify(scopeError, Object.getOwnPropertyNames(scopeError), 2)
              });
              // Continue anyway - the folder might already be in scope from dialog selection
            }
            
            setState((s) => ({ ...s, pdfSaveFolder: folderPath }));
            showToast(`תיקיית שמירה עודכנה: ${folderPath}`, "success");
          } catch (permError: any) {
            console.error("Error verifying folder permissions:", permError);
            showToast(`שגיאה באימות הרשאות לתיקייה: ${permError?.message || permError}`, "error");
          }
        }
      }
    } catch (error: any) {
      console.error("Error selecting folder:", error);
      showToast(`שגיאה בבחירת תיקייה: ${error?.message || error}`, "error");
    }
  }

  function clearPdfSaveFolder() {
    setState((s) => ({ ...s, pdfSaveFolder: undefined }));
    showToast("תיקיית שמירה אופסה - יישמר בשולחן העבודה", "info");
  }

  /** ======= UI ========= */
  return (
    <div className="container-app">
      <main className="w-full min-w-0 max-w-[1160px] flex flex-col gap-4 px-2">
        {/* Top Bar */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-md grid place-items-center text-white font-bold">
              א
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold min-w-0 break-words">
              אלום סמעאן סאמי
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:opacity-95"
              onClick={startNewEmptyQuote}
            >
              הצעה חדשה
            </button>
            <nav className="flex gap-2 rounded-xl p-1 bg-white/70 shadow">
              <button
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  state.ui.tab === "quote"
                    ? "bg-sky-500 text-white"
                    : "hover:bg-slate-100"
                }`}
                onClick={() =>
                  setState((s) => ({ ...s, ui: { ...s.ui, tab: "quote" } }))
                }
              >
                הצעה
              </button>
              <button
                className={`px-3 py-1.5 rounded-lg text-sm ${
                  state.ui.tab === "customers"
                    ? "bg-sky-500 text-white"
                    : "hover:bg-slate-100"
                }`}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    ui: { ...s.ui, tab: "customers" },
                  }))
                }
              >
                לקוחות
              </button>
            </nav>
            <button
              className="inline-flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-700 hover:bg-sky-100 text-sm font-medium shadow-sm"
              onClick={openSettings}
              title="הגדרות"
              aria-label="הגדרות"
            >
              <Settings className="w-4 h-4 shrink-0" aria-hidden />
              <span>הגדרות</span>
            </button>
          </div>
        </header>

        {/* "הצעה חדשה" button for mobile */}
        <div className="sm:hidden">
          <button
            className="w-full rounded-lg bg-emerald-600 text-white text-sm py-2 mb-1"
            onClick={startNewEmptyQuote}
          >
            הצעה חדשה
          </button>
        </div>

        {/* Pages */}
        {state.ui.tab === "quote" ? (
          <QuotePage
            state={state}
            itemEditor={itemEditor}
            activeProfileId={activeProfileId}
            updateCurrent={updateCurrent}
            setItemEditor={setItemEditor}
            setActiveProfileId={setActiveProfileId}
            openProfilesSettings={openProfilesSettings}
            onAddItem={() => addItem(itemEditor)}
            onResetItemEditor={resetItemEditor}
            onRemoveItem={removeItem}
            onEditItem={editItem}
            onUpdateItem={updateItem}
            onMoveItemUp={moveItemUp}
            onMoveItemDown={moveItemDown}
            onAddFreeFormAddition={addFreeFormAddition}
            onUpdateFreeFormAddition={updateFreeFormAddition}
            onRemoveFreeFormAddition={removeFreeFormAddition}
            onReorderFreeFormAdditions={reorderFreeFormAdditions}
            onExportPdf={handleExportPdf}
            onPrintPdf={handlePrintPdf}
            showPdfFolderControl={isTauri()}
            pdfSaveFolder={state.pdfSaveFolder}
            onSelectPdfFolder={selectPdfSaveFolder}
            onOpenPdfFolder={handleOpenPdfFolder}
            dimensionUnit={state.dimensionUnit ?? "cm"}
            onAddProfileQuick={addProfileQuick}
            onUpdateProfileQuick={updateProfileQuick}
          />
        ) : (
          <CustomersPage
            customers={state.customers}
            quotes={state.quotes}
            onOpenLast={openLastQuoteForCustomer}
            onOpenPdfFolder={isTauri() ? handleOpenPdfFolder : undefined}
            onDeleteCustomer={deleteCustomer}
            onDuplicateCustomer={duplicateCustomer}
          />
        )}

        {/* App Settings Dialog (top bar) – PDF folder, dimension unit, data file */}
        {state.ui.settingsOpen && (
          <Modal
            onClose={closeSettings}
            title={
              <>
                <Settings className="w-5 h-5 shrink-0 text-sky-600" aria-hidden />
                הגדרות
              </>
            }
          >
            <div className="modal-body p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto max-h-[80vh]">
              {/* Default PDF save folder – chosen folder is saved and used every time */}
              <div className="border rounded-lg p-4 bg-blue-50 border-blue-200">
                <div className="text-base font-semibold text-slate-800 mb-2">
                  תיקיית ברירת מחדל לשמירת PDF
                </div>
                <div className="text-sm text-slate-600 mb-3">
                  בחר תיקייה לשמירת קבצי ה-PDF. הבחירה נשמרת ותישמש בכל פתיחה של האפליקציה. הקבצים יאורגנו לפי שנה בתיקייה.
                </div>
                <div className="space-y-3">
                  {state.pdfSaveFolder ? (
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-slate-500 mb-1">תיקייה נבחרה:</div>
                        <div className="text-sm text-slate-700 bg-white border rounded-lg px-3 py-2 break-all">
                          {state.pdfSaveFolder}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg bg-white border text-sm hover:bg-slate-50"
                        onClick={selectPdfSaveFolder}
                      >
                        שינוי תיקייה
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
                      <span className="text-sm text-slate-600">לא נבחרה תיקייה</span>
                      <button
                        type="button"
                        className="px-4 py-2 rounded-lg bg-sky-500 text-white text-sm hover:opacity-95"
                        onClick={selectPdfSaveFolder}
                      >
                        בחר תיקייה
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Dimension unit: cm or mm */}
              <div className="border rounded-lg p-4 bg-slate-50 border-slate-200">
                <div className="text-base font-semibold text-slate-800 mb-2">
                  יחידת מידות (רוחב × גובה)
                </div>
                <div className="text-sm text-slate-600 mb-3">
                  בחר באיזו יחידה להציג ולהזין מידות במחשבון ובטבלת הפריטים.
                </div>
                <div className="flex flex-wrap gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dimensionUnit"
                      checked={(state.dimensionUnit ?? "cm") === "cm"}
                      onChange={() => setState((s) => ({ ...s, dimensionUnit: "cm" }))}
                      className="w-4 h-4"
                    />
                    <span>ס״מ (סנטימטרים)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="dimensionUnit"
                      checked={(state.dimensionUnit ?? "cm") === "mm"}
                      onChange={() => setState((s) => ({ ...s, dimensionUnit: "mm" }))}
                      className="w-4 h-4"
                    />
                    <span>מ״מ (מילימטרים)</span>
                  </label>
                </div>
              </div>

              {/* App data file location (Tauri) */}
              {isTauri() && (
                <DataFileLocation />
              )}
            </div>
            <div className="p-3 border-t flex flex-wrap gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-slate-800 text-white"
                onClick={closeSettings}
              >
                שמירה ויציאה
              </button>
            </div>
          </Modal>
        )}

        {/* Profiles & Addons Settings Dialog (beside מחשבון פריט) */}
        {state.ui.profilesSettingsOpen && (
          <Modal
            onClose={closeProfilesSettings}
            title={
              <>
                <Settings className="w-5 h-5 shrink-0 text-sky-600" aria-hidden />
                הגדרות — ניהול פרופילים ותוספות
              </>
            }
          >
            <div className="modal-body p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto max-h-[80vh]">
              <div ref={profileFormRef} className="text-sm sm:text-base text-slate-600">
                הוספה/עריכה של פרופילים (למשל 4300, 7300) עם מחיר למ״ר.
                {profileDraft.id && (
                  <span className="mr-2 inline-block mt-1 text-sky-600 font-medium">— מעריכים פרופיל</span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                <SettingsInput
                  label="שם פרופיל"
                  value={profileDraft.name}
                  onChange={(v) =>
                    setProfileDraft({ ...profileDraft, name: v })
                  }
                />
                <SettingsInput
                  label="מחיר למ״ר"
                  value={profileDraft.unitPrice}
                  onChange={(v) =>
                    setProfileDraft({ ...profileDraft, unitPrice: v })
                  }
                  inputMode="numeric"
                />
                <div className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                  {profileDraft.id ? (
                    <button
                      className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm sm:text-base flex-1 sm:flex-none"
                      onClick={saveProfileEdit}
                    >
                      שמירת עריכה
                    </button>
                  ) : (
                    <button
                      className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm sm:text-base flex-1 sm:flex-none"
                      onClick={addProfile}
                    >
                      הוספת פרופיל
                    </button>
                  )}
                  <button
                    className="px-3 py-2 rounded-lg bg-white border text-sm sm:text-base flex-1 sm:flex-none"
                    onClick={() =>
                      setProfileDraft({ name: "", unitPrice: "" })
                    }
                  >
                    ניקוי
                  </button>
                </div>
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <ThSettings>שם</ThSettings>
                      <ThSettings>מחיר למ״ר</ThSettings>
                      <ThSettings>פעולות</ThSettings>
                    </tr>
                  </thead>
                  <tbody>
                    {state.profiles.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="py-6 text-center text-slate-500"
                        >
                          אין פרופילים
                        </td>
                      </tr>
                    ) : (
                      state.profiles.map((p) => (
                        <tr key={p.id} className="border-t">
                          <TdSettings>
                            {editingProfileCell?.id === p.id && editingProfileCell?.field === "name" ? (
                              <input
                                type="text"
                                className="w-full min-w-[80px] px-2 py-1 border rounded text-sm bg-white text-right"
                                value={editingProfileValue}
                                onChange={(e) => setEditingProfileValue(e.target.value)}
                                onBlur={commitProfileCellEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitProfileCellEdit();
                                  if (e.key === "Escape") cancelProfileCellEdit();
                                }}
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                className="w-full text-right min-h-[28px] px-2 py-1 rounded hover:bg-slate-100"
                                onClick={() => startProfileCellEdit(p.id, "name", p.name)}
                              >
                                {p.name}
                              </button>
                            )}
                          </TdSettings>
                          <TdSettings>
                            {editingProfileCell?.id === p.id && editingProfileCell?.field === "unitPrice" ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                className="w-full min-w-[80px] px-2 py-1 border rounded text-sm bg-white text-right"
                                value={editingProfileValue}
                                onChange={(e) => setEditingProfileValue(e.target.value)}
                                onBlur={commitProfileCellEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitProfileCellEdit();
                                  if (e.key === "Escape") cancelProfileCellEdit();
                                }}
                                autoFocus
                              />
                            ) : (
                              <button
                                type="button"
                                className="w-full text-right min-h-[28px] px-2 py-1 rounded hover:bg-slate-100"
                                onClick={() => startProfileCellEdit(p.id, "unitPrice", p.unitPrice)}
                              >
                                {fmtCurrency.format(p.unitPrice)}
                              </button>
                            )}
                          </TdSettings>
                          <TdSettings>
                            <div className="flex flex-wrap gap-1 sm:gap-2">
                              <button
                                className="px-2 sm:px-3 py-1.5 rounded-md bg-red-600 text-white text-xs sm:text-sm"
                                onClick={() => deleteProfile(p.id)}
                              >
                                מחיקה
                              </button>
                            </div>
                          </TdSettings>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Addons Management Section */}
              <div className="border-t pt-4 mt-4">
                <div ref={addonFormRef} className="text-sm text-slate-600 mb-3">
                  הוספה/עריכה של תוספות (מחיר ליח׳) - יופיעו במחשבון הפריט.
                  {addonDraft.id && (
                    <span className="mr-2 inline-block mt-1 text-sky-600 font-medium">— מעריכים תוספת</span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-3">
                  <SettingsInput
                    label="שם תוספת"
                    value={addonDraft.name}
                    onChange={(v) =>
                      setAddonDraft({ ...addonDraft, name: v })
                    }
                  />
                  <SettingsInput
                    label="מחיר"
                    value={addonDraft.price}
                    onChange={(v) =>
                      setAddonDraft({ ...addonDraft, price: v })
                    }
                    inputMode="numeric"
                  />
                  <div className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                    {addonDraft.id ? (
                      <button
                        className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm sm:text-base flex-1 sm:flex-none"
                        onClick={saveAddonEdit}
                      >
                        שמירת עריכה
                      </button>
                    ) : (
                      <button
                        className="px-3 py-2 rounded-lg bg-sky-500 text-white text-sm sm:text-base flex-1 sm:flex-none"
                        onClick={addAddon}
                      >
                        הוספת תוספת
                      </button>
                    )}
                    <button
                      className="px-3 py-2 rounded-lg bg-white border text-sm sm:text-base flex-1 sm:flex-none"
                      onClick={() =>
                        setAddonDraft({ name: "", price: "" })
                      }
                    >
                      ניקוי
                    </button>
                  </div>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm min-w-[400px]">
                    <thead className="bg-slate-50">
                      <tr>
                        <ThSettings>שם</ThSettings>
                        <ThSettings>מחיר</ThSettings>
                        <ThSettings>פעולות</ThSettings>
                      </tr>
                    </thead>
                    <tbody>
                      {state.addons.length === 0 ? (
                        <tr>
                          <td
                            colSpan={3}
                            className="py-6 text-center text-slate-500"
                          >
                            אין תוספות
                          </td>
                        </tr>
                      ) : (
                        state.addons.map((a) => (
                          <tr key={a.id} className="border-t">
                            <TdSettings>
                              {editingAddonCell?.id === a.id && editingAddonCell?.field === "name" ? (
                                <input
                                  type="text"
                                  className="w-full min-w-[80px] px-2 py-1 border rounded text-sm bg-white"
                                  value={editingAddonValue}
                                  onChange={(e) => setEditingAddonValue(e.target.value)}
                                  onBlur={commitAddonCellEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitAddonCellEdit();
                                    if (e.key === "Escape") cancelAddonCellEdit();
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="w-full text-right min-h-[28px] px-2 py-1 rounded hover:bg-slate-100"
                                  onClick={() => startAddonCellEdit(a.id, "name", a.name)}
                                >
                                  {a.name}
                                </button>
                              )}
                            </TdSettings>
                            <TdSettings>
                              {editingAddonCell?.id === a.id && editingAddonCell?.field === "price" ? (
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="w-full min-w-[80px] px-2 py-1 border rounded text-sm bg-white"
                                  value={editingAddonValue}
                                  onChange={(e) => setEditingAddonValue(e.target.value)}
                                  onBlur={commitAddonCellEdit}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitAddonCellEdit();
                                    if (e.key === "Escape") cancelAddonCellEdit();
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  className="w-full text-right min-h-[28px] px-2 py-1 rounded hover:bg-slate-100"
                                  onClick={() => startAddonCellEdit(a.id, "price", a.price)}
                                >
                                  {fmtCurrency.format(parseLooseNumber(a.price))}
                                </button>
                              )}
                            </TdSettings>
                            <TdSettings>
                              <div className="flex flex-wrap gap-1 sm:gap-2">
                                <button
                                  className="px-2 sm:px-3 py-1.5 rounded-md bg-red-600 text-white text-xs sm:text-sm"
                                  onClick={() => deleteAddon(a.id)}
                                >
                                  מחיקה
                                </button>
                              </div>
                            </TdSettings>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="p-3 border-t flex flex-wrap gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-slate-800 text-white"
                onClick={closeProfilesSettings}
              >
                שמירה ויציאה
              </button>
            </div>
          </Modal>
        )}
      </main>

      {/* Toast UI */}
      {toast && (
        <div className="fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 pointer-events-none">
          <div
            className={`pointer-events-auto max-w-sm w-full rounded-2xl shadow-lg px-4 py-3 text-sm text-white flex items-center gap-3 ${
              toast.variant === "error"
                ? "bg-rose-500"
                : toast.variant === "info"
                ? "bg-slate-800"
                : "bg-emerald-600"
            }`}
          >
            <span className="text-lg" aria-hidden="true">
              {toast.variant === "error" ? "⚠️" : "✅"}
            </span>
            <span className="flex-1 text-right leading-relaxed">
              {toast.message}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Small UI bits for Settings dialog */
function SettingsInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="grid gap-1.5 w-full">
      <span className="text-sm text-slate-700">{props.label}</span>
      <input
        type="text"
        inputMode={props.inputMode}
        className="w-full rounded-md bg-white border border-slate-300 px-3 py-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function ThSettings({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-right px-2 sm:px-3 py-2 text-slate-700 font-medium whitespace-nowrap text-xs sm:text-sm">
      {children}
    </th>
  );
}
function TdSettings({ children }: { children: React.ReactNode }) {
  return (
    <td className="text-right px-2 sm:px-3 py-2 align-top whitespace-nowrap text-xs sm:text-sm">
      {children}
    </td>
  );
}

/** Shows where the app data file is stored (Tauri only) */
function DataFileLocation() {
  const [path, setPath] = useState<string | null>(null);
  useEffect(() => {
    getDataFilePath().then(setPath);
  }, []);
  return (
    <div className="border rounded-lg p-4 bg-slate-50 border-slate-200">
      <div className="text-base font-semibold text-slate-800 mb-2">
        קובץ נתוני האפליקציה
      </div>
      <div className="text-sm text-slate-600 mb-2">
        כל הנתונים (לקוחות, הצעות, פרופילים, תוספות והגדרות) נשמרים אוטומטית בקובץ אחד בתיקיית האפליקציה.
      </div>
      {path && (
        <div className="text-xs text-slate-500 bg-white border rounded-lg px-3 py-2 break-all font-mono">
          {path}
        </div>
      )}
    </div>
  );
}

/** Modal */
function Modal({
  title,
  onClose,
  children,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="modal-panel card" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">{title}</h3>
          <button
            className="px-3 py-1.5 rounded-md bg-white border hover:bg-slate-50"
            onClick={onClose}
            aria-label="סגירה"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
