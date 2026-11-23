import { useState } from "react";
import { dict } from "../rfq/i18n";
import { changeOpeningType, createRfqItem } from "../rfq/presets";
import { rfqUuid } from "../rfq/rfqState";
import type { RfqOpeningType } from "../rfq/types";
import { RFQ_OPENING_TYPES } from "../rfq/types";
import type { Addon, LineItem, Profile } from "../types";
import { lineUnitPrice } from "./pricing";
import type { WindowImportDraft } from "./windowImport";
import { withSubtotal } from "./windowLine";

const fieldClass = "w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-sm";

function money(amount: number): string {
  return new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(amount);
}

function applyOpening(line: LineItem, opening: RfqOpeningType): LineItem {
  const next = line.configuration
    ? changeOpeningType(line.configuration, opening)
    : createRfqItem({ id: rfqUuid(), openingType: opening, unit: "cm", reference: "", withDefaultSize: false });
  return withSubtotal({ ...line, configuration: { ...next, location: line.location ?? "" } });
}

function applyProfile(line: LineItem, profile: Profile | undefined): LineItem {
  return withSubtotal({
    ...line,
    profileId: profile?.id,
    profileName: profile?.name,
    unitPrice: profile ? String(profile.unitPrice) : "0",
    priceBasis: "per_m2",
  });
}

function applyAddon(line: LineItem, catalog: Addon[], addonId: string, checked: boolean): LineItem {
  const known = catalog.find((addon) => addon.id === addonId);
  const addons = line.addons.some((addon) => addon.id === addonId)
    ? line.addons.map((addon) => (addon.id === addonId ? { ...addon, checked } : addon))
    : known
      ? [...line.addons, { ...known, checked }]
      : line.addons;
  return withSubtotal({ ...line, addons });
}

