// Backend tests with a FAKE provider (no network, no key). The fake returns the same block shapes the
// Messages API returns for web_search / web_fetch / a client tool call.
import { describe, expect, it } from "vitest";
import { handle } from "../src/handler.ts";
import { runResearch, type ResearchDeps } from "../src/research.ts";
import { checkAmountOnPage, numbersIn } from "../src/verify.ts";
import type { MarketSpec } from "../../src/market/contract.ts";

const TOKEN = "unit-test-token-0123456789";
const spec: MarketSpec = {
  contractVersion: 1,
  category: "window",
  manufacturer: "קליל",
  seriesEntered: "7300",
  openingType: "הזזה",
  widthCm: 200,
  heightCm: 150,
  quantity: 1,
  productText: "7300 זכוכית ורשת",
  glazing: "זכוכית (סוג לא צוין)",
  screen: { present: true, coverage: "partial", areaM2: 1.5 },
  shutter: { type: "none", motor: "none", box: "none" },
  unit: "m2",
  scope: "installed",
};

type Msg = Awaited<ReturnType<ResearchDeps["createMessage"]>>;
function msg(content: unknown[], stop_reason = "tool_use"): Msg {
  return { id: "m", type: "message", role: "assistant", model: "claude-opus-5-5", content, stop_reason, usage: {} } as unknown as Msg;
}

const searchBlock = {
  type: "web_search_tool_result",
  tool_use_id: "s1",
  content: [
    { type: "web_search_result", url: "https://www.alu-a.co.il/7300", title: "חלונות 7300", encrypted_content: "x", page_age: null },
    { type: "web_search_result", url: "https://alu-b.co.il/prices", title: "מחירון", encrypted_content: "x", page_age: null },
  ],
};
const fetchBlock = {
  type: "web_fetch_tool_result",
  tool_use_id: "f1",
  content: {
    type: "web_fetch_result",
    url: "https://www.alu-a.co.il/7300",
    retrieved_at: "2026-11-24T09:00:00Z",
    content: { type: "document", title: "חלונות 7300", citations: null, source: { type: "text", media_type: "text/plain", data: "חלון קליל 7300 זכוכית ורשת: 1,850 ₪ למ״ר כולל התקנה, לא כולל מע״מ" } },
  },
};
const submit = (evidence: unknown[]) => ({
  type: "tool_use",
  id: "t1",
  name: "submit_market_evidence",
  input: { evidence, assumptions: ["a"], warnings: [] },
});
const base = { sellerType: "installer", currency: "ILS", unit: "m2", vat: "excl", scope: "installed", priceKind: "installer_price", matchLevel: "exact", specification: "7300" };

