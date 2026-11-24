// Live Israeli market research with Claude (web search + web fetch server tools).
// The model finds and structures evidence; this file verifies every cited page and amount in code.
import Anthropic from "@anthropic-ai/sdk";
import {
  MARKET_CONTRACT_VERSION,
  parseEvidence,
  type MarketEvidence,
  type MarketResearchResponse,
  type MarketSpec,
} from "../../src/market/contract.ts";
import { checkAmountOnPage, fetchPageText, normalizeUrl } from "./verify.ts";

export const DEFAULT_MODEL = "claude-opus-5-5";

type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

export type ResearchDeps = {
  createMessage: (params: CreateParams) => Promise<BetaMessage>;
  /** Used when a cited page was found by search but not fetched by the model. */
  fetchPage?: (url: string) => Promise<string | undefined>;
  now?: () => Date;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxSearches?: number;
};

export class ProviderError extends Error {
  readonly code: "provider_error" | "timeout";
  constructor(message: string, code: "provider_error" | "timeout" = "provider_error") {
    super(message);
    this.code = code;
  }
}

const SYSTEM = `You research current Israeli market prices for aluminium windows, doors and shutters, for an aluminium workshop that wants to see how its own selling price compares. You never see the workshop's price and must not guess it.

Search in Hebrew first and prefer Israeli sources (.co.il, Israeli fabricators, installers and manufacturers). Use manufacturer pages (קליל, אלומיל/ALUMIL, אקסטל, etc.) to identify the system and its options. Use named fabricators or installers to establish actual installed prices. Open (web_fetch) every page you cite, and copy the price exactly as printed.

Rules for the evidence you submit:
- Only cite pages that appeared in your search or fetch results in this conversation. Never cite a page from memory, never invent a seller, URL or amount, and never report a price you did not read on the page.
- Record what kind of figure it is: manufacturer_tariff (only when the manufacturer itself publishes it — never infer a manufacturer price from a dealer listing), installer_price, starting_price ("החל מ-"), published_range (give amount = low and amountHigh = high), or comparable_estimate.
- Record the unit exactly: m2 (₪/מ״ר), linear_m (₪/מטר אורך), opening (per window/door/opening), unit (per piece). Do not convert units yourself. If a per-window price states the window size, put it in referenceWidthCm/referenceHeightCm.
- Record VAT as incl / excl / unknown, and scope as installed / supply_only / unknown, from what the page says. Use unknown when the page does not say.
- Record any minimum order (e.g. מינימום 6 מ״ר) in minimumOrder; use unit "m2_total" for an order-level area minimum and "m2" for a per-window minimum.
- matchLevel: "exact" only when the page prices the same manufacturer, series and assembly (same opening type, glazing class, screen, shutter type, motor and box scope). "component" when the page prices one part (window with glass, screen, shutter, motor, box) — set componentRole, and list in includes what that price already contains (e.g. a complete תריס אור that includes its motor and box). "proxy" for a different series or a generic system.
- Put the series printed on the page in seriesOnPage. If the entered model code looks like a typo for another real model (for example M9960 vs M9660), keep the entered code, add the alternative to suggestedSeries, and mark evidence for the other model as proxy.
- A 7300 sliding window with glass and screen is a different assembly from 7300 with glass, screen and electric תריס אור. החלפת שדה תריס אור is a curtain replacement, not a complete shutter. תריס רפפה 1200 is a separate louver system. A shutter box (ארגז) is priced per linear metre; a cylinder (צילינדר) per piece.
- Prefer 3–8 independent sellers. Fewer real sources are better than padded ones. If nothing usable exists, submit an empty evidence list and explain in warnings.

When you are done, call submit_market_evidence exactly once with everything you found.`;

