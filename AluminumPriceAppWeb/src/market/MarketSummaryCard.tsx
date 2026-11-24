import { Search } from "lucide-react";
import { directionLabel, type QuoteMarketSummary } from "./compute";
import { money, plain, signedPercent } from "./format";
import type { MarketBanner } from "./useMarketRunner";

type Props = {
  summary: QuoteMarketSummary;
  banner: MarketBanner;
  runningCount: number;
  hasFixture: boolean;
  hasCache: boolean;
  onHide: () => void;
};

export default function MarketSummaryCard({ summary: s, banner, runningCount, hasFixture, hasCache, onHide }: Props) {
  const pctValue = Math.round(s.valueCoverage * 1000) / 10;
  return (
    <div className="mb-3 rounded-lg border border-slate-300 bg-white px-3 py-2" role="region" aria-label="סיכום השוואת שוק">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-500" aria-hidden />
          <h3 className="font-semibold text-slate-800">סיכום השוואת שוק</h3>
          <span className="text-xs text-slate-500">לשימוש פנימי — לא משנה מחירים או סכומים, ולא מופיע ב-PDF ללקוח</span>
        </div>
        <button type="button" className="text-xs text-slate-600 underline" onClick={onHide}>
          הסתר השוואה
        </button>
      </div>

      {banner && (
        <div
          className={`mb-2 rounded-md px-2 py-1 text-sm ${banner.tone === "error" ? "bg-rose-50 text-rose-800 border border-rose-200" : banner.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}
          role="status"
        >
          {banner.text}
          {runningCount > 0 && ` (${runningCount} שורות עדיין בבדיקה)`}
        </div>
      )}
      {hasFixture && (
        <div className="mb-2 rounded-md border border-fuchsia-300 bg-fuchsia-50 px-2 py-1 text-sm text-fuchsia-900">
          חלק מהתוצאות הן נתוני בדיקה (fixture) מהשרת — אינן מחירי שוק אמיתיים.
        </div>
      )}

      {s.index !== undefined && s.diff !== undefined && s.diffPercent !== undefined ? (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <div className="text-xs text-slate-500">מדד הצעה מול שוק (100 = שוק)</div>
            <div className="text-2xl font-bold text-slate-900" dir="ltr">
              {plain(Math.round(s.index * 10) / 10)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">פער לעבודה שהושוותה</div>
            <div className={`text-base font-semibold ${s.diff > 0 ? "text-amber-800" : "text-sky-800"}`}>
              {money(Math.abs(s.diff))} {directionLabel(s.diff)} ({signedPercent(s.diffPercent)})
            </div>
            <div className="text-xs text-slate-500">
              שלנו {money(s.ourMatched)} · שוק {money(s.marketMatched)} · לפני מע״מ, אחרי הנחה
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">כיסוי ההשוואה</div>
            <div className="text-base font-semibold text-slate-800">{plain(pctValue)}% מערך ההצעה</div>
            <div className="text-xs text-slate-500">
              {s.matchedLines} מתוך {s.totalLines} שורות
            </div>
          </div>
        </div>
      ) : (
        <div className="text-base font-semibold text-slate-700">
          {s.checkedLines ? "אין מספיק נתונים להשוואה" : runningCount ? "הבדיקה רצה…" : "לחצו ״בדיקת מחירי שוק״ כדי להשוות את ההצעה."}
        </div>
      )}

      {(s.excluded.length > 0 || s.additionsNotCompared > 0) && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-slate-700">
            לא נכללו במדד ({s.excluded.length + s.additionsNotCompared})
          </summary>
          <ul className="mt-1 list-disc pr-5 text-xs text-slate-600">
            {s.excluded.map((x) => (
              <li key={x.lineIndex}>
                {x.label}: {x.reason}
              </li>
            ))}
            {s.additionsNotCompared > 0 && <li>{s.additionsNotCompared} תוספות חופשיות — אין מפרט מוצר להשוואה</li>}
          </ul>
        </details>
      )}
      {hasCache && <div className="mt-1 text-[11px] text-slate-500">חלק מהשורות משתמשות בתוצאה שמורה למפרט זהה; התאריך מוצג בכל שורה.</div>}
    </div>
  );
}
