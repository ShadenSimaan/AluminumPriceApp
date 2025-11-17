// FILE: src/App.tsx
import React, { useEffect, useState } from "react";
import { exportQuotePdf } from "./pdfExporter";
import {
  AppState,
  Customer,
  LineItem,
  Profile,
} from "./types";
import QuotePage from "./QuotePage";
import CustomersPage from "./CustomersPage";

/** =========================
 *  Constants & Utilities
 *  ========================= */
const LS_KEY = "aluminum-quote-app:new-mobile-style-v1";

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
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

/** ===== Default state ===== */
const DEFAULT_STATE: AppState = {
  customers: [],
  quotes: [],
  profiles: defaultProfiles,
  current: {
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    customerNotes: "",
    title: "הצעת מחיר",
    items: [],
    taxPercentText: "18",
    notes: "",
  },
  ui: { tab: "quote", settingsOpen: false },
};

/** ===== Validate + migrate any LS object to the proper shape ===== */
function hydrateState(): AppState {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return structuredClone(DEFAULT_STATE);

  try {
    const parsed = JSON.parse(raw);
    const obj: Partial<AppState> =
      typeof parsed === "object" && parsed ? parsed : {};

    const customers = Array.isArray(obj.customers) ? obj.customers : [];
    const quotes = Array.isArray(obj.quotes) ? obj.quotes : [];
    const profiles =
      Array.isArray(obj.profiles) && obj.profiles.length > 0
        ? obj.profiles
        : defaultProfiles;

    const currentRaw: any = obj.current ?? {};
    const current = {
      customerName: String(currentRaw.customerName ?? ""),
      customerPhone: String(currentRaw.customerPhone ?? ""),
      customerEmail: String(currentRaw.customerEmail ?? ""),
      customerNotes: String(currentRaw.customerNotes ?? ""),
      title: String(currentRaw.title ?? "הצעת מחיר"),
      items: Array.isArray(currentRaw.items) ? currentRaw.items : [],
      taxPercentText: String(currentRaw.taxPercentText ?? "18"),
      notes: String(currentRaw.notes ?? ""),
    };

    const uiRaw: any = obj.ui ?? {};
    const tab: "quote" | "customers" =
      uiRaw.tab === "customers" ? "customers" : "quote";
    const ui = { tab, settingsOpen: Boolean(uiRaw.settingsOpen ?? false) };

    const safe: AppState = { customers, quotes, profiles, current, ui };
    return safe;
  } catch (e) {
    try {
      localStorage.setItem(LS_KEY + ":backup", raw!);
    } catch {}
    return structuredClone(DEFAULT_STATE);
  }
}

/** =========================
 *  App Component
 *  ========================= */
