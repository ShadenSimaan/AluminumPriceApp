/**
 * Build quote PDF with pdf-lib + @pdf-lib/fontkit.
 * Uses Hebrew font (WOFF2/TTF) from CDN – proper Unicode/Identity-H support, no local fonts needed.
 * Implements RTL (Right-to-Left) reversal so Hebrew displays correctly.
 */
import type { PdfQuotePayload, PdfLineItem, PdfFreeFormAddition } from "./pdfExporter";
import { documentTypeLabel, normalizeDocumentType } from "./types";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;

// Prefer TTF for PDF embedding – WOFF/WOFF2 often render as dots on iOS/Android PDF viewers.
// Fallback to WOFF2/WOFF if TTF fails (e.g. CORS or network).
const HEBREW_FONT_URLS = [
  "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanshebrew/NotoSansHebrew%5Bwdth%2Cwght%5D.ttf",
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-hebrew@5.2.8/files/noto-sans-hebrew-hebrew-400-normal.woff2",
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-hebrew@5.2.8/files/noto-sans-hebrew-hebrew-400-normal.woff",
];

/** Match Hebrew and symbols like ₪ */
const HEBREW_OR_SYMBOL = /[\u0590-\u05FF\uFB1D-\uFB4F\u20AA]/;

/** Reverse word order for RTL – words are correct but sentence order is opposite. */
function reverseWordOrder(text: string): string {
  if (!text || !HEBREW_OR_SYMBOL.test(text)) return text;
  return text.split(/\s+/).reverse().join(" ");
}

/** True if segment should use Hebrew font (has Hebrew or ₪) */
function useHebrewFont(text: string): boolean {
  if (!text) return false;
  return HEBREW_OR_SYMBOL.test(text);
}

/** Split text into segments: Hebrew/symbol vs Latin/digits (for font switching). */
/** Trailing colons (:) stay with preceding Hebrew word so "מחיר:" renders correctly. */
function segmentForFonts(text: string): { text: string; useHebrew: boolean }[] {
  if (!text) return [];
  const raw: { text: string; useHebrew: boolean }[] = [];
  let current = "";
  let isHebrew = false;
  for (const c of text) {
    const heb = useHebrewFont(c);
    if (current && heb !== isHebrew) {
      raw.push({ text: current, useHebrew: isHebrew });
      current = "";
    }
    isHebrew = heb;
    current += c;
  }
  if (current) raw.push({ text: current, useHebrew: isHebrew });
  const segments: { text: string; useHebrew: boolean }[] = [];
  for (let i = 0; i < raw.length; i++) {
    const seg = raw[i];
    const next = raw[i + 1];
    // Hebrew + trailing colon: append colon so it draws after the word (correct for Hebrew label: value)
    if (seg.useHebrew && next?.text === ":" && !next.useHebrew) {
      segments.push({ text: seg.text + ":", useHebrew: true });
      i++;
    } else if (seg.text === ":" && !seg.useHebrew) {
      // Colon before Hebrew (e.g. " : פקס/טל"): find next Hebrew segment and append colon to it
      let j = i + 1;
      while (j < raw.length && !raw[j].useHebrew) j++;
      if (j < raw.length && raw[j].useHebrew) {
        for (let k = i + 1; k < j; k++) segments.push(raw[k]);
        segments.push({ text: raw[j].text + ":", useHebrew: true });
        i = j;
      } else {
        segments.push(seg);
      }
    } else {
      segments.push(seg);
    }
  }
  return mergeHebrewSentencePunctuation(segments);
}

/** ASCII / common sentence punctuation that must stay on the preceding Hebrew word for RTL draw order. */
const HEBREW_SENTENCE_PUNCT = /^[.,;:!?…\u2026]+$/u;

/**
 * pdf-lib draws segments in reverse visual order; isolated `.,` segments end up on the wrong side of words.
 * Merge them (and drop stray spaces before them) onto the previous Hebrew segment.
 */
function mergeHebrewSentencePunctuation(
  segments: { text: string; useHebrew: boolean }[]
): { text: string; useHebrew: boolean }[] {
  const out: { text: string; useHebrew: boolean }[] = [];
  let i = 0;
  while (i < segments.length) {
    const seg = segments[i];
    // Drop whitespace between Hebrew and following punctuation so "נעימה ." still attaches correctly
    if (!seg.useHebrew && /^\s+$/.test(seg.text) && i + 1 < segments.length) {
      const next = segments[i + 1];
      if (!next.useHebrew && HEBREW_SENTENCE_PUNCT.test(next.text) && out.length > 0 && out[out.length - 1].useHebrew) {
        i += 1;
        continue;
      }
    }
    if (!seg.useHebrew && HEBREW_SENTENCE_PUNCT.test(seg.text) && out.length > 0 && out[out.length - 1].useHebrew) {
      const last = out[out.length - 1];
      out[out.length - 1] = { text: last.text + seg.text, useHebrew: true };
      i += 1;
      continue;
    }
    out.push({ ...seg });
    i += 1;
  }
  return out;
}

