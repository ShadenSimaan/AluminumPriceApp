// Calls the market-research endpoint. Only the product spec is sent; the provider key stays on the endpoint.
import {
  MARKET_CONTRACT_VERSION,
  MARKET_ERROR_LABELS,
  parseEvidence,
  type MarketErrorCode,
  type MarketEvidence,
  type MarketResearchResponse,
  type MarketSpec,
} from "./contract";
import type { MarketSettings } from "./types";

export class MarketRequestError extends Error {
  readonly code: MarketErrorCode;
  constructor(code: MarketErrorCode, detail?: string) {
    super(detail ? `${MARKET_ERROR_LABELS[code]} (${detail})` : MARKET_ERROR_LABELS[code]);
    this.code = code;
  }
}

const TIMEOUT_MS = 10 * 60 * 1000;

function baseUrl(settings: MarketSettings): string {
  return settings.endpointUrl.trim().replace(/\/+$/, "");
}

function configured(settings: MarketSettings | undefined): settings is MarketSettings {
  return Boolean(settings && settings.endpointUrl.trim() && settings.accessToken.trim());
}

async function call(settings: MarketSettings | undefined, path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  if (!configured(settings)) throw new MarketRequestError("missing_config");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${baseUrl(settings)}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${settings.accessToken.trim()}`, "content-type": "application/json" },
    });
  } catch (e) {
    throw new MarketRequestError(ctrl.signal.aborted ? "timeout" : "network", e instanceof Error ? e.message : undefined);
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = undefined;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error page */
  }
  if (!res.ok) {
    const err = (body as { error?: string; detail?: string } | undefined) ?? {};
    if (res.status === 401) throw new MarketRequestError("unauthorized");
    if (err.error === "provider_not_configured") throw new MarketRequestError("provider_not_configured");
    if (res.status === 504 || err.error === "timeout") throw new MarketRequestError("timeout");
    if (res.status === 400 || res.status === 404 || res.status === 413) throw new MarketRequestError("bad_request", err.detail);
    throw new MarketRequestError("provider_error", err.detail ?? err.error ?? `HTTP ${res.status}`);
  }
  return body;
}

/** Validates the endpoint's answer; rows without a usable amount or URL are dropped. */
export function parseResearchResponse(raw: unknown): MarketResearchResponse {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.contractVersion !== MARKET_CONTRACT_VERSION) throw new MarketRequestError("provider_error", "גרסת תשובה לא מוכרת");
  const evidence = (Array.isArray(r.evidence) ? r.evidence : []).map(parseEvidence).filter((e): e is MarketEvidence => Boolean(e));
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const source = r.source === "live" ? "live" : "fixture";
  return {
    contractVersion: MARKET_CONTRACT_VERSION,
    source,
    provider: typeof r.provider === "string" ? r.provider : "unknown",
    model: typeof r.model === "string" ? r.model : undefined,
    retrievedAt: typeof r.retrievedAt === "string" ? r.retrievedAt : new Date().toISOString(),
    // A fixture response can never be shown as verified live evidence.
    evidence: source === "fixture" ? evidence.map((e) => ({ ...e, verification: "fixture" as const })) : evidence,
    assumptions: strings(r.assumptions),
    warnings: strings(r.warnings),
    suggestedSeries: strings(r.suggestedSeries),
    searches: typeof r.searches === "number" ? r.searches : undefined,
    dropped: Array.isArray(r.dropped) ? (r.dropped as { url: string; reason: string }[]).slice(0, 50) : [],
  };
}

export async function requestMarketResearch(settings: MarketSettings | undefined, spec: MarketSpec): Promise<MarketResearchResponse> {
  const body = await call(settings, "/v1/market-research", { method: "POST", body: JSON.stringify({ spec }) }, TIMEOUT_MS);
  return parseResearchResponse(body);
}

export async function checkMarketEndpoint(settings: MarketSettings | undefined): Promise<{ provider: string; providerConfigured: boolean }> {
  const body = (await call(settings, "/v1/health", { method: "GET" }, 15000)) as { provider?: string; providerConfigured?: boolean };
  return { provider: body?.provider ?? "unknown", providerConfigured: Boolean(body?.providerConfigured) };
}
