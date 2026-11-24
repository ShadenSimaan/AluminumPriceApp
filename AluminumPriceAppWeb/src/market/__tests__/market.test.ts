import { describe, expect, it } from "vitest";
import { buildMarketSpec, researchKey, specKey } from "../spec";
import { compareLine, computeLineBenchmark, evaluateEvidence, ourPrice, summarizeQuote, type LineComparison } from "../compute";
import type { MarketLineSnapshot } from "../types";
import type { MarketEvidence, MarketSpec } from "../contract";
import { quoteMoney } from "../../quote/pricing";
import { toCustomerPdfItem } from "../../quote/customerPayload";
import type { LineItem } from "../../types";
import { ev, line, manufacturers, motorAddon, profiles } from "./fixtures";

const ctx = { profiles, manufacturers, installationTerms: "כולל התקנה" };
const VAT = 0.18;

function snap(l: LineItem, evidence: MarketEvidence[], hasSeparateBoxLine = false): MarketLineSnapshot {
  const b = buildMarketSpec(l, { ...ctx, hasSeparateBoxLine });
  return {
    specKey: specKey(b.spec),
    researchKey: researchKey(b.spec),
    spec: b.spec,
    retrievedAt: "2026-11-24T10:00:00.000Z",
    source: "fixture",
    provider: "fixture",
    evidence,
    assumptions: b.assumptions,
    warnings: [],
    vatRate: VAT,
  };
}

function cmp(l: LineItem, s: MarketLineSnapshot | undefined, discountRate = 0, hasSeparateBoxLine = false): LineComparison {
  const b = buildMarketSpec(l, { ...ctx, hasSeparateBoxLine });
  return compareLine({ line: l, snapshot: s, currentSpecKey: specKey(b.spec), currentUnit: b.spec.unit, comparable: b.comparable, notComparableReason: b.notComparableReason, discountRate });
}

describe("market spec (product only)", () => {
  it("7300 with partial screen and complete electric תריס אור", () => {
    const l = line({ profileId: "p7300s", profileName: "7300 זכוכית ורשת ותריס אור", unitPrice: "2600", widthCm: "200", heightCm: "150", qty: "1", addons: [motorAddon(true)] });
    const b = buildMarketSpec(l, ctx);
    expect(b.spec.category).toBe("window");
    expect(b.spec.seriesEntered).toBe("7300");
    expect(b.spec.manufacturer).toBe("קליל");
    expect(b.spec.unit).toBe("m2");
    expect(b.spec.shutter).toEqual({ type: "light_shutter", motor: "electric", box: "included" });
    // No screened area typed → labelled assumption: one sliding sash ≈ half the window.
    expect(b.spec.screen.coverage).toBe("partial");
    expect(b.spec.screen.areaM2).toBe(1.5);
    expect(b.assumptions.join(" ")).toMatch(/הנחה: רשת על כנף הזזה אחת/);

    const typed = buildMarketSpec({ ...l, marketInputs: { screenAreaM2: "1.2" } }, ctx);
    expect(typed.spec.screen).toEqual({ present: true, coverage: "partial", areaM2: 1.2 });
    expect(typed.assumptions.join(" ")).not.toMatch(/רשת על כנף/);
  });

  it("7300 glass+screen and 7300 glass+screen+electric light shutter are different assemblies", () => {
    const a = buildMarketSpec(line({ profileId: "p7300", profileName: "7300 זכוכית ורשת", unitPrice: "1800", widthCm: "200", heightCm: "150" }), ctx);
    const b = buildMarketSpec(line({ profileId: "p7300s", profileName: "7300 זכוכית ורשת ותריס אור", unitPrice: "2600", widthCm: "200", heightCm: "150", addons: [motorAddon(true)] }), ctx);
    expect(a.spec.shutter.type).toBe("none");
    expect(researchKey(a.spec)).not.toBe(researchKey(b.spec));
  });

  it("keeps M9960 exactly as entered and asks to verify M9660", () => {
    const l = line({ profileId: "pm9960", profileName: "ALUMIL M9960 חלון ציר נטוי", unitPrice: "3200", widthCm: "100", heightCm: "120" });
    const b = buildMarketSpec(l, ctx);
    expect(b.spec.seriesEntered).toBe("M9960");
    expect(b.spec.seriesConfirmed).toBeUndefined();
    expect(b.seriesCheck).toEqual({ status: "needs_verification", entered: "M9960", candidates: ["M9660"] });
    const confirmed = buildMarketSpec({ ...l, marketInputs: { seriesConfirmed: "M9660" } }, ctx);
    expect(confirmed.spec.seriesEntered).toBe("M9960");
    expect(confirmed.spec.seriesConfirmed).toBe("M9660");
  });

  it("distinguishes curtain replacement, louver 1200, shutter box and cylinder units", () => {
    expect(buildMarketSpec(line({ profileName: "החלפת שדה תריס אור", manualUnitPrice: "1400", priceBasis: "per_unit", widthCm: "180", heightCm: "140" }), ctx).spec).toMatchObject({
      category: "curtain_replacement",
      unit: "m2",
      shutter: { type: "light_shutter", box: "none" },
    });
    expect(buildMarketSpec(line({ profileName: "תריס רפפה 1200", unitPrice: "950", priceBasis: "per_m2", widthCm: "150", heightCm: "120" }), ctx).spec).toMatchObject({
      category: "louver",
      unit: "m2",
      shutter: { type: "louver_1200" },
    });
    expect(buildMarketSpec(line({ profileName: "ארגז תריס", manualUnitPrice: "900", priceBasis: "per_unit", widthCm: "250" }), ctx).spec).toMatchObject({
      category: "shutter_box",
      unit: "linear_m",
    });
    expect(buildMarketSpec(line({ profileName: "צילינדר", manualUnitPrice: "120", priceBasis: "per_unit", qty: "3" }), ctx).spec).toMatchObject({
      category: "cylinder",
      unit: "unit",
    });
  });

  it("sends no customer data, location, private notes or our prices", () => {
    const l = line({
      profileName: "7300 זכוכית ורשת 054-1234567 ₪1800",
      customerDescription: "חלון סלון — yossi@example.com",
      location: "חדר של משפחת כהן, רחוב הרצל 5",
      details: "לקוח מבקש הנחה, לא לספר לשכן",
      unitPrice: "1800",
      widthCm: "120",
      heightCm: "100",
      addons: [motorAddon(true)],
    });
    const body = JSON.stringify(buildMarketSpec(l, ctx).spec);
    for (const forbidden of ["054", "1234567", "1800", "yossi", "example.com", "כהן", "הרצל", "מבקש", "שכן", "800"]) {
      expect(body).not.toContain(forbidden);
    }
    expect(body).toContain("7300");
  });
});

