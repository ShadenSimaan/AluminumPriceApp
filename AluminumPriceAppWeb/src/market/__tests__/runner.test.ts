import { describe, expect, it } from "vitest";
import { applyMarketUpdate, executeRun, planRun, type MarketUpdate } from "../runner";
import { MarketRequestError } from "../client";
import type { MarketResearchResponse, MarketSpec } from "../contract";
import type { MarketCacheEntry } from "../types";
import type { AppCurrentState, LineItem } from "../../types";
import { toCustomerPdfPayload } from "../../quote/customerPayload";
import { DEFAULT_STATE } from "../../appState";
import { ev, line, manufacturers, profiles } from "./fixtures";

const ctx = { profiles, manufacturers, installationTerms: "" };
const live = (n = 1800): MarketResearchResponse => ({
  contractVersion: 1,
  source: "live",
  provider: "test",
  retrievedAt: "2026-11-20T08:00:00.000Z",
  evidence: [ev({ amount: n, verification: "amount_found", unitVerified: true })],
  assumptions: [],
  warnings: [],
});

function harness(request: (spec: MarketSpec) => Promise<MarketResearchResponse>) {
  const cache: Record<string, MarketCacheEntry> = {};
  const applied: MarketUpdate[] = [];
  let calls = 0;
  return {
    cache,
    applied,
    get calls() {
      return calls;
    },
    deps: {
      request: (spec: MarketSpec) => {
        calls += 1;
        return request(spec);
      },
      getCache: (k: string) => cache[k],
      onUpdates: (u: MarketUpdate[], c?: MarketCacheEntry) => {
        applied.push(...u);
        if (c) cache[c.researchKey] = c;
      },
      now: () => new Date("2026-11-24T10:00:00.000Z"),
    },
  };
}

describe("market runner", () => {
  const a = line({ id: "a", profileName: "7300 זכוכית ורשת", unitPrice: "2000", widthCm: "100", heightCm: "100", qty: "3" });
  const b = { ...a, id: "b" };
  const cyl = line({ id: "c", profileName: "צילינדר", manualUnitPrice: "150", priceBasis: "per_unit", qty: "4" });
  const service = line({ id: "s", profileName: "תיקון רשת", manualUnitPrice: "200", priceBasis: "per_unit" });

  it("one search per distinct specification within a quote; service lines are skipped", async () => {
    const plan = planRun([a, b, cyl, service], ctx);
    expect(plan.jobs).toHaveLength(2);
    expect(plan.jobs[0].lines.map((l) => l.lineId)).toEqual(["a", "b"]);
    expect(plan.notComparable).toBe(1);
    const h = harness(async () => live());
    const r = await executeRun(plan.jobs, h.deps, 0.18, false);
    expect(r.liveRequests).toBe(2);
    expect(h.applied.filter((u) => u.kind === "result").map((u) => u.lineId).sort()).toEqual(["a", "b", "c"]);
  });

  it("reuses a cached result for an identical spec and keeps its original retrieval date; refresh bypasses it", async () => {
    const h = harness(async () => live());
    await executeRun(planRun([a], ctx).jobs, h.deps, 0.18, false);
    expect(h.calls).toBe(1);
    h.applied.length = 0;
    await executeRun(planRun([b], ctx).jobs, h.deps, 0.18, false);
    expect(h.calls).toBe(1);
    const u = h.applied[0];
    expect(u.kind === "result" && u.snapshot.source).toBe("cache");
    expect(u.kind === "result" && u.snapshot.retrievedAt).toBe("2026-11-20T08:00:00.000Z");
    await executeRun(planRun([b], ctx, { force: true }).jobs, h.deps, 0.18, true);
    expect(h.calls).toBe(2);
  });

  it("a current line is not searched again; an edited spec is", () => {
    const h = planRun([a], ctx);
    const snapshot = applyMarketUpdate(undefined, {
      lineId: "a",
      kind: "result",
      snapshot: { ...{ specKey: h.jobs[0].lines[0].specKey, researchKey: h.jobs[0].researchKey, spec: h.jobs[0].spec }, retrievedAt: "2026-11-24T00:00:00Z", source: "live", provider: "t", evidence: [], assumptions: [], warnings: [], vatRate: 0.18 },
    });
    const checked: LineItem = { ...a, marketCheck: snapshot };
    expect(planRun([checked], ctx).skippedCurrent).toBe(1);
    expect(planRun([{ ...checked, widthCm: "120" }], ctx).jobs).toHaveLength(1);
  });

  it("a failed search keeps the previous result and records the error beside it", async () => {
    const h = harness(async () => {
      throw new MarketRequestError("provider_error", "HTTP 502");
    });
    const r = await executeRun(planRun([a], ctx, { force: true }).jobs, h.deps, 0.18, true);
    expect(r.errors[0].code).toBe("provider_error");
    const prev = { ...applyMarketUpdate(undefined, { lineId: "a", kind: "result", snapshot: { specKey: "k", researchKey: "r", spec: planRun([a], ctx).jobs[0].spec, retrievedAt: "2026-11-01T00:00:00Z", source: "live", provider: "t", evidence: [ev({})], assumptions: [], warnings: [], vatRate: 0.18 } }) };
    const after = applyMarketUpdate(prev, h.applied[0]);
    expect(after.retrievedAt).toBe("2026-11-01T00:00:00Z");
    expect(after.evidence).toHaveLength(1);
    expect(after.lastError?.code).toBe("provider_error");
  });

  it("missing configuration stops the run without touching lines", async () => {
    const h = harness(async () => {
      throw new MarketRequestError("missing_config");
    });
    const r = await executeRun(planRun([a, cyl], ctx).jobs, { ...h.deps, concurrency: 1 }, 0.18, false);
    expect(r.errors).toHaveLength(1);
    expect(h.applied).toHaveLength(0);
  });

  it("fixture responses are never cached as live research", async () => {
    const h = harness(async () => ({ ...live(), source: "fixture" }));
    await executeRun(planRun([a], ctx).jobs, h.deps, 0.18, false);
    expect(Object.keys(h.cache)).toHaveLength(0);
    const u = h.applied[0];
    expect(u.kind === "result" && u.snapshot.source).toBe("fixture");
  });
});

describe("customer PDF payload", () => {
  it("is identical with and without market data on the lines", () => {
    const items = [line({ id: "x", profileName: "7300 זכוכית ורשת", unitPrice: "2000", widthCm: "100", heightCm: "100" })];
    const current: AppCurrentState = { ...DEFAULT_STATE.current, customerName: "לקוח", items, discountPercentText: "10" };
    const withMarket: AppCurrentState = {
      ...current,
      items: items.map((it) => ({
        ...it,
        marketInputs: { screenAreaM2: "0.5", seriesConfirmed: "M9660" },
        marketCheck: { specKey: "k", researchKey: "r", spec: {} as MarketSpec, retrievedAt: "2026-11-24", source: "live" as const, provider: "p", evidence: [ev({})], assumptions: ["a"], warnings: [], vatRate: 0.18 },
      })),
    };
    const extra = { profiles, manufacturers, pdfDateMs: 1 };
    expect(toCustomerPdfPayload(withMarket, extra)).toEqual(toCustomerPdfPayload(current, extra));
  });
});
