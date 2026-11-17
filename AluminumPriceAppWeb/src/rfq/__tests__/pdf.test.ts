import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFPage } from "pdf-lib";
import { buildRfqPdfBytes } from "../pdf/rfqPdf";
import { sampleRequest, item } from "./fixtures";
import { itemSpecRows } from "../i18n";
import { newPanel, parseLayoutNotation } from "../layout";

const fontBytes = readFileSync(join(__dirname, "../../../public/fonts/NotoSansHebrew-Regular.ttf"));
const outDir = process.env.RFQ_PDF_OUT;

async function build(lang: "en" | "he", req = sampleRequest(), name = `rfq-${lang}`) {
  const bytes = await buildRfqPdfBytes(req, { lang, fontBytes });
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${name}.pdf`), bytes);
  }
  return bytes;
}

/** Captures every string drawn on any page (in drawing order). */
function captureText() {
  const drawn: string[] = [];
  const orig = PDFPage.prototype.drawText;
  vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
    drawn.push(text);
    return orig.call(this, text, options);
  });
  return drawn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RFQ PDF", () => {
  it("builds multipage A4 English and Hebrew documents", async () => {
    for (const lang of ["en", "he"] as const) {
      const doc = await PDFDocument.load(await build(lang));
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
      for (const p of doc.getPages()) {
        expect(p.getWidth()).toBeCloseTo(595.28, 1);
        expect(p.getHeight()).toBeCloseTo(841.89, 1);
      }
    }
  });

  it("contains no pricing, tax or quotation/payment wording", async () => {
    for (const lang of ["en", "he"] as const) {
      const drawn = captureText();
      await build(lang);
      const all = drawn.join("");
      expect(all).not.toMatch(/\bVAT\b|Subtotal|Discount|Margin|\bILS\b|\u20aa|Payment request|Grand total|Total price/i);
      for (const he of ["מע״מ", "סה״כ לתשלום", "חשבון עסקה", "הנחה"]) {
        expect(all).not.toContain(he);
        expect(all).not.toContain(Array.from(he).reverse().join(""));
      }
      vi.restoreAllMocks();
    }
  });

  it("shows page numbers on every page and both quantity figures", async () => {
    const drawn = captureText();
    const bytes = await build("en");
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    const all = drawn.join("\n");
    for (let p = 1; p <= pages; p++) expect(all).toContain(`Page ${p} of ${pages}`);
    expect(all).toContain("Different item designs");
    expect(all).toContain("Total units (all quantities)");
    expect(all).toContain("1200 mm");
  });

  it("explains every division of a door with side lights and a top light", async () => {
    const layout = parseLayoutNotation("(F:980/F):450|(F:980/(OL|OR)):1970|(F:980/F)", "mm", (p) =>
      p.fixed ? newPanel("fixed") : newPanel("hinged", { hingeSide: p.side ?? "left" })
    );
    const req = sampleRequest();
    req.items = [item("hinged_door_double", { reference: "W-01", widthCm: 287, heightCm: 328, layout })];
    const lines = itemSpecRows("en", req.items[0]).map((r) => `${r.label}|${r.value}`);
    expect(lines).toContain("Vertical divisions (mullions)|3");
    expect(lines.some((l) => l.replace(/[\u2066-\u2069]/g, "").includes("At 450 mm from the left — full height"))).toBe(true);
    expect(lines.some((l) => l.replace(/[\u2066-\u2069]/g, "").includes("At 980 mm from the top — full width"))).toBe(true);
    expect(lines.some((l) => /between P4 \(left\) and P5 \(right\) only/.test(l.replace(/[\u2066-\u2069]/g, "")))).toBe(true);
    expect(lines.some((l) => l.replace(/[\u2066-\u2069]/g, "") === "Widths, left to right|450 | 985 | 985 | 450 mm")).toBe(true);
    expect(lines.some((l) => l.replace(/[\u2066-\u2069]/g, "") === "Heights, top to bottom|980 | 2300 mm")).toBe(true);
    expect(lines.some((l) => /top-left.*450 × 980 mm/.test(l.replace(/[\u2066-\u2069]/g, "")))).toBe(true);
    expect(lines.some((l) => /bottom-left.*450 × 2300 mm/.test(l.replace(/[\u2066-\u2069]/g, "")))).toBe(true);
    for (const lang of ["en", "he"] as const) await build(lang, req, `rfq-${lang}-door-divisions`);
  });

  it("embeds a custom item's reference image instead of a standard diagram", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const req = sampleRequest();
    req.items = [
      item("custom", {
        reference: "C-01",
        customDescription: "Arched window",
        referenceImage: { name: "a.png", mime: "image/png", dataUrl: `data:image/png;base64,${png}` },
      }),
    ];
    const spy = vi.spyOn(PDFPage.prototype, "drawImage");
    await build("en", req, "rfq-en-image");
    expect(spy).toHaveBeenCalled();
  });

  it("paginates many items with long notes without errors", async () => {
    const req = sampleRequest();
    req.items = Array.from({ length: 40 }, (_, i) =>
      item(i % 2 ? "sliding_window" : "hinged_door_single", {
        reference: `R-${i + 1}`,
        widthCm: 50 + i * 7,
        heightCm: 100 + i,
        // Item 1 has notes longer than a full page to exercise page breaks inside one value
        notes: (i % 2 ? "הערה ארוכה מאוד " : "Long note ").repeat(i === 0 ? 900 : i % 5 === 0 ? 160 : 3),
      })
    );
    const drawn: { y: number }[] = [];
    const orig = PDFPage.prototype.drawText;
    vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
      drawn.push({ y: options?.y ?? 0 });
      return orig.call(this, text, options);
    });
    const doc = await PDFDocument.load(await build("he", req, "rfq-he-long"));
    expect(doc.getPageCount()).toBeGreaterThan(8);
    // Nothing may be drawn below the footer line or above the top margin (no clipped content)
    expect(Math.min(...drawn.map((d) => d.y))).toBeGreaterThanOrEqual(38);
    expect(Math.max(...drawn.map((d) => d.y))).toBeLessThanOrEqual(841.89 - 30);
  }, 30_000);
});