describe("evidence normalisation", () => {
  const spec7300 = buildMarketSpec(line({ profileId: "p7300", profileName: "7300 זכוכית ורשת", unitPrice: "1800", widthCm: "200", heightCm: "150" }), ctx).spec;

  it("removes VAT from VAT-inclusive prices using the quotation VAT rate", () => {
    const r = evaluateEvidence(ev({ amount: 2360, vat: "incl" }), spec7300, 0.18);
    expect(r.included).toBe(true);
    expect(r.value).toBeCloseTo(2000, 6);
  });

  it("excludes unknown VAT and unknown installation scope from the average but keeps them visible", () => {
    expect(evaluateEvidence(ev({ vat: "unknown" }), spec7300, VAT)).toMatchObject({ included: false, reason: expect.stringMatching(/מע״מ/) });
    expect(evaluateEvidence(ev({ scope: "unknown" }), spec7300, VAT)).toMatchObject({ included: false, reason: expect.stringMatching(/התקנה/) });
    expect(evaluateEvidence(ev({ scope: "supply_only" }), spec7300, VAT)).toMatchObject({ included: false, reason: expect.stringMatching(/אספקה בלבד/) });
  });

  it("excludes a 6 m² minimum when the job does not qualify", () => {
    const small = evaluateEvidence(ev({ minimumOrder: { value: 6, unit: "m2_total" } }), spec7300, VAT); // 3 m² job
    expect(small.included).toBe(false);
    expect(small.reason).toMatch(/מינימום הזמנה 6/);
    const big = evaluateEvidence(ev({ minimumOrder: { value: 6, unit: "m2_total" } }), { ...spec7300, quantity: 2 }, VAT);
    expect(big.included).toBe(true);
  });

  it("converts ₪/opening to ₪/m² only with source dimensions", () => {
    expect(evaluateEvidence(ev({ unit: "opening", amount: 3000 }), spec7300, VAT)).toMatchObject({ included: false });
    const ok = evaluateEvidence(ev({ unit: "opening", amount: 3000, referenceWidthCm: 150, referenceHeightCm: 100 }), spec7300, VAT);
    expect(ok.value).toBeCloseTo(2000, 6);
  });

  it("excludes unverified amounts", () => {
    expect(evaluateEvidence(ev({ verification: "amount_not_found" }), spec7300, VAT).included).toBe(false);
    expect(evaluateEvidence(ev({ verification: "amount_found", unitVerified: false }), spec7300, VAT).included).toBe(false);
  });

  it("one representative per seller, ranges as midpoints, 'from' prices as lower bounds", () => {
    const b = computeLineBenchmark({
      spec: spec7300,
      vatRate: VAT,
      evidence: [
        ev({ seller: "חלונות א", amount: 1800 }),
        ev({ seller: "חלונות א", amount: 2200 }), // same seller → one representative (2000)
        ev({ seller: "חלונות א", amount: 2200, url: "https://fixture.invalid/dup" }),
        ev({ seller: "אלומיניום ב", amount: 1600, amountHigh: 2400, priceKind: "published_range" }), // midpoint 2000
        ev({ seller: "אלומיניום ג", amount: 1500, priceKind: "starting_price" }),
      ],
    });
    expect(b.status).toBe("ok");
    expect(b.basis).toBe("multi_seller");
    expect(b.sellerCount).toBe(2);
    expect(b.sampleCount).toBe(3);
    expect(b.benchmark).toBeCloseTo(2000, 6);
    expect(b.low).toBe(1600);
    expect(b.high).toBe(2400);
    expect(b.hasMidpoint).toBe(true);
    expect(b.lowerBounds).toEqual([{ seller: "אלומיניום ג", value: 1500 }]);
  });

  it("labels a single source and never substitutes zero", () => {
    expect(computeLineBenchmark({ spec: spec7300, vatRate: VAT, evidence: [ev({ amount: 2100 })] })).toMatchObject({ basis: "single_source", benchmark: 2100 });
    const none = computeLineBenchmark({ spec: spec7300, vatRate: VAT, evidence: [] });
    expect(none.status).toBe("insufficient");
    expect(none.benchmark).toBeUndefined();
  });
});