export default function App() {
  const [state, setState] = useState<AppState>(() => hydrateState());

  /** ======= Item Editor (inline calculator) ======= */
  function initItemEditor(): LineItem {
    const defaultProfile = state.profiles[0];
    return {
      id: uuid(),
      widthCm: "",
      heightCm: "",
      qty: "1",
      profileId: defaultProfile?.id,
      profileName: defaultProfile?.name ?? "",
      unitPrice: defaultProfile ? String(defaultProfile.unitPrice) : "0",
      location: "",
      details: "",
      addons: defaultAddonsPreset.map((a) => ({ ...a })),
      subtotal: 0,
    };
  }

  const [itemEditor, setItemEditor] = useState<LineItem>(() =>
    initItemEditor()
  );
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(
    state.profiles[0]?.id
  );

  // Persist on change (autosave)
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  // Keep active profile valid when profiles change
  useEffect(() => {
    setActiveProfileId((prev) => {
      if (prev && state.profiles.some((p) => p.id === prev)) return prev;
      return state.profiles[0]?.id ?? undefined;
    });
  }, [state.profiles]);

  // When active profile changes, sync to item editor (name + price)
  useEffect(() => {
    const p = state.profiles.find((p) => p.id === activeProfileId);
    setItemEditor((e) => ({
      ...e,
      profileId: p?.id,
      profileName: p?.name,
      unitPrice: p ? String(p.unitPrice) : e.unitPrice,
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
    const w = parseLooseNumber(widthCm);
    const h = parseLooseNumber(heightCm);
    const qty = Math.max(0, parseLooseNumber(qtyText));
    const area = (w * h) / 10000; // m²
    const addonsPerItem = (currentDraft.addons ?? []).reduce(
      (sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const unitPriceNum = parseLooseNumber(unitPriceText);
    const perItemPrice = area * unitPriceNum + addonsPerItem;
    const subtotal = perItemPrice * qty;

    const item: LineItem = {
      id: uuid(),
      widthCm,
      heightCm,
      qty: qtyText,
      profileId: currentDraft.profileId,
      profileName: currentDraft.profileName,
      unitPrice: unitPriceText,
      location: currentDraft.location ?? "",
      details: currentDraft.details ?? "",
      addons: (currentDraft.addons ?? []).map((a) => ({ ...a })),
      subtotal,
    };

    setState((s) => ({
      ...s,
      current: { ...s.current, items: [...s.current.items, item] },
    }));

    setItemEditor(initItemEditor());
    alert("החלון נוסף בהצלחה");
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

  function clearCurrentForm() {
    setItemEditor(initItemEditor());
  }

  // Completely new empty quote and go to "הצעה" tab
  function startNewEmptyQuote() {
    setState((s) => ({
      ...s,
      ui: { ...s.ui, tab: "quote" },
      current: {
        ...s.current,
        customerName: "",
        customerPhone: "",
        customerEmail: "",
        customerNotes: "",
        title: "הצעת מחיר",
        items: [],
        notes: "",
        taxPercentText: "18",
      },
    }));
    clearCurrentForm();
  }

  // ✅ On app load: ALWAYS start with a fresh new quote (not old one)
  useEffect(() => {
    startNewEmptyQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ======= Customers + Quotes helpers ======= */
  function ensureCustomerByName(
    name: string,
    phone?: string,
    email?: string,
    notes?: string
  ): Customer {
    const trimmed = name.trim();
    const existing = state.customers.find((c) => c.name === trimmed);
    if (existing) {
      const updated: Customer = {
        ...existing,
        phone: phone || existing.phone,
        email: email || existing.email,
        notes: notes ?? existing.notes,
      };
      if (JSON.stringify(updated) !== JSON.stringify(existing)) {
        setState((s) => ({
          ...s,
          customers: s.customers.map((c) =>
            c.id === updated.id ? updated : c
          ),
        }));
      }
      return updated;
    }
    const created: Customer = {
      id: uuid(),
      name: trimmed,
      phone,
      email,
      notes,
      createdAt: Date.now(),
    };
    setState((s) => ({ ...s, customers: [...s.customers, created] }));
    return created;
  }

  const subTotal = state.current.items.reduce(
    (a, it) => a + it.subtotal,
    0
  );
  const taxDecimal = normalizeTaxPercent(
    parseLooseNumber(state.current.taxPercentText ?? "18")
  );
  const taxValue = subTotal * taxDecimal;
  const grandTotal = subTotal + taxValue;

  function saveQuote() {
    if (!state.current.customerName.trim()) {
      alert("אנא הזן/י שם לקוח");
      return;
    }
    const customer = ensureCustomerByName(
      state.current.customerName,
      state.current.customerPhone,
      state.current.customerEmail,
      state.current.customerNotes
    );

    const quote = {
      id: uuid(),
      customerId: customer.id,
      title: state.current.title || "הצעת מחיר",
      date: Date.now(),
      items: state.current.items,
      taxPercent: parseLooseNumber(state.current.taxPercentText ?? "18"),
      totals: { sub: subTotal, tax: taxValue, grand: grandTotal },
    };

    setState((s) => ({
      ...s,
      quotes: [...s.quotes.filter((q) => q.customerId !== customer.id), quote],
    }));
    alert("הצעה נשמרה ללקוח");
  }

  function openLastQuoteForCustomer(customerId: string) {
    const q = [...state.quotes]
      .filter((x) => x.customerId === customerId)
      .sort((a, b) => b.date - a.date)[0];
    const customer = state.customers.find((c) => c.id === customerId);
    if (!q || !customer) {
      alert("אין הצעה שמורה ללקוח זה");
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

  function deleteCustomer(customerId: string) {
    if (!confirm("למחוק את הלקוח וכל ההצעות שלו?")) return;
    setState((s) => ({
      ...s,
      customers: s.customers.filter((c) => c.id !== customerId),
      quotes: s.quotes.filter((q) => q.customerId !== customerId),
    }));
  }

  // ======== PDF EXPORT =========
  const handleExportPdf = async () => {
    if (!state.current.customerName.trim()) {
      alert("אנא הזן/י שם לקוח לפני יצוא PDF");
      return;
    }
    if (!state.current.items.length) {
      alert("ההצעה ריקה. הוסף/י פריטים לפני יצוא PDF.");
      return;
    }

    await exportQuotePdf({
      title: state.current.title || "הצעת מחיר",
      customerName: state.current.customerName,
      customerPhone: state.current.customerPhone,
      customerEmail: state.current.customerEmail,
      notes: state.current.notes,
      taxPercentText: state.current.taxPercentText ?? "18",
      items: state.current.items,
    });
  };

  // Export last quote for customer from לקוחות page
  function exportLastQuoteForCustomer(customerId: string) {
    const hasQuote = state.quotes.some((q) => q.customerId === customerId);
    if (!hasQuote) {
      alert("אין הצעה שמורה ללקוח זה");
      return;
    }
    openLastQuoteForCustomer(customerId);
    setTimeout(() => {
      handleExportPdf();
    }, 0);
  }

  /** ======= Settings dialog: profiles CRUD ======= */
  const [profileDraft, setProfileDraft] = useState<{
    id?: string;
    name: string;
    unitPrice: string;
  }>({ name: "", unitPrice: "" });

  function openSettings() {
    setState((s) => ({ ...s, ui: { ...s.ui, settingsOpen: true } }));
  }
  function closeSettings() {
    setState((s) => ({ ...s, ui: { ...s.ui, settingsOpen: false } }));
    setProfileDraft({ name: "", unitPrice: "" });
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
  function editProfile(p: Profile) {
    setProfileDraft({ id: p.id, name: p.name, unitPrice: String(p.unitPrice) });
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
            <h1 className="text-xl sm:text-2xl font-semibold">
              הצעת מחיר — אלום סמעאן
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
            openSettings={openSettings}
            onAddItem={() => addItem(itemEditor)}
            onRemoveItem={removeItem}
            onSaveQuote={saveQuote}
            onExportPdf={handleExportPdf}
          />
        ) : (
          <CustomersPage
            customers={state.customers}
            quotes={state.quotes}
            onOpenLast={openLastQuoteForCustomer}
            onCreateNewOrder={startNewEmptyQuote}
            onExportPdf={exportLastQuoteForCustomer}
            onDeleteCustomer={deleteCustomer}
          />
        )}

        {/* Settings Dialog */}
        {state.ui.settingsOpen && (
          <Modal onClose={closeSettings} title="הגדרות — ניהול פרופילים">
            <div className="modal-body p-4 space-y-4">
              <div className="text-sm text-slate-600">
                הוספה/עריכה של פרופילים (למשל 4300, 7300) עם מחיר למ״ר.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <div className="flex items-end gap-2">
                  {profileDraft.id ? (
                    <button
                      className="px-3 py-2 rounded-lg bg-sky-500 text-white"
                      onClick={saveProfileEdit}
                    >
                      שמירת עריכה
                    </button>
                  ) : (
                    <button
                      className="px-3 py-2 rounded-lg bg-sky-500 text-white"
                      onClick={addProfile}
                    >
                      הוספת פרופיל
                    </button>
                  )}
                  <button
                    className="px-3 py-2 rounded-lg bg-white border"
                    onClick={() =>
                      setProfileDraft({ name: "", unitPrice: "" })
                    }
                  >
                    ניקוי
                  </button>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
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
                          <TdSettings>{p.name}</TdSettings>
                          <TdSettings>
                            {fmtCurrency.format(p.unitPrice)}
                          </TdSettings>
                          <TdSettings>
                            <div className="flex flex-wrap gap-2">
                              <button
                                className="px-3 py-1.5 rounded-md bg-white border hover:bg-slate-50"
                                onClick={() => editProfile(p)}
                              >
                                עריכה
                              </button>
                              <button
                                className="px-3 py-1.5 rounded-md bg-red-600 text-white"
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
            </div>
            <div className="p-3 border-t flex flex-wrap gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-slate-800 text-white"
                onClick={closeSettings}
              >
                סגירה
              </button>
            </div>
          </Modal>
        )}
      </main>
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
    <th className="text-right px-3 py-2 text-slate-700 font-medium whitespace-nowrap">
      {children}
    </th>
  );
}
function TdSettings({ children }: { children: React.ReactNode }) {
  return (
    <td className="text-right px-3 py-2 align-top whitespace-nowrap">
      {children}
    </td>
  );
}

/** Modal */
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
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
          <h3 className="text-base font-semibold">{title}</h3>
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
