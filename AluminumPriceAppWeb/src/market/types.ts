// App-side market comparison records. Stored on the quote line (LineItem.marketCheck) so a saved quotation
// keeps the exact evidence, assumptions and retrieval date it was compared with.
import type { MarketErrorCode, MarketEvidence, MarketResearchResponse, MarketSpec } from "./contract";

export type MarketLineSnapshot = {
  /** Fingerprint of the spec (incl. dimensions/quantity) the comparison was made for. */
  specKey: string;
  /** Cache key of the research (assembly + size class). */
  researchKey: string;
  /** Spec at check time; the market side of the comparison is always evaluated against it. */
  spec: MarketSpec;
  /** When the evidence was retrieved by the endpoint (ISO). */
  retrievedAt: string;
  /** live = searched for this check; cache = reused research of an identical spec; fixture = test data. */
  source: "live" | "cache" | "fixture";
  provider: string;
  model?: string;
  evidence: MarketEvidence[];
  assumptions: string[];
  warnings: string[];
  suggestedSeries?: string[];
  dropped?: { url: string; reason: string }[];
  /** VAT rate (decimal) used to normalise source prices at check time. */
  vatRate: number;
  /** Last failed attempt. The previous result above stays valid and keeps its own date. */
  lastError?: { code: MarketErrorCode; message: string; at: string };
};

/** Estimator inputs that only affect the market comparison (never the quote price). */
export type MarketLineInputs = {
  /** Actual screened area in m² for the whole line (all pieces), as typed. */
  screenAreaM2?: string;
  /** Series interpretation confirmed for comparison (e.g. M9660 for an entered M9960). */
  seriesConfirmed?: string;
};

export type MarketCacheEntry = {
  researchKey: string;
  response: MarketResearchResponse;
  storedAt: string;
};

export type MarketSettings = {
  /** Base URL of the deployed market-proxy, e.g. https://alum-market.example.workers.dev */
  endpointUrl: string;
  /** Per-device access token for that endpoint (not the provider key). */
  accessToken: string;
};

export const DEFAULT_MARKET_SETTINGS: MarketSettings = { endpointUrl: "", accessToken: "" };

/** Cached research older than this is not reused automatically. */
export const MARKET_CACHE_MAX_AGE_DAYS = 30;
