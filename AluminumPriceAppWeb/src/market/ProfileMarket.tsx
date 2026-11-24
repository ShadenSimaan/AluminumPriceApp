// בדיקת מחירי שוק לפרופילים — inside הגדרות — ניהול פרופילים ותוספות.
// Click a profile → the AI searches the web (original manufacturers + leading fabricators) → the app
// verifies each source and computes the average price per m² (before VAT) and the gap to our price.
import React from "react";
import { Loader2, RefreshCw, Search } from "lucide-react";
import type { AppState, Profile } from "../types";
import { requestMarketResearch, MarketRequestError } from "./client";
import { MARKET_ERROR_LABELS, type MarketErrorCode } from "./contract";
import { dateHe, money, signedPercent } from "./format";
import { SourcesTable } from "./MarketLinePanel";
import MarketSettingsSection from "./MarketSettingsSection";
import { profileMarketSpec, profileMarketStats, profileSnapshot, type ProfileMarketStats } from "./profileCheck";
import { pruneCache, vatRateOf } from "./runner";
import { isMarketConfigured, type MarketCacheEntry, type MarketLineSnapshot } from "./types";
import { researchKey, specKey } from "./spec";

type SetState = React.Dispatch<React.SetStateAction<AppState>>;
export type ProfileMarketBanner = { tone: "info" | "error"; text: string } | null;

