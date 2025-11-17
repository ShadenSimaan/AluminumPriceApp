// FILE: src/QuotePage.tsx
import React, { useMemo } from "react";
import { AppState, LineItem } from "./types";

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
  onSaveQuote,
  onExportPdf,
}) => {
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

  const taxDecimal = useMemo(() => {
    const raw = state.current.taxPercentText ?? "18";
    const n = parseLooseNumber(raw);
    if (n === 0) return 0;
    if (n > 1.0) return n / 100;
    return n;
  }, [state.current.taxPercentText]);

  const taxValue = subTotal * taxDecimal;
  const grandTotal = subTotal + taxValue;

  return (
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
                <Th>פרופיל</Th>
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
                    <tr key={it.id} className="border-b">
                      <Td>{idx + 1}</Td>
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
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => onRemoveItem(it.id)}
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
