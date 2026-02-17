// FILE: src/App.tsx
import React, { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { exportQuotePdf, openPdfSaveFolder } from "./pdfExporter";
import { AppState, Customer, LineItem, Profile, FreeFormAddition, Addon } from "./types";
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
    items: [],
    freeFormAdditions: [],
    taxPercentText: "18",
    notes: "",
  },
  ui: { tab: "quote", settingsOpen: false, profilesSettingsOpen: false },
  pdfSaveFolder: undefined,
  dimensionUnit: "cm",
};

/** ===== Normalize a raw object into valid AppState (for LS or data file) ===== */
function normalizeState(obj: unknown): AppState {
  const o: Partial<AppState> =
    typeof obj === "object" && obj !== null ? (obj as Partial<AppState>) : {};
  const customers = Array.isArray(o.customers) ? o.customers : [];
  const quotes = Array.isArray(o.quotes) ? o.quotes : [];
  const profiles =
    Array.isArray(o.profiles) && o.profiles.length > 0 ? o.profiles : defaultProfiles;
  const addons =
    Array.isArray(o.addons) && o.addons.length > 0
      ? o.addons
      : defaultAddonsPreset.map((a) => ({ ...a }));
  const currentRaw: any = o.current ?? {};
  const current = {
    customerName: String(currentRaw.customerName ?? ""),
    customerPhone: String(currentRaw.customerPhone ?? ""),
    customerEmail: String(currentRaw.customerEmail ?? ""),
    customerNotes: String(currentRaw.customerNotes ?? ""),
    title: String(currentRaw.title ?? "הצעת מחיר"),
    items: Array.isArray(currentRaw.items) ? currentRaw.items : [],
    freeFormAdditions: Array.isArray(currentRaw.freeFormAdditions) ? currentRaw.freeFormAdditions : [],
    taxPercentText: String(currentRaw.taxPercentText ?? "18"),
    notes: String(currentRaw.notes ?? ""),
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
  return { customers, quotes, profiles, addons, current, ui, pdfSaveFolder, dimensionUnit };
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

function saveQuoteToState(
  s: AppState
): { nextState: AppState; error?: string } {
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

  const quote = {
    id: uuid(),
    customerId: customer.id,
    title: withCustomer.current.title || "הצעת מחיר",
    date: Date.now(),
    items: withCustomer.current.items,
    taxPercent: parseLooseNumber(withCustomer.current.taxPercentText ?? "18"),
    totals: { sub: subTotalLocal, tax: taxValueLocal, grand: grandTotalLocal },
  };

  const nextState: AppState = {
    ...withCustomer,
    quotes: [
      ...withCustomer.quotes.filter((q) => q.customerId !== customer.id),
      quote,
    ],
  };

  return { nextState };
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

  // Keep active profile valid when profiles change
  useEffect(() => {
    setActiveProfileId((prev) => {
      if (prev && state.profiles.some((p) => p.id === prev)) return prev;
      return undefined; // Default to nothing selected
    });
  }, [state.profiles]);

  // When active profile changes, sync to item editor (name + price)
  useEffect(() => {
    const p = state.profiles.find((p) => p.id === activeProfileId);
    setItemEditor((e) => ({
      ...e,
      profileId: p?.id,
      profileName: p?.name ?? undefined,
      unitPrice: p ? String(p.unitPrice) : "0",
    }));
  }, [activeProfileId, state.profiles]);

  function updateCurrent<K extends keyof AppState["current"]>(
    key: K,
    val: AppState["current"][K]
  ) {
    setState((s) => ({ ...s, current: { ...s.current, [key]: val } }));
  }

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

  function removeItem(id: string) {
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
    setItemEditor({ ...item });
    setActiveProfileId(item.profileId);
  }

  function updateItem(id: string, updated: LineItem) {
    setState((s) => ({
      ...s,
      current: {
        ...s.current,
        items: s.current.items.map((it) => (it.id === id ? updated : it)),
      },
    }));
  }

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

  function removeFreeFormAddition(id: string) {
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
        items: [] as LineItem[],
        freeFormAdditions: [] as FreeFormAddition[],
        notes: "",
        taxPercentText: "18",
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
        customerPhone: customer.phone ?? "",
        customerEmail: customer.email ?? "",
        customerNotes: customer.notes ?? "",
        items: q.items.map((it) => ({ ...it, id: uuid() })), // clone
        title: q.title,
        taxPercentText: String(q.taxPercent ?? "18"),
        notes: s.current.notes,
      },
    }));
    clearCurrentForm();
  }

  async function deleteCustomer(customerId: string) {
    const customer = state.customers.find((c) => c.id === customerId);
    const name = customer?.name ? ` "${customer.name}"` : "";
    const message = `האם אתה בטוח שברצונך למחוק את הלקוח${name}? פעולה זו תמחק גם את כל ההצעות השמורות של הלקוח.`;
    let confirmed = false;
    if (isTauri()) {
      try {
        const dialogModule = await import("@tauri-apps/plugin-dialog");
        confirmed = await dialogModule.confirm(message, {
          title: "אישור מחיקה",
          kind: "warning",
          okLabel: "כן, מחק",
          cancelLabel: "ביטול",
        });
      } catch {
        confirmed = window.confirm(message);
      }
    } else {
      confirmed = window.confirm(message);
    }
    if (!confirmed) return;
    setState((s) => ({
      ...s,
      customers: s.customers.filter((c) => c.id !== customerId),
      quotes: s.quotes.filter((q) => q.customerId !== customerId),
    }));
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
      const { nextState, error: saveError } = saveQuoteToState(state);
      if (saveError) {
        showToast(saveError, "error");
        return;
      }
      setState(nextState);

      const result = await exportQuotePdf({
        title: nextState.current.title || "הצעת מחיר",
        customerName: nextState.current.customerName,
        customerPhone: nextState.current.customerPhone,
        customerEmail: nextState.current.customerEmail,
        notes: nextState.current.notes,
        taxPercentText: nextState.current.taxPercentText ?? "18",
        items: nextState.current.items,
        freeFormAdditions: nextState.current.freeFormAdditions,
        pdfSaveFolder: nextState.pdfSaveFolder,
        dimensionUnit: nextState.dimensionUnit ?? "cm",
      });

      if (result.success === false) {
        showToast(result.error, "error");
        return;
      }

      showToast("ה-PDF נשמר בהצלחה. התיקייה נפתחה עם הקובץ.", "success");
    } catch (err: any) {
      const msg = err?.message || String(err) || "שגיאה ביצוא PDF";
      showToast(msg, "error");
    }
  };

  const handleOpenPdfFolder = async () => {
    const result = await openPdfSaveFolder(state.pdfSaveFolder);
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
  function deleteProfile(id: string) {
    setState((s) => ({
      ...s,
      profiles: s.profiles.filter((p) => p.id !== id),
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

  function deleteAddon(id: string) {
    setState((s) => ({
      ...s,
      addons: s.addons.filter((a) => a.id !== id),
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
      <main className="w-full max-w-[1160px] flex flex-col gap-4 px-2">
        {/* Top Bar */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 shadow-md grid place-items-center text-white font-bold">
              א
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold">
              הצעת מחיר — אלום סמעאן סאמי
            </h1>
          </div>
          <div className="flex items-center gap-2">
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
            {state.ui.tab === "quote" && (
              <button
                className="hidden sm:inline-flex px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:opacity-95"
                onClick={startNewEmptyQuote}
              >
                הצעה חדשה
              </button>
            )}
          </div>
        </header>

        {/* "הצעה חדשה" button for mobile */}
        {state.ui.tab === "quote" && (
          <div className="sm:hidden">
            <button
              className="w-full rounded-lg bg-emerald-600 text-white text-sm py-2 mb-1"
              onClick={startNewEmptyQuote}
            >
              הצעה חדשה
            </button>
          </div>
        )}

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
            onResetItemEditor={() => {
              setItemEditor(initItemEditor());
              setActiveProfileId(undefined);
            }}
            onRemoveItem={removeItem}
            onEditItem={editItem}
            onUpdateItem={updateItem}
            onMoveItemUp={moveItemUp}
            onMoveItemDown={moveItemDown}
            onAddFreeFormAddition={addFreeFormAddition}
            onUpdateFreeFormAddition={updateFreeFormAddition}
            onRemoveFreeFormAddition={removeFreeFormAddition}
            onExportPdf={handleExportPdf}
            showPdfFolderControl={isTauri()}
            pdfSaveFolder={state.pdfSaveFolder}
            onSelectPdfFolder={selectPdfSaveFolder}
            onOpenPdfFolder={handleOpenPdfFolder}
            dimensionUnit={state.dimensionUnit ?? "cm"}
            onAddProfileQuick={addProfileQuick}
          />
        ) : (
          <CustomersPage
            customers={state.customers}
            quotes={state.quotes}
            onOpenLast={openLastQuoteForCustomer}
            onCreateNewOrder={startNewEmptyQuote}
            onOpenPdfFolder={isTauri() ? handleOpenPdfFolder : undefined}
            onDeleteCustomer={deleteCustomer}
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
