import React, { useMemo } from "react";
import type { LineItem, Manufacturer, Profile, SeriesAppendixSettings } from "../../types";
import { lineManufacturer } from "../manufacturers";
import { toCustomerPdfItem } from "../customerPayload";
import { appendixSummary, computeAppendixPlan, type AppendixPlan } from "./appendix";
import { BRANDS, SERIES_CATALOG, seriesLabel } from "./catalog";
import { normalizeSeriesAppendix } from "./settings";

const CONTENT_OPTIONS: { key: keyof SeriesAppendixSettings["content"]; label: string }[] = [
  { key: "photos", label: "תמונות וחתכי פרופיל" },
  { key: "glass", label: "אפשרויות זכוכית" },
  { key: "colors", label: "מניפת צבעים" },
  { key: "screens", label: "רשתות ותריסים" },
];

type Props = {
  items: LineItem[];
  profiles: Profile[];
  manufacturers: Manufacturer[];
  settings: SeriesAppendixSettings;
  onChangeSettings: (next: SeriesAppendixSettings) => void;
  onMapItemSeries: (itemId: string, seriesKeys: string[] | undefined) => void;
};

function planFor(items: LineItem[], profiles: Profile[], manufacturers: Manufacturer[], settings: SeriesAppendixSettings): AppendixPlan {
  const pdfItems = items.map((item) => ({
    ...toCustomerPdfItem(item),
    manufacturer: (() => {
      const m = lineManufacturer(item, profiles, manufacturers);
      return m ? { id: m.id, name: m.name, logoUrl: m.logoUrl } : undefined;
    })(),
  }));
  return computeAppendixPlan(pdfItems, settings);
}

export function SeriesAppendixControls({
  items,
  profiles,
  manufacturers,
  settings: rawSettings,
  onChangeSettings,
  onMapItemSeries,
}: Props) {
  const settings = normalizeSeriesAppendix(rawSettings);
  const plan = useMemo(() => planFor(items, profiles, manufacturers, settings), [items, profiles, manufacturers, settings]);
  const summary = appendixSummary(plan);

  const setEnabled = (enabled: boolean) => onChangeSettings({ ...settings, enabled });

  const toggleSeries = (key: string, selected: boolean) => {
    const excluded = new Set(settings.excluded);
    if (selected) excluded.delete(key);
    else excluded.add(key);
    onChangeSettings({ ...settings, excluded: [...excluded] });
  };

  const setContent = (key: keyof SeriesAppendixSettings["content"], value: boolean) => {
    onChangeSettings({ ...settings, content: { ...settings.content, [key]: value } });
  };

  const mappingOptions = SERIES_CATALOG.filter((r) => !r.conditional || r.brand === "alumil");

  return (
    <section className="card p-4 w-full" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold">דפי מידע לסדרות</h2>
          <p className="text-sm text-slate-600">
            דפים נפרדים אחרי הצעת המחיר — ללא מחירים וללא השפעה על סיכומים
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm cursor-pointer shrink-0">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={settings.enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>צרף דפי מידע לסדרות בהצעת המחיר</span>
        </label>
      </div>

      {!settings.enabled ? (
        <p className="text-sm text-slate-500">כבוי — תופק הצעת מחיר רגילה.</p>
      ) : (
        <div className="grid gap-4">
          {plan.recognized.length === 0 ? (
            <p className="text-sm text-slate-600">לא זוהו סדרות מוכרות בפריטי ההצעה.</p>
          ) : (
            <div className="grid gap-2">
              <div className="text-sm font-medium text-slate-800">סדרות בהצעה</div>
              <ul className="grid gap-1.5">
                {plan.recognized.map((r) => (
                  <li key={r.key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={r.selected}
                      onChange={(e) => toggleSeries(r.key, e.target.checked)}
                    />
                    <span>
                      {BRANDS[r.record.brand].nameLatin} {r.record.code}
                      <span className="text-slate-500"> · {r.record.family}</span>
                      <span className="text-slate-500"> · {r.count} פריטים</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-2">
            <div className="text-sm font-medium text-slate-800">תוכן הדפים</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CONTENT_OPTIONS.map((opt) => (
                <label key={opt.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4"
                    checked={settings.content[opt.key]}
                    onChange={(e) => setContent(opt.key, e.target.checked)}
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">מבוא הסדרה מוצג תמיד כשדף נבחר.</p>
          </div>

          {summary ? <p className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{summary}</p> : null}

          {(plan.issues.length > 0 || items.some((it) => it.seriesRefs !== undefined)) && (
            <div className="grid gap-2 border border-amber-200 bg-amber-50/60 rounded-lg p-3">
              <div className="text-sm font-medium text-amber-900">מיפוי סדרה ידני</div>
              <p className="text-xs text-amber-800">ערכים לא ודאיים או מיפוי שכבר נבחר. בלי מיפוי — ההצעה הרגילה עדיין מיוצאת.</p>
              <ul className="grid gap-2">
                {items.map((item, index) => {
                  const match = plan.matches[index];
                  const issue = plan.issues.find((i) => i.itemIndex === index);
                  if (!issue && item.seriesRefs === undefined) return null;
                  const candidates = [
                    ...new Set([
                      ...(match?.candidates ?? []),
                      ...(match?.seriesKeys ?? []),
                      ...(item.seriesRefs ?? []),
                      ...mappingOptions.map((r) => r.key),
                    ]),
                  ];
                  const value =
                    item.seriesRefs === undefined ? "" : item.seriesRefs.length === 0 ? "__none__" : item.seriesRefs[0] ?? "";
                  return (
                    <li key={item.id} className="grid sm:grid-cols-[1fr_auto] gap-2 items-center text-sm">
                      <div>
                        <span className="font-medium">פריט {index + 1}</span>
                        {(issue?.label || item.customerDescription || item.profileName) && (
                          <span className="text-slate-600">
                            {" "}
                            · {issue?.label || item.customerDescription || item.profileName}
                          </span>
                        )}
                        <div className="text-xs text-amber-900/80">
                          {issue?.match.reason || (item.seriesRefs !== undefined ? "מיפוי ידני פעיל" : match?.status)}
                        </div>
                      </div>
                      <select
                        className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white min-w-[12rem]"
                        value={value}
                        onChange={(e) => onMapItemSeries(item.id, applySeriesMapping(e.target.value))}
                      >
                        <option value="">ללא מיפוי (אוטומטי)</option>
                        <option value="__none__">ללא דף סדרה</option>
                        {candidates.map((key) => {
                          const rec = SERIES_CATALOG.find((r) => r.key === key);
                          return (
                            <option key={key} value={key}>
                              {rec ? seriesLabel(rec) : key}
                            </option>
                          );
                        })}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(plan.reviewFlags.length > 0 || plan.missingAssets.length > 0) && (
            <div className="grid gap-1 text-xs text-slate-600">
              {plan.reviewFlags.map((f, i) => (
                <div key={`rf-${i}`}>
                  פריט {f.itemNumber}: {f.text}
                </div>
              ))}
              {plan.missingAssets.map((m, i) => (
                <div key={`ma-${i}`}>{m}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Sentinel used in the mapping select for an explicit empty series list. */
export function applySeriesMapping(raw: string): string[] | undefined {
  if (!raw) return undefined;
  if (raw === "__none__") return [];
  return [raw];
}
