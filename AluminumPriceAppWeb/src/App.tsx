// FILE: src/App.tsx
import React, { useEffect, useMemo, useState } from "react";

/** =========================
 *  Types (per requirements)
 *  ========================= */
type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: number;
};

type Quote = {
  id: string;
  customerId: string;
  title: string; // internal only (for filename)
  date: number; // epoch ms
  items: LineItem[];
  taxPercent: number; // accepts 0.18 or 18
  totals: { sub: number; tax: number; grand: number };
};

type Profile = {
  id: string;
  name: string;
  unitPrice: number; // price per m²
};

type Addon = {
  id: string;
  name: string;
  price: string; // text input (per item)
  checked: boolean;
};

type LineItem = {
  id: string;
  widthCm: string; // text input
  heightCm: string; // text input
  qty: string; // text input
  profileId?: string;
  profileName?: string;
  unitPrice: string; // from profile by default but editable
  location?: string;
  details?: string;
  addons: Addon[];
  subtotal: number; // computed
};

type AppState = {
  customers: Customer[];
  quotes: Quote[];
  profiles: Profile[];
  current: {
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    customerNotes: string;
    title: string;
    items: LineItem[];
    taxPercentText: string;
    notes: string;
  };
  ui: {
    tab: "quote" | "customers";
    settingsOpen: boolean;
  };
};

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

const fmtNumber = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const fmtCurrency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
});
const fmtDate = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" });

const defaultProfiles: Profile[] = [
  { id: uuid(), name: "4300", unitPrice: 520 },
  { id: uuid(), name: "5600", unitPrice: 590 },
  { id: uuid(), name: "7300", unitPrice: 690 },
  { id: uuid(), name: "7600", unitPrice: 740 },
];

const defaultAddonsPreset: Addon[] = [
  { id: uuid(), name: "רשת", price: "80", checked: false },
  { id: uuid(), name: "פרזול איכותי", price: "120", checked: false },
  { id: uuid(), name: "תריס גלילה", price: "0", checked: false },
];