const SUBMIT_TOOL = {
  name: "submit_market_evidence",
  description:
    "Submit the price evidence found on the pages you searched and fetched, with assumptions and warnings. Call once, at the end.",
  input_schema: {
    type: "object" as const,
    properties: {
      evidence: {
        type: "array",
        items: {
          type: "object",
          properties: {
            seller: { type: "string" },
            sellerType: { type: "string", enum: ["manufacturer", "fabricator", "installer", "dealer", "retailer", "aggregator", "other"] },
            url: { type: "string" },
            pageTitle: { type: "string" },
            observedPriceText: { type: "string", description: "The price sentence exactly as printed on the page" },
            amount: { type: "number" },
            amountHigh: { type: "number" },
            currency: { type: "string" },
            unit: { type: "string", enum: ["m2", "linear_m", "opening", "unit"] },
            vat: { type: "string", enum: ["incl", "excl", "unknown"] },
            scope: { type: "string", enum: ["installed", "supply_only", "unknown"] },
            priceKind: { type: "string", enum: ["manufacturer_tariff", "installer_price", "starting_price", "published_range", "comparable_estimate"] },
            matchLevel: { type: "string", enum: ["exact", "component", "proxy"] },
            componentRole: { type: "string", enum: ["window_glass", "screen", "shutter", "motor", "box", "fixed_section", "other"] },
            includes: { type: "array", items: { type: "string", enum: ["window_glass", "screen", "shutter", "motor", "box", "fixed_section", "other"] } },
            specification: { type: "string", description: "What the page says the price covers" },
            seriesOnPage: { type: "string" },
            referenceWidthCm: { type: "number" },
            referenceHeightCm: { type: "number" },
            referenceLengthM: { type: "number" },
            minimumOrder: {
              type: "object",
              properties: { value: { type: "number" }, unit: { type: "string", enum: ["m2", "m2_total", "linear_m", "opening", "unit"] } },
              required: ["value", "unit"],
            },
            publishedDate: { type: "string" },
            notes: { type: "string" },
          },
          required: ["seller", "sellerType", "url", "observedPriceText", "amount", "currency", "unit", "vat", "scope", "priceKind", "matchLevel", "specification"],
        },
      },
      assumptions: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
      suggestedSeries: { type: "array", items: { type: "string" } },
    },
    required: ["evidence", "assumptions", "warnings"],
  },
};

function describeSpec(spec: MarketSpec, today: string): string {
  return [
    `Today is ${today}. Find current Israeli prices for this item (product specification only):`,
    "```json",
    JSON.stringify(spec, null, 2),
    "```",
    "Field notes: unit is the unit the workshop compares in. screen.areaM2 is the screened area of one piece. shutter.box = included means the shutter box is part of this item. scope = installed means supply and installation.",
  ].join("\n");
}

type Collected = {
  seen: Map<string, { url: string; title?: string; pageAge?: string | null }>;
  fetched: Map<string, { text: string; retrievedAt?: string | null }>;
  searches: number;
};

function collect(content: BetaMessage["content"], into: Collected): void {
  for (const block of content) {
    if (block.type === "server_tool_use" && block.name === "web_search") into.searches += 1;
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) into.seen.set(normalizeUrl(r.url), { url: r.url, title: r.title, pageAge: r.page_age });
    }
    if (block.type === "web_fetch_tool_result" && block.content.type === "web_fetch_result") {
      const doc = block.content.content;
      const key = normalizeUrl(block.content.url);
      into.seen.set(key, into.seen.get(key) ?? { url: block.content.url, title: doc.title ?? undefined });
      if (doc.source.type === "text") into.fetched.set(key, { text: doc.source.data, retrievedAt: block.content.retrieved_at });
    }
  }
}