/** Runs profile checks in the background (2 at a time) and stores each result as it arrives. */
export function useProfileMarket(state: AppState, setState: SetState) {
  const [running, setRunning] = React.useState<Set<string>>(new Set());
  const [banner, setBanner] = React.useState<ProfileMarketBanner>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const runningRef = React.useRef(running);
  runningRef.current = running;

  const check = React.useCallback(
    async (profileIds: string[]) => {
      const s = stateRef.current;
      if (!isMarketConfigured(s.marketSettings)) {
        setBanner({ tone: "error", text: MARKET_ERROR_LABELS.missing_config });
        return;
      }
      const queue = profileIds.filter((id) => !runningRef.current.has(id) && s.profiles.some((p) => p.id === id));
      if (!queue.length) return;
      setRunning((prev) => new Set([...prev, ...queue]));
      setBanner({ tone: "info", text: `בודק ${queue.length === 1 ? "פרופיל אחד" : `${queue.length} פרופילים`} באינטרנט… זה לוקח 1–3 דקות לפרופיל. אפשר להמשיך לעבוד.` });
      const vatRate = vatRateOf(s.current.taxPercentText);
      let failures = 0;
      let firstError = "";
      const worker = async () => {
        for (let id = queue.shift(); id; id = queue.shift()) {
          const profile = stateRef.current.profiles.find((p) => p.id === id);
          if (!profile) continue;
          const manufacturers = stateRef.current.manufacturers;
          try {
            const response = await requestMarketResearch(stateRef.current.marketSettings, profileMarketSpec(profile, manufacturers).spec);
            const snap = profileSnapshot(profile, manufacturers, response, vatRate);
            const entry: MarketCacheEntry | undefined =
              response.source === "live" ? { researchKey: snap.researchKey, response, storedAt: new Date().toISOString() } : undefined;
            setState((st) => ({
              ...st,
              profileMarket: { ...st.profileMarket, [profile.id]: snap },
              marketCache: entry ? pruneCache({ ...st.marketCache, [entry.researchKey]: entry }) : st.marketCache,
            }));
          } catch (e) {
            const code: MarketErrorCode = e instanceof MarketRequestError ? e.code : "provider_error";
            const message = e instanceof Error ? e.message : MARKET_ERROR_LABELS[code];
            failures += 1;
            firstError ||= message;
            const at = new Date().toISOString();
            setState((st) => {
              const prev = st.profileMarket[profile.id];
              const { spec, assumptions } = profileMarketSpec(profile, st.manufacturers);
              // A failed attempt never erases the previous result; it is only noted beside it.
              const next: MarketLineSnapshot = prev
                ? { ...prev, lastError: { code, message, at } }
                : {
                    specKey: specKey(spec),
                    researchKey: researchKey(spec),
                    spec,
                    retrievedAt: "",
                    source: "live",
                    provider: "",
                    evidence: [],
                    assumptions,
                    warnings: [],
                    vatRate,
                    lastError: { code, message, at },
                  };
              return { ...st, profileMarket: { ...st.profileMarket, [profile.id]: next } };
            });
            if (code === "missing_config" || code === "unauthorized") queue.length = 0;
          } finally {
            setRunning((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        }
      };
      await Promise.all([worker(), worker()]);
      setBanner(
        failures
          ? { tone: "error", text: `${firstError}${failures > 1 ? ` (${failures} בדיקות נכשלו)` : ""}. תוצאות קודמות נשמרו עם התאריך שלהן.` }
          : { tone: "info", text: "הבדיקה הסתיימה. לחצו על מחיר השוק בשורה כדי לראות את המקורות." }
      );
    },
    [setState]
  );

  return { running, banner, clearBanner: () => setBanner(null), check };
}

const diffTone = (d: number) => (d > 0.1 ? "text-rose-700" : d < -0.1 ? "text-amber-700" : "text-emerald-700");

function diffText(d: number): string {
  if (Math.abs(d) < 0.03) return "כמו השוק";
  const pct = signedPercent(Math.abs(d) * 100).replace(/^[+−]/, "");
  return d > 0 ? `${pct} מעל השוק` : `${pct} מתחת לשוק`;
}

/** Compact cell in the profiles table: market average per m², gap to our price, and the check button. */
export function ProfileMarketCell({
  stats,
  running,
  expanded,
  onCheck,
  onToggle,
}: {
  stats: ProfileMarketStats;
  running: boolean;
  expanded: boolean;
  onCheck: () => void;
  onToggle: () => void;
}) {
  const checkedToday = stats.checkedAt && new Date(stats.checkedAt).toDateString() === new Date().toDateString();
  return (
    <div className="flex items-start justify-between gap-1">
      <div className="min-w-0">
        {running ? (
          <span className="inline-flex items-center gap-1 text-xs text-sky-700">
            <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> בודק באינטרנט…
          </span>
        ) : stats.status === "not_checked" ? (
          <span className="text-xs text-slate-400">{stats.error ? <span className="text-rose-700">{stats.error}</span> : "לא נבדק"}</span>
        ) : (
          <button type="button" className="text-right hover:underline" onClick={onToggle} aria-expanded={expanded} title="הצגת המקורות והחישוב">
            {stats.status === "ok" && stats.average !== undefined ? (
              <>
                <span className="font-semibold text-slate-800">{money(stats.average)}</span>
                <span className="text-[11px] text-slate-500"> ממוצע</span>
                {stats.diffFraction !== undefined && <div className={`text-[11px] ${diffTone(stats.diffFraction)}`}>אנחנו {diffText(stats.diffFraction)}</div>}
              </>
            ) : (
              <span className="text-xs text-amber-800">אין מספיק מקורות</span>
            )}
            <div className="text-[11px] text-slate-500">
              {dateHe(stats.checkedAt)}
              {stats.stale && <span className="text-amber-700"> · לא עדכני</span>}
              {stats.error && <span className="text-rose-700"> · הבדיקה האחרונה נכשלה</span>}
              {" "}
              {expanded ? "▲" : "▼"}
            </div>
          </button>
        )}
      </div>
      <button
        type="button"
        className="shrink-0 inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-1.5 py-1 text-[11px] text-sky-800 hover:bg-sky-100 disabled:opacity-50"
        onClick={onCheck}
        disabled={running}
        title="חיפוש מחיר השוק להיום באינטרנט (AI)"
      >
        {stats.status === "not_checked" ? <Search className="w-3.5 h-3.5" aria-hidden /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden />}
        {stats.status === "not_checked" ? "בדיקה" : checkedToday ? "שוב" : "היום"}
      </button>
    </div>
  );
}

/** Expanded row: how the average was computed, from which sources, and what was left out and why. */
export function ProfileMarketDetails({ profile, stats, snapshot }: { profile: Profile; stats: ProfileMarketStats; snapshot: MarketLineSnapshot }) {
  return (
    <div className="space-y-2 bg-sky-50/40 px-3 py-2 text-sm">
      {stats.status === "ok" && stats.average !== undefined ? (
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <div>
            <span className="text-slate-500">ממוצע שוק למ״ר (לפני מע״מ): </span>
            <span className="font-semibold">{money(stats.average)}</span>
          </div>
          {stats.median !== undefined && stats.sellerCount > 2 && (
            <div>
              <span className="text-slate-500">חציון: </span>
              {money(stats.median)}
            </div>
          )}
          {stats.low !== undefined && stats.high !== undefined && (
            <div>
              <span className="text-slate-500">טווח: </span>
              {money(stats.low)} – {money(stats.high)}
            </div>
          )}
          <div>
            <span className="text-slate-500">מוכרים בממוצע: </span>
            {stats.sellerCount}
          </div>
          <div>
            <span className="text-slate-500">המחיר שלנו: </span>
            {money(profile.unitPrice)}
            {stats.diffFraction !== undefined && <span className={`mr-1 ${diffTone(stats.diffFraction)}`}>({diffText(stats.diffFraction)})</span>}
          </div>
        </div>
      ) : (
        <div className="text-amber-800">לא נמצאו מספיק מחירים מאומתים למ״ר כדי לחשב ממוצע. אפשר לעיין במקורות שנמצאו למטה.</div>
      )}
      {stats.basis === "proxy" && (
        <div className="text-xs text-amber-800">לא נמצא מחיר לסדרה הזו בדיוק — הממוצע מבוסס על מערכות דומות (קירוב).</div>
      )}
      {stats.lowerBounds.length > 0 && (
        <div className="text-xs text-slate-600">
          מחירי ״החל מ-״ (לא בממוצע): {stats.lowerBounds.map((b) => `${b.seller} ${money(b.value)}`).join(" · ")}
        </div>
      )}
      {snapshot.suggestedSeries?.length ? (
        <div className="text-xs text-amber-800">ייתכן שהכוונה לדגם: {snapshot.suggestedSeries.join(", ")} — כדאי לבדוק את שם הפרופיל.</div>
      ) : null}
      {stats.stale && <div className="text-xs text-amber-800">שם הפרופיל או החברה השתנו מאז הבדיקה — כדאי לבדוק שוב.</div>}
      {snapshot.lastError && (
        <div className="text-xs text-rose-700">
          הבדיקה האחרונה ({dateHe(snapshot.lastError.at)}) נכשלה: {snapshot.lastError.message}
        </div>
      )}
      {snapshot.assumptions.length > 0 && (
        <ul className="list-disc pr-4 text-[11px] text-slate-500">
          {snapshot.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <div className="text-[11px] text-slate-500">
        מחירים עם מע״מ נוטרלו ממע״מ. נכללים רק מחירים שנמצאו בפועל בעמוד המקור, ביחידה למ״ר (או מחיר לחלון שהמקור ציין את מידותיו). כל מוכר נספר פעם אחת.
        המחירון שלנו לא משתנה אוטומטית.
      </div>
      {snapshot.retrievedAt && (
        <SourcesTable snap={snapshot.evidence} evaluations={stats.evaluations} warnings={snapshot.warnings} dropped={snapshot.dropped} />
      )}
    </div>
  );
}

/** Header of the market section: connection settings, check-all, and status. */
export function ProfileMarketToolbar({
  state,
  setState,
  runningCount,
  banner,
  onCheckAll,
  onClearBanner,
}: {
  state: AppState;
  setState: SetState;
  runningCount: number;
  banner: ProfileMarketBanner;
  onCheckAll: () => void;
  onClearBanner: () => void;
}) {
  const checked = state.profiles.filter((p) => profileMarketStats(p, state.manufacturers, state.profileMarket[p.id]).status === "ok").length;
  return (
    <div className="border rounded-lg p-3 sm:p-4 bg-sky-50/60 border-sky-200 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-base font-semibold text-slate-800">בדיקת מחירי שוק לפרופילים</div>
          <div className="text-sm text-slate-600">
            לחצו <b>בדיקה</b> ליד פרופיל: ה-AI מחפש באינטרנט אצל היצרנים המקוריים ואצל החברות המובילות, והאפליקציה מחשבת את מחיר השוק הממוצע למ״ר להיום ומשווה למחיר שלנו.
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          onClick={onCheckAll}
          disabled={!state.profiles.length}
        >
          <Search className="w-4 h-4" aria-hidden />
          בדיקת כל הפרופילים
        </button>
      </div>
      <MarketSettingsSection value={state.marketSettings} onChange={(marketSettings) => setState((s) => ({ ...s, marketSettings }))} />
      <div className="text-xs text-slate-500">
        {checked} מתוך {state.profiles.length} פרופילים עם מחיר שוק
        {runningCount > 0 && ` · ${runningCount} בבדיקה כעת`}
      </div>
      {banner && (
        <div
          className={`flex items-start justify-between gap-2 rounded-md px-2 py-1 text-sm ${banner.tone === "error" ? "bg-rose-50 text-rose-800 border border-rose-200" : "bg-white text-sky-900 border border-sky-200"}`}
          role="status"
        >
          <span>{banner.text}</span>
          <button type="button" className="text-xs underline shrink-0" onClick={onClearBanner}>
            סגירה
          </button>
        </div>
      )}
    </div>
  );
}
