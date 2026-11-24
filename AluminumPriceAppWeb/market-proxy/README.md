# market-proxy — בדיקת מחירי שוק

A small authenticated endpoint that runs Israeli market-price research for the quotation app.
It holds the provider key; the desktop app holds only a per-device access token.

- Provider: Anthropic Claude Messages API with the server-side **web search** (`web_search_20260318`)
  and **web fetch** (`web_fetch_20260318`) tools, model `claude-opus-5-5` by default, server-side refusal
  fallback enabled (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).
- The model finds and structures evidence and returns it through a `submit_market_evidence` tool call.
  **This endpoint then verifies every row in code** (`src/verify.ts`):
  - a cited URL must have appeared in this session's search or fetch results; otherwise it is dropped;
  - the reported amount (and the upper bound of a range) must appear on the fetched page text, with the
    unit wording (מ״ר / מטר אורך / ליח׳ …) within 150 characters; otherwise the row is marked
    `amount_not_found` / unit not verified and the app keeps it out of the benchmark.
- All arithmetic (units, VAT, averages, discounts, percentages, index) happens in the app
  (`src/market/compute.ts`), never in the model.

## Privacy

The app sends only the product spec (`MarketSpec` in `src/market/contract.ts`): manufacturer, series as
entered, opening type, width/height, quantity, glazing, screen, shutter/motor/box, unit and installation
scope, plus the product wording (profile name and checked add-on names). Customer name, phone, e-mail,
address, location in the house, line details/notes, PDFs and all of our prices are never sent.
The endpoint re-applies the same whitelist (`sanitizeSpec`) and strips e-mails, phone numbers, URLs and
₪ amounts from text fields before anything reaches the provider.

## Settings

| Variable | Where | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | secret | Claude API key (console.anthropic.com → API keys). Web search must be enabled for the organisation (Console → Settings → Capabilities; on by default). |
| `MARKET_APP_TOKEN` | secret | Access token(s) the app sends as `Authorization: Bearer …`. At least 16 characters; comma-separate several devices. Generate with `openssl rand -hex 24`. |
| `ALLOWED_ORIGINS` | var | CORS origins. Default covers the Tauri app (`tauri://localhost`, `http(s)://tauri.localhost`) and `vite` dev (`http://localhost:5173`). |
| `MARKET_MODEL` | var | Default `claude-opus-5-5`. |
| `MARKET_EFFORT` | var | `low`/`medium`/`high`/`xhigh`/`max`; default `medium`. |
| `MARKET_FIXTURES` | var | `1` = return clearly labelled **test data**, never call the provider. For testing only. |

## Deploy (Cloudflare Workers)

```bash
cd market-proxy
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put MARKET_APP_TOKEN
npx wrangler deploy
```

The deploy prints the URL (e.g. `https://alum-market-proxy.<account>.workers.dev`).
A research request can run for one to several minutes (searches + page reads), which Workers allow
while the app's request stays open; the app waits up to 10 minutes.

## Run with Node instead (VPS, container, or locally)

```bash
cd market-proxy && npm install
ANTHROPIC_API_KEY=... MARKET_APP_TOKEN=... PORT=8787 node --experimental-strip-types src/node.ts
```

Put it behind HTTPS (reverse proxy) when it is not on the same machine.

## Connect the app

The app no longer needs this server: by default it connects directly to Claude with an API key saved on
the computer (the research code is shared, in `src/market/research.ts`). Use this server only when the
key must not live on the desktop.

In the app: **הגדרות — ניהול פרופילים ותוספות → חיבור לאינטרנט ול-AI → דרך שרת ביניים** → enter the
endpoint URL and the access token → **בדיקת חיבור**.

## Expected cost (estimate — not yet measured on a live run)

Pricing (Anthropic first-party, checked Nov 2026): Claude Opus 5.5 $4 / $20 per million input / output
tokens; web search $10 per 1,000 searches; web fetch has no charge beyond tokens.
One research request (one distinct spec) is capped at 8 searches and 12 page fetches of ≤20K tokens each.
A typical request should use roughly 40K–150K input tokens and 3K–10K output tokens:

- tokens ≈ $0.20–0.80, searches ≤ $0.08 → **about $0.25–0.90 per distinct specification**;
- a quotation with 4–8 distinct items ≈ **$1–7** the first time;
- identical specs within a quote share one request; the app reuses research for an identical spec for
  30 days (same assembly and size class), so re-checking costs nothing until you press ↻ on a line.

Setting `MARKET_MODEL=claude-sonnet-5-5` ($2 / $10) roughly halves token cost, at some research quality
cost. That is a choice to make after comparing results. Check `usage` in the Anthropic Console after the
first real quotation to replace this estimate with measured figures.

## Tests

From `AluminumPriceAppWeb/`: `npx vitest run market-proxy src/market` (fake provider, no key needed).
`scripts/e2e-market.mjs` drives the real quotation screen against this endpoint in fixture mode.
