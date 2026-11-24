// Runs market research. Direct mode: the app calls Claude itself with the key saved on this computer.
// Proxy mode: calls the deployed market-proxy, which holds the key. Either way only the product spec is sent.
import {
  MARKET_CONTRACT_VERSION,
  MARKET_ERROR_LABELS,
  parseEvidence,
  sanitizeSpec,
  type MarketErrorCode,
  type MarketEvidence,
  type MarketResearchResponse,
  type MarketSpec,
} from "./contract";
import { isMarketConfigured, type MarketSettings } from "./types";
import { anthropicCreateMessage, checkAnthropicKey, ProviderError, runResearch } from "./research";

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

async function call(settings: MarketSettings | undefined, path: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  if (!isMarketConfigured(settings)) throw new MarketRequestError("missing_config");
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

function fromProviderError(e: unknown): MarketRequestError {
  if (e instanceof MarketRequestError) return e;
  if (e instanceof ProviderError) return new MarketRequestError(e.code, e.code === "unauthorized" ? undefined : e.message);
  return new MarketRequestError("provider_error", e instanceof Error ? e.message : undefined);
}

async function directResearch(settings: MarketSettings, spec: MarketSpec): Promise<MarketResearchResponse> {
  // Same whitelist the server applies: nothing but product fields reaches the provider.
  const clean = sanitizeSpec(spec);
  if (!clean) throw new MarketRequestError("bad_request", "missing spec");
  try {
    // Pages the model cited but did not open cannot be fetched from the app (browser rules); they stay "not verified".
    const raw = await runResearch(clean, { createMessage: anthropicCreateMessage(settings.apiKey, { browser: true }) });
    return parseResearchResponse(raw);
  } catch (e) {
    throw fromProviderError(e);
  }
}

export async function requestMarketResearch(settings: MarketSettings | undefined, spec: MarketSpec): Promise<MarketResearchResponse> {
  if (!isMarketConfigured(settings)) throw new MarketRequestError("missing_config");
  if (settings.mode === "direct") return directResearch(settings, spec);
  const body = await call(settings, "/v1/market-research", { method: "POST", body: JSON.stringify({ spec }) }, TIMEOUT_MS);
  return parseResearchResponse(body);
}

export async function checkMarketEndpoint(settings: MarketSettings | undefined): Promise<{ provider: string; providerConfigured: boolean }> {
  if (!isMarketConfigured(settings)) throw new MarketRequestError("missing_config");
  if (settings.mode === "direct") {
    try {
      await checkAnthropicKey(settings.apiKey, { browser: true });
    } catch (e) {
      throw fromProviderError(e);
    }
    return { provider: "anthropic", providerConfigured: true };
  }
  const body = (await call(settings, "/v1/health", { method: "GET" }, 15000)) as { provider?: string; providerConfigured?: boolean };
  return { provider: body?.provider ?? "unknown", providerConfigured: Boolean(body?.providerConfigured) };
}
