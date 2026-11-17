import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

const publicDir = join(__dirname, "../../../public");
const logoBytes = readFileSync(join(publicDir, "brand/alum-simaan-sami-logo.png"));
const fontBytes = readFileSync(join(publicDir, "fonts/NotoSansHebrew-Regular.ttf"));

function mockFetch() {
  vi.stubGlobal("fetch", async (input: string | URL) => {
    const url = String(input);
    if (url.includes("alum-simaan-sami-logo.png")) return new Response(logoBytes);
    if (url.includes("NotoSansHebrew") || url.includes("noto-sans-hebrew")) return new Response(fontBytes);
    return new Response(null, { status: 404 });
  });
}

/** Image XObjects drawn on page 1, as width/height in pixels. */
async function imagesOnFirstPage(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPages()[0];
  const resources = page.node.Resources();
  const xobjects = resources?.lookup(PDFName.of("XObject"));
  const out: { width: number; height: number }[] = [];
  if (!xobjects || !("entries" in xobjects)) return out;
  for (const [, ref] of (xobjects as { entries: () => [unknown, unknown][] }).entries()) {
    const stream = doc.context.lookup(ref as never);
    if (stream instanceof PDFRawStream && String(stream.dict.get(PDFName.of("Subtype"))) === "/Image") {
      out.push({
        width: Number(String(stream.dict.get(PDFName.of("Width")))),
        height: Number(String(stream.dict.get(PDFName.of("Height")))),
      });
    }
  }
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("company logo in documents", () => {
  it("embeds the trimmed Alum Simaan Sami logo at its original pixel size in the quotation PDF", async () => {
    mockFetch();
    const { buildQuotePdfBytes } = await import("../../buildPdfWithPdfLib");
    const bytes = await buildQuotePdfBytes({
      title: "הצעת מחיר",
      documentType: "quote",
      quoteNumber: 7,
      customerName: "תאבר עסאף",
      customerPhone: "",
      customerEmail: "",
      notes: "",
      taxPercentText: "18",
      items: [{ widthCm: "150", heightCm: "120", qty: "1", unitPrice: "1100", addons: [], profileName: "1700" }],
      freeFormAdditions: [],
    });
    const images = await imagesOnFirstPage(bytes);
    expect(images).toContainEqual({ width: 944, height: 716 });
  });

  it("embeds the same logo in the supplier request PDF", async () => {
    mockFetch();
    const { buildRfqPdfBytes } = await import("../../rfq/pdf/rfqPdf");
    const { sampleRequest } = await import("../../rfq/__tests__/fixtures");
    const bytes = await buildRfqPdfBytes(sampleRequest(), { lang: "he", fontBytes });
    const images = await imagesOnFirstPage(bytes);
    expect(images).toContainEqual({ width: 944, height: 716 });
  });

  it("still builds the supplier request PDF when the logo cannot be loaded", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 404 }));
    const { buildRfqPdfBytes } = await import("../../rfq/pdf/rfqPdf");
    const { sampleRequest } = await import("../../rfq/__tests__/fixtures");
    const bytes = await buildRfqPdfBytes(sampleRequest(), { lang: "en", fontBytes });
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