describe("research verification (code, not model)", () => {
  it("keeps verified sources, flags wrong amounts, drops URLs that never appeared in results", async () => {
    const calls: unknown[] = [];
    const deps: ResearchDeps = {
      createMessage: async (p) => {
        calls.push(p);
        if (calls.length === 1) return msg([searchBlock], "pause_turn");
        return msg([
          fetchBlock,
          submit([
            { ...base, seller: "אלו א", url: "https://alu-a.co.il/7300/", observedPriceText: "1,850 ₪ למ״ר", amount: 1850 },
            { ...base, seller: "אלו א", url: "https://www.alu-a.co.il/7300", observedPriceText: "2,000 ₪", amount: 2000 },
            { ...base, seller: "אלו ב", url: "https://alu-b.co.il/prices", observedPriceText: "1,700", amount: 1700 },
            { ...base, seller: "מומצא", url: "https://invented.co.il/x", observedPriceText: "1,500", amount: 1500 },
          ]),
        ]);
      },
      fetchPage: async (url) => (url.includes("alu-b") ? "מחיר חלון 7300: 1700 ש״ח לכל מטר רבוע" : undefined),
      now: () => new Date("2026-11-24T10:00:00Z"),
    };
    const r = await runResearch(spec, deps);
    expect(calls).toHaveLength(2); // pause_turn continued once
    // The fallback beta travels as the anthropic-beta header (see anthropicCreateMessage), not in the body.
    const p = calls[0] as unknown as { fallbacks: string; tools: { type?: string; name: string }[]; messages: { content: string }[] };
    expect(p.fallbacks).toBe("default");
    expect(p.tools.map((t) => t.type ?? t.name)).toEqual(["web_search_20260318", "web_fetch_20260318", "submit_market_evidence"]);
    expect(r.source).toBe("live");
    expect(r.searches).toBe(0);
    expect(r.evidence.map((e) => [e.amount, e.verification, e.unitVerified])).toEqual([
      [1850, "amount_found", true],
      [2000, "amount_not_found", false],
      [1700, "amount_found", true],
    ]);
    expect(r.evidence[0].checkedAt).toBe("2026-11-24T09:00:00Z");
    expect(r.dropped).toEqual([{ url: "https://invented.co.il/x", reason: "url_not_in_results" }]);
  });

  it("nudges once for the structured submission and fails cleanly when none arrives", async () => {
    let n = 0;
    const deps: ResearchDeps = { createMessage: async () => (n++, msg([{ type: "text", text: "done" }], "end_turn")) };
    await expect(runResearch(spec, deps)).rejects.toThrow(/no structured evidence/);
    expect(n).toBe(2);
  });

  it("reads Israeli number formats", () => {
    expect(numbersIn("1,250 ₪ · 1.250 ש״ח · 1 250 · 980.50").map((x) => x.value)).toEqual([1250, 1250, 1250, 980.5]);
    expect(checkAmountOnPage("ארגז תריס 320 ₪ למטר אורך", 320, "linear_m")).toEqual({ amountFound: true, unitVerified: true });
    expect(checkAmountOnPage("ארגז תריס 320 ₪", 320, "linear_m")).toEqual({ amountFound: true, unitVerified: false });
  });
});

describe("endpoint", () => {
  const env = { MARKET_APP_TOKEN: TOKEN, ANTHROPIC_API_KEY: undefined as string | undefined };
  const post = (body: unknown, token = TOKEN, origin = "tauri://localhost") =>
    new Request("https://proxy.test/v1/market-research", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin },
      body: JSON.stringify(body),
    });

  it("rejects a wrong token", async () => {
    const r = await handle(post({ spec }, "wrong-token-but-long-enough"), env);
    expect(r.status).toBe(401);
  });

  it("reports a missing provider key instead of inventing results", async () => {
    const r = await handle(post({ spec }), env);
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ error: "provider_not_configured" });
    expect(r.headers.get("access-control-allow-origin")).toBe("tauri://localhost");
  });

  it("forwards only whitelisted product fields to the provider", async () => {
    let sent = "";
    const deps: ResearchDeps = {
      createMessage: async (p) => {
        sent = JSON.stringify(p.messages);
        return msg([submit([])]);
      },
    };
    const r = await handle(
      post({ spec: { ...spec, productText: "7300 · yossi@example.com · 052-7654321 · ₪1,800", customerName: "יוסי כהן", ourPrice: 1800, address: "הרצל 5" } }),
      { ...env, ANTHROPIC_API_KEY: "k" },
      deps
    );
    expect(r.status).toBe(200);
    for (const s of ["יוסי", "כהן", "הרצל", "yossi", "7654321", "1,800", "ourPrice", "customerName"]) expect(sent).not.toContain(s);
    expect(sent).toContain("7300");
  });

  it("maps a provider failure to an error the app can show", async () => {
    const deps: ResearchDeps = { createMessage: async () => msg([{ type: "text", text: "no" }], "refusal") };
    const r = await handle(post({ spec }), { ...env, ANTHROPIC_API_KEY: "k" }, deps);
    expect(r.status).toBe(502);
    expect(await r.json()).toMatchObject({ error: "provider_error" });
  });
});