describe("workshop cases", () => {
  it("7300 + partial screen + complete light shutter: component estimate counts motor and box once", () => {
    const l = line({ profileId: "p7300s", profileName: "7300 זכוכית ורשת ותריס אור", unitPrice: "2600", widthCm: "200", heightCm: "150", addons: [motorAddon(true)], marketInputs: { screenAreaM2: "1.2" } });
    const s = snap(l, [
      ev({ seller: "א", matchLevel: "component", componentRole: "window_glass", amount: 1500, seriesOnPage: "7300" }),
      ev({ seller: "ב", matchLevel: "component", componentRole: "window_glass", amount: 1700, seriesOnPage: "7300" }),
      ev({ seller: "ג", matchLevel: "component", componentRole: "screen", amount: 300 }),
      ev({ seller: "ד", matchLevel: "component", componentRole: "shutter", amount: 900, includes: ["motor", "box"] }),
      // A separate motor price must not be added again: the complete light shutter already includes it.
      ev({ seller: "ה", matchLevel: "component", componentRole: "motor", unit: "unit", amount: 700 }),
    ]);
    const b = computeLineBenchmark(s);
    expect(b.basis).toBe("component_estimate");
    // (1600 × 3 m² + 900 × 3 m² + 300 × 1.2 m² screen) / 3 m²
    expect(b.benchmark).toBeCloseTo((1600 * 3 + 900 * 3 + 300 * 1.2) / 3, 6);
    expect(b.components?.map((p) => p.role)).toEqual(["window_glass", "shutter", "screen"]);
  });

  it("ALUMIL S350 with only a generic thermal-window proxy is not in the index", () => {
    const l = line({ profileId: "ps350", profileName: "ALUMIL S350 זכוכית בידודית", unitPrice: "2900", widthCm: "240", heightCm: "220" });
    const s = snap(l, [ev({ seller: "חלונות תרמיים", matchLevel: "proxy", seriesOnPage: "חלון תרמי גנרי", amount: 2400 })]);
    const c = cmp(l, s);
    expect(c.status).toBe("insufficient");
    expect(c.bench?.proxy?.benchmark).toBe(2400);
    expect(c.includedInIndex).toBe(false);
  });

  it("M9960: M9660 evidence is held back until the model is confirmed", () => {
    const l = line({ profileId: "pm9960", profileName: "ALUMIL M9960 חלון ציר נטוי", unitPrice: "3200", widthCm: "100", heightCm: "120" });
    const evidence = [ev({ seller: "מתקין אלומיל", seriesOnPage: "M9660", amount: 3000 })];
    const before = computeLineBenchmark(snap(l, evidence));
    expect(before.status).toBe("insufficient");
    expect(before.evaluations[0].pool).toBe("proxy");
    expect(before.evaluations[0].notes.join(" ")).toMatch(/נדרש אימות דגם/);
    const after = computeLineBenchmark(snap({ ...l, marketInputs: { seriesConfirmed: "M9660" } }, evidence));
    expect(after).toMatchObject({ status: "ok", basis: "single_source", benchmark: 3000 });
  });

  it("linear-metre shutter box and per-unit cylinder keep their own units", () => {
    const box = line({ profileName: "ארגז תריס", manualUnitPrice: "900", priceBasis: "per_unit", widthCm: "250", qty: "2" });
    const boxSnap = snap(box, [ev({ unit: "linear_m", amount: 320 }), ev({ seller: "אחר", unit: "m2", amount: 1000 })]);
    const c = cmp(box, boxSnap);
    expect(c.our.unit).toBe("linear_m");
    expect(c.our.billableQty).toBe(5);
    expect(c.our.rate).toBeCloseTo(360, 6); // 1800 / 5 m
    expect(c.bench?.benchmark).toBe(320);
    expect(c.bench?.evaluations[1].included).toBe(false);
    expect(c.diffPercent).toBeCloseTo(12.5, 6);

    const cyl = line({ profileName: "צילינדר", manualUnitPrice: "120", priceBasis: "per_unit", qty: "3" });
    const cc = cmp(cyl, snap(cyl, [ev({ unit: "unit", amount: 100 }), ev({ seller: "x", unit: "m2", amount: 100 })]));
    expect(cc.our).toMatchObject({ unit: "unit", billableQty: 3, rate: 120 });
    expect(cc.bench?.sellerCount).toBe(1);
    expect(cc.marketTotal).toBe(300);
  });
});