/** ===== Default state (used for migration/fallback) ===== */
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
    taxPercentText: "17",
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
      taxPercentText: String(currentRaw.taxPercentText ?? "17"),
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
    return {
      id: uuid(),
      widthCm: "",
      heightCm: "",
      qty: "1",
      profileId: undefined,
      profileName: "",
      unitPrice: "0",
      location: "",
      details: "",
      addons: defaultAddonsPreset.map((a) => ({ ...a })),
      subtotal: 0,
    };
  }
  const [itemEditor, setItemEditor] = useState<LineItem>(initItemEditor());
  const [activeProfileId, setActiveProfileId] = useState<string | undefined>(
    undefined
  );

  // Persist on change (autosave)
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  // Initialize default selected profile once after load (if exists)
  useEffect(() => {
    setActiveProfileId(
      (prev) => prev ?? (state.profiles[0]?.id ?? undefined)
    );
  }, [state.profiles]);

  useEffect(() => {
    const p = state.profiles.find((p) => p.id === activeProfileId);
    setItemEditor((e) => ({
      ...e,
      profileId: p?.id,
      profileName: p?.name,
      unitPrice: p ? String(p.unitPrice) : e.unitPrice,
    }));
  }, [activeProfileId, state.profiles]);

  /** ======= Derived values & helpers ======= */
  const taxDecimal = normalizeTaxPercent(
    parseLooseNumber(state.current?.taxPercentText ?? "17")
  );
  const subTotal = useMemo(
    () => state.current.items.reduce((a, it) => a + it.subtotal, 0),
    [state.current.items]
  );
  const taxValue = subTotal * taxDecimal;
  const grandTotal = subTotal + taxValue;

  const liveArea = useMemo(() => {
    const w = parseLooseNumber(itemEditor.widthCm);
    const h = parseLooseNumber(itemEditor.heightCm);
    return (w * h) / 10000;
  }, [itemEditor.widthCm, itemEditor.heightCm]);

  const liveAddonsSumPerItem = useMemo(
    () =>
      itemEditor.addons.reduce(
        (sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0),
        0
      ),
    [itemEditor.addons]
  );

  const livePerItemPrice = useMemo(() => {
    const unit = parseLooseNumber(itemEditor.unitPrice);
    return liveArea * unit + liveAddonsSumPerItem;
  }, [liveArea, itemEditor.unitPrice, liveAddonsSumPerItem]);

  const liveQty = useMemo(
    () => Math.max(0, parseLooseNumber(itemEditor.qty)),
    [itemEditor.qty]
  );
  const liveLineSubtotal = useMemo(
    () => livePerItemPrice * liveQty,
    [livePerItemPrice, liveQty]
  );

  function updateCurrent<K extends keyof AppState["current"]>(
    key: K,
    val: AppState["current"][K]
  ) {
    setState((s) => ({ ...s, current: { ...s.current, [key]: val } }));
  }

  function addItem(currentDraft?: Partial<LineItem>) {
    const widthCm = currentDraft?.widthCm ?? "";
    const heightCm = currentDraft?.heightCm ?? "";
    const qtyText = currentDraft?.qty ?? "";
    const unitPriceText = currentDraft?.unitPrice ?? "0";
    const w = parseLooseNumber(widthCm);
    const h = parseLooseNumber(heightCm);
    const qty = Math.max(0, parseLooseNumber(qtyText));
    const area = (w * h) / 10000; // m²
    const addonsPerItem = (currentDraft?.addons ?? []).reduce(
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
      profileId: currentDraft?.profileId,
      profileName: currentDraft?.profileName,
      unitPrice: unitPriceText,
      location: currentDraft?.location ?? "",
      details: currentDraft?.details ?? "",
      addons: (currentDraft?.addons ?? []).map((a) => ({ ...a })),
      subtotal,
    };

    setState((s) => ({
      ...s,
      current: { ...s.current, items: [...s.current.items, item] },
    }));
    // Clear editor after adding
    setItemEditor(initItemEditor());
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
      },
    }));
    clearCurrentForm();
  }

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

    const quote: Quote = {
      id: uuid(),
      customerId: customer.id,
      title: state.current.title || "הצעת מחיר",
      date: Date.now(),
      items: state.current.items,
      taxPercent: parseLooseNumber(state.current.taxPercentText ?? "17"),
      totals: { sub: subTotal, tax: taxValue, grand: grandTotal },
    };

    // Keep only one quote per customer (overwrite old)
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
        taxPercentText: String(q.taxPercent ?? "17"),
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

  // Export last quote for customer from לקוחות page
  function exportLastQuoteForCustomer(customerId: string) {
    const hasQuote = state.quotes.some((q) => q.customerId === customerId);
    if (!hasQuote) {
      alert("אין הצעה שמורה ללקוח זה");
      return;
    }
    openLastQuoteForCustomer(customerId);
    setTimeout(() => {
      generateAndExportPDF();
    }, 0);
  }


  
//===================================================================================================================================================================
//===================================================================================================================================================================
//===================================================================================================================================================================

// ======== PDF EXPORT (HEBREW FIXED: NORMAL + BOLD FONT) ========
// ======== PDF EXPORT (STYLED + FIXED HEBREW/LTR) ========

const PDF_FONT_NAME = "NotoHebrew";
const PDF_FONT_FILE = "NotoSansHebrew-Regular.ttf"; // expects /fonts/NotoSansHebrew-Regular.ttf
const HEBREW_REGEX = /[\u0590-\u05FF]/;

// Detect if a string is mostly RTL (Hebrew) or LTR (English/Latin)
function isRTLText(text: string): boolean {
  return HEBREW_REGEX.test(text);
}

// Draw text with smart direction: Hebrew → RTL/right, English → LTR/left or center
function drawTextSmart(
  doc: any,
  text: string,
  x: number,
  y: number,
  opts: { align?: "left" | "right" | "center"; forceRtl?: boolean } = {}
) {
  const rtl = opts.forceRtl ?? isRTLText(text);
  const align = opts.align ?? (rtl ? "right" : "left");

  const prevR2L = (doc as any).R2L;
  try {
    (doc as any).setR2L?.(rtl);
  } catch {}
  doc.text(text, x, y, { align });
  try {
    (doc as any).setR2L?.(prevR2L);
  } catch {}
}

