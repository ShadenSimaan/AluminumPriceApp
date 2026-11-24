// Plans and runs market checks for quote lines: one request per distinct research key, cache first,
// results applied per line as they arrive so editing stays responsive.
import type { AppState, LineItem } from "../types";
import { normalizeTaxPercent, parseLooseNumber } from "../quote/pricing";
import type { MarketErrorCode, MarketResearchResponse, MarketSpec } from "./contract";
import { MARKET_ERROR_LABELS } from "./contract";
import { MarketRequestError } from "./client";
import { buildMarketSpec, researchKey, specKey, type QuoteContext, type SpecBuild } from "./spec";
import { MARKET_CACHE_MAX_AGE_DAYS, type MarketCacheEntry, type MarketLineSnapshot } from "./types";

export function quoteContext(state: Pick<AppState, "profiles" | "manufacturers" | "current">): QuoteContext {
  const base: QuoteContext = { profiles: state.profiles, manufacturers: state.manufacturers, installationTerms: state.current.installationTerms };
  const hasSeparateBoxLine = state.current.items.some((it) => buildMarketSpec(it, base).spec.category === "shutter_box");
  return { ...base, hasSeparateBoxLine };
}

export function vatRateOf(taxPercentText: string | undefined): number {
  return normalizeTaxPercent(parseLooseNumber(taxPercentText ?? "18"));
}

export function buildAll(items: LineItem[], ctx: QuoteContext): Map<string, SpecBuild> {
  return new Map(items.map((it) => [it.id, buildMarketSpec(it, ctx)]));
}

export type PlannedLine = { lineId: string; spec: MarketSpec; specKey: string; assumptions: string[] };
export type PlannedJob = { researchKey: string; spec: MarketSpec; lines: PlannedLine[] };

export function isCurrent(line: LineItem, build: SpecBuild): boolean {
  const s = line.marketCheck;
  return Boolean(s && s.specKey === specKey(build.spec) && !s.lastError && s.source !== "fixture" && s.retrievedAt);
}

/** Groups comparable lines by research key. Without `force`, lines with a current result are skipped. */
export function planRun(items: LineItem[], ctx: QuoteContext, opts: { lineIds?: string[]; force?: boolean } = {}): { jobs: PlannedJob[]; skippedCurrent: number; notComparable: number } {
  const jobs = new Map<string, PlannedJob>();
  let skippedCurrent = 0;
  let notComparable = 0;
  for (const it of items) {
    if (opts.lineIds && !opts.lineIds.includes(it.id)) continue;
    const b = buildMarketSpec(it, ctx);
    if (!b.comparable) {
      notComparable += 1;
      continue;
    }
    if (!opts.force && isCurrent(it, b)) {
      skippedCurrent += 1;
      continue;
    }
    const rk = researchKey(b.spec);
    const job = jobs.get(rk) ?? { researchKey: rk, spec: b.spec, lines: [] };
    job.lines.push({ lineId: it.id, spec: b.spec, specKey: specKey(b.spec), assumptions: b.assumptions });
    jobs.set(rk, job);
  }
  return { jobs: [...jobs.values()], skippedCurrent, notComparable };
}

export function cacheIsFresh(entry: MarketCacheEntry | undefined, now: Date): entry is MarketCacheEntry {
  if (!entry || entry.response.source !== "live") return false;
  const age = now.getTime() - new Date(entry.response.retrievedAt).getTime();
  return age >= 0 && age < MARKET_CACHE_MAX_AGE_DAYS * 86400000;
}

export function snapshotFor(line: PlannedLine, job: PlannedJob, response: MarketResearchResponse, vatRate: number, fromCache: boolean): MarketLineSnapshot {
  return {
    specKey: line.specKey,
    researchKey: job.researchKey,
    spec: line.spec,
    retrievedAt: response.retrievedAt,
    source: response.source === "fixture" ? "fixture" : fromCache ? "cache" : "live",
    provider: response.provider,
    model: response.model,
    evidence: response.evidence,
    assumptions: [...new Set([...line.assumptions, ...response.assumptions])],
    warnings: response.warnings,
    suggestedSeries: response.suggestedSeries?.length ? response.suggestedSeries : undefined,
    dropped: response.dropped?.length ? response.dropped : undefined,
    vatRate,
  };
}

