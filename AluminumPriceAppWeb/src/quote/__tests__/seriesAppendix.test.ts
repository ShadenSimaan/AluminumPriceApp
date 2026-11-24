import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildQuotePdfBytes } from "../../buildPdfWithPdfLib";
import type { PdfQuotePayload } from "../../pdfExporter";
import { createRfqItem } from "../../rfq/presets";
import { toCustomerPdfItem } from "../customerPayload";
import { lineItemFromWindow, withSubtotal } from "../windowLine";
import { appendixSummary, computeAppendixPlan, explainGlassFormula, hasAppendix } from "../series/appendix";
import { SERIES_CATALOG } from "../series/catalog";
import { matchItemSeries } from "../series/matching";
import { PALETTES, paletteSwatchCount } from "../series/palettes";
import { defaultSeriesAppendix, normalizeSeriesAppendix } from "../series/settings";

const KLIL = { id: "mfr-klil", name: "קליל", logoUrl: "/brand/klil-logo.png" };
const ALUMIL = { id: "mfr-alumil", name: "Alumil", logoUrl: "/brand/alumil-logo.png" };

function configuredLine(opts: {
  id: string;
  openingType: "hinged_door_single" | "fixed_window" | "sliding_door" | "sliding_window";
  profileName: string;
  glass?: string;
  frameFinish?: string;
  details?: string;
  addons?: { name: string; price: string; checked: boolean }[];
  manufacturer?: { id: string; name: string; logoUrl: string };
  seriesRefs?: string[];
  location?: string;
}) {
  const cfg = createRfqItem({
    id: opts.id,
    openingType: opts.openingType,
    unit: "mm",
    reference: opts.id,
    withDefaultSize: false,
  });
  cfg.widthCm = 90;
  cfg.heightCm = 210;
  cfg.glass = opts.glass ?? "";
  cfg.frameFinish = opts.frameFinish ?? "";
  cfg.location = opts.location ?? "";
  const line = withSubtotal(
    lineItemFromWindow(cfg, [], {
      profileName: opts.profileName,
      unitPrice: "0",
      priceBasis: "per_unit",
      details: opts.details ?? "",
    })
  );
  return {
    ...toCustomerPdfItem(
      withSubtotal({
        ...line,
        qty: "1",
        manualUnitPrice: "1000",
        priceBasis: "per_unit",
        addons: opts.addons ?? [],
        seriesRefs: opts.seriesRefs,
      })
    ),
    manufacturer: opts.manufacturer,
  };
}

