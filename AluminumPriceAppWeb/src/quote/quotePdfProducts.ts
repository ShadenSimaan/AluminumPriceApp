import { PDFDocument, rgb, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { eklienLogoKind, loadEklienLogoBytes, mentionsEklien } from "./eklienLogo";
import type { PdfLineItem } from "../pdfExporter";
import { buildDiagram } from "../rfq/diagram";
import { dict } from "../rfq/i18n";
import { drawDiagramPdf, type ImageCache } from "../rfq/pdf/pdfDiagram";
import { drawLine, wrap, type PdfFonts } from "../rfq/pdf/pdfText";
import { compactProductCardRows, customerPdfGeneralNotes } from "./customerSpecs";
import { lineQuantity } from "./pricing";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36;
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 28;
const BOTTOM = M + FOOTER_H;

const INK: RGB = rgb(0.09, 0.12, 0.18);
const MUTED: RGB = rgb(0.38, 0.43, 0.5);
const ACCENT: RGB = rgb(0.03, 0.4, 0.62);
const RULE: RGB = rgb(0.78, 0.82, 0.87);
const FILL: RGB = rgb(0.94, 0.97, 1);
const CARD_BG: RGB = rgb(0.985, 0.988, 0.992);

type Row = { label: string; value: string; ltr?: boolean; strong?: boolean };

/** Items that get a detail block: the ones with a window configuration to draw. */
export function productDetailItems(items: PdfLineItem[]): PdfLineItem[] {
  return items.filter((item) => item.configuration);
}

/**
 * Compact product appendix: horizontal cards (drawing + short specs), ~2–3 per A4 page.
 * Shared drawing disclaimers go once at the end. Page numbers are stamped on every page.
 */
export async function drawQuoteProducts(args: {
  doc: PDFDocument;
  fonts: PdfFonts;
  items: PdfLineItem[];
  /** Optional footer label (quote number / customer) shown on product pages. */
  footerLabel?: string;
}): Promise<void> {
  const { doc, fonts, footerLabel } = args;
  const items = productDetailItems(args.items);
  if (!items.length) return;
  const d = dict("he");
  const cache: ImageCache = new Map();
  let eklien: PDFImage | null = null;
  if (items.some(mentionsEklien)) {
    const bytes = await loadEklienLogoBytes();
    const kind = bytes ? eklienLogoKind(bytes) : null;
    if (bytes && kind) eklien = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  }

  const productPages: PDFPage[] = [];
  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  productPages.push(page);
  let y = PAGE_H - M;

  const boxLeft = (off: number, w: number) => PAGE_W - M - off - w;
  const textAt = (
    text: string,
    off: number,
    w: number,
    baseline: number,
    o: { size: number; bold?: boolean; color?: RGB; align?: "start" | "end" | "center"; ltr?: boolean }
  ) => {
    const left = boxLeft(off, w);
    const align = o.align === "center" ? "center" : o.align === "end" ? "left" : "right";
    const x = align === "center" ? left + w / 2 : align === "left" ? left : left + w;
    drawLine(page, fonts, text, x, baseline, {
      size: o.size,
      bold: o.bold,
      color: o.color ?? INK,
      align,
      docRtl: true,
      forceRtl: o.ltr ? false : undefined,
    });
  };

  const addPage = (continued: boolean) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    productPages.push(page);
    y = PAGE_H - M;
    if (continued) {
      textAt("פירוט מוצרים — המשך", 0, CONTENT_W, y - 9, { size: 9, color: MUTED });
      page.drawLine({ start: { x: M, y: y - 15 }, end: { x: PAGE_W - M, y: y - 15 }, thickness: 0.6, color: RULE });
      y -= 26;
    }
  };

  textAt("פירוט מוצרים", 0, CONTENT_W, y - 12, { size: 13, bold: true, color: ACCENT });
  y -= 18;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 1, color: ACCENT });
  y -= 12;

  // Compact card geometry: fit 2–3 readable cards per page.
  const DW = 168;
  const DH = 148;
  const GAP = 10;
  const BAR_H = 16;
  const SS = 7.8;
  const SLH = 10.2;
  const labelW = 72;
  const PAD = 8;
  const CARD_GAP = 12;

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const cfg = item.configuration!;
    const qty = lineQuantity(item);
    const rows: Row[] = compactProductCardRows(item);
    const tall = !!(cfg.widthCm && cfg.heightCm && cfg.heightCm > cfg.widthCm * 1.15);
    const drawH = tall ? 168 : DH;
    const drawW = DW;
    const specOff = drawW + GAP;
    const specW = CONTENT_W - specOff - PAD;
    const valueW = Math.max(40, specW - labelW - 4);

    const laid = rows.map((row) => {
      const labelLines = wrap(row.label, fonts, SS, labelW, true);
      const valueLines = wrap(row.value, fonts, SS, valueW, row.strong);
      return {
        ...row,
        labelLines,
        valueLines,
        h: Math.max(labelLines.length, valueLines.length, 1) * SLH + 1.5,
      };
    });
    const specsH = laid.reduce((sum, row) => sum + row.h, 0);
    const bodyH = Math.max(drawH + 12, specsH) + PAD;
    const cardH = BAR_H + bodyH + 4;

    if (y - cardH < BOTTOM) addPage(true);

    const cardTop = y;
    const cardBottom = y - cardH;
    page.drawRectangle({
      x: M,
      y: cardBottom,
      width: CONTENT_W,
      height: cardH,
      color: CARD_BG,
      borderColor: RULE,
      borderWidth: 0.7,
    });

    // Title bar
    page.drawRectangle({
      x: M,
      y: cardTop - BAR_H,
      width: CONTENT_W,
      height: BAR_H,
      color: FILL,
      borderColor: RULE,
      borderWidth: 0.5,
    });
    const title = `${index + 1}. ${cfg.reference || item.profileName || "פריט"} — ${
      item.customerDescription || d.openingType[cfg.openingType]
    }`;
    const brandW = eklien && mentionsEklien(item) ? (eklien.width / eklien.height) * 11 : 0;
    textAt(`${d.ui.quantity}: ${qty}`, 6, CONTENT_W - 12, cardTop - 11.5, { size: 8.5, bold: true, align: "end" });
    if (brandW) page.drawImage(eklien!, { x: M + 56, y: cardTop - 13.5, width: brandW, height: 11 });
    textAt(title, 6, CONTENT_W - 70 - brandW, cardTop - 11.5, { size: 8.5, bold: true });

    const bodyTop = cardTop - BAR_H - 4;

    // Drawing on the reading-start side (right in RTL)
    const diagX = boxLeft(PAD, drawW);
    page.drawRectangle({
      x: diagX,
      y: bodyTop - drawH,
      width: drawW,
      height: drawH,
      color: rgb(1, 1, 1),
      borderColor: RULE,
      borderWidth: 0.45,
    });
    const spec = buildDiagram(cfg, {
      width: drawW,
      height: drawH,
      customPlaceholder: "שרטוט מצורף",
      showDivisionDims: cfg.openingType !== "custom",
    });
    await drawDiagramPdf(doc, page, spec, diagX, bodyTop, fonts, cache);
    textAt(d.ui.viewedFromOutside, PAD, drawW, bodyTop - drawH - 9, {
      size: 6.5,
      color: MUTED,
      align: "center",
    });

    // Spec table beside the drawing
    let sy = bodyTop - 2;
    for (const row of laid) {
      row.labelLines.forEach((line, i) =>
        textAt(line, specOff, labelW, sy - 8 - i * SLH, { size: SS, bold: true, color: MUTED })
      );
      row.valueLines.forEach((line, i) =>
        textAt(line, specOff + labelW + 4, valueW, sy - 8 - i * SLH, {
          size: SS,
          bold: row.strong,
          color: row.strong ? ACCENT : INK,
          ltr: row.ltr,
        })
      );
      sy -= row.h;
      page.drawLine({
        start: { x: boxLeft(specOff, specW), y: sy + 0.5 },
        end: { x: boxLeft(specOff, specW) + specW, y: sy + 0.5 },
        thickness: 0.25,
        color: RULE,
      });
    }

    y = cardBottom - CARD_GAP;
  }

  // General notes once (drawing disclaimer + shared layout note)
  const notes = customerPdfGeneralNotes();
  const noteLines = notes.flatMap((n) => wrap(n, fonts, 7.5, CONTENT_W - 8));
  const notesH = 18 + noteLines.length * 10 + 8;
  if (y - notesH < BOTTOM) addPage(true);
  textAt("הערות כלליות לשרטוטים", 0, CONTENT_W, y - 10, { size: 9, bold: true, color: ACCENT });
  y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: RULE });
  y -= 10;
  for (const line of noteLines) {
    if (y - 10 < BOTTOM) addPage(true);
    textAt(line, 4, CONTENT_W - 8, y - 8, { size: 7.5, color: MUTED });
    y -= 10;
  }

  // Page numbers for the whole document (including these appendix pages) are stamped by buildQuotePdfBytes.
  void footerLabel;
  void productPages;
}
