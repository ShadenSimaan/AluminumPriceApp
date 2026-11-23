import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { buildQuotePdfBytes } from "../../buildPdfWithPdfLib";
import { toCustomerPdfItem } from "../customerPayload";
import { compactProductCardRows, customerPdfGeneralNotes, essentialProductSpecRows } from "../customerSpecs";
import { createRfqItem } from "../../rfq/presets";
import { lineItemFromWindow, withSubtotal } from "../windowLine";
import type { PdfQuotePayload } from "../../pdfExporter";

function sampleLine(ref: string, openingType: "sliding_window" | "casement_window", w: number, h: number, price: number) {
  const cfg = createRfqItem({ id: ref, openingType, unit: "mm", reference: ref, withDefaultSize: false });
  cfg.widthCm = w / 10;
  cfg.heightCm = h / 10;
  cfg.frameFinish = "Gray";
  cfg.glass = "5+12A+5 Low-E";
  const line = withSubtotal(
    lineItemFromWindow(cfg, [], {
      profileName: `EKLIEN · ${openingType === "sliding_window" ? "SWR110" : "AWR75"}`,
      unitPrice: "0",
      priceBasis: "per_unit",
      details: "",
    })
  );
  return withSubtotal({ ...line, qty: "1", manualUnitPrice: String(price), priceBasis: "per_unit" });
}

describe("customer PDF product cards", () => {
  it("keeps only essential specs and drops layout essays", () => {
    const item = createRfqItem({ id: "1", openingType: "sliding_window", unit: "mm", reference: "W-01", withDefaultSize: true });
    const rows = essentialProductSpecRows(item);
    const labels = rows.map((r) => r.label);
    expect(labels).toContain("סוג פתיחה");
    expect(labels.some((l) => l.includes("חלוקה") || l.includes("Layout"))).toBe(false);
    expect(rows.every((r) => r.value.trim())).toBe(true);
  });

  it("prints shared drawing notes once", () => {
    const notes = customerPdfGeneralNotes();
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(notes.join(" ")).toMatch(/שרטוט/);
  });

  it("builds a multi-product PDF with page numbers and compact cards", async () => {
    const font = readFileSync("public/fonts/NotoSansHebrew-Regular.ttf");
    // Patch fetch for Node so logo/font loaders that hit /fonts still work when possible.
    const items = [
      sampleLine("W-01", "sliding_window", 1600, 1125, 1500),
      sampleLine("W-02", "sliding_window", 1590, 1125, 1500),
      sampleLine("W-03", "casement_window", 805, 1065, 900),
      sampleLine("W-04", "casement_window", 570, 805, 900),
      sampleLine("W-05", "sliding_window", 1720, 1010, 1600),
      sampleLine("W-06", "casement_window", 585, 825, 900),
    ].map(toCustomerPdfItem);

    const card = compactProductCardRows(items[0]);
    expect(card.some((r) => r.label === "מזהה" && r.value === "W-01")).toBe(true);
    expect(card.some((r) => r.label === "מידות")).toBe(true);
    expect(card.some((r) => r.label.includes("מחיר"))).toBe(true);

    const payload: PdfQuotePayload = {
      title: "הצעת מחיר",
      documentType: "quote",
      quoteNumber: 1,
      customerName: "Thaber Assaf",
      customerPhone: "0500000000",
      taxPercentText: "18",
      validityText: "30 יום",
      paymentTerms: "50% מקדמה",
      installationTerms: "כולל התקנה",
      notes: "הצעה לדוגמה",
      items,
      freeFormAdditions: [{ id: "a1", name: "משלוח", price: "500", qty: "1" }],
      dimensionUnit: "mm",
      showTotals: true,
      pdfDateMs: Date.UTC(2026, 10, 16),
    };

    // Ensure local font path works under vitest (file URL base).
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("NotoSansHebrew") || url.includes("/fonts/")) {
        return new Response(font, { status: 200, headers: { "Content-Type": "font/ttf" } });
      }
      if (url.includes("/brand/")) {
        try {
          const bytes = readFileSync(`public/brand/${url.split("/brand/")[1].split(/[?#]/)[0]}`);
          return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
        } catch {
          return new Response(null, { status: 404 });
        }
      }
      if (url.includes("eklien")) {
        try {
          const bytes = readFileSync("public/brand/eklien-logo.jpg");
          return new Response(bytes, { status: 200, headers: { "Content-Type": "image/jpeg" } });
        } catch {
          return new Response(null, { status: 404 });
        }
      }
      if (url.includes("signature")) {
        try {
          const bytes = readFileSync("public/fonts/signature.png");
          return new Response(bytes, { status: 200, headers: { "Content-Type": "image/png" } });
        } catch {
          return new Response(null, { status: 404 });
        }
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const bytes = await buildQuotePdfBytes(payload);
      expect(bytes.byteLength).toBeGreaterThan(5000);
      const doc = await PDFDocument.load(bytes);
      // Pricing page + product appendix: 6 compact cards should not need 6+ product pages.
      expect(doc.getPageCount()).toBeLessThanOrEqual(5);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);

      const withoutDrawings = await buildQuotePdfBytes({ ...payload, includeProductDetails: false });
      const shortDoc = await PDFDocument.load(withoutDrawings);
      expect(shortDoc.getPageCount()).toBe(1);
      expect(withoutDrawings.byteLength).toBeLessThan(bytes.byteLength);

      // Company logos: Alumil on some lines, קליל on others, none on the rest.
      const alumil = { id: "mfr-alumil", name: "Alumil", logoUrl: "/brand/alumil-logo.png" };
      const klil = { id: "mfr-klil", name: "קליל", logoUrl: "/brand/klil-logo.png" };
      const branded = items.map((it, i) => ({ ...it, manufacturer: i < 2 ? alumil : i < 4 ? klil : undefined }));
      const plain = await buildQuotePdfBytes({ ...payload, items: items.map((it) => ({ ...it, manufacturer: undefined })) });
      const withLogos = await buildQuotePdfBytes({ ...payload, items: branded });
      const imageCount = (b: Uint8Array) => (Buffer.from(b).toString("latin1").match(/\/Subtype\s*\/Image/g) ?? []).length;
      // Each transparent PNG logo is embedded once (image + alpha mask), however many rows use it.
      expect(imageCount(withLogos)).toBe(imageCount(plain) + 4);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 60000);
});