export type MarketUpdate =
  | { lineId: string; kind: "result"; snapshot: MarketLineSnapshot }
  | { lineId: string; kind: "error"; code: MarketErrorCode; message: string; at: string; planned: PlannedLine; researchKey: string; vatRate: number };

/** On failure the previous result (with its own date) is kept; only the error is recorded beside it. */
export function applyMarketUpdate(prev: MarketLineSnapshot | undefined, u: MarketUpdate): MarketLineSnapshot {
  if (u.kind === "result") return u.snapshot;
  const lastError = { code: u.code, message: u.message, at: u.at };
  if (prev) return { ...prev, lastError };
  return {
    specKey: u.planned.specKey,
    researchKey: u.researchKey,
    spec: u.planned.spec,
    retrievedAt: "",
    source: "live",
    provider: "",
    evidence: [],
    assumptions: u.planned.assumptions,
    warnings: [],
    vatRate: u.vatRate,
    lastError,
  };
}

export type RunDeps = {
  request: (spec: MarketSpec) => Promise<MarketResearchResponse>;
  getCache: (key: string) => MarketCacheEntry | undefined;
  onUpdates: (updates: MarketUpdate[], cache?: MarketCacheEntry) => void;
  onJobDone?: (job: PlannedJob) => void;
  now?: () => Date;
  concurrency?: number;
};

export async function executeRun(jobs: PlannedJob[], deps: RunDeps, vatRate: number, force: boolean): Promise<{ errors: { code: MarketErrorCode; message: string }[]; liveRequests: number }> {
  const now = deps.now ?? (() => new Date());
  const queue = [...jobs];
  const errors: { code: MarketErrorCode; message: string }[] = [];
  let liveRequests = 0;
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const cached = deps.getCache(job.researchKey);
      try {
        if (!force && cacheIsFresh(cached, now())) {
          deps.onUpdates(job.lines.map((l) => ({ lineId: l.lineId, kind: "result", snapshot: snapshotFor(l, job!, cached.response, vatRate, true) })));
        } else {
          liveRequests += 1;
          const response = await deps.request(job.spec);
          const entry: MarketCacheEntry | undefined =
            response.source === "live" ? { researchKey: job.researchKey, response, storedAt: now().toISOString() } : undefined;
          deps.onUpdates(
            job.lines.map((l) => ({ lineId: l.lineId, kind: "result", snapshot: snapshotFor(l, job!, response, vatRate, false) })),
            entry
          );
        }
      } catch (e) {
        const code: MarketErrorCode = e instanceof MarketRequestError ? e.code : "provider_error";
        const message = e instanceof Error ? e.message : MARKET_ERROR_LABELS[code];
        errors.push({ code, message });
        const at = now().toISOString();
        if (code !== "missing_config") {
          deps.onUpdates(job.lines.map((l) => ({ lineId: l.lineId, kind: "error", code, message, at, planned: l, researchKey: job!.researchKey, vatRate })));
        } else {
          queue.length = 0;
        }
      } finally {
        deps.onJobDone?.(job);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, deps.concurrency ?? 2) }, worker));
  return { errors, liveRequests };
}

/** Keeps the newest entries only. */
export function pruneCache(cache: Record<string, MarketCacheEntry>, max = 300): Record<string, MarketCacheEntry> {
  const entries = Object.values(cache);
  if (entries.length <= max) return cache;
  entries.sort((a, b) => (a.storedAt < b.storedAt ? 1 : -1));
  return Object.fromEntries(entries.slice(0, max).map((e) => [e.researchKey, e]));
}