export async function runResearch(spec: MarketSpec, deps: ResearchDeps): Promise<MarketResearchResponse> {
  const now = deps.now ?? (() => new Date());
  const model = deps.model ?? DEFAULT_MODEL;
  const today = now().toISOString().slice(0, 10);
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [{ role: "user", content: describeSpec(spec, today) }];
  const collected: Collected = { seen: new Map(), fetched: new Map(), searches: 0 };
  let submitted: Record<string, unknown> | undefined;
  let nudged = false;
  let servedModel = model;

  for (let turn = 0; turn < 8 && !submitted; turn++) {
    let res: BetaMessage;
    try {
      res = await deps.createMessage({
        model,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: deps.effort ?? "medium" },
        system: SYSTEM,
        tools: [
          {
            type: "web_search_20260318",
            name: "web_search",
            max_uses: deps.maxSearches ?? 8,
            user_location: { type: "approximate", country: "IL", timezone: "Asia/Jerusalem" },
          },
          { type: "web_fetch_20260318", name: "web_fetch", max_uses: 12, max_content_tokens: 20000 },
          SUBMIT_TOOL,
        ],
        tool_choice: { type: "auto" },
        messages,
      });
    } catch (e) {
      if (e instanceof Anthropic.APIConnectionTimeoutError) throw new ProviderError("provider timeout", "timeout");
      if (e instanceof Anthropic.APIError) throw new ProviderError(`provider ${e.status ?? ""}: ${e.message}`.slice(0, 300));
      throw e;
    }
    servedModel = res.model ?? servedModel;
    collect(res.content, collected);
    const submit = res.content.find((b) => b.type === "tool_use" && b.name === "submit_market_evidence");
    if (submit && submit.type === "tool_use") {
      submitted = submit.input as Record<string, unknown>;
      break;
    }
    if (res.stop_reason === "refusal") throw new ProviderError("provider declined the request");
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.Messages.BetaContentBlockParam[] });
    if (res.stop_reason === "pause_turn") continue;
    if (nudged) break;
    nudged = true;
    messages.push({ role: "user", content: "Call submit_market_evidence now with the evidence you verified (an empty list is fine)." });
  }
  if (!submitted) throw new ProviderError("provider returned no structured evidence");

  const retrievedAt = now().toISOString();
  const evidence: MarketEvidence[] = [];
  const dropped: { url: string; reason: string }[] = [];
  const rawList = Array.isArray(submitted.evidence) ? submitted.evidence : [];
  let i = 0;
  for (const raw of rawList) {
    const parsed = parseEvidence({ ...(raw as object), id: `ev-${++i}`, verification: "page_not_fetched", checkedAt: retrievedAt });
    if (!parsed) {
      dropped.push({ url: String((raw as { url?: unknown })?.url ?? ""), reason: "missing amount or URL" });
      continue;
    }
    const key = normalizeUrl(parsed.url);
    const seen = collected.seen.get(key);
    if (!seen) {
      // Never pass on a source the model did not actually retrieve in this session.
      dropped.push({ url: parsed.url, reason: "url_not_in_results" });
      continue;
    }
    if (!parsed.pageTitle && seen.title) parsed.pageTitle = seen.title;
    let text = collected.fetched.get(key)?.text;
    const fetchedAt = collected.fetched.get(key)?.retrievedAt;
    if (text === undefined && deps.fetchPage) text = await deps.fetchPage(parsed.url);
    if (text === undefined) {
      parsed.verification = "page_not_fetched";
    } else {
      const check = checkAmountOnPage(text, parsed.amount, parsed.unit, parsed.amountHigh);
      parsed.verification = check.amountFound ? "amount_found" : "amount_not_found";
      parsed.unitVerified = check.unitVerified;
      if (fetchedAt) parsed.checkedAt = fetchedAt;
    }
    evidence.push(parsed);
  }

  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((s) => s.slice(0, 300)).slice(0, 20) : []);
  return {
    contractVersion: MARKET_CONTRACT_VERSION,
    source: "live",
    provider: "anthropic",
    model: servedModel,
    retrievedAt,
    evidence,
    assumptions: strings(submitted.assumptions),
    warnings: strings(submitted.warnings),
    suggestedSeries: strings(submitted.suggestedSeries),
    searches: collected.searches,
    dropped,
  };
}

export function anthropicDeps(apiKey: string, opts: { model?: string; effort?: ResearchDeps["effort"] } = {}): ResearchDeps {
  const client = new Anthropic({ apiKey, timeout: 9 * 60 * 1000, maxRetries: 2 });
  return {
    createMessage: (params) => client.beta.messages.create(params),
    fetchPage: (url) => fetchPageText(url),
    model: opts.model,
    effort: opts.effort,
  };
}
