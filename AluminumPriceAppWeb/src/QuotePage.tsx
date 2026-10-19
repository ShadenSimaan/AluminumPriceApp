// FILE: src/QuotePage.tsx
import React, { useMemo } from "react";
import { Pencil, Settings } from "lucide-react";
import { AppState, LineItem, FreeFormAddition, DocumentType, DOCUMENT_TYPE_LABELS } from "./types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function uuid() {
  if ((crypto as any)?.randomUUID) return crypto.randomUUID();
  const buf = new Uint8Array(16);
  (crypto as any).getRandomValues?.(buf);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return [...buf].map(toHex).join("");
}

// Local helpers (same logic as in App)
const fmtNumber = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const fmtCurrency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
});

function parseLooseNumber(s: string): number {
  if (!s || !s.trim()) return 0;
  const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

/** Same totals logic as App.addItem — used when saving an edited line from the add-item modal. */
function buildLineItemFromItemEditor(draft: LineItem, id: string): LineItem {
  const widthCm = draft.widthCm ?? "";
  const heightCm = draft.heightCm ?? "";
  const qtyText = draft.qty ?? "";
  const unitPriceText = draft.unitPrice ?? "0";
  const manualUnitPriceText = (draft.manualUnitPrice ?? "").trim();
  const w = parseLooseNumber(widthCm);
  const h = parseLooseNumber(heightCm);
  const qty = Math.max(0, parseLooseNumber(qtyText));
  const area = (w * h) / 10000;
  const addonsPerItem = (draft.addons ?? []).reduce(
    (sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0),
    0
  );
  const perItemPrice = manualUnitPriceText
    ? parseLooseNumber(manualUnitPriceText) + addonsPerItem
    : parseLooseNumber(unitPriceText) * area + addonsPerItem;
  const subtotal = perItemPrice * qty;
  return {
    id,
    widthCm,
    heightCm,
    qty: qtyText,
    profileId: draft.profileId,
    profileName: draft.profileName,
    unitPrice: unitPriceText,
    manualUnitPrice: manualUnitPriceText || undefined,
    location: draft.location ?? "",
    details: draft.details ?? "",
    addons: (draft.addons ?? []).map((a) => ({ ...a })),
    subtotal,
  };
}

type QuotePageProps = {
  state: AppState;
  itemEditor: LineItem;
  activeProfileId?: string;
  updateCurrent: <K extends keyof AppState["current"]>(
    key: K,
    val: AppState["current"][K]
  ) => void;
  setItemEditor: React.Dispatch<React.SetStateAction<LineItem>>;
  setActiveProfileId: React.Dispatch<React.SetStateAction<string | undefined>>;
  openProfilesSettings: () => void;
  onAddItem: () => void;
  onResetItemEditor?: () => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (id: string) => void;
  onUpdateItem: (id: string, updated: LineItem) => void;
  onMoveItemUp: (id: string) => void;
  onMoveItemDown: (id: string) => void;
  onAddFreeFormAddition: () => void;
  onUpdateFreeFormAddition: (id: string, updated: any) => void;
  onRemoveFreeFormAddition: (id: string) => void;
  onReorderFreeFormAdditions: (reordered: FreeFormAddition[]) => void;
  onExportPdf: () => void;
  /** Open PDF in a viewer for printing / printer selection */
  onPrintPdf?: () => void;
  /** When true, show PDF save folder control beside export button (Tauri only) */
  showPdfFolderControl?: boolean;
  pdfSaveFolder?: string;
  onSelectPdfFolder?: () => void;
  /** Open the folder where PDFs are saved (Tauri only) */
  onOpenPdfFolder?: () => void;
  dimensionUnit?: "cm" | "mm";
  onAddProfileQuick?: (name: string, unitPrice: number) => string;
  onUpdateProfileQuick?: (id: string, name: string, unitPrice: number) => void;
};

/** Convert stored cm to display value (cm or mm) */
function cmToDisplay(cm: number, unit: "cm" | "mm"): number {
  return unit === "mm" ? cm * 10 : cm;
}
/** Convert display value to stored cm */
function displayToCm(display: number, unit: "cm" | "mm"): number {
  return unit === "mm" ? display / 10 : display;
}

/** ===== Items table: column widths sized to their content (same idea as the PDF table) ===== */
type ItemsColKey = "num" | "profile" | "dims" | "location" | "details" | "unitPrice" | "qty" | "total" | "actions";
const ITEMS_COL_ORDER: ItemsColKey[] = ["num", "profile", "dims", "location", "details", "unitPrice", "qty", "total", "actions"];
type ItemsColumnContent = Record<ItemsColKey, string[]> & { headers: Record<ItemsColKey, string> };

// Sizes in rem, matching the Tailwind classes used by the cells
const CELL_PAD_X_REM = 1.5; // px-3 on both sides of every cell
const EDITABLE_BTN_PAD_REM = 0.5; // px-1 inside the full-width click-to-edit buttons
const DRAG_HANDLE_GAP_REM = 0.5; // gap-2 between "⋮⋮" and the row number
const PROFILE_EDIT_BTN_REM = 1.75; // pencil (w-4) + p-1 + gap-1 next to the profile name
const DELETE_BTN_PAD_REM = 1.25; // px-2.5 on the delete button
const PROFILE_MAX_SHARE = 0.4;
const PROFILE_MIN_REM = 12; // on narrow windows keep the profile readable and scroll the table instead

type ItemsTableMetrics = { fontFamily: string; rem: number };

let measureCtx: CanvasRenderingContext2D | null = null;
function measureTextPx(text: string, font: string): number {
  if (!text) return 0;
  if (!measureCtx) measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * 8;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function computeItemsColumnWidths(
  content: ItemsColumnContent,
  available: number,
  { fontFamily, rem }: ItemsTableMetrics
): Record<ItemsColKey, number> {
  const fontPx = 0.875 * rem; // text-sm
  const cellFont = `600 ${fontPx}px ${fontFamily}`;
  const headerFont = `500 ${fontPx}px ${fontFamily}`;
  const cellPad = CELL_PAD_X_REM * rem;
  const editPad = EDITABLE_BTN_PAD_REM * rem;
  const m = (t: string, font = cellFont) => measureTextPx(t, font);
  const longestWord = (t: string) => Math.max(0, ...t.split(/\s+/).map((w) => m(w)));
  // +4px so sub-pixel rounding never pushes a value onto a second line
  const headerW = (k: ItemsColKey) => m(content.headers[k], headerFont) + cellPad + 4;
  const fit = (k: ItemsColKey, extra = 0) =>
    Math.ceil(Math.max(headerW(k), ...content[k].map((v) => m(v) + cellPad + extra + 4)));

  const widths: Record<ItemsColKey, number> = {
    num: fit("num", m("⋮⋮") + DRAG_HANDLE_GAP_REM * rem),
    profile: 0,
    dims: fit("dims", editPad),
    location: 0,
    details: 0,
    unitPrice: fit("unitPrice", editPad),
    qty: fit("qty", editPad),
    total: fit("total"),
    actions: fit("actions", DELETE_BTN_PAD_REM * rem + 2),
  };

  // Text columns: at least header / longest word, then the profile is widened toward one line
  // (up to PROFILE_MAX_SHARE of the table), then the rest is shared; never shrink below the minimum.
  const flexCols = (["profile", "location", "details"] as const).map((k) => {
    const extra = k === "profile" ? PROFILE_EDIT_BTN_REM * rem + 2 : editPad;
    const texts = content[k];
    const wordMin = Math.ceil(Math.max(headerW(k), ...texts.map((t) => longestWord(t) + cellPad + extra + 4)));
    const natural = Math.ceil(Math.max(wordMin, ...texts.map((t) => m(t) + cellPad + extra + 4)));
    const min = k === "profile" ? Math.max(wordMin, Math.min(natural, PROFILE_MIN_REM * rem)) : wordMin;
    return { k, min, natural };
  });
  flexCols.forEach((c) => (widths[c.k] = c.min));
  let remaining = available - ITEMS_COL_ORDER.reduce((s, k) => s + widths[k], 0);
  if (remaining > 0) {
    const profileTarget = Math.max(widths.profile, Math.min(flexCols[0].natural, available * PROFILE_MAX_SHARE));
    const add = Math.min(remaining, profileTarget - widths.profile);
    widths.profile += add;
    remaining -= add;
  }
  for (let pass = 0; pass < 4 && remaining > 0.5; pass++) {
    const needy = flexCols.filter((c) => widths[c.k] < c.natural);
    if (!needy.length) break;
    let given = 0;
    needy.forEach((c) => {
      const add = Math.min(c.natural - widths[c.k], remaining / needy.length);
      widths[c.k] += add;
      given += add;
    });
    remaining -= given;
  }
  if (remaining > 0) {
    widths.details += remaining * 0.5;
    widths.profile += remaining * 0.5;
  }
  return widths;
}

/** Tracks the table container width and font, and returns content-based column widths. */
function useItemsColumnWidths(content: ItemsColumnContent) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [available, setAvailable] = React.useState(0);
  const [metrics, setMetrics] = React.useState<ItemsTableMetrics>({ fontFamily: "sans-serif", rem: 16 });
  const [fontsLoaded, setFontsLoaded] = React.useState(0);

  React.useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setAvailable(el.clientWidth);
      // The root font size changes with the window size, so re-read it on every resize
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const fontFamily = getComputedStyle(el).fontFamily || "sans-serif";
      setMetrics((prev) => (prev.rem === rem && prev.fontFamily === fontFamily ? prev : { fontFamily, rem }));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) setFontsLoaded((n) => n + 1);
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, []);

  const widths = useMemo(
    () => computeItemsColumnWidths(content, available, metrics),
    // fontsLoaded: re-measure once web fonts finish loading
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [content, available, metrics, fontsLoaded]
  );
  const totalWidth = ITEMS_COL_ORDER.reduce((s, k) => s + widths[k], 0);
  return { containerRef, widths, totalWidth };
}

