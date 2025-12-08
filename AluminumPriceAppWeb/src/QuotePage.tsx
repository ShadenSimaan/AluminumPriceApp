// FILE: src/QuotePage.tsx
import React, { useMemo } from "react";
import { AppState, LineItem } from "./types";

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
  openSettings: () => void;
  onAddItem: () => void;
  onRemoveItem: (id: string) => void;
  onEditItem: (id: string) => void;
  onUpdateItem: (id: string, updated: LineItem) => void;
  onMoveItemUp: (id: string) => void;
  onMoveItemDown: (id: string) => void;
  onAddFreeFormAddition: () => void;
  onUpdateFreeFormAddition: (id: string, updated: any) => void;
  onRemoveFreeFormAddition: (id: string) => void;
  onSaveQuote: () => void;
  onExportPdf: () => void;
};

const QuotePage: React.FC<QuotePageProps> = ({
  state,
  itemEditor,
  activeProfileId,
  updateCurrent,
  setItemEditor,
  setActiveProfileId,
  openSettings,
  onAddItem,
  onRemoveItem,
  onEditItem,
  onUpdateItem,
  onMoveItemUp,
  onMoveItemDown,
  onAddFreeFormAddition,
  onUpdateFreeFormAddition,
  onRemoveFreeFormAddition,
  onSaveQuote,
  onExportPdf,
}) => {
  const [editingItemId, setEditingItemId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState<LineItem | null>(null);
  const [editActiveProfileId, setEditActiveProfileId] = React.useState<string | undefined>(undefined);
  const [editingFreeFormId, setEditingFreeFormId] = React.useState<string | null>(null);
  const [editFreeFormDraft, setEditFreeFormDraft] = React.useState<any | null>(null);
  const [draggedItemId, setDraggedItemId] = React.useState<string | null>(null);
  const [showFreeFormInput, setShowFreeFormInput] = React.useState(false);
  const [newFreeFormDraft, setNewFreeFormDraft] = React.useState<{ name: string; price: string; qty: string }>({
    name: "",
    price: "0",
    qty: "1",
  });

  React.useEffect(() => {
    if (editingItemId) {
      const item = state.current.items.find((it) => it.id === editingItemId);
      if (item) {
        setEditDraft({ ...item });
        setEditActiveProfileId(item.profileId);
      }
    }
  }, [editingItemId, state.current.items]);

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

  React.useEffect(() => {
    if (editingFreeFormId) {
      const add = state.current.freeFormAdditions.find((a) => a.id === editingFreeFormId);
      if (add) {
        setEditFreeFormDraft({ ...add });
      } else {
        setEditFreeFormDraft(null);
      }
    } else {
      setEditFreeFormDraft(null);
    }
  }, [editingFreeFormId, state.current.freeFormAdditions]);

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
    const unitPriceNum = parseLooseNumber(editDraft.unitPrice);
    const perItemPrice = area * unitPriceNum + addonsPerItem;
    const subtotal = perItemPrice * qty;

    const updated: LineItem = {
      ...editDraft,
      subtotal,
    };

    onUpdateItem(editingItemId, updated);
    setEditingItemId(null);
    setEditDraft(null);
    setEditActiveProfileId(undefined);
  };

  const handleSaveFreeFormEdit = () => {
    if (!editFreeFormDraft || !editingFreeFormId) return;
    onUpdateFreeFormAddition(editingFreeFormId, editFreeFormDraft);
    setEditingFreeFormId(null);
    setEditFreeFormDraft(null);
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

  return (
    <section className="grid gap-4">
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
          />
        </div>
      </section>

      {/* Calculator + Add item */}
      <section className="card p-4 w-full">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-semibold">מחשבון פריט</h2>
        </div>

        {/* Row 1: width / height / qty */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <LabeledInput
            label="רוחב (ס״מ)"
            value={itemEditor.widthCm}
            onChange={(v) => setItemEditor({ ...itemEditor, widthCm: v })}
            inputMode="numeric"
          />
          <LabeledInput
            label="גובה (ס״מ)"
            value={itemEditor.heightCm}
            onChange={(v) => setItemEditor({ ...itemEditor, heightCm: v })}
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
            onChange={(v) => setItemEditor({ ...itemEditor, unitPrice: v })}
            inputMode="numeric"
          />
          <LabeledInput
            label="מיקום"
            value={itemEditor.location || ""}
            onChange={(v) => setItemEditor({ ...itemEditor, location: v })}
          />
        </div>

        {/* Row 3: details + addons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
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
                  <div
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1"
                  >
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-5 h-5 cursor-pointer"
                        checked={itemAddon.checked}
                        onChange={(e) => {
                          const next = [...itemEditor.addons];
                          const existingIdx = next.findIndex((ia) => ia.id === a.id);
                          if (existingIdx >= 0) {
                            next[existingIdx] = { ...next[existingIdx], checked: e.target.checked };
                          } else {
                            next.push({ ...a, checked: e.target.checked });
                          }
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
                      value={itemAddon.price}
                      onChange={(e) => {
                        const next = [...itemEditor.addons];
                        const existingIdx = next.findIndex((ia) => ia.id === a.id);
                        if (existingIdx >= 0) {
                          next[existingIdx] = { ...next[existingIdx], price: e.target.value };
                        } else {
                          next.push({ ...a, price: e.target.value, checked: false });
                        }
                        setItemEditor({
                          ...itemEditor,
                          addons: next,
                        });
                      }}
                    />
                  </div>
                );
              })}
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

        {/* Add-item + settings */}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
            onClick={onAddItem}
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
          <h2 className="text-xl font-semibold">פריטי ההצעה</h2>
          <div className="text-sm text-slate-600">
            הטבלה נגללת אופקית במסכים קטנים
          </div>
        </div>
        <div className="table-scroll">
          <table className="table-inner-min w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50">
                <Th>מס׳</Th>
                <Th>פרופיל</Th>
                <Th>מידות (ס״מ)</Th>
                <Th>מיקום</Th>
                <Th>פרטים</Th>
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
                  const unit = parseLooseNumber(it.unitPrice);
                  const perItem = area * unit + addonsSum;
                  const qty = Math.max(0, parseLooseNumber(it.qty));
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
                    <tr 
                      key={it.id} 
                      className={`border-b ${draggedItemId === it.id ? "opacity-50" : ""}`}
                      draggable
                      onDragStart={(e) => {
                        setDraggedItemId(it.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (draggedItemId && draggedItemId !== it.id) {
                          const draggedIdx = state.current.items.findIndex((item) => item.id === draggedItemId);
                          const targetIdx = idx;
                          if (draggedIdx !== -1) {
                            const items = [...state.current.items];
                            const [draggedItem] = items.splice(draggedIdx, 1);
                            items.splice(targetIdx, 0, draggedItem);
                            updateCurrent("items", items);
                          }
                        }
                        setDraggedItemId(null);
                      }}
                      onDragEnd={() => setDraggedItemId(null)}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="cursor-move text-slate-400 hover:text-slate-600 select-none" title="גרור לסידור מחדש" draggable={false}>
                            ⋮⋮
                          </span>
                          <span>{idx + 1}</span>
                        </div>
                      </Td>
                      <Td>{it.profileName || ""}</Td>
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
                        <div className="flex flex-wrap gap-1 items-center">
                          <button
                            className="text-blue-600 hover:underline text-xs"
                            onClick={() => setEditingItemId(it.id)}
                            aria-label="ערוך פריט"
                            title="ערוך"
                          >
                            עריכה
                          </button>
                          <button
                            className="text-red-600 hover:underline text-xs"
                            onClick={() => onRemoveItem(it.id)}
                            aria-label="מחק פריט"
                            title="מחק"
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

        {/* Free-form additions table */}
        <div className="mt-4 border-t pt-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-xl font-semibold">תוספות חופשיות</h2>
            <button
              className="px-4 py-2 rounded-lg bg-sky-500 text-white text-base hover:opacity-95"
              onClick={() => setShowFreeFormInput(true)}
            >
              הוסף תוספת
            </button>
          </div>

          {/* Input form for new free-form addition */}
          {showFreeFormInput && (
            <div className="mb-4 p-4 border rounded-lg bg-slate-50">
              <h3 className="text-lg font-semibold mb-3">הוספת תוספת חופשית</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
                <LabeledInput
                  label="שם התוספת*"
                  placeholder="חובה"
                  value={newFreeFormDraft.name}
                  onChange={(v) => setNewFreeFormDraft({ ...newFreeFormDraft, name: v })}
                />
                <LabeledInput
                  label="מחיר*"
                  placeholder="חובה"
                  value={newFreeFormDraft.price}
                  onChange={(v) => setNewFreeFormDraft({ ...newFreeFormDraft, price: v })}
                  inputMode="numeric"
                />
                <LabeledInput
                  label="כמות*"
                  placeholder="חובה"
                  value={newFreeFormDraft.qty}
                  onChange={(v) => setNewFreeFormDraft({ ...newFreeFormDraft, qty: v })}
                  inputMode="numeric"
                />
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-lg bg-sky-500 text-white text-base hover:opacity-95"
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
                  className="px-4 py-2 rounded-lg bg-white border text-base hover:bg-slate-50"
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
            <table className="table-inner-min w-full text-sm">
              <thead>
                <tr className="border-b bg-slate-50">
                  <Th>מס׳</Th>
                  <Th>שם התוספת</Th>
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
                    return (
                      <tr key={add.id} className="border-b">
                        <Td>{idx + 1}</Td>
                        <Td>{add.name || ""}</Td>
                        <Td>{fmtCurrency.format(price)}</Td>
                        <Td>{fmtNumber.format(qty)}</Td>
                        <Td className="font-medium">
                          {fmtCurrency.format(total)}
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1 items-center">
                            <button
                              className="text-blue-600 hover:underline text-xs"
                              onClick={() => setEditingFreeFormId(add.id)}
                              aria-label="ערוך תוספת"
                              title="ערוך"
                            >
                              עריכה
                            </button>
                            <button
                              className="text-red-600 hover:underline text-xs"
                              onClick={() => onRemoveFreeFormAddition(add.id)}
                              aria-label="מחק תוספת"
                              title="מחק"
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
            <Stat label="מחיר" value={fmtCurrency.format(totalSubTotal)} />
            <Stat label="מע״מ" value={fmtCurrency.format(taxValue)} />
            <Stat
              label="סה״כ לתשלום"
              value={fmtCurrency.format(grandTotal)}
              highlight
            />
          </div>
        </div>

        {/* Footer notes - moved above date */}
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
            onClick={onSaveQuote}
          >
            שמור הצעה
          </button>
          <button
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-95"
            onClick={onExportPdf}
          >
            ייצוא ל-PDF
          </button>
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
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">עריכת פריט</h3>
              <button
                className="text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setEditingItemId(null);
                  setEditDraft(null);
                  setEditActiveProfileId(undefined);
                }}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LabeledInput
                  label="רוחב (ס״מ)"
                  value={editDraft.widthCm}
                  onChange={(v) =>
                    setEditDraft({ ...editDraft, widthCm: v })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label="גובה (ס״מ)"
                  value={editDraft.heightCm}
                  onChange={(v) =>
                    setEditDraft({ ...editDraft, heightCm: v })
                  }
                  inputMode="numeric"
                />
                <LabeledInput
                  label="כמות"
                  value={editDraft.qty}
                  onChange={(v) => setEditDraft({ ...editDraft, qty: v })}
                  inputMode="numeric"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <LabeledSelect
                  label="פרופיל"
                  value={editActiveProfileId ?? ""}
                  onChange={(id) => setEditActiveProfileId(id || undefined)}
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
            </div>
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
          </div>
        </div>
      )}

      {/* Edit Free-Form Addition Modal */}
      {editingFreeFormId && editFreeFormDraft && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => {
            setEditingFreeFormId(null);
            setEditFreeFormDraft(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="text-lg font-semibold">עריכת תוספת חופשית</h3>
              <button
                className="text-slate-500 hover:text-slate-700"
                onClick={() => {
                  setEditingFreeFormId(null);
                  setEditFreeFormDraft(null);
                }}
              >
                ✕
              </button>
            </div>
            <div className="p-4 space-y-4">
              <LabeledInput
                label="שם התוספת"
                value={editFreeFormDraft.name}
                onChange={(v) =>
                  setEditFreeFormDraft({ ...editFreeFormDraft, name: v })
                }
              />
              <LabeledInput
                label="מחיר"
                value={editFreeFormDraft.price}
                onChange={(v) =>
                  setEditFreeFormDraft({ ...editFreeFormDraft, price: v })
                }
                inputMode="numeric"
              />
              <LabeledInput
                label="כמות"
                value={editFreeFormDraft.qty}
                onChange={(v) =>
                  setEditFreeFormDraft({ ...editFreeFormDraft, qty: v })
                }
                inputMode="numeric"
              />
            </div>
            <div className="p-4 border-t flex justify-end gap-2">
              <button
                className="px-4 py-2 rounded-lg bg-white border hover:bg-slate-50"
                onClick={() => {
                  setEditingFreeFormId(null);
                  setEditFreeFormDraft(null);
                }}
              >
                ביטול
              </button>
              <button
                className="px-4 py-2 rounded-lg bg-sky-500 text-white hover:opacity-95"
                onClick={handleSaveFreeFormEdit}
              >
                שמור שינויים
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default QuotePage;

/** ===== local small UI bits for this page ===== */
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