/** Confirm and correct imported windows before they are added. Every visible field can be changed. */
export default function WindowImportPreview({
  drafts: initialDrafts,
  message,
  profiles,
  addons,
  onCancel,
  onConfirm,
}: {
  drafts: WindowImportDraft[];
  message: string;
  profiles: Profile[];
  addons: Addon[];
  onCancel: () => void;
  onConfirm: (lines: LineItem[]) => void;
}) {
  const [drafts, setDrafts] = useState(initialDrafts);
  const [included, setIncluded] = useState<boolean[]>(() => initialDrafts.map(() => true));
  const labels = dict("he");
  const selected = drafts.filter((_, index) => included[index]).map((draft) => draft.line);
  const missingOpening = selected.filter((line) => !line.configuration).length;

  function update(index: number, line: LineItem, rawOpening?: string) {
    setDrafts((current) =>
      current.map((draft, i) => (i === index ? { ...draft, line, rawOpening: rawOpening ?? draft.rawOpening } : draft))
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full my-6 p-4" dir="rtl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-semibold">תצוגה מקדימה לפני הוספה</h2>
            <p className="text-sm text-slate-600 mt-1">{message}</p>
          </div>
          <button type="button" className="px-3 py-1.5 rounded border" onClick={onCancel}>
            ביטול
          </button>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="p-2 text-right">הוסף</th>
                <th className="p-2 text-right">מיקום</th>
                <th className="p-2 text-right">רוחב</th>
                <th className="p-2 text-right">גובה</th>
                <th className="p-2 text-right">כמות</th>
                <th className="p-2 text-right">פרופיל</th>
                <th className="p-2 text-right">סוג פתיחה</th>
                <th className="p-2 text-right">תוספות</th>
                <th className="p-2 text-right">מחיר ליח׳</th>
              </tr>
            </thead>
            <tbody>
              {drafts.map((draft, index) => {
                const line = draft.line;
                const opening = line.configuration?.openingType ?? "";
                const needsOpening = !opening && (included[index] ?? false);
                return (
                  <tr key={line.id} className={`border-t align-top ${needsOpening ? "bg-amber-100" : ""}`}>
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={included[index] ?? false}
                        aria-label={`הוסף שורה ${index + 1}`}
                        onChange={(event) =>
                          setIncluded((current) => current.map((value, i) => (i === index ? event.target.checked : value)))
                        }
                      />
                    </td>
                    <td className="p-2 min-w-24">
                      <input
                        className={fieldClass}
                        aria-label={`מיקום שורה ${index + 1}`}
                        value={line.location ?? ""}
                        onChange={(event) => update(index, withSubtotal({ ...line, location: event.target.value }))}
                      />
                    </td>
                    <td className="p-2 w-20">
                      <input
                        className={fieldClass}
                        dir="ltr"
                        inputMode="decimal"
                        aria-label={`רוחב שורה ${index + 1}`}
                        value={line.widthCm}
                        onChange={(event) => update(index, withSubtotal({ ...line, widthCm: event.target.value }))}
                      />
                    </td>
                    <td className="p-2 w-20">
                      <input
                        className={fieldClass}
                        dir="ltr"
                        inputMode="decimal"
                        aria-label={`גובה שורה ${index + 1}`}
                        value={line.heightCm}
                        onChange={(event) => update(index, withSubtotal({ ...line, heightCm: event.target.value }))}
                      />
                    </td>
                    <td className="p-2 w-16">
                      <input
                        className={fieldClass}
                        dir="ltr"
                        inputMode="numeric"
                        aria-label={`כמות שורה ${index + 1}`}
                        value={line.qty}
                        onChange={(event) => update(index, withSubtotal({ ...line, qty: event.target.value }))}
                      />
                    </td>
                    <td className="p-2 min-w-36">
                      <select
                        className={fieldClass}
                        aria-label={`פרופיל שורה ${index + 1}`}
                        value={line.profileId ?? ""}
                        onChange={(event) => update(index, applyProfile(line, profiles.find((profile) => profile.id === event.target.value)))}
                      >
                        <option value="">בלי פרופיל</option>
                        {profiles.map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 min-w-40">
                      <select
                        className={`${fieldClass} ${needsOpening ? "border-amber-600 bg-amber-50" : ""}`}
                        aria-label={`סוג פתיחה שורה ${index + 1}`}
                        value={opening}
                        onChange={(event) => {
                          const next = event.target.value as RfqOpeningType;
                          if (!next) return;
                          update(index, applyOpening(line, next), "");
                        }}
                      >
                        <option value="">בחר סוג פתיחה</option>
                        {RFQ_OPENING_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {labels.openingType[type]}
                          </option>
                        ))}
                      </select>
                      {needsOpening && <div className="text-xs font-medium text-amber-900 mt-1">חסר סוג פתיחה</div>}
                      {draft.rawOpening && !opening && (
                        <div className="text-xs text-amber-800 mt-1">בקובץ: {draft.rawOpening}</div>
                      )}
                    </td>
                    <td className="p-2 min-w-52">
                      <div className="flex flex-col gap-1">
                        {addons.map((addon) => {
                          const onLine = line.addons.find((item) => item.id === addon.id);
                          const checked = onLine?.checked ?? false;
                          return (
                            <label key={addon.id} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                aria-label={`${addon.name} שורה ${index + 1}`}
                                onChange={(event) => update(index, applyAddon(line, addons, addon.id, event.target.checked))}
                              />
                              <span>
                                {addon.name} ({money(Number(onLine?.price ?? addon.price) || 0)})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {draft.unmatchedAddons.length > 0 && (
                        <div className="text-xs text-amber-800 mt-1">לא זוהה: {draft.unmatchedAddons.join(", ")}</div>
                      )}
                    </td>
                    <td className="p-2 whitespace-nowrap">{money(lineUnitPrice(line))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {missingOpening > 0 && (
          <p className="mt-3 text-sm text-amber-950 bg-amber-100 border border-amber-300 rounded-lg px-3 py-2">בחר סוג פתיחה בשורות שמסומנות להוספה. הקטגוריה נקבעת לפי הסוג.</p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-4 py-2 rounded-lg border" onClick={onCancel}>
            אל תוסיף
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-40"
            disabled={!selected.length || missingOpening > 0}
            onClick={() => onConfirm(selected)}
          >
            {selected.length === 1 ? "הוסף חלון אחד להצעה" : `הוסף ${selected.length} חלונות להצעה`}
          </button>
        </div>
      </div>
    </div>
  );
}
