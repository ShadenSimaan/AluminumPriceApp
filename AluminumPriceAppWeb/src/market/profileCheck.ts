// Market price per m² for a catalogue profile (הגדרות — ניהול פרופילים ותוספות).
// The spec is built from the profile name and company only; the AI finds sources, all arithmetic is here.
import type { LineItem, Manufacturer, Profile } from "../types";
import type { MarketResearchResponse, MarketSpec } from "./contract";
import { computeLineBenchmark, type EvidenceEvaluation } from "./compute";
import { buildMarketSpec, researchKey, specKey } from "./spec";
import type { MarketLineSnapshot } from "./types";

export function profileMarketSpec(profile: Profile, manufacturers: Manufacturer[]): { spec: MarketSpec; assumptions: string[] } {
  const line: LineItem = {
    id: profile.id,
    widthCm: "",
    heightCm: "",
    qty: "1",
    profileId: profile.id,
    profileName: profile.name,
    unitPrice: String(profile.unitPrice),
    addons: [],
    subtotal: 0,
  };
  const b = buildMarketSpec(line, { profiles: [profile], manufacturers });
  // A profile row is always a per-m² catalogue rate, without a window size or quantity.
  const spec: MarketSpec = { ...b.spec, unit: "m2", quantity: 1, widthCm: undefined, heightCm: undefined, purpose: "profile_rate" };
  if (spec.screen.areaM2 !== undefined) spec.screen = { ...spec.screen, areaM2: undefined };
  const assumptions = b.assumptions.filter((a) => !/שטח|מחצית/.test(a));
  assumptions.push("בדיקת פרופיל: מחיר למ״ר לפי שם הפרופיל והחברה, בלי מידות חלון מסוימות");
  return { spec, assumptions };
}

export function profileSpecKey(profile: Profile, manufacturers: Manufacturer[]): string {
  return specKey(profileMarketSpec(profile, manufacturers).spec);
}

export function profileSnapshot(profile: Profile, manufacturers: Manufacturer[], response: MarketResearchResponse, vatRate: number): MarketLineSnapshot {
  const { spec, assumptions } = profileMarketSpec(profile, manufacturers);
  return {
    specKey: specKey(spec),
    researchKey: researchKey(spec),
    spec,
    retrievedAt: response.retrievedAt,
    source: response.source === "fixture" ? "fixture" : "live",
    provider: response.provider,
    model: response.model,
    evidence: response.evidence,
    assumptions: [...new Set([...assumptions, ...response.assumptions])],
    warnings: response.warnings,
    suggestedSeries: response.suggestedSeries?.length ? response.suggestedSeries : undefined,
    dropped: response.dropped?.length ? response.dropped : undefined,
    vatRate,
  };
}

export type ProfileMarketStats = {
  status: "ok" | "insufficient" | "not_checked";
  /** "exact" = sources for this profile/series; "proxy" = comparable systems only (no exact source found). */
  basis?: "exact" | "proxy";
  /** Mean of one representative price per seller, ₪/מ״ר before VAT. */
  average?: number;
  median?: number;
  low?: number;
  high?: number;
  sellerCount: number;
  /** Our catalogue price per m² minus the market average, as a fraction of the average. */
  diffFraction?: number;
  /** "From" prices, before VAT; not in the average. */
  lowerBounds: { seller: string; value: number }[];
  evaluations: EvidenceEvaluation[];
  stale: boolean;
  checkedAt?: string;
  error?: string;
};

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** One value per seller (median of that seller's listings), so one site with many listings counts once. */
function sellerValues(evals: EvidenceEvaluation[]): number[] {
  const bySeller = new Map<string, number[]>();
  for (const x of evals) {
    if (!x.included || x.value === undefined) continue;
    bySeller.set(x.sellerKey, [...(bySeller.get(x.sellerKey) ?? []), x.value]);
  }
  return [...bySeller.values()].map(median);
}

export function profileMarketStats(profile: Profile, manufacturers: Manufacturer[], snapshot: MarketLineSnapshot | undefined): ProfileMarketStats {
  const empty: ProfileMarketStats = { status: "not_checked", sellerCount: 0, lowerBounds: [], evaluations: [], stale: false };
  if (!snapshot) return empty;
  const stale = snapshot.specKey !== profileSpecKey(profile, manufacturers);
  const error = snapshot.lastError?.message;
  if (!snapshot.retrievedAt) return { ...empty, stale, error };
  const bench = computeLineBenchmark(snapshot);
  const evaluations = bench.evaluations;
  const lowerBounds = bench.lowerBounds;
  const base = { ...empty, status: "insufficient" as const, evaluations, lowerBounds, stale, checkedAt: snapshot.retrievedAt, error };
  const exact = evaluations.filter((x) => x.pool === "exact" && x.included);
  const proxy = evaluations.filter((x) => x.pool === "proxy" && x.included);
  const pool = exact.length ? exact : proxy;
  const values = sellerValues(pool);
  if (!values.length) return base;
  const average = mean(values);
  const prices = pool.flatMap((x) => [x.low as number, x.high as number]).filter((n) => Number.isFinite(n));
  return {
    ...base,
    status: "ok",
    basis: exact.length ? "exact" : "proxy",
    average,
    median: median(values),
    low: Math.min(...prices),
    high: Math.max(...prices),
    sellerCount: values.length,
    diffFraction: profile.unitPrice > 0 && average > 0 ? (profile.unitPrice - average) / average : undefined,
  };
}