const QuotePage: React.FC<QuotePageProps> = ({
  state,
  itemEditor,
  activeProfileId,
  updateCurrent,
  setItemEditor,
  setActiveProfileId,
  openProfilesSettings,
  onAddItem,
  onResetItemEditor,
  onRemoveItem,
  onEditItem,
  onUpdateItem,
  onMoveItemUp,
  onMoveItemDown,
  onAddFreeFormAddition,
  onUpdateFreeFormAddition,
  onRemoveFreeFormAddition,
  onReorderFreeFormAdditions,
  onExportPdf,
  onPrintPdf,
  showPdfFolderControl,
  pdfSaveFolder,
  onSelectPdfFolder,
  onOpenPdfFolder,
  dimensionUnit = "cm",
  onAddProfileQuick,
  onUpdateProfileQuick,
}) => {
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [showAddProfileModal, setShowAddProfileModal] = React.useState(false);
  /** When set, the profile popup is editing this existing profile; when null, it is add-new mode. */
  const [profileModalEditId, setProfileModalEditId] = React.useState<string | null>(null);
  const [addProfileDraft, setAddProfileDraft] = React.useState({ name: "", unitPrice: "" });
  const [editDraft, setEditDraft] = React.useState<LineItem | null>(null);
  const [editActiveProfileId, setEditActiveProfileId] = React.useState<string | undefined>(undefined);
  const [showAddItemModal, setShowAddItemModal] = React.useState(false);
  /** When set, the add-item calculator modal is editing this existing line instead of adding a new one. */
  const [addItemModalEditingId, setAddItemModalEditingId] = React.useState<string | null>(null);
  const [addItemModalContentEl, setAddItemModalContentEl] = React.useState<HTMLDivElement | null>(null);
  const [editItemModalContentEl, setEditItemModalContentEl] = React.useState<HTMLDivElement | null>(null);
  const [showFreeFormInput, setShowFreeFormInput] = React.useState(false);
  const [newFreeFormDraft, setNewFreeFormDraft] = React.useState<{ name: string; price: string; qty: string }>({
    name: "",
    price: "0",
    qty: "1",
  });
  /** Inline edit: which cell is being edited (field: profile | dims | location | details | unitPrice | qty) */
  const [editingCell, setEditingCell] = React.useState<{ itemId: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = React.useState("");
  /** Inline edit for free-form additions: which cell (addon id + field) and draft value */
  const [editingFreeFormCell, setEditingFreeFormCell] = React.useState<{ id: string; field: "name" | "price" | "qty" } | null>(null);
  const [editingFreeFormValue, setEditingFreeFormValue] = React.useState("");
  /** Pointer-based drag: type + id + label for preview, and cursor position for floating card */
  const [dragState, setDragState] = React.useState<{
    type: "item" | "freeform";
    id: string;
    label: string;
  } | null>(null);
  const [dragPreviewPos, setDragPreviewPos] = React.useState<{ x: number; y: number } | null>(null);
  const itemsRef = React.useRef(state.current.items);
  const freeFormRef = React.useRef(state.current.freeFormAdditions);
  itemsRef.current = state.current.items;
  freeFormRef.current = state.current.freeFormAdditions;

  function closeProfileModal() {
    setShowAddProfileModal(false);
    setProfileModalEditId(null);
    setAddProfileDraft({ name: "", unitPrice: "" });
  }

  function commitProfileModal() {
    const name = addProfileDraft.name.trim() || "פרופיל חדש";
    const unitPrice = parseLooseNumber(addProfileDraft.unitPrice) || 0;
    if (profileModalEditId && onUpdateProfileQuick) {
      onUpdateProfileQuick(profileModalEditId, name, unitPrice);
    } else if (onAddProfileQuick) {
      const newId = onAddProfileQuick(name, unitPrice);
      if (editingItemId) {
        setEditActiveProfileId(newId);
        setEditDraft((d) =>
          d
            ? {
                ...d,
                profileId: newId,
                profileName: name.trim() || "פרופיל חדש",
                unitPrice: String(unitPrice),
              }
            : d
        );
      }
    }
    closeProfileModal();
  }

  /** Open the full item calculator (same as + הוסף פריט) with this line’s data. */
  function openExistingLineInAddItemModal(itemId: string) {
    onEditItem(itemId);
    setAddItemModalEditingId(itemId);
    setShowAddItemModal(true);
  }

  function closeAddItemModal() {
    setShowAddItemModal(false);
    setAddItemModalEditingId(null);
    closeProfileModal();
    onResetItemEditor?.();
  }

  React.useEffect(() => {
    if (!dragState) return;
    const onMove = (e: PointerEvent) => setDragPreviewPos({ x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const tr = el?.closest("tr[data-drag-row]");
      const targetId = tr?.getAttribute(dragState.type === "item" ? "data-item-id" : "data-freeform-id") ?? null;
      if (targetId && targetId !== dragState.id) {
        if (dragState.type === "item") {
          const items = [...itemsRef.current];
          const fromIdx = items.findIndex((i) => i.id === dragState.id);
          const toIdx = items.findIndex((i) => i.id === targetId);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [removed] = items.splice(fromIdx, 1);
            items.splice(toIdx, 0, removed);
            updateCurrent("items", items);
          }
        } else {
          const list = [...freeFormRef.current];
          const fromIdx = list.findIndex((a) => a.id === dragState.id);
          const toIdx = list.findIndex((a) => a.id === targetId);
          if (fromIdx !== -1 && toIdx !== -1) {
            const [removed] = list.splice(fromIdx, 1);
            list.splice(toIdx, 0, removed);
            onReorderFreeFormAdditions(list);
          }
        }
      }
      setDragState(null);
      setDragPreviewPos(null);
    };
    window.addEventListener("pointermove", onMove, { capture: true });
    window.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onMove, { capture: true });
      window.removeEventListener("pointerup", onUp, { capture: true });
    };
  }, [dragState, updateCurrent, onReorderFreeFormAdditions]);

  React.useEffect(() => {
    if (showAddItemModal && !addItemModalEditingId) onResetItemEditor?.();
  }, [showAddItemModal, addItemModalEditingId, onResetItemEditor]);

  // Only when the edited row changes — not on every items save — avoids a feedback loop with the auto-save effect below.
  React.useEffect(() => {
    if (!editingItemId) return;
    const item = state.current.items.find((it) => it.id === editingItemId);
    if (item) {
      setEditDraft({ ...item });
      setEditActiveProfileId(item.profileId);
    }
  }, [editingItemId]);

  React.useEffect(() => {
    if (editDraft && editActiveProfileId) {
      const p = state.profiles.find((p) => p.id === editActiveProfileId);
      if (p) {
        setEditDraft((d) => ({
          ...d!,
          profileId: p.id,
          profileName: p.name,
          unitPrice: String(p.unitPrice),
        }));
      }
    } else if (editDraft && !editActiveProfileId) {
      setEditDraft((d) => ({
        ...d!,
        profileId: undefined,
        profileName: undefined,
      }));
    }
  }, [editActiveProfileId, state.profiles]);

  // Auto-save item edits to state (and thus to storage) on every change in the edit modal
  React.useEffect(() => {
    if (!editingItemId || !editDraft) return;
    const w = parseLooseNumber(editDraft.widthCm);
    const h = parseLooseNumber(editDraft.heightCm);
    const qty = Math.max(0, parseLooseNumber(editDraft.qty));
    const area = (w * h) / 10000;
    const addonsPerItem = editDraft.addons.reduce(
      (sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const manual = (editDraft.manualUnitPrice ?? "").trim();
    const perItemPrice = manual
      ? parseLooseNumber(manual) + addonsPerItem
      : area * parseLooseNumber(editDraft.unitPrice) + addonsPerItem;
    const subtotal = perItemPrice * qty;
    const updated: LineItem = {
      ...editDraft,
      manualUnitPrice: manual || undefined,
      subtotal,
    };
    onUpdateItem(editingItemId, updated);
  }, [editingItemId, editDraft, onUpdateItem]);

  const handleSaveEdit = () => {
    if (!editDraft || !editingItemId) return;
    
    const w = parseLooseNumber(editDraft.widthCm);
    const h = parseLooseNumber(editDraft.heightCm);
    const qty = Math.max(0, parseLooseNumber(editDraft.qty));
    const area = (w * h) / 10000;
    const addonsPerItem = editDraft.addons.reduce(
      (sum, a) => sum + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const manual = (editDraft.manualUnitPrice ?? "").trim();
    const perItemPrice = manual
      ? parseLooseNumber(manual) + addonsPerItem
      : area * parseLooseNumber(editDraft.unitPrice) + addonsPerItem;
    const subtotal = perItemPrice * qty;

    const updated: LineItem = {
      ...editDraft,
      manualUnitPrice: manual || undefined,
      subtotal,
    };

    onUpdateItem(editingItemId, updated);
    setEditingItemId(null);
    setEditDraft(null);
    setEditActiveProfileId(undefined);
  };

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
    const manual = (itemEditor.manualUnitPrice ?? "").trim();
    if (manual) {
      return parseLooseNumber(manual) + liveAddonsSumPerItem;
    }
    const unit = parseLooseNumber(itemEditor.unitPrice);
    return liveArea * unit + liveAddonsSumPerItem;
  }, [liveArea, itemEditor.unitPrice, itemEditor.manualUnitPrice, liveAddonsSumPerItem]);

  const liveQty = useMemo(
    () => Math.max(0, parseLooseNumber(itemEditor.qty)),
    [itemEditor.qty]
  );
  const liveLineSubtotal = useMemo(
    () => livePerItemPrice * liveQty,
    [livePerItemPrice, liveQty]
  );

  const subTotal = useMemo(
    () => state.current.items.reduce((a, it) => a + it.subtotal, 0),
    [state.current.items]
  );

  const freeFormSubTotal = useMemo(() => {
    return state.current.freeFormAdditions.reduce((sum, add) => {
      const price = parseLooseNumber(add.price);
      const qty = Math.max(0, parseLooseNumber(add.qty));
      return sum + price * qty;
    }, 0);
  }, [state.current.freeFormAdditions]);

  const totalSubTotal = subTotal + freeFormSubTotal;

  const taxDecimal = useMemo(() => {
    const raw = state.current.taxPercentText ?? "18";
    const n = parseLooseNumber(raw);
    if (n === 0) return 0;
    if (n > 1.0) return n / 100;
    return n;
  }, [state.current.taxPercentText]);

  const taxValue = totalSubTotal * taxDecimal;
  const grandTotal = totalSubTotal + taxValue;

  const itemsColumnContent = useMemo<ItemsColumnContent>(() => {
    const items = state.current.items;
    const rows = items.map((it) => {
      const w = parseLooseNumber(it.widthCm);
      const h = parseLooseNumber(it.heightCm);
      const addonsSum = it.addons.reduce((s, a) => s + (a.checked ? parseLooseNumber(a.price) : 0), 0);
      const manual = (it.manualUnitPrice ?? "").trim();
      const perItem = manual
        ? parseLooseNumber(manual) + addonsSum
        : ((w * h) / 10000) * parseLooseNumber(it.unitPrice) + addonsSum;
      const qty = Math.max(0, parseLooseNumber(it.qty));
      const addonsText = it.addons
        .filter((a) => a.checked)
        .map((a) => `${a.name} (${fmtCurrency.format(parseLooseNumber(a.price))})`)
        .join(" • ");
      return {
        dims:
          dimensionUnit === "mm"
            ? `${fmtNumber.format(Math.round(cmToDisplay(w, dimensionUnit)))}×${fmtNumber.format(Math.round(cmToDisplay(h, dimensionUnit)))}`
            : `${fmtNumber.format(w)}×${fmtNumber.format(h)}`,
        perItem,
        qty,
        profile: it.profileName || "",
        location: it.location || "",
        details: [it.details, addonsText].filter(Boolean).join(" — "),
      };
    });
    return {
      headers: {
        num: "מס׳",
        profile: "פרופיל",
        dims: dimensionUnit === "mm" ? "מידות (מ״מ)" : "מידות (ס״מ)",
        location: "מיקום",
        details: "פרטים",
        unitPrice: "מחיר ליח׳",
        qty: "כמות",
        total: "סה״כ",
        actions: "פעולות",
      },
      num: rows.map((_, i) => String(i + 1)),
      profile: rows.map((r) => r.profile),
      dims: rows.map((r) => r.dims),
      location: rows.map((r) => r.location),
      details: rows.map((r) => r.details),
      unitPrice: rows.map((r) => fmtCurrency.format(r.perItem)),
      qty: rows.map((r) => fmtNumber.format(r.qty)),
      total: rows.map((r) => fmtCurrency.format(r.perItem * r.qty)),
      actions: rows.length ? ["מחיקה"] : [],
    };
  }, [state.current.items, dimensionUnit]);
  const itemsColumns = useItemsColumnWidths(itemsColumnContent);

  return (
    <section className="grid gap-4 min-w-0 w-full">
      {/* Floating drag preview — follows cursor when reordering */}
      {dragState && (
        <div
          dir="rtl"
          className="fixed z-[99999] pointer-events-none text-sm font-semibold text-slate-800 bg-white rounded-xl shadow-lg border-2 border-sky-400 px-4 py-2 whitespace-nowrap"
          style={{
            left: (dragPreviewPos?.x ?? 0) + 12,
            top: (dragPreviewPos?.y ?? 0) + 12,
          }}
        >
          {dragState.label} — גרור לסידור
        </div>
      )}
      {/* Document type */}
      <section className="card p-4 w-full">
        <h2 className="text-xl font-semibold mb-3">סוג מסמך</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium text-slate-700">סוג הקובץ</label>
            <Select
              value={state.current.documentType ?? "quote"}
              onValueChange={(v) =>
                updateCurrent("documentType", (v === "payment_request" ? "payment_request" : "quote") as DocumentType)
              }
            >
              <SelectTrigger className="w-full bg-white">
                <SelectValue placeholder="בחר סוג מסמך" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quote">{DOCUMENT_TYPE_LABELS.quote}</SelectItem>
                <SelectItem value="payment_request">
                  {DOCUMENT_TYPE_LABELS.payment_request}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {state.current.documentType === "payment_request" && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {state.current.documentNumber != null && state.current.documentNumber > 0 ? (
                <>
                  מספר חשבון עסקה:{" "}
                  <span className="font-semibold tabular-nums">
                    {String(state.current.documentNumber).padStart(4, "0")}
                  </span>
                </>
              ) : (
                <>מספר רץ יוקצה אוטומטית בשמירה / ייצוא</>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Customer inline form */}
      <section className="card p-4 w-full">
        <h2 className="text-xl font-semibold mb-3">פרטי לקוח</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <LabeledInput
            label="שם לקוח* (לכבוד)"
            placeholder="חובה - יופיע 'לכבוד' אוטומטית"
            value={state.current.customerName.startsWith("לכבוד ") 
              ? state.current.customerName.replace(/^לכבוד\s+/, "")
              : state.current.customerName}
            onChange={(v) => {
              // Always add "לכבוד" prefix if not already present
              // Preserve ALL spaces in the name (allows multiple names with spaces)
              // Remove "לכבוד " prefix if user typed it
              let namePart = v.replace(/^לכבוד\s+/, "");
              
              // Check if empty (only trim for the check, don't modify the actual value)
              const isEmpty = !namePart.trim();
              
              if (isEmpty) {
                updateCurrent("customerName", "");
              } else {
                // Preserve ALL spaces - don't trim! Only remove leading spaces from the beginning
                // This allows users to type "John Smith" or "John  Smith" with spaces
                const withoutLeadingSpaces = namePart.replace(/^\s+/, "");
                
                // Add "לכבוד" prefix with the name (ALL spaces preserved, including trailing)
                updateCurrent("customerName", `לכבוד ${withoutLeadingSpaces}`);
              }
            }}
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
            multiline
            rows={3}
          />
        </div>
      </section>

      {/* Add profile standalone modal (only when add-item modal is not open) */}
      {showAddProfileModal &&
        !showAddItemModal &&
        (profileModalEditId ? onUpdateProfileQuick : onAddProfileQuick) && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={closeProfileModal}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-3">
              {profileModalEditId ? "עריכת פרופיל" : "הוספת פרופיל"}
            </h3>
            <div className="space-y-3">
              <LabeledInput
                label="שם הפרופיל"
                placeholder="למשל 4300 זכוכית ורשת"
                value={addProfileDraft.name}
                onChange={(v) => setAddProfileDraft((d) => ({ ...d, name: v }))}
              />
              <LabeledInput
                label="מחיר למ״ר (ברירת מחדל)"
                value={addProfileDraft.unitPrice}
                onChange={(v) => setAddProfileDraft((d) => ({ ...d, unitPrice: v }))}
                inputMode="numeric"
              />
            </div>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                onClick={closeProfileModal}
              >
                ביטול
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                onClick={commitProfileModal}
              >
                {profileModalEditId ? "שמור" : "הוסף ובחר"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Item modal — מחשבון פריט popup (add-profile step shown inside when chosen) */}
      {showAddItemModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={closeAddItemModal}
        >
          <div
            ref={(el) => el && setAddItemModalContentEl(el)}
            className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
              <h2 className="text-xl font-semibold">
                {showAddProfileModal
                  ? profileModalEditId
                    ? "עריכת פרופיל — המשך הוספת פריט להצעה"
                    : "הוספת פרופיל — המשך הוספת פריט להצעה"
                  : addItemModalEditingId
                  ? "מחשבון פריט — עריכת פריט להצעה"
                  : "מחשבון פריט — הוספת פריט להצעה"}
              </h2>
              <div className="flex items-center gap-2">
                {!showAddProfileModal && (
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-xl bg-sky-100 border border-sky-300 text-sky-800 hover:bg-sky-200 text-sm inline-flex items-center gap-1.5"
                    onClick={openProfilesSettings}
                    title="הגדרות פרופילים ותוספות"
                  >
                    <Settings className="w-4 h-4 shrink-0" aria-hidden />
                    הגדרות
                  </button>
                )}
                <button
                  type="button"
                  className="text-slate-500 hover:text-slate-700 p-1"
                  onClick={() => {
                    if (showAddProfileModal) closeProfileModal();
                    else closeAddItemModal();
                  }}
                  aria-label="סגירה"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {showAddProfileModal && (onAddProfileQuick || onUpdateProfileQuick) ? (
                <>
                  <p className="text-sm text-slate-600">
                    {profileModalEditId
                      ? "עריכת הפרופיל הנבחר — השינויים יחולו על כל השורות שמשתמשות בפרופיל זה."
                      : "הוספת פרופיל חדש — לאחר ההוספה תוכל לבחור אותו בפרופיל ולהמשיך למלא את הפריט."}
                  </p>
                  <div className="space-y-3">
                    <LabeledInput
                      label="שם הפרופיל"
                      placeholder="למשל 4300 זכוכית ורשת"
                      value={addProfileDraft.name}
                      onChange={(v) => setAddProfileDraft((d) => ({ ...d, name: v }))}
                    />
                    <LabeledInput
                      label="מחיר למ״ר (ברירת מחדל)"
                      value={addProfileDraft.unitPrice}
                      onChange={(v) => setAddProfileDraft((d) => ({ ...d, unitPrice: v }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                      onClick={closeProfileModal}
                    >
                      חזרה למחשבון
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                      onClick={commitProfileModal}
                    >
                      {profileModalEditId ? "שמור" : "הוסף ובחר"}
                    </button>
                  </div>
                </>
              ) : (
                <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LabeledInput
                  label={dimensionUnit === "mm" ? "רוחב (מ״מ)" : "רוחב (ס״מ)"}
                  value={
                    dimensionUnit === "mm"
                      ? String(Math.round(cmToDisplay(parseLooseNumber(itemEditor.widthCm), "mm")))
                      : itemEditor.widthCm
                  }
                  onChange={(v) =>
                    setItemEditor({
                      ...itemEditor,
                      widthCm: String(displayToCm(parseLooseNumber(v), dimensionUnit)),
                    })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label={dimensionUnit === "mm" ? "גובה (מ״מ)" : "גובה (ס״מ)"}
                  value={
                    dimensionUnit === "mm"
                      ? String(Math.round(cmToDisplay(parseLooseNumber(itemEditor.heightCm), "mm")))
                      : itemEditor.heightCm
                  }
                  onChange={(v) =>
                    setItemEditor({
                      ...itemEditor,
                      heightCm: String(displayToCm(parseLooseNumber(v), dimensionUnit)),
                    })
                  }
                  inputMode="numeric"
                />
                <LabeledQuantityInput
                  label="כמות"
                  value={itemEditor.qty}
                  onChange={(v) => setItemEditor({ ...itemEditor, qty: v })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="grid gap-1.5 w-full">
                  <span className="text-sm text-slate-700">פרופיל</span>
                  <Select
                    value={
                      showAddProfileModal && profileModalEditId
                        ? "__edit_profile__"
                        : showAddProfileModal
                        ? "__add_profile__"
                        : (activeProfileId ?? "__empty__")
                    }
                    onValueChange={(id) => {
                      if (id === "__add_profile__") {
                        setShowAddProfileModal(true);
                        setProfileModalEditId(null);
                        setAddProfileDraft({ name: "", unitPrice: "" });
                      } else if (id === "__edit_profile__") {
                        const pid = activeProfileId;
                        if (!pid || !onUpdateProfileQuick) return;
                        const p = state.profiles.find((x) => x.id === pid);
                        if (!p) return;
                        setProfileModalEditId(pid);
                        setAddProfileDraft({ name: p.name, unitPrice: String(p.unitPrice) });
                        setShowAddProfileModal(true);
                      } else if (id === "__empty__") {
                        setActiveProfileId(undefined);
                      } else {
                        setActiveProfileId(id);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full rounded-md bg-white border border-slate-300 px-3 py-2 text-sm">
                      <SelectValue placeholder="— בחר/י —" />
                    </SelectTrigger>
                    <SelectContent portalContainer={addItemModalContentEl}>
                      <SelectItem value="__empty__">— בחר/י —</SelectItem>
                      {state.profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                      {activeProfileId && onUpdateProfileQuick && (
                        <SelectItem value="__edit_profile__">✏️ ערוך פרופיל...</SelectItem>
                      )}
                      {onAddProfileQuick && (
                        <SelectItem value="__add_profile__">➕ הוסף פרופיל...</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </label>
                <LabeledInput
                  label="מחיר למ״ר"
                  value={itemEditor.unitPrice}
                  onChange={(v) => setItemEditor({ ...itemEditor, unitPrice: v })}
                  inputMode="numeric"
                />
                <LabeledInput
                  label="מיקום"
                  value={itemEditor.location || ""}
                  onChange={(v) => setItemEditor({ ...itemEditor, location: v })}
                />
              </div>
              <LabeledInput
                label="מחיר ליח׳ ידני (אופציונלי)"
                placeholder="השאר ריק לחישוב מנוסחה"
                value={itemEditor.manualUnitPrice ?? ""}
                onChange={(v) => setItemEditor({ ...itemEditor, manualUnitPrice: v })}
                inputMode="numeric"
              />
              <LabeledInput
                label="פרטים"
                value={itemEditor.details || ""}
                onChange={(v) => setItemEditor({ ...itemEditor, details: v })}
              />
              <div>
                <div className="text-sm font-medium mb-2">תוספות (מחיר ליח׳)</div>
                <div className="flex flex-wrap gap-2">
                  {state.addons.map((a) => {
                    const itemAddon = itemEditor.addons.find((ia) => ia.id === a.id) || { ...a, checked: false };
                    return (
                      <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-5 h-5 cursor-pointer"
                            checked={itemAddon.checked}
                            onChange={(e) => {
                              const next = [...itemEditor.addons];
                              const idx = next.findIndex((ia) => ia.id === a.id);
                              if (idx >= 0) next[idx] = { ...next[idx], checked: e.target.checked };
                              else next.push({ ...a, checked: e.target.checked });
                              setItemEditor({ ...itemEditor, addons: next });
                            }}
                          />
                          <span className="text-sm">{a.name}</span>
                        </label>
                        <input
                          className="w-20 rounded-md bg-slate-50 border border-slate-200 px-2 py-1 text-sm"
                          type="text"
                          inputMode="numeric"
                          placeholder="₪"
                          value={itemAddon.price}
                          onChange={(e) => {
                            const next = [...itemEditor.addons];
                            const idx = next.findIndex((ia) => ia.id === a.id);
                            if (idx >= 0) next[idx] = { ...next[idx], price: e.target.value };
                            else next.push({ ...a, price: e.target.value, checked: false });
                            setItemEditor({ ...itemEditor, addons: next });
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-sm">
                <Stat label="שטח (מ״ר)" value={fmtNumber.format(liveArea)} />
                <Stat label="תוס׳ ליח׳" value={fmtCurrency.format(liveAddonsSumPerItem)} />
                <Stat label="מחיר ליח׳" value={fmtCurrency.format(livePerItemPrice)} />
                <Stat label="כמות" value={fmtNumber.format(liveQty)} />
                <Stat label="סה״כ לפריט" value={fmtCurrency.format(liveLineSubtotal)} highlight />
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t">
                <button
                  className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                  onClick={() => {
                    if (addItemModalEditingId) {
                      onUpdateItem(
                        addItemModalEditingId,
                        buildLineItemFromItemEditor(itemEditor, addItemModalEditingId)
                      );
                    } else {
                      onAddItem();
                    }
                    closeAddItemModal();
                  }}
                >
                  {addItemModalEditingId ? "שמור שינויים" : "הוסף להצעה"}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                  onClick={closeAddItemModal}
                >
                  ביטול
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Items Table + totals + save/export */}
      <section className="card p-4 w-full">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="text-xl font-semibold">
            {state.current.documentType === "payment_request" ? "פריטי החשבון" : "פריטי ההצעה"}
          </h2>
          <span className="text-sm text-slate-600 hidden sm:inline">
            הטבלה נגללת אופקית במסכים קטנים
          </span>
        </div>
        <div className="table-scroll" ref={itemsColumns.containerRef}>
          <table
            className="table-inner-min table-quote-items w-full text-sm"
            style={{ minWidth: itemsColumns.totalWidth }}
          >
            <colgroup>
              {ITEMS_COL_ORDER.map((k) => (
                <col key={k} style={{ width: itemsColumns.widths[k] }} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b bg-slate-50">
                <Th>מס׳</Th>
                <Th className="td-wrap-col">פרופיל</Th>
                <Th className="td-nowrap-col">{dimensionUnit === "mm" ? "מידות (מ״מ)" : "מידות (ס״מ)"}</Th>
                <Th className="td-wrap-col">מיקום</Th>
                <Th className="td-details-col">פרטים</Th>
                <Th>מחיר ליח׳</Th>
                <Th>כמות</Th>
                <Th>סה״כ</Th>
                <Th>פעולות</Th>
              </tr>
            </thead>
            <tbody>
              {state.current.items.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
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
                  const manual = (it.manualUnitPrice ?? "").trim();
                  const perItem = manual
                    ? parseLooseNumber(manual) + addonsSum
                    : area * parseLooseNumber(it.unitPrice) + addonsSum;
                  const qty = Math.max(0, parseLooseNumber(it.qty));
                  const total = perItem * qty;
                  const totalWithVat = total * (1 + taxDecimal);

                  const addonsText = it.addons
                    .filter((a) => a.checked)
                    .map((a) =>
                      `${a.name} (${fmtCurrency.format(
                        parseLooseNumber(a.price)
                      )})`
                    )
                    .join(" • ");

                  return (
                    <tr
                      key={it.id}
                      data-drag-row="item"
                      data-item-id={it.id}
                      className={`border-b ${dragState?.type === "item" && dragState?.id === it.id ? "opacity-50" : ""}`}
                    >
                      <Td>
                        <div
                          className="flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
                          title="גרור לסידור מחדש"
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              setDragState({ type: "item", id: it.id, label: it.profileName || `פריט ${idx + 1}` });
                              setDragPreviewPos({ x: e.clientX, y: e.clientY });
                            }}
                        >
                          <span className="text-slate-400 hover:text-slate-600">⋮⋮</span>
                          <span>{idx + 1}</span>
                        </div>
                      </Td>
                      <Td className="td-wrap-col">
                        <div className="flex items-start justify-end gap-1 w-full min-w-0">
                          <button
                            type="button"
                            className="text-right flex-1 min-w-0 hover:bg-slate-100 rounded px-1 py-0.5 -mx-1 min-h-[1.5rem] break-words"
                            onClick={() => openExistingLineInAddItemModal(it.id)}
                            title="לחץ לעריכת פריט (אותו חלון כמו + הוסף פריט)"
                          >
                            {it.profileName || "\u00A0"}
                          </button>
                          <button
                            type="button"
                            className="shrink-0 mt-0.5 p-1 rounded-md text-sky-700 hover:bg-sky-100 border border-transparent hover:border-sky-200"
                            title="עריכת פריט"
                            aria-label="עריכת פריט"
                            onClick={(e) => {
                              e.stopPropagation();
                              openExistingLineInAddItemModal(it.id);
                            }}
                          >
                            <Pencil className="w-4 h-4" aria-hidden />
                          </button>
                        </div>
                      </Td>
                      <Td className="td-nowrap-col">
                        {editingCell?.itemId === it.id && editingCell?.field === "dims" ? (
                          <EditableCellInput
                            value={editingValue}
                            onChange={setEditingValue}
                            onCommit={() => {
                              const parts = editingValue.split(/[×xX]/).map((s) => parseLooseNumber(s.trim()));
                              const displayW = parts[0] ?? cmToDisplay(w, dimensionUnit);
                              const displayH = parts[1] ?? cmToDisplay(h, dimensionUnit);
                              const nw = displayToCm(displayW, dimensionUnit);
                              const nh = displayToCm(displayH, dimensionUnit);
                              const newArea = (nw * nh) / 10000;
                              const manual = (it.manualUnitPrice ?? "").trim();
                              const newPerItem = manual
                                ? parseLooseNumber(manual) + addonsSum
                                : newArea * parseLooseNumber(it.unitPrice) + addonsSum;
                              const newSubtotal = newPerItem * qty;
                              onUpdateItem(it.id, {
                                ...it,
                                widthCm: String(nw),
                                heightCm: String(nh),
                                subtotal: newSubtotal,
                              });
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            onCancel={() => { setEditingCell(null); setEditingValue(""); }}
                          />
                        ) : (
                          <EditableCellButton
                            onClick={() => {
                              setEditingCell({ itemId: it.id, field: "dims" });
                              const dw = cmToDisplay(w, dimensionUnit);
                              const dh = cmToDisplay(h, dimensionUnit);
                              setEditingValue(dimensionUnit === "mm" ? `${Math.round(dw)}×${Math.round(dh)}` : `${w}×${h}`);
                            }}
                            title={dimensionUnit === "mm" ? "לחץ לעריכה (רוחב×גובה במ״מ)" : "לחץ לעריכה (רוחב×גובה)"}
                          >
                            {dimensionUnit === "mm"
                              ? `${fmtNumber.format(Math.round(cmToDisplay(w, dimensionUnit)))}×${fmtNumber.format(Math.round(cmToDisplay(h, dimensionUnit)))}`
                              : `${fmtNumber.format(w)}×${fmtNumber.format(h)}`}
                          </EditableCellButton>
                        )}
                      </Td>
                      <Td className="td-wrap-col">
                        {editingCell?.itemId === it.id && editingCell?.field === "location" ? (
                          <EditableCellInput
                            value={editingValue}
                            onChange={setEditingValue}
                            onCommit={() => {
                              onUpdateItem(it.id, { ...it, location: editingValue.trim() });
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            onCancel={() => { setEditingCell(null); setEditingValue(""); }}
                          />
                        ) : (
                          <EditableCellButton
                            onClick={() => { setEditingCell({ itemId: it.id, field: "location" }); setEditingValue(it.location || ""); }}
                            title="לחץ לעריכה"
                          >
                            {it.location || ""}
                          </EditableCellButton>
                        )}
                      </Td>
                      <Td className="td-details-col">
                        {editingCell?.itemId === it.id && editingCell?.field === "details" ? (
                          <EditableCellInput
                            value={editingValue}
                            onChange={setEditingValue}
                            onCommit={() => {
                              onUpdateItem(it.id, { ...it, details: editingValue.trim() });
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            onCancel={() => { setEditingCell(null); setEditingValue(""); }}
                          />
                        ) : (
                          <EditableCellButton
                            onClick={() => { setEditingCell({ itemId: it.id, field: "details" }); setEditingValue(it.details || ""); }}
                            title="לחץ לעריכה"
                          >
                            {[it.details, addonsText].filter(Boolean).join(" — ")}
                          </EditableCellButton>
                        )}
                      </Td>
                      <Td className="td-keep-together">
                        {editingCell?.itemId === it.id && editingCell?.field === "unitPrice" ? (
                          <EditableCellInput
                            value={editingValue}
                            onChange={setEditingValue}
                            inputMode="numeric"
                            onCommit={() => {
                              if (!editingValue.trim()) { setEditingCell(null); setEditingValue(""); return; }
                              const num = parseLooseNumber(editingValue);
                              const newManual = Math.max(0, num - addonsSum);
                              const newSubtotal = num * qty;
                              onUpdateItem(it.id, {
                                ...it,
                                manualUnitPrice: String(newManual),
                                subtotal: newSubtotal,
                              });
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            onCancel={() => { setEditingCell(null); setEditingValue(""); }}
                          />
                        ) : (
                          <EditableCellButton
                            onClick={() => {
                              setEditingCell({ itemId: it.id, field: "unitPrice" });
                              setEditingValue(perItem % 1 === 0 ? String(Math.round(perItem)) : String(perItem));
                            }}
                            title="לחץ לעריכת מחיר ליחידה"
                          >
                            {fmtCurrency.format(perItem)}
                          </EditableCellButton>
                        )}
                      </Td>
                      <Td className="td-keep-together">
                        {editingCell?.itemId === it.id && editingCell?.field === "qty" ? (
                          <EditableCellInput
                            value={editingValue}
                            onChange={setEditingValue}
                            inputMode="numeric"
                            onCommit={() => {
                              const nq = Math.max(0, parseLooseNumber(editingValue));
                              const newSubtotal = perItem * nq;
                              onUpdateItem(it.id, {
                                ...it,
                                qty: String(nq),
                                subtotal: newSubtotal,
                              });
                              setEditingCell(null);
                              setEditingValue("");
                            }}
                            onCancel={() => { setEditingCell(null); setEditingValue(""); }}
                          />
                        ) : (
                          <EditableCellButton
                            onClick={() => { setEditingCell({ itemId: it.id, field: "qty" }); setEditingValue(it.qty || ""); }}
                            title="לחץ לעריכה"
                          >
                            {fmtNumber.format(qty)}
                          </EditableCellButton>
                        )}
                      </Td>
                      <Td className="font-medium td-keep-together">
                        <div className="flex flex-col items-end gap-0.5">
                          <span>{fmtCurrency.format(total)}</span>
                          {!state.current.showTotals && (
                            <span className="text-xs text-slate-500 whitespace-normal">
                              סה״כ עם מע״מ: {fmtCurrency.format(totalWithVat)}
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td className="td-keep-together">
                        <button
                          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-100"
                          onClick={() => onRemoveItem(it.id)}
                          aria-label="מחק פריט"
                          title="מחק"
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
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95 inline-flex items-center gap-2 text-sm font-medium"
            onClick={() => {
              setAddItemModalEditingId(null);
              setShowAddItemModal(true);
            }}
            aria-label="הוסף פריט"
          >
            <span className="text-lg leading-none">+</span>
            הוסף פריט
          </button>
        </div>

        {/* Free-form additions — gentle continuation of פריטי ההצעה */}
        <div className="mt-3 pt-3 border-t border-slate-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base font-medium text-slate-700">
              תוספות חופשיות
              {state.current.freeFormAdditions.length > 0 && (
                <span className="text-slate-500 font-normal mr-1">
                  ({state.current.freeFormAdditions.length})
                </span>
              )}
            </span>
          </div>

          {/* Input form for new free-form addition */}
          {showFreeFormInput && (
            <div className="mb-3 p-3 border border-slate-200 rounded-lg bg-slate-50/80">
              <h3 className="text-sm font-medium text-slate-700 mb-2">הוספת תוספת חופשית</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
                <LabeledInput
                  label="שם התוספת"
                  value={newFreeFormDraft.name}
                  onChange={(v) => setNewFreeFormDraft({ ...newFreeFormDraft, name: v })}
                />
                <LabeledInput
                  label="מחיר"
                  value={newFreeFormDraft.price}
                  onChange={(v) => setNewFreeFormDraft({ ...newFreeFormDraft, price: v })}
                  inputMode="numeric"
                />
                <LabeledQuantityInput
                  label="כמות"
                  value={newFreeFormDraft.qty}
                  onChange={(v) => setNewFreeFormDraft({ ...newFreeFormDraft, qty: v })}
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-sm hover:opacity-95"
                  onClick={() => {
                    if (newFreeFormDraft.name.trim() && newFreeFormDraft.price.trim() && newFreeFormDraft.qty.trim()) {
                      // Create the addition directly with the form data
                      const newAddition = {
                        id: uuid(),
                        name: newFreeFormDraft.name.trim(),
                        price: newFreeFormDraft.price.trim(),
                        qty: newFreeFormDraft.qty.trim(),
                      };
                      // Add it to the state directly
                      updateCurrent("freeFormAdditions", [...state.current.freeFormAdditions, newAddition]);
                      setNewFreeFormDraft({ name: "", price: "0", qty: "1" });
                      setShowFreeFormInput(false);
                    }
                  }}
                >
                  שמור והוסף
                </button>
                <button
                  className="px-3 py-1.5 rounded-lg bg-white border text-sm hover:bg-slate-50"
                  onClick={() => {
                    setShowFreeFormInput(false);
                    setNewFreeFormDraft({ name: "", price: "0", qty: "1" });
                  }}
                >
                  ביטול
                </button>
              </div>
            </div>
          )}
          <div className="table-scroll">
            <table className="table-inner-min table-quote-items w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <Th>מס׳</Th>
                  <Th className="td-wrap-col">שם התוספת</Th>
                  <Th>מחיר ליח׳</Th>
                  <Th>כמות</Th>
                  <Th>סה״כ</Th>
                  <Th>פעולות</Th>
                </tr>
              </thead>
              <tbody>
                {state.current.freeFormAdditions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="text-center py-6 text-slate-500"
                    >
                      אין תוספות חופשיות עדיין
                    </td>
                  </tr>
                ) : (
                  state.current.freeFormAdditions.map((add, idx) => {
                    const price = parseLooseNumber(add.price);
                    const qty = Math.max(0, parseLooseNumber(add.qty));
                    const total = price * qty;
                    const totalWithVat = total * (1 + taxDecimal);
                    const isEditing = (f: "name" | "price" | "qty") =>
                      editingFreeFormCell?.id === add.id && editingFreeFormCell?.field === f;
                    const commitFreeForm = (field: "name" | "price" | "qty") => {
                      if (!editingFreeFormCell || editingFreeFormCell.id !== add.id || editingFreeFormCell.field !== field) return;
                      const updated = { ...add, [field]: editingFreeFormValue };
                      onUpdateFreeFormAddition(add.id, updated);
                      setEditingFreeFormCell(null);
                    };
                    return (
                      <tr
                        key={add.id}
                        data-drag-row="freeform"
                        data-freeform-id={add.id}
                        className={`border-b ${dragState?.type === "freeform" && dragState?.id === add.id ? "opacity-50" : ""}`}
                      >
                        <Td>
                          <div
                            className="flex items-center gap-2 cursor-grab active:cursor-grabbing select-none"
                            title="גרור לסידור מחדש"
                            onPointerDown={(e) => {
                              if (e.button !== 0) return;
                              setDragState({ type: "freeform", id: add.id, label: add.name || `תוספת ${idx + 1}` });
                              setDragPreviewPos({ x: e.clientX, y: e.clientY });
                            }}
                          >
                            <span className="text-slate-400 hover:text-slate-600">⋮⋮</span>
                            <span>{idx + 1}</span>
                          </div>
                        </Td>
                        <Td className="td-wrap-col">
                          {isEditing("name") ? (
                            <EditableCellInput
                              value={editingFreeFormValue}
                              onChange={setEditingFreeFormValue}
                              onCommit={() => commitFreeForm("name")}
                              onCancel={() => setEditingFreeFormCell(null)}
                            />
                          ) : (
                            <EditableCellButton
                              onClick={() => {
                                setEditingFreeFormCell({ id: add.id, field: "name" });
                                setEditingFreeFormValue(add.name || "");
                              }}
                              title="לחץ לעריכה"
                            >
                              {add.name || "\u00A0"}
                            </EditableCellButton>
                          )}
                        </Td>
                        <Td className="td-keep-together">
                          {isEditing("price") ? (
                            <EditableCellInput
                              value={editingFreeFormValue}
                              onChange={setEditingFreeFormValue}
                              onCommit={() => commitFreeForm("price")}
                              onCancel={() => setEditingFreeFormCell(null)}
                              inputMode="numeric"
                            />
                          ) : (
                            <EditableCellButton
                              onClick={() => {
                                setEditingFreeFormCell({ id: add.id, field: "price" });
                                setEditingFreeFormValue(add.price || "");
                              }}
                              title="לחץ לעריכה"
                            >
                              {fmtCurrency.format(price)}
                            </EditableCellButton>
                          )}
                        </Td>
                        <Td className="td-keep-together">
                          {isEditing("qty") ? (
                            <EditableCellInput
                              value={editingFreeFormValue}
                              onChange={setEditingFreeFormValue}
                              onCommit={() => commitFreeForm("qty")}
                              onCancel={() => setEditingFreeFormCell(null)}
                              inputMode="numeric"
                            />
                          ) : (
                            <EditableCellButton
                              onClick={() => {
                                setEditingFreeFormCell({ id: add.id, field: "qty" });
                                setEditingFreeFormValue(add.qty || "");
                              }}
                              title="לחץ לעריכה"
                            >
                              {fmtNumber.format(qty)}
                            </EditableCellButton>
                          )}
                        </Td>
                        <Td className="font-medium td-keep-together">
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{fmtCurrency.format(total)}</span>
                            {!state.current.showTotals && (
                              <span className="text-xs text-slate-500 whitespace-normal">
                                סה״כ עם מע״מ: {fmtCurrency.format(totalWithVat)}
                              </span>
                            )}
                          </div>
                        </Td>
                        <Td className="td-keep-together">
                          <button
                            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-sm font-medium text-red-600 hover:bg-red-100"
                            onClick={() => onRemoveFreeFormAddition(add.id)}
                            aria-label="מחק תוספת"
                            title="מחק"
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
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95 inline-flex items-center gap-2 text-sm font-medium"
              onClick={() => setShowFreeFormInput(true)}
              title="הוסף תוספת חופשית"
              aria-label="הוסף תוספת"
            >
              <span className="text-lg leading-none">+</span>
              הוסף תוספת
            </button>
          </div>
        </div>

        {/* Totals row + toggle for calculating overall totals */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={state.current.showTotals}
                  onChange={(e) =>
                    updateCurrent("showTotals", e.target.checked)
                  }
                />
                <span>חשב והצג סיכום כללי (מחיר, מע״מ, סה״כ)</span>
              </label>
            </div>
            {state.current.showTotals && (
              <div className="grid grid-cols-3 gap-3 text-sm">
                <Stat label="מחיר" value={fmtCurrency.format(totalSubTotal)} />
                <Stat label="מע״מ" value={fmtCurrency.format(taxValue)} />
                <Stat
                  label="סה״כ לתשלום"
                  value={fmtCurrency.format(grandTotal)}
                  highlight
                />
              </div>
            )}
          </div>
        </div>

        {/* Footer notes - moved above date */}
        <div className="mt-4">
          <LabeledInput
            label="הערות למסמך (יופיעו ב-PDF)"
            value={state.current.notes}
            onChange={(v) => updateCurrent("notes", v)}
            multiline
            rows={4}
          />
        </div>

        {/* Final actions: export / print + PDF folder (when in Tauri) — saving is automatic; keep buttons on the right in RTL */}
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 items-center justify-start">
            <button
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-95"
              onClick={onExportPdf}
            >
              ייצוא ל-PDF
            </button>
            {onPrintPdf && (
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-sky-600 text-white hover:opacity-95"
                onClick={onPrintPdf}
                title="פתיחת ה-PDF בצופה להדפסה ובחירת מדפסת"
              >
                הדפסה
              </button>
            )}
            {showPdfFolderControl && onSelectPdfFolder && (
              <>
                <button
                  type="button"
                  className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
                  onClick={onSelectPdfFolder}
                  title={pdfSaveFolder ? "שינוי תיקייה" : "בחר תיקייה"}
                >
                  תיקיית שמירה ל-PDF
                </button>
                <span className="text-sm text-slate-600" title={pdfSaveFolder || undefined}>
                  {pdfSaveFolder ? (
                    <>הקבצים יישמרו ב: <span className="text-slate-800 font-medium truncate max-w-[240px] sm:max-w-[320px] inline-block align-bottom" dir="ltr">{pdfSaveFolder}</span></>
                  ) : (
                    <>טרם נבחרה תיקייה — לחץ על &quot;תיקיית שמירה ל-PDF&quot; לבחירה</>
                  )}
                </span>
              </>
            )}
          </div>
          {showPdfFolderControl && onOpenPdfFolder && (
            <div className="flex justify-start">
              <button
                type="button"
                className="px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm"
                onClick={onOpenPdfFolder}
                title="פתח את התיקייה שבה נשמרים קבצי ה-PDF"
              >
                פתח תיקייה
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Edit Item Modal */}
      {editingItemId && editDraft && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditingItemId(null);
            setEditDraft(null);
            setEditActiveProfileId(undefined);
            closeProfileModal();
          }}
        >
          <div
            ref={(el) => el && setEditItemModalContentEl(el)}
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                {showAddProfileModal
                  ? profileModalEditId
                    ? "עריכת פרופיל — עריכת פריט"
                    : "הוספת פרופיל — עריכת פריט"
                  : "עריכת פריט"}
              </h3>
              <button
                className="text-slate-500 hover:text-slate-700"
                onClick={() => {
                  if (showAddProfileModal) closeProfileModal();
                  else {
                    setEditingItemId(null);
                    setEditDraft(null);
                    setEditActiveProfileId(undefined);
                  }
                }}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              {showAddProfileModal && (onAddProfileQuick || onUpdateProfileQuick) ? (
                <>
                  <p className="text-sm text-slate-600">
                    {profileModalEditId
                      ? "עריכת הפרופיל הנבחר — השינויים יחולו על כל השורות שמשתמשות בפרופיל זה."
                      : "הוספת פרופיל חדש — לאחר ההוספה הפרופיל ייבחר עבור פריט זה."}
                  </p>
                  <div className="space-y-3">
                    <LabeledInput
                      label="שם הפרופיל"
                      placeholder="למשל 4300 זכוכית ורשת"
                      value={addProfileDraft.name}
                      onChange={(v) => setAddProfileDraft((d) => ({ ...d, name: v }))}
                    />
                    <LabeledInput
                      label="מחיר למ״ר (ברירת מחדל)"
                      value={addProfileDraft.unitPrice}
                      onChange={(v) => setAddProfileDraft((d) => ({ ...d, unitPrice: v }))}
                      inputMode="numeric"
                    />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                      onClick={closeProfileModal}
                    >
                      חזרה לעריכת פריט
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                      onClick={commitProfileModal}
                    >
                      {profileModalEditId ? "שמור" : "הוסף ובחר"}
                    </button>
                  </div>
                </>
              ) : (
              <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LabeledInput
                  label={dimensionUnit === "mm" ? "רוחב (מ״מ)" : "רוחב (ס״מ)"}
                  value={
                    dimensionUnit === "mm"
                      ? String(Math.round(cmToDisplay(parseLooseNumber(editDraft.widthCm), "mm")))
                      : editDraft.widthCm
                  }
                  onChange={(v) =>
                    setEditDraft({
                      ...editDraft,
                      widthCm: String(displayToCm(parseLooseNumber(v), dimensionUnit)),
                    })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label={dimensionUnit === "mm" ? "גובה (מ״מ)" : "גובה (ס״מ)"}
                  value={
                    dimensionUnit === "mm"
                      ? String(Math.round(cmToDisplay(parseLooseNumber(editDraft.heightCm), "mm")))
                      : editDraft.heightCm
                  }
                  onChange={(v) =>
                    setEditDraft({
                      ...editDraft,
                      heightCm: String(displayToCm(parseLooseNumber(v), dimensionUnit)),
                    })
                  }
                  inputMode="numeric"
                />
                <LabeledQuantityInput
                  label="כמות"
                  value={editDraft.qty}
                  onChange={(v) => setEditDraft({ ...editDraft, qty: v })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="grid gap-1.5 w-full">
                  <span className="text-sm text-slate-700">פרופיל</span>
                  <Select
                    value={
                      showAddProfileModal && profileModalEditId
                        ? "__edit_profile__"
                        : showAddProfileModal
                        ? "__add_profile__"
                        : (editActiveProfileId ?? "__empty__")
                    }
                    onValueChange={(id) => {
                      if (id === "__add_profile__") {
                        setShowAddProfileModal(true);
                        setProfileModalEditId(null);
                        setAddProfileDraft({ name: "", unitPrice: "" });
                      } else if (id === "__edit_profile__") {
                        const pid = editActiveProfileId;
                        if (!pid || !onUpdateProfileQuick) return;
                        const p = state.profiles.find((x) => x.id === pid);
                        if (!p) return;
                        setProfileModalEditId(pid);
                        setAddProfileDraft({ name: p.name, unitPrice: String(p.unitPrice) });
                        setShowAddProfileModal(true);
                      } else if (id === "__empty__") {
                        setEditActiveProfileId(undefined);
                      } else {
                        setEditActiveProfileId(id);
                      }
                    }}
                  >
                    <SelectTrigger className="w-full rounded-md bg-white border border-slate-300 px-3 py-2 text-sm">
                      <SelectValue placeholder="— בחר/י —" />
                    </SelectTrigger>
                    <SelectContent portalContainer={editItemModalContentEl}>
                      <SelectItem value="__empty__">— בחר/י —</SelectItem>
                      {state.profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                      {editActiveProfileId && onUpdateProfileQuick && (
                        <SelectItem value="__edit_profile__">✏️ ערוך פרופיל...</SelectItem>
                      )}
                      {onAddProfileQuick && (
                        <SelectItem value="__add_profile__">➕ הוסף פרופיל...</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </label>
                <LabeledInput
                  label="מחיר למ״ר"
                  value={editDraft.unitPrice}
                  onChange={(v) =>
                    setEditDraft({ ...editDraft, unitPrice: v })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label="מיקום"
                  value={editDraft.location || ""}
                  onChange={(v) =>
                    setEditDraft({ ...editDraft, location: v })
                  }
                />
              </div>
              <LabeledInput
                label="מחיר ליח׳ ידני (אופציונלי)"
                placeholder="השאר ריק לחישוב מנוסחה"
                value={editDraft.manualUnitPrice ?? ""}
                onChange={(v) =>
                  setEditDraft({ ...editDraft, manualUnitPrice: v })
                }
                inputMode="numeric"
              />
              <LabeledInput
                label="פרטים"
                value={editDraft.details || ""}
                onChange={(v) => setEditDraft({ ...editDraft, details: v })}
              />
              <div>
                <div className="text-sm font-medium mb-2">תוספות (מחיר ליח׳)</div>
                <div className="flex flex-wrap gap-2">
                  {editDraft.addons.map((a, idx) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1"
                    >
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={a.checked}
                          onChange={(e) => {
                            const next = [...editDraft.addons];
                            next[idx] = { ...a, checked: e.target.checked };
                            setEditDraft({ ...editDraft, addons: next });
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
                          const next = [...editDraft.addons];
                          next[idx] = { ...a, price: e.target.value };
                          setEditDraft({ ...editDraft, addons: next });
                        }}
                      />
                    </div>
                  ))}
                </div>
              </div>
              </>
              )}
            </div>
            {!showAddProfileModal && (
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                onClick={() => {
                  setEditingItemId(null);
                  setEditDraft(null);
                  setEditActiveProfileId(undefined);
                }}
              >
                ביטול
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                onClick={handleSaveEdit}
              >
                שמור שינויים
              </button>
            </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default QuotePage;

/** ===== local small UI bits for this page ===== */
function EditableCellButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="text-right w-full min-w-0 hover:bg-slate-100 rounded px-1 py-0.5 -mx-1 min-h-[1.5rem] break-words"
      onClick={onClick}
      title={title}
    >
      {children || "\u00A0"}
    </button>
  );
}

function EditableCellInput({
  value,
  onChange,
  onCommit,
  onCancel,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <input
      type="text"
      inputMode={inputMode}
      className="w-full min-w-[4rem] rounded border border-sky-400 px-2 py-1 text-sm"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onCommit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") onCancel();
      }}
      autoFocus
    />
  );
}

function LabeledInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  multiline?: boolean;
  rows?: number;
}) {
  const { multiline, rows = 3 } = props;
  return (
    <label className="grid gap-1.5 w-full">
      <span className="text-sm text-slate-700">{props.label}</span>
      {multiline ? (
        <textarea
          rows={rows}
          className="w-full rounded-md bg-white border border-slate-300 px-3 py-2 resize-y min-h-[80px]"
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          inputMode={props.inputMode}
          className="w-full rounded-md bg-white border border-slate-300 px-3 py-2"
          placeholder={props.placeholder}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
    </label>
  );
}

function LabeledQuantityInput(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
}) {
  const min = props.min ?? 1;
  const n = parseLooseNumber(props.value);
  const num = Number.isNaN(n) ? min : Math.max(min, Math.round(n));
  return (
    <label className="grid gap-1.5 w-full max-w-[6.5rem]">
      <span className="text-sm text-slate-700">{props.label}</span>
      <div className="flex items-center gap-0.5 w-full">
        <button
          type="button"
          className="flex-shrink-0 w-7 h-7 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-medium"
          onClick={() => props.onChange(String(Math.max(min, num - 1)))}
          aria-label="הפחת 1"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          className="flex-1 min-w-0 w-10 rounded border border-slate-300 px-1.5 py-1.5 text-center text-sm"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
        />
        <button
          type="button"
          className="flex-shrink-0 w-7 h-7 rounded border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-medium"
          onClick={() => props.onChange(String(num + 1))}
          aria-label="הוסף 1"
        >
          +
        </button>
      </div>
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
        highlight
          ? "bg-emerald-50 border-emerald-200"
          : "bg-white border-slate-200"
      }`}
    >
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-center px-3 py-2 text-slate-700 font-medium whitespace-nowrap ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`text-right px-3 py-2 align-top whitespace-nowrap ${className ?? ""}`}>
      {children}
    </td>
  );
}