describe("quotation index", () => {
  it("matches the worked example: 21,000 vs 20,000 → index 105, +₪1,000, +5%, 70% coverage", () => {
    const a = line({ profileName: "7300 זכוכית ורשת", unitPrice: "3500", widthCm: "200", heightCm: "150", qty: "2" }); // 6 m² × 3500 = 21,000
    const other = line({ profileName: "פרגולה", manualUnitPrice: "9000", priceBasis: "per_unit" }); // not comparable
    const items = [a, other];
    const money = quoteMoney({ lines: items, freeForm: [], taxPercentText: "18" });
    const comps = [cmp(a, snap(a, [ev({ amount: 20000 / 6 })])), cmp(other, undefined)];
    const s = summarizeQuote({ items, comparisons: comps, freeFormAdditions: [], money });
    expect(s.index).toBeCloseTo(105, 9);
    expect(s.diff).toBeCloseTo(1000, 6);
    expect(s.diffPercent).toBeCloseTo(5, 9);
    expect(s.valueCoverage).toBeCloseTo(0.7, 9);
    expect(s.matchedLines).toBe(1);
  });

  it("mixed quotation: discount allocated proportionally, repeated items extended once, partial coverage", () => {
    const w1 = line({ profileName: "7300 זכוכית ורשת", unitPrice: "2000", widthCm: "100", heightCm: "100", qty: "3" }); // 6,000
    const w1dup = { ...w1, id: "dup" }; // repeated line, same spec → same research key
    const cyl = line({ profileName: "צילינדר", manualUnitPrice: "150", priceBasis: "per_unit", qty: "4" }); // 600
    const s350 = line({ profileId: "ps350", profileName: "ALUMIL S350 זכוכית בידודית", unitPrice: "3000", widthCm: "200", heightCm: "200" }); // 12,000
    const items = [w1, w1dup, cyl, s350];
    const additions = [{ id: "f", name: "פירוק והובלה", price: "1400", qty: "1" }];
    const money = quoteMoney({ lines: items, freeForm: additions, taxPercentText: "18", discountPercentText: "10" });
    expect(money.sub).toBe(26000);
    expect(money.net).toBe(23400);
    const d = money.discountRate;
    const s1 = snap(w1, [ev({ amount: 1500 }), ev({ seller: "שני", amount: 2100 })]); // median 1800
    expect(researchKey(s1.spec)).toBe(researchKey(buildMarketSpec(w1dup, ctx).spec));
    const comps = [
      cmp(w1, s1, d),
      cmp(w1dup, { ...s1 }, d),
      cmp(cyl, snap(cyl, [ev({ unit: "unit", amount: 150 })]), d),
      cmp(s350, snap(s350, [ev({ matchLevel: "proxy", amount: 2500 })]), d),
    ];
    // Line: 6,000 × 0.9 = 5,400 for 3 m² → 1,800/m², equal to the market.
    expect(comps[0].our.rate).toBeCloseTo(1800, 6);
    expect(comps[0].diffPercent).toBeCloseTo(0, 6);
    expect(comps[2].diffPercent).toBeCloseTo(-10, 6); // 135 vs 150
    const sum = summarizeQuote({ items, comparisons: comps, freeFormAdditions: additions, money });
    const our = 5400 + 5400 + 540;
    const market = 1800 * 3 + 1800 * 3 + 150 * 4;
    expect(sum.ourMatched).toBeCloseTo(our, 6);
    expect(sum.marketMatched).toBeCloseTo(market, 6);
    expect(sum.index).toBeCloseTo((100 * our) / market, 9);
    // Not the average of line percentages (0, 0, −10 → −3.33).
    expect(sum.diffPercent).not.toBeCloseTo(-10 / 3, 2);
    expect(sum.matchedLines).toBe(3);
    expect(sum.totalLines).toBe(5);
    expect(sum.valueCoverage).toBeCloseTo(our / 23400, 9);
    expect(sum.excluded.map((x) => x.reason)).toEqual(["קיים רק קירוב ממערכת אחרת — לא נכלל במדד"]);
  });

  it("an edited specification marks the stored comparison outdated and removes it from the index", () => {
    const l = line({ profileName: "7300 זכוכית ורשת", unitPrice: "2000", widthCm: "100", heightCm: "100" });
    const s = snap(l, [ev({ amount: 1800 })]);
    expect(cmp(l, s).includedInIndex).toBe(true);
    const edited = { ...l, widthCm: "140" };
    const c = cmp(edited, s);
    expect(c.outdated).toBe(true);
    expect(c.includedInIndex).toBe(false);
    expect(c.bench?.benchmark).toBe(1800); // the stored result stays visible
  });

  it("a failed refresh keeps the previous result and its date", () => {
    const l = line({ profileName: "7300 זכוכית ורשת", unitPrice: "2000", widthCm: "100", heightCm: "100" });
    const s: MarketLineSnapshot = { ...snap(l, [ev({ amount: 1800 })]), lastError: { code: "provider_error", message: "x", at: "2026-11-25T00:00:00Z" } };
    const c = cmp(l, s);
    expect(c.status).toBe("ok");
    expect(c.includedInIndex).toBe(true);
    const empty: MarketLineSnapshot = { ...s, evidence: [] };
    expect(cmp(l, empty).status).toBe("error_only");
  });
});