async function generateAndExportPDF() {
  let jsPDFMod: any;
  try {
    jsPDFMod = await import("jspdf");
  } catch (e) {
    alert("חסרות חבילות PDF. התקן/י: npm i jspdf");
    return;
  }
  const jsPDF = jsPDFMod.default || jsPDFMod;

  if (!state.current.customerName.trim()) {
    alert("אנא הזן/י שם לקוח לפני יצוא PDF");
    return;
  }
  if (state.current.items.length === 0) {
    alert("ההצעה ריקה. הוסף/י פריטים לפני יצוא PDF.");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  await ensureHebrewFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginTop = 40;
  const marginBottom = 40;

  let cursorY = marginTop;

  // ===== Header =====
  const headerLines = [
    "אלום סמעאן סאמי",
    "ביצוע עבודות אלומיניום ותריס",
    "פסוטה   ת.ד 528             טל/פקס : 9870933          נייד0526475531",
    "ע.מ. מס' 023107659",
  ];

  doc.setFont(PDF_FONT_NAME, "bold");
  doc.setFontSize(13);
  headerLines.forEach((line) => {
    drawTextSmart(doc, line, pageWidth / 2, cursorY, {
      align: "center",
      forceRtl: true,
    });
    cursorY += 18;
  });

  doc.setFont(PDF_FONT_NAME, "normal");
  doc.setFontSize(12);
  cursorY += 10;

  // ===== Customer block =====
  const customerLine = [state.current.customerName, state.current.customerPhone]
    .filter(Boolean)
    .join(" • ");
  const emailLine = state.current.customerEmail?.trim() || "";

  if (customerLine) {
    drawTextSmart(doc, customerLine, pageWidth / 2, cursorY, {
      align: "center",
    });
    cursorY += 16;
  }
  if (emailLine) {
    // Emails should be LTR and centered
    drawTextSmart(doc, emailLine, pageWidth / 2, cursorY, {
      align: "center",
      forceRtl: false,
    });
    cursorY += 16;
  }

  // Divider line
  doc.setDrawColor(200);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 12;

  // ===== Items table =====
  cursorY = drawItemsTable(
    doc,
    state.current.items,
    cursorY,
    marginX,
    pageWidth,
    pageHeight,
    marginTop,
    marginBottom
  );

  // ===== Totals box =====
  const boxWidth = 240;
  const boxX = pageWidth - marginX - boxWidth;
  let boxY = cursorY + 18;

  const sub = state.current.items.reduce((a, it) => a + it.subtotal, 0);
  const taxDecimalNow = normalizeTaxPercent(
    parseLooseNumber(state.current.taxPercentText ?? "17")
  );
  const vat = sub * taxDecimalNow;
  const grand = sub + vat;

  doc.setDrawColor(210);
  doc.roundedRect(boxX, boxY, boxWidth, 96, 8, 8);
  boxY += 24;

  doc.setFont(PDF_FONT_NAME, "normal");
  drawTextSmart(
    doc,
    `מחיר: ${fmtCurrency.format(sub)}`,
    boxX + boxWidth - 12,
    boxY,
    { align: "right" }
  );
  boxY += 22;
  drawTextSmart(
    doc,
    `מע״מ: ${fmtCurrency.format(vat)}`,
    boxX + boxWidth - 12,
    boxY,
    { align: "right" }
  );
  boxY += 24;

  // Highlighted grand total
  doc.setFillColor(236, 248, 255);
  doc.roundedRect(boxX + 10, boxY - 18, boxWidth - 20, 30, 6, 6, "F");
  doc.setFont(PDF_FONT_NAME, "bold");
  drawTextSmart(
    doc,
    `סה״כ לתשלום: ${fmtCurrency.format(grand)}`,
    boxX + boxWidth - 18,
    boxY + 2,
    { align: "right" }
  );
  doc.setFont(PDF_FONT_NAME, "normal");

  // ===== Footer: date + notes + signature =====
  let footerY = Math.max(boxY + 36, cursorY + 120);

  drawTextSmart(
    doc,
    `תאריך: ${fmtDate.format(new Date())}`,
    pageWidth - marginX,
    footerY,
    { align: "right" }
  );
  footerY += 18;

  if (state.current.notes?.trim()) {
    const notesText = `הערות: ${state.current.notes.trim()}`;
    const wrapped = doc.splitTextToSize(
      notesText,
      pageWidth - marginX * 2
    );
    // draw each line with smart RTL handling
    wrapped.forEach((line: string, idx: number) => {
      drawTextSmart(
        doc,
        line,
        pageWidth - marginX,
        footerY + idx * 14,
        { align: "right" }
      );
    });
    footerY += wrapped.length * 14 + 10;
  }

  drawTextSmart(doc, "חתימה:", pageWidth - marginX, footerY, {
    align: "right",
  });

  try {
    const sigResp = await fetch("/signature.png");
    if (sigResp.ok) {
      const blob = await sigResp.blob();
      const dataUrl = await blobToDataUrl(blob);
      doc.addImage(
        dataUrl,
        "PNG",
        pageWidth - marginX - 160,
        footerY - 18,
        140,
        48
      );
    }
  } catch {
    // ignore
  }

  const filename = `${state.current.title || "הצעת מחיר"}.pdf`;
  await androidSafeSave(doc, filename);
}

// Stylish table: zebra rows, proper column widths, smart RTL/LTR text
function drawItemsTable(
  doc: any,
  items: LineItem[],
  startY: number,
  marginX: number,
  pageWidth: number,
  pageHeight: number,
  marginTop: number,
  marginBottom: number
): number {
  const right = pageWidth - marginX;
  const left = marginX;

  // Column widths sum == page content width (no overflow)
  const colWidths = {
    num: 25,
    dims: 60,
    location: 70,
    details: 180,
    unitPrice: 75,
    qty: 45,
    total: 60,
  }; // 25+60+70+180+75+45+60 = 515

  // Right edges (RTL layout, from right to left)
  const colX = {
    total: right,
    qty: right - colWidths.total,
    unitPrice: right - colWidths.total - colWidths.qty,
    details:
      right - colWidths.total - colWidths.qty - colWidths.unitPrice,
    location:
      right -
      colWidths.total -
      colWidths.qty -
      colWidths.unitPrice -
      colWidths.details,
    dims:
      right -
      colWidths.total -
      colWidths.qty -
      colWidths.unitPrice -
      colWidths.details -
      colWidths.location,
    num:
      right -
      colWidths.total -
      colWidths.qty -
      colWidths.unitPrice -
      colWidths.details -
      colWidths.location -
      colWidths.dims,
  };

  const headerHeight = 24;
  const rowLineHeight = 14;
  let y = startY;

  const drawHeader = () => {
    if (y + headerHeight > pageHeight - marginBottom) {
      doc.addPage();
      doc.setFont(PDF_FONT_NAME, "normal");
      y = marginTop;
    }

    // header background
    doc.setFillColor(236, 248, 255);
    doc.roundedRect(left, y, right - left, headerHeight, 6, 6, "F");
    doc.setDrawColor(210);
    doc.roundedRect(left, y, right - left, headerHeight, 6, 6);

    const centerY = y + headerHeight / 2 + 4;

    doc.setFont(PDF_FONT_NAME, "bold");
    drawTextSmart(
      doc,
      "מידות )ס״מ(",
      colX.dims - 4,
      centerY,
      { align: "right" }
    );
    drawTextSmart(doc, "מיקום", colX.location - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "פרטים", colX.details - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "מחיר ליח׳", colX.unitPrice - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "כמות", colX.qty - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "סה״כ", colX.total - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "מס׳", colX.num - 4, centerY, { align: "right" });

    doc.setFont(PDF_FONT_NAME, "normal");

    y += headerHeight;
  };

  const drawRowBorders = (rowHeight: number, startYRow: number) => {
    doc.setDrawColor(230);
    doc.rect(left, startYRow, right - left, rowHeight);

    const xs = [
      colX.total - colWidths.total,
      colX.qty - colWidths.qty,
      colX.unitPrice - colWidths.unitPrice,
      colX.details - colWidths.details,
      colX.location - colWidths.location,
      colX.dims - colWidths.dims,
    ];
    xs.forEach((x) => {
      doc.line(x, startYRow, x, startYRow + rowHeight);
    });
  };

  if (items.length === 0) return y;

  drawHeader();

  items.forEach((it, idx) => {
    const w = parseLooseNumber(it.widthCm);
    const h = parseLooseNumber(it.heightCm);
    const dims = `${fmtNumber.format(w)}×${fmtNumber.format(h)}`;

    const addonsText = it.addons
      .filter((a) => a.checked)
      .map((a) => `${a.name} (${fmtCurrency.format(parseLooseNumber(a.price))})`)
      .join(" • ");

    const detailsFull = [it.details, addonsText].filter(Boolean).join(" — ");

    const qty = Math.max(0, parseLooseNumber(it.qty));
    const area = (w * h) / 10000;
    const addonsSum = it.addons.reduce(
      (s, a) => s + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const unitPriceNum = parseLooseNumber(it.unitPrice);
    const perItemPrice = area * unitPriceNum + addonsSum;
    const lineTotal = perItemPrice * qty;

    const numStr = String(idx + 1);
    const locStr = it.location || "";
    const unitPriceStr = fmtCurrency.format(perItemPrice);
    const qtyStr = fmtNumber.format(qty);
    const totalStr = fmtCurrency.format(lineTotal);

    const detailsMaxWidth = colWidths.details - 8;
    const detailsLines = detailsFull
      ? doc.splitTextToSize(detailsFull, detailsMaxWidth)
      : [];

    const linesCount = Math.max(1, detailsLines.length);
    const rowHeight = linesCount * rowLineHeight + 6;

    // new page if needed
    if (y + rowHeight > pageHeight - marginBottom) {
      doc.addPage();
      doc.setFont(PDF_FONT_NAME, "normal");
      y = marginTop;
      drawHeader();
    }

    const rowTop = y;
    const baseline = y + rowLineHeight + 2;

    // zebra background
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(left, rowTop, right - left, rowHeight, "F");
    }

    drawRowBorders(rowHeight, rowTop);

    doc.setFont(PDF_FONT_NAME, "normal");
    drawTextSmart(doc, numStr, colX.num - 4, baseline, { align: "right" });
    drawTextSmart(doc, dims, colX.dims - 4, baseline, { align: "right" });
    if (locStr) {
      drawTextSmart(doc, locStr, colX.location - 4, baseline, {
        align: "right",
      });
    }
    if (detailsLines.length > 0) {
      let dy = baseline;
      detailsLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.details - 4, dy, { align: "right" });
        dy += rowLineHeight;
      });
    }
    drawTextSmart(
      doc,
      unitPriceStr,
      colX.unitPrice - 4,
      baseline,
      { align: "right" }
    );
    drawTextSmart(doc, qtyStr, colX.qty - 4, baseline, {
      align: "right",
    });
    drawTextSmart(doc, totalStr, colX.total - 4, baseline, {
      align: "right",
    });

    y += rowHeight;
  });

  return y;
}

