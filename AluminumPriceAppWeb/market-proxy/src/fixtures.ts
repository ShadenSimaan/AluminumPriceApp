// FIXTURE MODE ONLY (MARKET_FIXTURES=1). Deterministic, clearly fake evidence for testing the app workflow
// without a provider key. Responses carry source: "fixture" and every row verification: "fixture";
// the app labels them "נתוני בדיקה (לא חי)". Sellers and URLs are fictitious (.invalid domain).
import { MARKET_CONTRACT_VERSION, type MarketEvidence, type MarketResearchResponse, type MarketSpec } from "../../src/market/contract.ts";

function row(i: number, p: Partial<MarketEvidence>): MarketEvidence {
  return {
    id: `fixture-${i}`,
    seller: `ספק בדיקה ${String.fromCharCode(0x05d0 + i)}`,
    sellerType: "installer",
    url: `https://fixture.invalid/source-${i}`,
    pageTitle: "FIXTURE — לא מקור אמיתי",
    observedPriceText: "FIXTURE",
    amount: 1000,
    currency: "ILS",
    unit: "m2",
    vat: "excl",
    scope: "installed",
    priceKind: "installer_price",
    matchLevel: "exact",
    specification: "נתון בדיקה",
    checkedAt: "2026-01-01T00:00:00.000Z",
    verification: "fixture",
    ...p,
  };
}

export function fixtureResponse(spec: MarketSpec, now: Date): MarketResearchResponse {
  const series = spec.seriesConfirmed ?? spec.seriesEntered;
  const ev: MarketEvidence[] = [];
  const warnings: string[] = ["FIXTURE: נתוני בדיקה בלבד — לא תוצאת חיפוש חיה"];
  let suggestedSeries: string[] | undefined;
  if (spec.category === "cylinder") {
    ev.push(row(1, { unit: "unit", amount: 140 }), row(2, { unit: "unit", amount: 177, vat: "incl" }), row(3, { unit: "m2", amount: 900 }));
  } else if (spec.category === "shutter_box") {
    ev.push(row(1, { unit: "linear_m", amount: 330 }), row(2, { unit: "linear_m", amount: 300, amountHigh: 420, priceKind: "published_range" }));
  } else if (series === "S350") {
    ev.push(row(1, { matchLevel: "proxy", seriesOnPage: "חלון תרמי גנרי", amount: 2500, priceKind: "comparable_estimate" }));
    warnings.push("לא נמצאו מחירים ל-ALUMIL S350; רק חלון תרמי כללי");
  } else if (series === "M9960") {
    ev.push(row(1, { seriesOnPage: "M9660", amount: 3100 }));
    suggestedSeries = ["M9660"];
  } else if (series === "M9660") {
    ev.push(row(1, { seriesOnPage: "M9660", amount: 3100 }), row(2, { seriesOnPage: "M9660", amount: 3540, vat: "incl" }));
  } else if (spec.shutter.type === "light_shutter" && spec.category === "window") {
    ev.push(
      row(1, { matchLevel: "component", componentRole: "window_glass", includes: ["screen"], seriesOnPage: series, amount: 1650 }),
      row(2, { matchLevel: "component", componentRole: "window_glass", includes: ["screen"], seriesOnPage: series, amount: 1850 }),
      row(3, { matchLevel: "component", componentRole: "shutter", includes: ["motor", "box"], amount: 950 }),
      row(4, { matchLevel: "component", componentRole: "motor", unit: "unit", amount: 650 }),
      row(5, { matchLevel: "exact", amount: 2300, priceKind: "starting_price", seriesOnPage: series }),
      row(6, { matchLevel: "exact", amount: 2600, minimumOrder: { value: 6, unit: "m2_total" }, seriesOnPage: series })
    );
  } else if (spec.category === "window" || spec.category === "door") {
    ev.push(
      row(1, { seriesOnPage: series, amount: 1700 }),
      row(2, { seriesOnPage: series, amount: 2124, vat: "incl" }),
      row(3, { seriesOnPage: series, amount: 1500, amountHigh: 2100, priceKind: "published_range" }),
      row(4, { seriesOnPage: series, amount: 1900, vat: "unknown" })
    );
  }
  return {
    contractVersion: MARKET_CONTRACT_VERSION,
    source: "fixture",
    provider: "fixture",
    retrievedAt: now.toISOString(),
    evidence: ev,
    assumptions: [],
    warnings,
    suggestedSeries,
    searches: 0,
    dropped: [],
  };
}