describe("the quotation itself is untouched", () => {
  it("market data never changes line totals, quotation totals or the customer PDF line", () => {
    const l = line({ profileName: "7300 זכוכית ורשת", unitPrice: "2000", widthCm: "100", heightCm: "100", addons: [motorAddon(true)] });
    const withMarket: LineItem = { ...l, marketCheck: snap(l, [ev({ amount: 1800 })]), marketInputs: { screenAreaM2: "0.5" } };
    expect(quoteMoney({ lines: [withMarket], taxPercentText: "18", discountPercentText: "5" })).toEqual(
      quoteMoney({ lines: [l], taxPercentText: "18", discountPercentText: "5" })
    );
    const pdfItem = toCustomerPdfItem(withMarket) as unknown as Record<string, unknown>;
    expect(pdfItem.marketCheck).toBeUndefined();
    expect(pdfItem.marketInputs).toBeUndefined();
    expect(JSON.stringify(pdfItem)).not.toMatch(/fixture|מחיר שוק/);
  });

  it("our price follows the stored per-unit rate vs. per-m² rate exactly once", () => {
    const perM2 = line({ unitPrice: "1000", widthCm: "200", heightCm: "100", qty: "2", profileName: "7300" });
    expect(ourPrice(perM2, "m2", 0)).toMatchObject({ rate: 1000, billableQty: 4, effectiveTotal: 4000 });
    const perUnit = line({ manualUnitPrice: "2500", priceBasis: "per_unit", widthCm: "200", heightCm: "100", qty: "2", profileName: "7300" });
    // 2 pieces × ₪2,500 over 2 × 2 m² → ₪1,250/m²
    expect(ourPrice(perUnit, "m2", 0)).toMatchObject({ rate: 1250, billableQty: 4, effectiveTotal: 5000 });
    expect(ourPrice(perUnit, "opening", 0.1)).toMatchObject({ rate: 2250, billableQty: 2, effectiveTotal: 4500 });
  });
});

// Type-only use to keep the import (MarketSpec documents the snapshot shape in this file).
export type _Spec = MarketSpec;