// register Noto font both as "normal" & "bold"
async function ensureHebrewFont(doc: any) {
  try {
    const fontResp = await fetch("/fonts/NotoSansHebrew-Regular.ttf");
    if (!fontResp.ok) throw new Error("font missing");
    const buf = await fontResp.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);

    doc.addFileToVFS(PDF_FONT_FILE, base64);
    doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, "normal");
    doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, "bold");
    doc.setFont(PDF_FONT_NAME, "normal");
  } catch (e) {
    console.warn(
      "Hebrew font not found at /fonts/NotoSansHebrew-Regular.ttf. Proceeding with default font.",
      e
    );
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

async function androidSafeSave(doc: any, filename: string) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  try {
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch {
    doc.save(filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

//===================================================================================================================================================================
//===================================================================================================================================================================
//===================================================================================================================================================================
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
                  setState((s) => ({ ...s, ui: { ...s.ui, tab: "customers" } }))
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

        {/* Quote tab */}
        {state.ui.tab === "quote" ? (
          <section className="grid gap-4">
            {/* Customer inline form */}
            <section className="card p-4 w-full">
              <h2 className="text-lg font-semibold mb-3">פרטי לקוח</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <LabeledInput
                  label="שם לקוח*"
                  placeholder="חובה"
                  value={state.current.customerName}
                  onChange={(v) => updateCurrent("customerName", v)}
                />
                <LabeledInput
                  label="טלפון"
                  placeholder="אופציונלי"
                  value={state.current.customerPhone}
                  onChange={(v) => updateCurrent("customerPhone", v)}
                  inputMode="tel"
                />
                <LabeledInput
                  label="אימייל"
                  placeholder="אופציונלי"
                  value={state.current.customerEmail}
                  onChange={(v) => updateCurrent("customerEmail", v)}
                  inputMode="email"
                />
                <LabeledInput
                  label="הערות ללקוח (לא חובה)"
                  placeholder=""
                  value={state.current.customerNotes}
                  onChange={(v) => updateCurrent("customerNotes", v)}
                />
              </div>
            </section>

            {/* Calculator + Add item */}
            <section className="card p-4 w-full">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <h2 className="text-lg font-semibold">מחשבון פריט</h2>
                <div className="text-sm text-slate-600">
                  גובה הממשק מותאם לנייד (100vh אמיתי)
                </div>
              </div>

              {/* Row 1: width / height / qty (no col-span tricks) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <LabeledInput
                  label="רוחב (ס״מ)"
                  value={itemEditor.widthCm}
                  onChange={(v) =>
                    setItemEditor({ ...itemEditor, widthCm: v })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label="גובה (ס״מ)"
                  value={itemEditor.heightCm}
                  onChange={(v) =>
                    setItemEditor({ ...itemEditor, heightCm: v })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label="כמות"
                  value={itemEditor.qty}
                  onChange={(v) => setItemEditor({ ...itemEditor, qty: v })}
                  inputMode="numeric"
                />
              </div>

              {/* Row 2: profile / unitPrice / location */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <LabeledSelect
                  label="פרופיל"
                  value={activeProfileId ?? ""}
                  onChange={(id) => setActiveProfileId(id || undefined)}
                  options={[
                    { label: "— בחר/י —", value: "" },
                    ...state.profiles.map((p) => ({
                      label: p.name,
                      value: p.id,
                    })),
                  ]}
                />
                <LabeledInput
                  label="מחיר למ״ר"
                  value={itemEditor.unitPrice}
                  onChange={(v) =>
                    setItemEditor({ ...itemEditor, unitPrice: v })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label="מיקום"
                  value={itemEditor.location || ""}
                  onChange={(v) =>
                    setItemEditor({ ...itemEditor, location: v })
                  }
                />
              </div>

              {/* Row 3: details + addons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                <LabeledInput
                  label="פרטים"
                  value={itemEditor.details || ""}
                  onChange={(v) =>
                    setItemEditor({ ...itemEditor, details: v })
                  }
                />

                <div>
                  <div className="text-sm font-medium mb-2">
                    תוספות (מחיר ליח׳)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {itemEditor.addons.map((a, idx) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1"
                      >
                        <label className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={a.checked}
                            onChange={(e) => {
                              const next = [...itemEditor.addons];
                              next[idx] = { ...a, checked: e.target.checked };
                              setItemEditor({
                                ...itemEditor,
                                addons: next,
                              });
                            }}
                          />
                          <span className="text-sm">{a.name}</span>
                        </label>
                        <input
                          className="w-20 rounded-md bg-slate-50 border border-slate-200 px-2 py-1 text-sm"
                          type="text"
                          inputMode="numeric"
                          placeholder="₪"
                          value={a.price}
                          onChange={(e) => {
                            const next = [...itemEditor.addons];
                            next[idx] = { ...a, price: e.target.value };
                            setItemEditor({
                              ...itemEditor,
                              addons: next,
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-sm">
                <Stat label="שטח (מ״ר)" value={fmtNumber.format(liveArea)} />
                <Stat
                  label="תוס׳ ליח׳"
                  value={fmtCurrency.format(liveAddonsSumPerItem)}
                />
                <Stat
                  label="מחיר ליח׳"
                  value={fmtCurrency.format(livePerItemPrice)}
                />
                <Stat label="כמות" value={fmtNumber.format(liveQty)} />
                <Stat
                  label="סה״כ לפריט"
                  value={fmtCurrency.format(liveLineSubtotal)}
                  highlight
                />
              </div>

              {/* Only add-item + settings here */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                  onClick={() => addItem(itemEditor)}
                >
                  הוסף להצעה
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                  onClick={openSettings}
                >
                  הגדרות
                </button>
              </div>
            </section>

            {/* Items Table + totals + save/export */}
            <section className="card p-4 w-full">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h2 className="text-lg font-semibold">פריטי ההצעה</h2>
                <div className="text-sm text-slate-600">
                  הטבלה נגללת אופקית במסכים קטנים
                </div>
              </div>
              <div className="table-scroll">
                <table className="table-inner-min w-full text-sm">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <Th>מס׳</Th>
                      <Th>מידות (ס״מ)</Th>
                      <Th>מיקום</Th>
                      <Th>פרטים</Th>
                      <Th>מחיר ליח׳</Th>
                      <Th>כמות</Th>
                      <Th>סה״כ</Th>
                      <Th></Th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.current.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-6 text-slate-500"
                        >
                          אין פריטים עדיין
                        </td>
                      </tr>
                    ) : (
                      state.current.items.map((it, idx) => {
                        const w = parseLooseNumber(it.widthCm);
                        const h = parseLooseNumber(it.heightCm);
                        const area = (w * h) / 10000;
                        const addonsSum = it.addons.reduce(
                          (s, a) =>
                            s + (a.checked ? parseLooseNumber(a.price) : 0),
                          0
                        );
                        const unit = parseLooseNumber(it.unitPrice);
                        const perItem = area * unit + addonsSum;
                        const qty = Math.max(
                          0,
                          parseLooseNumber(it.qty)
                        );
                        const total = perItem * qty;

                        const addonsText = it.addons
                          .filter((a) => a.checked)
                          .map((a) =>
                            `${a.name} (${fmtCurrency.format(
                              parseLooseNumber(a.price)
                            )})`
                          )
                          .join(" • ");

                        return (
                          <tr key={it.id} className="border-b">
                            <Td>{idx + 1}</Td>
                            <Td>{`${fmtNumber.format(w)}×${fmtNumber.format(
                              h
                            )}`}</Td>
                            <Td>{it.location || ""}</Td>
                            <Td>
                              {[it.details, addonsText]
                                .filter(Boolean)
                                .join(" — ")}
                            </Td>
                            <Td>{fmtCurrency.format(perItem)}</Td>
                            <Td>{fmtNumber.format(qty)}</Td>
                            <Td className="font-medium">
                              {fmtCurrency.format(total)}
                            </Td>
                            <Td>
                              <button
                                className="text-red-600 hover:underline"
                                onClick={() => removeItem(it.id)}
                                aria-label="מחק פריט"
                              >
                                מחיקה
                              </button>
                            </Td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals row */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm">מע״מ (% או עשרוני):</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="w-28 rounded-md bg-white border border-slate-300 px-2 py-1.5"
                    value={state.current.taxPercentText}
                    onChange={(e) =>
                      updateCurrent("taxPercentText", e.target.value)
                    }
                  />
                </div>
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <Stat label="מחיר" value={fmtCurrency.format(subTotal)} />
                  <Stat label="מע״מ" value={fmtCurrency.format(taxValue)} />
                  <Stat
                    label="סה״כ לתשלום"
                    value={fmtCurrency.format(grandTotal)}
                    highlight
                  />
                </div>
              </div>

              {/* Footer notes */}
              <div className="mt-4">
                <LabeledInput
                  label="הערות למסמך (יופיעו ב-PDF)"
                  value={state.current.notes}
                  onChange={(v) => updateCurrent("notes", v)}
                />
              </div>

              {/* Final actions: save + export */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:opacity-95"
                  onClick={saveQuote}
                >
                  שמור הצעה
                </button>
                <button
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-95"
                  onClick={generateAndExportPDF}
                >
                  ייצוא ל-PDF
                </button>
              </div>
            </section>
          </section>
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
                הוספה/עריכה של פרופילים (למשל 4300, 7300) עם מחיר למ״ר. הדיאלוג
                מותאם לנייד: רוחב/גובה מוגבלים וגלילה פנימית.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LabeledInput
                  label="שם פרופיל"
                  value={profileDraft.name}
                  onChange={(v) =>
                    setProfileDraft({ ...profileDraft, name: v })
                  }
                />
                <LabeledInput
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
                      <Th>שם</Th>
                      <Th>מחיר למ״ר</Th>
                      <Th>פעולות</Th>
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
                          <Td>{p.name}</Td>
                          <Td>{fmtCurrency.format(p.unitPrice)}</Td>
                          <Td>
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
                          </Td>
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

/** ======= Small UI bits (inline) ======= */
function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="grid gap-1.5 w-full">
      <span className="text-sm text-slate-700">{props.label}</span>
      <input
        type="text"
        inputMode={props.inputMode}
        className="w-full rounded-md bg-white border border-slate-300 px-3 py-2"
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

function LabeledSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="grid gap-1.5 w-full">
      <span className="text-sm text-slate-700">{props.label}</span>
      <select
        className="w-full rounded-md bg-white border border-slate-300 px-3 py-2"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value + o.label} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        highlight ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-200"
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-right px-3 py-2 text-slate-700 font-medium whitespace-nowrap">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="text-right px-3 py-2 align-top whitespace-nowrap">
      {children}
    </td>
  );
}

/** Customers Page */
function CustomersPage(props: {
  customers: Customer[];
  quotes: Quote[];
  onOpenLast: (customerId: string) => void;
  onCreateNewOrder: () => void;
  onExportPdf: (customerId: string) => void;
  onDeleteCustomer: (customerId: string) => void;
}) {
  const latestMap = useMemo(() => {
    const grouped: Record<string, Quote[]> = {};
    for (const q of props.quotes) (grouped[q.customerId] ||= []).push(q);
    const latest: Record<string, Quote> = {};
    for (const id in grouped)
      latest[id] = grouped[id].sort((a, b) => b.date - a.date)[0];
    return latest;
  }, [props.quotes]);

  return (
    <section className="grid gap-4">
      <div className="card p-4 w-full">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold">לקוחות</h2>
          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:opacity-95"
            onClick={props.onCreateNewOrder}
          >
            הזמנה חדשה
          </button>
        </div>

        {/* Mobile: cards */}
        <div className="grid sm:hidden grid-cols-1 gap-3">
          {props.customers.length === 0 ? (
            <div className="text-slate-500 text-sm">אין לקוחות עדיין</div>
          ) : (
            props.customers.map((c) => {
              const last = latestMap[c.id];
              return (
                <div key={c.id} className="rounded-xl border p-3 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-slate-600">
                        {last
                          ? `הצעה אחרונה: ${fmtDate.format(
                              new Date(last.date)
                            )} • ${fmtCurrency.format(last.totals.grand)}`
                          : "אין הצעה שמורה"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="px-3 py-1.5 rounded-md bg-sky-500 text-white"
                        onClick={() => props.onOpenLast(c.id)}
                      >
                        פתח הצעה
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md bg-white border"
                        onClick={() => props.onExportPdf(c.id)}
                      >
                        ייצוא ל-PDF
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="px-3 py-1.5 rounded-md bg-red-600 text-white"
                      onClick={() => props.onDeleteCustomer(c.id)}
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden sm:block table-scroll mt-2">
          <table className="table-inner-min w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>שם</Th>
                <Th>טלפון</Th>
                <Th>אימייל</Th>
                <Th>הצעה אחרונה</Th>
                <Th>סכום אחרון</Th>
                <Th>פעולות</Th>
              </tr>
            </thead>
            <tbody>
              {props.customers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-6 text-center text-slate-500"
                  >
                    אין לקוחות עדיין
                  </td>
                </tr>
              ) : (
                props.customers.map((c) => {
                  const last = latestMap[c.id];
                  return (
                    <tr key={c.id} className="border-t">
                      <Td>{c.name}</Td>
                      <Td>{c.phone ?? ""}</Td>
                      <Td>{c.email ?? ""}</Td>
                      <Td>{last ? fmtDate.format(new Date(last.date)) : ""}</Td>
                      <Td>
                        {last ? fmtCurrency.format(last.totals.grand) : ""}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="px-3 py-1.5 rounded-md bg-sky-500 text-white"
                            onClick={() => props.onOpenLast(c.id)}
                          >
                            פתח הצעה
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md bg-white border"
                            onClick={() => props.onExportPdf(c.id)}
                          >
                            ייצוא ל-PDF
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md bg-red-600 text-white"
                            onClick={() => props.onDeleteCustomer(c.id)}
                          >
                            מחיקה
                          </button>
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** Modal (phone-safe constraints + internal scroll + wrapped buttons) */
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
