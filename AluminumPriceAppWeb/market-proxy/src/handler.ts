// Small authenticated endpoint. Holds the provider key; the desktop app only holds a per-device access token.
import { sanitizeSpec, type MarketErrorCode } from "../../src/market/contract.ts";
import { fixtureResponse } from "./fixtures.ts";
import { anthropicDeps, ProviderError, runResearch, type ResearchDeps } from "./research.ts";

export type Env = {
  /** Provider key (secret). */
  ANTHROPIC_API_KEY?: string;
  /** Shared access token(s) for the app, comma-separated (secret). */
  MARKET_APP_TOKEN?: string;
  /** Comma-separated origins allowed by CORS. */
  ALLOWED_ORIGINS?: string;
  MARKET_MODEL?: string;
  MARKET_EFFORT?: string;
  /** "1" returns clearly labelled test data and never calls the provider. */
  MARKET_FIXTURES?: string;
};

const DEFAULT_ORIGINS = ["tauri://localhost", "http://tauri.localhost", "https://tauri.localhost", "http://localhost:5173", "http://127.0.0.1:5173"];
const MAX_BODY = 20_000;
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map<string, number[]>();

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()) : DEFAULT_ORIGINS;
  return allowed.includes(origin)
    ? {
        "access-control-allow-origin": origin,
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-max-age": "600",
        vary: "origin",
      }
    : {};
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

function fail(code: MarketErrorCode | "server_not_configured" | "rate_limited", status: number, headers: Record<string, string>, detail?: string): Response {
  return json({ error: code, detail }, status, headers);
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function authorized(request: Request, env: Env): boolean {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const tokens = (env.MARKET_APP_TOKEN ?? "").split(",").map((t) => t.trim()).filter((t) => t.length >= 16);
  return Boolean(token) && tokens.some((t) => timingSafeEqual(t, token));
}

function rateLimited(key: string, now: number): boolean {
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  return list.length > MAX_PER_WINDOW;
}

export async function handle(request: Request, env: Env, depsOverride?: ResearchDeps): Promise<Response> {
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (!env.MARKET_APP_TOKEN) return fail("server_not_configured", 503, cors, "MARKET_APP_TOKEN is not set");
  if (!authorized(request, env)) return fail("unauthorized", 401, cors);

  const fixtures = env.MARKET_FIXTURES === "1";
  const providerReady = Boolean(depsOverride || env.ANTHROPIC_API_KEY);
  if (request.method === "GET" && url.pathname === "/v1/health") {
    return json({ ok: true, provider: fixtures ? "fixture" : "anthropic", providerConfigured: fixtures || providerReady }, 200, cors);
  }
  if (request.method !== "POST" || url.pathname !== "/v1/market-research") return fail("bad_request", 404, cors, "not found");
  if (rateLimited(request.headers.get("authorization") ?? "", Date.now())) return fail("rate_limited", 429, cors);

  const raw = await request.text();
  if (raw.length > MAX_BODY) return fail("bad_request", 413, cors, "body too large");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("bad_request", 400, cors, "invalid JSON");
  }
  // Only whitelisted product fields go further; anything else the client sent is discarded here.
  const spec = sanitizeSpec((body as { spec?: unknown })?.spec);
  if (!spec) return fail("bad_request", 400, cors, "missing spec");

  if (fixtures) return json(fixtureResponse(spec, new Date()), 200, cors);
  if (!providerReady) return fail("provider_not_configured", 503, cors);
  const effort = (["low", "medium", "high", "xhigh", "max"] as const).find((e) => e === env.MARKET_EFFORT);
  const deps = depsOverride ?? anthropicDeps(env.ANTHROPIC_API_KEY as string, { model: env.MARKET_MODEL || undefined, effort });
  try {
    return json(await runResearch(spec, deps), 200, cors);
  } catch (e) {
    if (e instanceof ProviderError) return fail(e.code, e.code === "timeout" ? 504 : 502, cors, e.message);
    return fail("provider_error", 500, cors, e instanceof Error ? e.message.slice(0, 200) : "unknown");
  }
}
