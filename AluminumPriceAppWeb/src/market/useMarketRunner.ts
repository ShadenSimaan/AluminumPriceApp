import React from "react";
import type { AppState } from "../types";
import { MARKET_ERROR_LABELS } from "./contract";
import { requestMarketResearch } from "./client";
import { executeRun, planRun, quoteContext, vatRateOf, type MarketUpdate } from "./runner";
import { isMarketConfigured, type MarketCacheEntry } from "./types";

export type MarketBanner = { tone: "info" | "warn" | "error"; text: string } | null;

/**
 * Runs checks in the background. State changes go through `onUpdates`, which merges results into
 * whatever the quotation looks like when they arrive, so the estimator can keep editing meanwhile.
 */
export function useMarketRunner(state: AppState, onUpdates: (updates: MarketUpdate[], cache?: MarketCacheEntry) => void) {
  const [running, setRunning] = React.useState<Set<string>>(new Set());
  const [banner, setBanner] = React.useState<MarketBanner>(null);
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const run = React.useCallback(
    async (opts: { lineIds?: string[]; force?: boolean }) => {
      const s = stateRef.current;
      const settings = s.marketSettings;
      if (!isMarketConfigured(settings)) {
        setBanner({ tone: "error", text: MARKET_ERROR_LABELS.missing_config });
        return;
      }
      const plan = planRun(s.current.items, quoteContext(s), opts);
      if (!plan.jobs.length) {
        setBanner({
          tone: "info",
          text: plan.skippedCurrent
            ? "כל השורות כבר נבדקו למפרט הנוכחי. לבדיקה חדשה לחצו ↻ בשורה."
            : "אין בהצעה שורות מוצר שניתן להשוות.",
        });
        return;
      }
      const ids = plan.jobs.flatMap((j) => j.lines.map((l) => l.lineId));
      setRunning((prev) => new Set([...prev, ...ids]));
      setBanner({ tone: "info", text: `בודק ${ids.length} שורות (${plan.jobs.length} חיפושים שונים)… אפשר להמשיך לערוך.` });
      const result = await executeRun(
        plan.jobs,
        {
          request: (spec) => requestMarketResearch(stateRef.current.marketSettings, spec),
          getCache: (key) => stateRef.current.marketCache?.[key],
          onUpdates,
          onJobDone: (job) =>
            setRunning((prev) => {
              const next = new Set(prev);
              job.lines.forEach((l) => next.delete(l.lineId));
              return next;
            }),
        },
        vatRateOf(s.current.taxPercentText),
        Boolean(opts.force)
      );
      if (result.errors.length) {
        const first = result.errors[0];
        setBanner({
          tone: "error",
          text: `${first.message}${result.errors.length > 1 ? ` (+${result.errors.length - 1} נוספות)` : ""}. ההצעה לא השתנתה; תוצאות קודמות נשמרו עם התאריך שלהן.`,
        });
      } else {
        setBanner({
          tone: "info",
          text: result.liveRequests
            ? `הבדיקה הסתיימה (${result.liveRequests} בקשות נשלחו לשירות; מקור כל תוצאה מוצג בשורה).`
            : "הבדיקה הסתיימה — נעשה שימוש בתוצאות שמורות למפרט זהה.",
        });
      }
    },
    [onUpdates]
  );

  return {
    running,
    banner,
    clearBanner: () => setBanner(null),
    runAll: () => run({}),
    refreshLine: (lineId: string) => run({ lineIds: [lineId], force: true }),
  };
}