function installAssetFetch() {
  const font = readFileSync("public/fonts/NotoSansHebrew-Regular.ttf");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const tryFile = (rel: string) => {
      try {
        const bytes = readFileSync(rel);
        const type = rel.endsWith(".png") ? "image/png" : rel.endsWith(".jpg") || rel.endsWith(".jpeg") ? "image/jpeg" : "application/octet-stream";
        return new Response(bytes, { status: 200, headers: { "Content-Type": type } });
      } catch {
        return new Response(null, { status: 404 });
      }
    };
    if (url.includes("NotoSansHebrew") || url.includes("/fonts/")) {
      return new Response(font, { status: 200, headers: { "Content-Type": "font/ttf" } });
    }
    for (const prefix of ["/brand/", "/series/"]) {
      if (url.includes(prefix)) {
        const path = url.split(prefix)[1].split(/[?#]/)[0];
        return tryFile(`public${prefix}${path}`);
      }
    }
    if (url.includes("signature")) return tryFile("public/fonts/signature.png");
    return originalFetch(input, init);
  }) as typeof fetch;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

describe("series matching", () => {
  it("matches bare KLIL code in the profile field only", () => {
    expect(matchItemSeries({ profileName: "4400", manufacturer: KLIL }).seriesKeys).toEqual(["klil/4400"]);
    expect(matchItemSeries({ details: "תיקון פרופיל 4400", manufacturer: KLIL }).status).toBe("none");
    expect(matchItemSeries({ customerDescription: "חלון 4400", manufacturer: KLIL }).status).toBe("none");
  });

  it("keeps ambiguous alternatives for the estimator", () => {
    const m = matchItemSeries({ profileName: "קליל 7500-7300" });
    expect(m.status).toBe("ambiguous");
    expect(m.candidates.sort()).toEqual(["klil/7300", "klil/7500"]);
    expect(m.seriesKeys).toEqual([]);
  });

  it("does not auto-convert 440 → 4400 and leaves EKLIEN unresolved", () => {
    expect(matchItemSeries({ profileName: "440", manufacturer: KLIL }).status).not.toBe("matched");
    expect(matchItemSeries({ profileName: "EKLIEN 9960" }).status).toBe("unresolved");
  });

  it("links KLIL 1200 as an accessory on a hinged series", () => {
    const m = matchItemSeries({
      profileName: "KLIL 5600",
      addons: [{ name: "תריס רפפה 1200", price: "0", checked: true }],
    });
    expect(m.seriesKeys).toEqual(["klil/5600"]);
    expect(m.accessories).toContain("klil/1200");
    expect(m.reviewFlags.length).toBeGreaterThan(0);
  });

  it("ignores repairs, pergolas and LEDs", () => {
    expect(matchItemSeries({ profileName: "תיקון חלון 4400" }).status).toBe("excluded");
    expect(matchItemSeries({ profileName: "פרגולה אלומיניום" }).status).toBe("excluded");
  });

  it("explains laminated and insulated glass formulas", () => {
    expect(explainGlassFormula("4+4")).toMatch(/רבודה/);
    expect(explainGlassFormula("5+6+5")).toMatch(/בידודית/);
    expect(explainGlassFormula("5+6+5")).toMatch(/16/);
  });
});

describe("series appendix plan", () => {
  it("defaults off and restores missing saved fields", () => {
    expect(defaultSeriesAppendix().enabled).toBe(false);
    expect(normalizeSeriesAppendix(undefined).enabled).toBe(false);
    expect(normalizeSeriesAppendix({ enabled: true }).content.photos).toBe(true);
  });

  it("acceptance 1: one 4400 sheet for door + fixed 4+4, KLIL chart when colors on", () => {
    const items = [
      configuredLine({
        id: "d1",
        openingType: "hinged_door_single",
        profileName: "KLIL 4400",
        manufacturer: KLIL,
        location: "כניסה",
      }),
      configuredLine({
        id: "f1",
        openingType: "fixed_window",
        profileName: "KLIL 4400",
        glass: "4+4",
        manufacturer: KLIL,
        location: "צד",
      }),
    ];
    const plan = computeAppendixPlan(items, {
      enabled: true,
      excluded: [],
      content: { photos: true, glass: true, colors: true, screens: true },
    });
    expect(plan.sheets).toHaveLength(1);
    expect(plan.sheets[0].record.key).toBe("klil/4400");
    expect(plan.sheets[0].items.map((i) => i.number)).toEqual([1, 2]);
    expect(plan.sheets[0].glass).toHaveLength(1);
    expect(plan.sheets[0].glass[0].formula).toBe("4+4");
    expect(plan.sheets[0].glass[0].itemNumbers).toEqual([2]);
    expect(plan.charts).toHaveLength(1);
    expect(plan.charts[0].brand).toBe("klil");
    expect(plan.charts[0].available).toBe(true);
    expect(appendixSummary(plan)).toMatch(/דף סדרה אחד/);
    expect(appendixSummary(plan)).toMatch(/מניפת צבעים אחת/);
  });

  it("acceptance 2: three sheets / deselect / chart follows brand presence", () => {
    const items = [
      configuredLine({
        id: "s1",
        openingType: "sliding_door",
        profileName: "KLIL 7600",
        manufacturer: KLIL,
        addons: [{ name: "תריס רפפה 1200", price: "200", checked: true }],
      }),
      configuredLine({
        id: "a1",
        openingType: "sliding_door",
        profileName: "ALUMIL S350",
        manufacturer: ALUMIL,
      }),
    ];
    const on = {
      enabled: true,
      excluded: [] as string[],
      content: { photos: true, glass: true, colors: true, screens: true },
    };
    let plan = computeAppendixPlan(items, on);
    expect(plan.sheets.map((s) => s.record.key)).toEqual(["klil/7600", "alumil/S350"]);
    expect(plan.sheets[0].accessories.some((a) => a.record.key === "klil/1200")).toBe(true);
    expect(plan.charts.map((c) => c.brand).sort()).toEqual(["alumil", "klil"]);

    plan = computeAppendixPlan(items, { ...on, excluded: ["klil/7600"] });
    expect(plan.sheets.map((s) => s.record.key)).toEqual(["alumil/S350"]);
    expect(plan.charts.map((c) => c.brand)).toEqual(["alumil"]);
    expect(hasAppendix(plan)).toBe(true);

    plan = computeAppendixPlan([items[0]], { ...on, excluded: ["klil/7600"] });
    expect(hasAppendix(plan)).toBe(false);
    expect(appendixSummary(plan)).toMatch(/אין סדרות/);
  });

  it("seeds the Hebrew catalog series listed in the brief", () => {
    const codes = [
      "1700",
      "4300",
      "7300",
      "1600",
      "5600",
      "7600",
      "2600",
      "7500",
      "9000",
      "9200",
      "4400",
      "4500",
      "5500",
      "S350",
    ];
    for (const code of codes) {
      expect(SERIES_CATALOG.some((r) => r.code === code)).toBe(true);
    }
    expect(paletteSwatchCount(PALETTES.klil)).toBeGreaterThanOrEqual(46);
    expect(PALETTES.alumil.status).toBe("unavailable");
  });
});

describe("series appendix PDF", () => {
  it("appends series pages when enabled and leaves ordinary quotes unchanged when off", async () => {
    const restore = installAssetFetch();
    try {
      const items = [
        configuredLine({
          id: "d1",
          openingType: "hinged_door_single",
          profileName: "KLIL 4400",
          manufacturer: KLIL,
          frameFinish: "66F",
        }),
        configuredLine({
          id: "f1",
          openingType: "fixed_window",
          profileName: "KLIL 4400",
          glass: "4+4",
          manufacturer: KLIL,
        }),
      ];
      const base: PdfQuotePayload = {
        title: "הצעת מחיר",
        documentType: "quote",
        quoteNumber: 99,
        customerName: "בדיקת סדרות",
        customerPhone: "0500000000",
        taxPercentText: "18",
        validityText: "30 יום",
        paymentTerms: "50% מקדמה",
        installationTerms: "כולל התקנה",
        notes: "בדיקת דפי סדרה",
        items,
        freeFormAdditions: [],
        dimensionUnit: "mm",
        showTotals: true,
        includeProductDetails: false,
        pdfDateMs: Date.UTC(2026, 10, 23),
      };

      const plain = await buildQuotePdfBytes(base);
      const plainDoc = await PDFDocument.load(plain);
      expect(plainDoc.getPageCount()).toBe(1);

      const withAppendix = await buildQuotePdfBytes({
        ...base,
        seriesAppendix: {
          enabled: true,
          excluded: [],
          content: { photos: true, glass: true, colors: true, screens: true },
        },
      });
      const appendixDoc = await PDFDocument.load(withAppendix);
      // 1 pricing + ≥1 series sheet + ≥1 KLIL colour chart page
      expect(appendixDoc.getPageCount()).toBeGreaterThanOrEqual(3);
      expect(withAppendix.byteLength).toBeGreaterThan(plain.byteLength);

      const outDir = join("tmp");
      mkdirSync(outDir, { recursive: true });
      const samplePath = join(outDir, "series-appendix-sample.pdf");
      writeFileSync(samplePath, withAppendix);
      expect(readFileSync(samplePath).byteLength).toBe(withAppendix.byteLength);
    } finally {
      restore();
    }
  }, 120000);

  it("acceptance 2 PDF: three series refs produce multi-brand appendix", async () => {
    const restore = installAssetFetch();
    try {
      const items = [
        configuredLine({
          id: "k4400",
          openingType: "hinged_door_single",
          profileName: "KLIL 4400",
          manufacturer: KLIL,
        }),
        configuredLine({
          id: "k7600",
          openingType: "sliding_door",
          profileName: "KLIL 7600",
          manufacturer: KLIL,
          addons: [{ name: "תריס רפפה 1200", price: "200", checked: true }],
        }),
        configuredLine({
          id: "a350",
          openingType: "sliding_door",
          profileName: "ALUMIL SMARTIA S350",
          manufacturer: ALUMIL,
        }),
      ];
      const plan = computeAppendixPlan(items, {
        enabled: true,
        excluded: [],
        content: { photos: true, glass: true, colors: true, screens: true },
      });
      expect(plan.sheets).toHaveLength(3);
      expect(plan.charts).toHaveLength(2);

      const bytes = await buildQuotePdfBytes({
        title: "הצעת מחיר",
        documentType: "quote",
        quoteNumber: 100,
        customerName: "Acceptance 2",
        taxPercentText: "18",
        items,
        freeFormAdditions: [],
        includeProductDetails: false,
        seriesAppendix: {
          enabled: true,
          excluded: [],
          content: { photos: true, glass: true, colors: true, screens: true },
        },
        pdfDateMs: Date.UTC(2026, 10, 23),
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(4);

      const without7600 = await buildQuotePdfBytes({
        title: "הצעת מחיר",
        documentType: "quote",
        quoteNumber: 101,
        customerName: "Acceptance 2b",
        taxPercentText: "18",
        items,
        freeFormAdditions: [],
        includeProductDetails: false,
        seriesAppendix: {
          enabled: true,
          excluded: ["klil/7600"],
          content: { photos: true, glass: true, colors: true, screens: true },
        },
        pdfDateMs: Date.UTC(2026, 10, 23),
      });
      expect((await PDFDocument.load(without7600)).getPageCount()).toBeLessThan(doc.getPageCount());
    } finally {
      restore();
    }
  }, 120000);
});