function parseNum(value: string | number | null | undefined): number {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9,.\-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

const moneyFmt = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0, minimumFractionDigits: 0 });
function formatMoney(v: number): string {
  return `${moneyFmt.format(v)} ₪`;
}
function formatNum(v: number): string {
  return moneyFmt.format(v);
}
const dateFmt = new Intl.DateTimeFormat("he-IL");

function normalizeTax(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 0;
  if (raw > 1) return raw / 100;
  return raw;
}

/** Local TTF paths (same-origin). Prefer static Regular from zip (static/NotoSansHebrew-Regular.ttf). */
const LOCAL_HEBREW_FONT_PATHS = [
  "/fonts/NotoSansHebrew-Regular.ttf",
  "fonts/NotoSansHebrew-Regular.ttf",
  "./fonts/NotoSansHebrew-Regular.ttf",
  "/fonts/NotoSansHebrew-VariableFont_wdth,wght.ttf",
  "fonts/NotoSansHebrew-VariableFont_wdth,wght.ttf",
];

/** Load Hebrew font bytes: local TTF first, then CDN TTF, then WOFF2/WOFF. */
async function loadHebrewFontBytes(): Promise<ArrayBuffer> {
  // Prefer local TTF so PDFs render correctly on iOS/Android without CORS or WOFF issues.
  if (typeof document !== "undefined" && document.baseURI) {
    try {
      const base = new URL(document.baseURI);
      for (const path of LOCAL_HEBREW_FONT_PATHS) {
        const url = path.startsWith("/") ? new URL(path, base.origin) : new URL(path, base);
        const resp = await fetch(url.href);
        if (resp.ok) return await resp.arrayBuffer();
      }
    } catch {
      /* ignore */
    }
  }
  let lastError: Error | null = null;
  for (const url of HEBREW_FONT_URLS) {
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.arrayBuffer();
      lastError = new Error(`HTTP ${resp.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Hebrew font failed to load");
}

/** Total width of text using dual fonts */
function textWidth(hebrewFont: PDFFont, latinFont: PDFFont, size: number, text: string): number {
  let w = 0;
  for (const { text: seg, useHebrew } of segmentForFonts(text)) {
    w += (useHebrew ? hebrewFont : latinFont).widthOfTextAtSize(seg, size);
  }
  return w;
}

/** Draw text right-aligned; Hebrew/₪ in hebrewFont, digits/Latin in latinFont. */
function drawTextRight(
  page: PDFPage,
  hebrewFont: PDFFont,
  latinFont: PDFFont,
  size: number,
  text: string,
  xRight: number,
  y: number
): void {
  const rtlText = reverseWordOrder(text);
  const segments = segmentForFonts(rtlText);
  let x = xRight;
  for (let i = segments.length - 1; i >= 0; i--) {
    const { text: seg, useHebrew } = segments[i];
    const font = useHebrew ? hebrewFont : latinFont;
    const w = font.widthOfTextAtSize(seg, size);
    x -= w;
    page.drawText(seg, { x, y, size, font, color: rgb(0, 0, 0) });
  }
}

/** Draw text centered; dual font. Uses RTL placement (right-to-left) so colons render correctly after Hebrew words. */
function drawTextCenter(
  page: PDFPage,
  hebrewFont: PDFFont,
  latinFont: PDFFont,
  size: number,
  text: string,
  xCenter: number,
  y: number,
  opts: { reverseWords?: boolean } = {}
): void {
  const reverseWords = opts.reverseWords !== false;
  const rtlText = reverseWords ? reverseWordOrder(text) : text;
  const segments = segmentForFonts(rtlText);
  let totalW = 0;
  for (const { text: seg, useHebrew } of segments) {
    totalW += (useHebrew ? hebrewFont : latinFont).widthOfTextAtSize(seg, size);
  }
  const xRight = xCenter + totalW / 2;
  let x = xRight;
  for (let i = segments.length - 1; i >= 0; i--) {
    const { text: seg, useHebrew } = segments[i];
    const font = useHebrew ? hebrewFont : latinFont;
    const w = font.widthOfTextAtSize(seg, size);
    x -= w;
    page.drawText(seg, { x, y, size, font, color: rgb(0, 0, 0) });
  }
}

/** Break a single oversized token into chunks that each fit maxWidth. */
function breakLongWord(
  hebrewFont: PDFFont,
  latinFont: PDFFont,
  size: number,
  word: string,
  maxWidth: number
): string[] {
  if (!word) return [];
  if (textWidth(hebrewFont, latinFont, size, word) <= maxWidth) return [word];
  const chunks: string[] = [];
  let chunk = "";
  for (const ch of word) {
    const candidate = chunk + ch;
    if (chunk && textWidth(hebrewFont, latinFont, size, candidate) > maxWidth) {
      chunks.push(chunk);
      chunk = ch;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

/** Wrap text to fit width (words first; overlong tokens are split by character). */
function wrapText(hebrewFont: PDFFont, latinFont: PDFFont, size: number, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = "";
  const pushLine = () => {
    if (line) {
      lines.push(line);
      line = "";
    }
  };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(hebrewFont, latinFont, size, candidate) <= maxWidth) {
      line = candidate;
      continue;
    }
    pushLine();
    if (textWidth(hebrewFont, latinFont, size, word) <= maxWidth) {
      line = word;
      continue;
    }
    const pieces = breakLongWord(hebrewFont, latinFont, size, word, maxWidth);
    for (const piece of pieces) {
      if (textWidth(hebrewFont, latinFont, size, piece) <= maxWidth) {
        lines.push(piece);
      } else {
        lines.push(piece); // last resort: still emit so nothing is dropped
      }
    }
  }
  pushLine();
  return lines.length > 0 ? lines : [""];
}

/** Word-wrap where each output line may use a different max width (by line index). */
function wrapTextVariableWidth(
  hebrewFont: PDFFont,
  latinFont: PDFFont,
  size: number,
  text: string,
  maxWidthForLine: (lineIndex: number) => number
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let line = "";
  let lineIndex = 0;
  const flush = (): void => {
    if (line) {
      lines.push(line);
      line = "";
      lineIndex += 1;
    }
  };
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    const mw = maxWidthForLine(lineIndex);
    if (textWidth(hebrewFont, latinFont, size, candidate) <= mw) {
      line = candidate;
    } else {
      if (line) {
        flush();
        const mw2 = maxWidthForLine(lineIndex);
        const lone = word;
        if (textWidth(hebrewFont, latinFont, size, lone) <= mw2) {
          line = lone;
        } else {
          lines.push(lone);
          lineIndex += 1;
        }
      } else {
        lines.push(word);
        lineIndex += 1;
      }
    }
  }
  flush();
  return lines;
}

export async function buildQuotePdfBytes(payload: PdfQuotePayload): Promise<Uint8Array> {
  const fontBytes = await loadHebrewFontBytes();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  // subset: false embeds the full font so mobile viewers (iOS/Android) render text correctly.
  const hebrewFont = await doc.embedFont(fontBytes, { subset: false });
  const latinFont = doc.embedStandardFont(StandardFonts.Helvetica);
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const right = A4_WIDTH - MARGIN_X;
  let y = A4_HEIGHT - MARGIN_TOP;

  const drawLine = (): void => {
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: right, y },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= 12;
  };

  // Document title (both types) goes below מס מ.ע in the company header
  const documentType = normalizeDocumentType(payload.documentType);
  const docTitle =
    (payload.title && payload.title.trim()) || documentTypeLabel(documentType);

  // Company header
  const headerLines = [
    "אלום סמעאן סאמי",
    "ביצוע עבודות אלומיניום ותריס",
    "פסוטה      ד.ת 528      :פקס/טל 9870933     :נייד 0526475531",
    "'מס מ.ע  023107659 ",
  ];
  headerLines.forEach((line) => {
    drawTextCenter(page, hebrewFont, latinFont, 18, line, A4_WIDTH / 2, y);
    y -= 22;
  });

  y -= 6;
  drawTextCenter(page, hebrewFont, latinFont, 22, docTitle, A4_WIDTH / 2, y);
  y -= 22;
  if (
    documentType === "payment_request" &&
    payload.documentNumber != null &&
    payload.documentNumber > 0
  ) {
    const numText = `מס׳ ${String(Math.floor(payload.documentNumber)).padStart(4, "0")}`;
    drawTextCenter(page, hebrewFont, latinFont, 14, numText, A4_WIDTH / 2, y);
    y -= 16;
  }
  y -= 12;

  // Customer with underline under name only
  const customerName = payload.customerName.trim();
  const nameWithPrefix = customerName
    ? customerName.startsWith("לכבוד")
      ? customerName
      : `לכבוד ${customerName}`
    : "";
  if (nameWithPrefix) {
    drawTextRight(page, hebrewFont, latinFont, 16, nameWithPrefix, right, y);
    const customerNameOnly = nameWithPrefix.startsWith("לכבוד ")
      ? nameWithPrefix.replace(/^לכבוד\s+/, "")
      : nameWithPrefix;
    const lekavodWidth = textWidth(hebrewFont, latinFont, 16, "לכבוד");
    const spaceWidth = latinFont.widthOfTextAtSize(" ", 16);
    const nameWidth = textWidth(hebrewFont, latinFont, 16, customerNameOnly);
    const fullWidth = lekavodWidth + spaceWidth + nameWidth;
    const nameStartX = right - fullWidth;
    const nameEndX = right - lekavodWidth - spaceWidth;
    page.drawLine({
      start: { x: nameStartX, y: y - 4 },
      end: { x: nameEndX, y: y - 4 },
      thickness: 0.8,
      color: rgb(0, 0, 0),
    });
    y -= 24;
  }
  if (payload.customerPhone?.trim()) {
    drawTextRight(page, hebrewFont, latinFont, 13, payload.customerPhone.trim(), right, y);
    y -= 19;
  }
  if (payload.customerEmail?.trim()) {
    drawTextRight(page, hebrewFont, latinFont, 13, payload.customerEmail.trim(), right, y);
    y -= 19;
  }
  drawLine();

  // Items table
  const colW = {
    num: 25,
    profile: 78,
    dims: 78,
    location: 58,
    details: 111,
    unitPrice: 65,
    qty: 30,
    total: 70,
  };
  const colRight = {
    num: right,
    profile: right - colW.num,
    dims: right - colW.num - colW.profile,
    location: right - colW.num - colW.profile - colW.dims,
    details: right - colW.num - colW.profile - colW.dims - colW.location,
    unitPrice: right - colW.num - colW.profile - colW.dims - colW.location - colW.details,
    qty: right - colW.num - colW.profile - colW.dims - colW.location - colW.details - colW.unitPrice,
    total: right - colW.num - colW.profile - colW.dims - colW.location - colW.details - colW.unitPrice - colW.qty,
  };
  const lineH = 14;
  const headerH = 40;

  const colBoundaries = [
    MARGIN_X,
    colRight.num - colW.num,
    colRight.profile - colW.profile,
    colRight.dims - colW.dims,
    colRight.location - colW.location,
    colRight.details - colW.details,
    colRight.unitPrice - colW.unitPrice,
    colRight.qty - colW.qty,
    colRight.total - colW.total,
    right,
  ];

  const drawVerticalGridLines = (page: PDFPage, yTop: number, yBottom: number): void => {
    const gridColor = rgb(0.7, 0.7, 0.7);
    for (let i = 1; i < colBoundaries.length; i++) {
      const x = colBoundaries[i];
      page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.5, color: gridColor });
    }
  };

  let currentPage: PDFPage = page;

  const checkNewPage = (need: number): void => {
    if (y - need < MARGIN_BOTTOM) {
      currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
      y = A4_HEIGHT - MARGIN_TOP;
      drawTableHeader();
    }
  };

  const drawTableHeader = (): void => {
    checkNewPage(headerH);
    currentPage.drawRectangle({
      x: MARGIN_X,
      y: y - headerH,
      width: right - MARGIN_X,
      height: headerH,
      color: rgb(0.925, 0.973, 1),
      borderColor: rgb(0.65, 0.65, 0.65),
      borderWidth: 0.5,
    });
    drawVerticalGridLines(currentPage, y - headerH, y);
    const cy = y - headerH / 2 + 5;
    const dimsX = colRight.dims - colW.dims / 2;
    const headers = [
      { text: "מס׳", xCenter: colRight.num - colW.num / 2 },
      { text: "פרופיל", xCenter: colRight.profile - colW.profile / 2 },
      { text: "מיקום", xCenter: colRight.location - colW.location / 2 },
      { text: "פרטים", xCenter: colRight.details - colW.details / 2 },
      { text: "מחיר ליח׳", xCenter: colRight.unitPrice - colW.unitPrice / 2 },
      { text: "כמות", xCenter: colRight.qty - colW.qty / 2 },
      { text: "סה״כ", xCenter: colRight.total - colW.total / 2 },
    ];
    headers.forEach(({ text, xCenter }) => {
      drawTextCenter(currentPage, hebrewFont, latinFont, 12, text, xCenter, cy);
    });
    // מידות: title + order hint (width × height) matching the values below
    drawTextCenter(
      currentPage,
      hebrewFont,
      latinFont,
      11,
      payload.dimensionUnit === "mm" ? "מידות (מ״מ)" : "מידות (ס״מ)",
      dimsX,
      y - 14
    );
    drawTextCenter(currentPage, hebrewFont, latinFont, 8, "רוחב × גובה", dimsX, y - 28, {
      reverseWords: false,
    });
    y -= headerH;
  };

  drawTableHeader();

  const items = payload.items || [];
  const additions = payload.freeFormAdditions || [];
  const dimUnit = payload.dimensionUnit ?? "cm";
  const taxRate = normalizeTax(parseNum(payload.taxPercentText));
  const showTotalsBox = payload.showTotals !== false;

  items.forEach((it: PdfLineItem, idx: number) => {
    const w = parseNum(it.widthCm);
    const h = parseNum(it.heightCm);
    const dims =
      dimUnit === "mm" ? `${Math.round(w * 10)}×${Math.round(h * 10)}` : `${Math.round(w)}×${Math.round(h)}`;
    const qty = Math.max(0, parseNum(it.qty));
    const area = (w * h) / 10000;
    const addonsSum = (it.addons || []).reduce((s, a) => s + (a.checked ? parseNum(a.price) : 0), 0);
    const manual = (it.manualUnitPrice ?? "").trim();
    const perItem = manual ? parseNum(manual) + addonsSum : area * parseNum(it.unitPrice) + addonsSum;
    const lineTotal = perItem * qty;
    const lineTotalWithVat = lineTotal * (1 + taxRate);
    const profileStr = it.profileName || "";
    const detailsStr = [it.details, (it.addons || []).filter((a) => a.checked).map((a) => `${a.name}`).join(" • ")]
      .filter(Boolean)
      .join(" — ");

    const profileLines = wrapText(hebrewFont, latinFont, 12, profileStr, colW.profile - 8);
    const locationLines = wrapText(hebrewFont, latinFont, 12, it.location || "", colW.location - 8);
    const detailsLines = wrapText(hebrewFont, latinFont, 12, detailsStr, colW.details - 8);
    const unitPriceLines = wrapText(hebrewFont, latinFont, 12, formatNum(perItem), colW.unitPrice - 8);
    const qtyLines = wrapText(hebrewFont, latinFont, 12, formatNum(qty), colW.qty - 8);
    const baseTotalText = `${formatNum(lineTotal)} ₪`;
    const vatTotalText = `עם מע״מ ${formatNum(lineTotalWithVat)} ₪`;
    const baseTotalLines = wrapText(hebrewFont, latinFont, 12, baseTotalText, colW.total - 8);
    const vatTotalLines = !showTotalsBox
      ? wrapText(hebrewFont, latinFont, 12, vatTotalText, colW.total - 8)
      : [];
    const totalLinesWrapped: string[] = [...baseTotalLines, ...vatTotalLines];
    const rowLines = Math.max(
      1,
      profileLines.length,
      locationLines.length,
      detailsLines.length,
      unitPriceLines.length,
      qtyLines.length,
      totalLinesWrapped.length
    );
    const rowH = rowLines * lineH + 6;
    checkNewPage(rowH);
    currentPage.drawRectangle({
      x: MARGIN_X,
      y: y - rowH,
      width: right - MARGIN_X,
      height: rowH,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });
    drawVerticalGridLines(currentPage, y - rowH, y);
    const rowBaseline = y - 2 - lineH;
    const drawT = (t: string, xR: number, yy: number, color = rgb(0, 0, 0)) => {
      const rtlText = reverseWordOrder(t);
      const segments = segmentForFonts(rtlText);
      let x = xR - 4;
      for (let i = segments.length - 1; i >= 0; i--) {
        const { text: seg, useHebrew } = segments[i];
        const font = useHebrew ? hebrewFont : latinFont;
        const w = font.widthOfTextAtSize(seg, 12);
        x -= w;
        currentPage.drawText(seg, { x, y: yy, size: 12, font, color });
      }
    };
    const drawColLines = (lines: string[], xR: number) => {
      let yy = rowBaseline;
      for (const line of lines) {
        if (line) drawT(line, xR, yy);
        yy -= lineH;
      }
    };
    drawT(String(idx + 1), colRight.num, rowBaseline);
    drawColLines(profileLines, colRight.profile);
    // מידות stays on one line so the full WxH number is readable at a glance
    drawT(dims, colRight.dims, rowBaseline);
    drawColLines(locationLines, colRight.location);
    drawColLines(detailsLines, colRight.details);
    drawColLines(unitPriceLines, colRight.unitPrice);
    drawColLines(qtyLines, colRight.qty);
    // Total column: base total and, when overall box is hidden, extra wrapped line(s) "עם מע״מ ..." with background highlight
    let totalY = rowBaseline;
    totalLinesWrapped.forEach((line, lineIdx) => {
      const isVatLine = lineIdx >= baseTotalLines.length;
      if (isVatLine) {
        // Light background marker behind the "עם מע״מ" line only (single-line height, aligned to this line’s baseline)
        const rectX = colRight.total - colW.total;
        const rectHeight = 12; // one line of 12pt text
        const rectY = totalY;   // baseline of this line – rect sits behind this line only
        currentPage.drawRectangle({
          x: rectX,
          y: rectY,
          width: colW.total,
          height: rectHeight,
          color: rgb(0.9, 0.96, 1),
        });
      }
      drawT(line, colRight.total, totalY, rgb(0, 0, 0));
      totalY -= lineH;
    });
    y -= rowH;
  });

  additions.forEach((add: PdfFreeFormAddition, addIdx: number) => {
    const price = parseNum(add.price);
    const qty = Math.max(0, parseNum(add.qty));
    const total = price * qty;
    const totalWithVat = total * (1 + taxRate);
    const baseTotalText = `${formatNum(total)} ₪`;
    const vatTotalText = `עם מע״מ ${formatNum(totalWithVat)} ₪`;
    const nameLines = wrapText(hebrewFont, latinFont, 12, add.name || "", colW.details - 8);
    const unitPriceLines = wrapText(hebrewFont, latinFont, 12, formatNum(price), colW.unitPrice - 8);
    const qtyLines = wrapText(hebrewFont, latinFont, 12, formatNum(qty), colW.qty - 8);
    const baseTotalLines = wrapText(hebrewFont, latinFont, 12, baseTotalText, colW.total - 8);
    const vatTotalLines = !showTotalsBox
      ? wrapText(hebrewFont, latinFont, 12, vatTotalText, colW.total - 8)
      : [];
    const totalLinesWrapped: string[] = [...baseTotalLines, ...vatTotalLines];
    const rowLines = Math.max(
      1,
      nameLines.length,
      unitPriceLines.length,
      qtyLines.length,
      totalLinesWrapped.length
    );
    const rowH = rowLines * lineH + 6;
    checkNewPage(rowH);
    currentPage.drawRectangle({
      x: MARGIN_X,
      y: y - rowH,
      width: right - MARGIN_X,
      height: rowH,
      borderColor: rgb(0.7, 0.7, 0.7),
      borderWidth: 0.5,
    });
    drawVerticalGridLines(currentPage, y - rowH, y);
    const rowBaseline = y - 2 - lineH;
    const drawAdd = (t: string, xR: number, yy: number, color = rgb(0, 0, 0)) => {
      const rtlText = reverseWordOrder(t);
      const segments = segmentForFonts(rtlText);
      let x = xR - 4;
      for (let i = segments.length - 1; i >= 0; i--) {
        const { text: seg, useHebrew } = segments[i];
        const font = useHebrew ? hebrewFont : latinFont;
        const w = font.widthOfTextAtSize(seg, 12);
        x -= w;
        currentPage.drawText(seg, { x, y: yy, size: 12, font, color });
      }
    };
    const drawColLines = (lines: string[], xR: number) => {
      let yy = rowBaseline;
      for (const line of lines) {
        if (line) drawAdd(line, xR, yy);
        yy -= lineH;
      }
    };
    drawAdd(String(items.length + addIdx + 1), colRight.num, rowBaseline);
    drawColLines(nameLines, colRight.details);
    drawColLines(unitPriceLines, colRight.unitPrice);
    drawColLines(qtyLines, colRight.qty);
    // Total column for free-form additions (possibly multi-line, wrapped, with background highlight for "עם מע״מ")
    let totalY = rowBaseline;
    totalLinesWrapped.forEach((line, lineIdx) => {
      const isVatLine = lineIdx >= baseTotalLines.length;
      if (isVatLine) {
        const rectX = colRight.total - colW.total;
        const rectHeight = 12;
        const rectY = totalY;
        currentPage.drawRectangle({
          x: rectX,
          y: rectY,
          width: colW.total,
          height: rectHeight,
          color: rgb(0.9, 0.96, 1),
        });
      }
      drawAdd(line, colRight.total, totalY, rgb(0, 0, 0));
      totalY -= lineH;
    });
    y -= rowH;
  });

  y -= 18;

  // Totals box and footer (חתימה, תאריך, הערות) sit side by side in one bottom band – they do not
  // affect each other; we only add a new page when the table would run into this band.
  // Use a low band position to extend usable area further down the page.
  const footerBaseY = 20;
  const TOTALS_BOX_HEIGHT = 96;
  const FOOTER_ZONE_HEIGHT = 130;
  const BOTTOM_BAND_HEIGHT = Math.max(TOTALS_BOX_HEIGHT, FOOTER_ZONE_HEIGHT); // 130

  // Only add a new page when table content would extend into the bottom band (footer zone).
  if (y < footerBaseY + BOTTOM_BAND_HEIGHT) {
    currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }

  const boxW = 260;
  const boxX = MARGIN_X;
  let totalsBoxBottomY: number | null = null;

  // Totals box: right after the table (or at top of new page if we just added one).
  if (showTotalsBox) {
    const sub = items.reduce((sum, it) => {
      const w = parseNum(it.widthCm);
      const h = parseNum(it.heightCm);
      const qty = Math.max(0, parseNum(it.qty));
      const area = (w * h) / 10000;
      const addonsSum = (it.addons || []).reduce((s, a) => s + (a.checked ? parseNum(a.price) : 0), 0);
      const manual = (it.manualUnitPrice ?? "").trim();
      const perItem = manual ? parseNum(manual) + addonsSum : area * parseNum(it.unitPrice) + addonsSum;
      return sum + perItem * qty;
    }, 0);
    const freeSub = additions.reduce((sum, add) => sum + parseNum(add.price) * Math.max(0, parseNum(add.qty)), 0);
    const totalSub = sub + freeSub;
    const vat = totalSub * taxRate;
    const grand = totalSub + vat;

    const boxY = y - TOTALS_BOX_HEIGHT; // immediately below the table
    totalsBoxBottomY = boxY;
    currentPage.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: TOTALS_BOX_HEIGHT,
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.3,
    });
    let textY = boxY + 70;
    drawTextRight(currentPage, hebrewFont, latinFont, 13, `מחיר: ${formatMoney(totalSub)}`, boxX + boxW - 12, textY);
    textY -= 26;
    drawTextRight(currentPage, hebrewFont, latinFont, 13, `מע״מ: ${formatMoney(vat)}`, boxX + boxW - 12, textY);
    textY -= 28;
    currentPage.drawRectangle({
      x: boxX + 10,
      y: textY - 16,
      width: boxW - 20,
      height: 34,
      color: rgb(0.925, 0.973, 1),
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.3,
    });
    drawTextRight(currentPage, hebrewFont, latinFont, 16, `סה״כ :לתשלום ${formatMoney(grand)}`, boxX + boxW - 18, textY + 2);
  }

  // Footer (חתימה, תאריך, הערות) – fixed position on the right of the same bottom band.
  const GAP_BETWEEN_BOX_AND_FOOTER = 24;
  const FULL_NOTES_WIDTH = right - MARGIN_X;
  const NARROW_NOTES_WIDTH = right - (boxX + boxW + GAP_BETWEEN_BOX_AND_FOOTER);
  const NOTES_LINE_STEP = 15;
  const GAP_LABEL_ABOVE_FIRST_LINE = 20;

  const noteParagraphs = payload.notes?.trim()
    ? payload.notes
        .trim()
        .split(/\r?\n/)
        .map((p) => p.trim())
        .filter(Boolean)
    : [];

  /** Baseline y for global line index g when there are `total` wrapped lines (stacked bottom → top). */
  const noteLineBaseline = (g: number, total: number): number =>
    footerBaseY + (total - 1 - g) * NOTES_LINE_STEP;

  const lineOverlapsTotalsBox = (baselineY: number): boolean => {
    if (!showTotalsBox || totalsBoxBottomY == null) return false;
    const boxLow = totalsBoxBottomY;
    const boxHigh = totalsBoxBottomY + TOTALS_BOX_HEIGHT;
    const textLow = baselineY - 3;
    const textHigh = baselineY + 14;
    return !(textHigh < boxLow || textLow > boxHigh);
  };

  const maxWidthForGlobalLineIndex = (g: number, estimatedTotal: number): number => {
    const b = noteLineBaseline(g, estimatedTotal);
    return lineOverlapsTotalsBox(b) ? NARROW_NOTES_WIDTH : FULL_NOTES_WIDTH;
  };

  const buildWrappedNoteLines = (estimatedTotal: number): string[] => {
    const out: string[] = [];
    let globalIdx = 0;
    for (const para of noteParagraphs) {
      const paraLines = wrapTextVariableWidth(hebrewFont, latinFont, 12, para, (li) =>
        maxWidthForGlobalLineIndex(globalIdx + li, estimatedTotal)
      );
      for (const pl of paraLines) {
        out.push(pl);
        globalIdx += 1;
      }
    }
    return out;
  };

  const computeFinalNoteLines = (): string[] => {
    if (noteParagraphs.length === 0) return [];
    let est = 0;
    for (const para of noteParagraphs) {
      est += wrapText(hebrewFont, latinFont, 12, para, FULL_NOTES_WIDTH).length;
    }
    let lines = buildWrappedNoteLines(est);
    for (let iter = 0; iter < 12; iter++) {
      if (lines.length === est) break;
      est = lines.length;
      lines = buildWrappedNoteLines(est);
    }
    return lines;
  };

  const wrappedNoteLines = noteParagraphs.length > 0 ? computeFinalNoteLines() : [];

  // Measure the footer height (notes + date + signature). Only add a new page when the footer would
  // overflow into the table/calculations above.
  const estimateFooterHeight = (): number => {
    let h = 0;
    if (wrappedNoteLines.length > 0) {
      h += wrappedNoteLines.length * NOTES_LINE_STEP + 46; // notes + "הערות:" + gap before date (same as before)
    }
    h += 22; // date block vertical advance
    h += 48; // distance from signature image baseline to "חתימה:" label
    return h;
  };

  const availableHeightForFooter = y - footerBaseY;
  if (estimateFooterHeight() > availableHeightForFooter) {
    currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  }

  let footerY = footerBaseY;

  // Footer order (top → bottom on page): date, "הערות:", note lines (first line directly under label),
  // then signature. PDF y increases upward; we assign baselines so the first note line is under the label
  // and the last wrapped line sits at the lowest y (previous bug drew lines in reverse order).

  if (wrappedNoteLines.length > 0) {
    const noteLines = wrappedNoteLines;
    const n = noteLines.length;
    const firstLineY = footerBaseY + (n > 0 ? (n - 1) * NOTES_LINE_STEP : 0);
    for (let i = 0; i < n; i++) {
      drawTextRight(currentPage, hebrewFont, latinFont, 12, noteLines[i], right, firstLineY - i * NOTES_LINE_STEP);
    }
    const labelY = firstLineY + GAP_LABEL_ABOVE_FIRST_LINE;
    drawTextRight(currentPage, hebrewFont, latinFont, 13, "הערות:", right, labelY);
    footerY = labelY + 46;
  }

  // Date – fixed position. Reuse the quote's saved date unless the quote actually changed.
  const pdfDate = payload.pdfDateMs ? new Date(payload.pdfDateMs) : new Date();
  drawTextRight(currentPage, hebrewFont, latinFont, 13, `תאריך: ${dateFmt.format(pdfDate)}`, right, footerY);
  footerY += 22;

  // Signature section: signature first (bottom), then "חתימה:" above it – fixed position
  const sigUrls = ["/fonts/signature.png", "fonts/signature.png", "./fonts/signature.png"];
  if (typeof document !== "undefined" && document.baseURI) {
    try {
      const base = new URL(document.baseURI);
      sigUrls.unshift(new URL("fonts/signature.png", base).href);
    } catch {}
  }
  for (const sigUrl of sigUrls) {
    try {
      const sigResp = await fetch(sigUrl);
      if (sigResp.ok) {
        const sigBytes = new Uint8Array(await sigResp.arrayBuffer());
        const sigImg = await doc.embedPng(sigBytes);
        const sigW = 120;
        const sigH = 40;
        currentPage.drawImage(sigImg, { x: right - sigW, y: footerY, width: sigW, height: sigH });
        break;
      }
    } catch {
      /* ignore */
    }
  }
  drawTextRight(currentPage, hebrewFont, latinFont, 13, "חתימה:", right, footerY + 48);

  const pdfBytes = await doc.save();
  return pdfBytes;
}
