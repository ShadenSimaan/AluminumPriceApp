import { afterEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "../../types";
import { DEFAULT_MANUFACTURERS, KLIL_ID } from "../../quote/manufacturers";
import { requestMarketResearch, MarketRequestError } from "../client";
import type { MarketEvidence, MarketResearchResponse } from "../contract";
import { profileMarketSpec, profileMarketStats, profileSnapshot } from "../profileCheck";
import { isMarketConfigured } from "../types";

const profile: Profile = { id: "p1", name: "7300", unitPrice: 1800, manufacturerId: KLIL_ID };

function ev(over: Partial<MarketEvidence>): MarketEvidence {
  return {
    id: over.id ?? Math.random().toString(36),
    seller: "מוכר",
    sellerType: "installer",
    url: "https://a.co.il/x",
    observedPriceText: "",
    amount: 1000,
    currency: "ILS",
    unit: "m2",
    vat: "excl",
    scope: "installed",
    priceKind: "installer_price",
    matchLevel: "exact",
    specification: "7300",
    checkedAt: "2026-11-24T08:00:00Z",
    verification: "amount_found",
    unitVerified: true,
    ...over,
  };
}

function response(evidence: MarketEvidence[]): MarketResearchResponse {
  return { contractVersion: 1, source: "live", provider: "anthropic", retrievedAt: "2026-11-24T09:00:00Z", evidence, assumptions: [], warnings: [] };
}

describe("profile market check", () => {
  it("builds a per-m² spec from the profile name and company only", () => {
    const { spec } = profileMarketSpec(profile, DEFAULT_MANUFACTURERS);
    expect(spec.purpose).toBe("profile_rate");
    expect(spec.unit).toBe("m2");
    expect(spec.seriesEntered).toBe("7300");
    expect(spec.widthCm).toBeUndefined();
    expect(JSON.stringify(spec)).not.toContain("1800");
  });

  it("averages one price per seller, removes VAT, and compares with our price", () => {
    const snap = profileSnapshot(
      profile,
      DEFAULT_MANUFACTURERS,
      response([
        ev({ seller: "א", amount: 1500 }),
        ev({ seller: "א", amount: 1700, url: "https://a.co.il/y" }), // same seller → median 1600
        ev({ seller: "ב", amount: 2360, vat: "incl", url: "https://b.co.il" }), // 2000 before 18% VAT
        ev({ seller: "ג", amount: 900, verification: "amount_not_found", url: "https://c.co.il" }), // not verified → out
        ev({ seller: "ד", amount: 1200, priceKind: "starting_price", url: "https://d.co.il" }), // "from" → lower bound only
      ]),
      0.18
    );
    const s = profileMarketStats(profile, DEFAULT_MANUFACTURERS, snap);
    expect(s.status).toBe("ok");
    expect(s.basis).toBe("exact");
    expect(s.sellerCount).toBe(2);
    expect(s.average).toBeCloseTo(1800, 6);
    expect(s.diffFraction).toBeCloseTo(0, 6);
    expect(s.lowerBounds.map((b) => b.seller)).toEqual(["ד"]);
    expect(s.stale).toBe(false);
  });

  it("falls back to comparable systems when no exact source exists, and flags a renamed profile", () => {
    const snap = profileSnapshot(profile, DEFAULT_MANUFACTURERS, response([ev({ matchLevel: "proxy", amount: 2000 })]), 0.18);
    const s = profileMarketStats(profile, DEFAULT_MANUFACTURERS, snap);
    expect(s.basis).toBe("proxy");
    expect(s.average).toBe(2000);
    expect(s.diffFraction).toBeCloseTo(-0.1, 6);
    expect(profileMarketStats({ ...profile, name: "4300" }, DEFAULT_MANUFACTURERS, snap).stale).toBe(true);
  });

  it("reports insufficient data instead of inventing an average", () => {
    const snap = profileSnapshot(profile, DEFAULT_MANUFACTURERS, response([ev({ vat: "unknown" })]), 0.18);
    expect(profileMarketStats(profile, DEFAULT_MANUFACTURERS, snap).status).toBe("insufficient");
    expect(profileMarketStats(profile, DEFAULT_MANUFACTURERS, undefined).status).toBe("not_checked");
  });
});

describe("direct connection (no server)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is configured by the API key alone", () => {
    expect(isMarketConfigured({ mode: "direct", apiKey: "sk-ant-x", endpointUrl: "", accessToken: "" })).toBe(true);
    expect(isMarketConfigured({ mode: "direct", apiKey: " ", endpointUrl: "https://x", accessToken: "t" })).toBe(false);
    expect(isMarketConfigured({ mode: "proxy", apiKey: "", endpointUrl: "https://x", accessToken: "t" })).toBe(true);
  });

  it("calls Claude from the app with the browser header, verifies sources, and sends only the product spec", async () => {
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
      return new Response(
        JSON.stringify({
          model: "claude-opus-5-5",
          stop_reason: "tool_use",
          content: [
            {
              type: "web_fetch_tool_result",
              tool_use_id: "f1",
              content: {
                type: "web_fetch_result",
                url: "https://www.alu-a.co.il/7300",
                retrieved_at: "2026-11-24T09:00:00Z",
                content: { type: "document", title: "7300", source: { type: "text", data: "חלון קליל 7300: 1,850 ₪ למ״ר כולל התקנה, לא כולל מע״מ" } },
              },
            },
            {
              type: "tool_use",
              id: "t1",
              name: "submit_market_evidence",
              input: {
                evidence: [
                  { seller: "א", sellerType: "installer", url: "https://www.alu-a.co.il/7300", observedPriceText: "1,850 ₪ למ״ר", amount: 1850, currency: "ILS", unit: "m2", vat: "excl", scope: "installed", priceKind: "installer_price", matchLevel: "exact", specification: "7300" },
                  { seller: "ב", sellerType: "installer", url: "https://invented.co.il", observedPriceText: "1 ₪", amount: 1, currency: "ILS", unit: "m2", vat: "excl", scope: "installed", priceKind: "installer_price", matchLevel: "exact", specification: "x" },
                ],
                assumptions: [],
                warnings: [],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    });
    const { spec } = profileMarketSpec(profile, DEFAULT_MANUFACTURERS);
    const r = await requestMarketResearch({ mode: "direct", apiKey: "sk-ant-test", endpointUrl: "", accessToken: "" }, spec);
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].headers["x-api-key"]).toBe("sk-ant-test");
    expect(calls[0].headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(calls[0].headers["anthropic-beta"]).toBe("server-side-fallback-2026-07-01");
    expect(calls[0].body).toContain("profile_rate");
    expect(calls[0].body).not.toContain("1800");
    expect(r.evidence).toHaveLength(1);
    expect(r.evidence[0].verification).toBe("amount_found");
    expect(r.dropped?.[0].reason).toBe("url_not_in_results");
  });

  it("maps a rejected key to a clear error", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: { message: "invalid x-api-key" } }), { status: 401 }));
    const { spec } = profileMarketSpec(profile, DEFAULT_MANUFACTURERS);
    const err = await requestMarketResearch({ mode: "direct", apiKey: "bad", endpointUrl: "", accessToken: "" }, spec).catch((e) => e);
    expect(err).toBeInstanceOf(MarketRequestError);
    expect(err.code).toBe("unauthorized");
  });
});
