/**
 * Build quote PDF with pdf-lib + @pdf-lib/fontkit.
 * Uses Hebrew font (WOFF2/TTF) from CDN – proper Unicode/Identity-H support, no local fonts needed.
 * Implements RTL (Right-to-Left) reversal so Hebrew displays correctly.
 */
import type { PdfQuotePayload, PdfLineItem, PdfFreeFormAddition } from "./pdfExporter";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;

// Hebrew-only subset (works correctly). Use Helvetica for numbers – full TTF causes "ל" for all chars.
const HEBREW_FONT_URLS = [
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
  return segments;
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

/** Load Hebrew font bytes; tries WOFF2, WOFF, then TTF from CDN. */
async function loadHebrewFontBytes(): Promise<ArrayBuffer> {
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
  y: number
): void {
  const rtlText = reverseWordOrder(text);
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

/** Wrap text to fit width */
function wrapText(hebrewFont: PDFFont, latinFont: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(hebrewFont, latinFont, size, candidate) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function buildQuotePdfBytes(payload: PdfQuotePayload): Promise<Uint8Array> {
  const fontBytes = await loadHebrewFontBytes();
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const hebrewFont = await doc.embedFont(fontBytes);
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

  // Header
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
    profile: 80,
    dims: 65,
    location: 60,
    details: 120,
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
  const headerH = 32;

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
    const headers = [
      { text: "מס׳", x: colRight.num - 4 },
      { text: "פרופיל", x: colRight.profile - 4 },
      { text: payload.dimensionUnit === "mm" ? "מידות (מ״מ)" : "מידות (ס״מ)", x: colRight.dims - 4 },
      { text: "מיקום", x: colRight.location - 4 },
      { text: "פרטים", x: colRight.details - 4 },
      { text: "מחיר ליח׳", x: colRight.unitPrice - 4 },
      { text: "כמות", x: colRight.qty - 4 },
      { text: "סה״כ", x: colRight.total - 4 },
    ];
    headers.forEach(({ text, x }) => {
      drawTextRight(currentPage, hebrewFont, latinFont, 12, text, x, cy);
    });
    y -= headerH;
  };

  drawTableHeader();

  const items = payload.items || [];
  const additions = payload.freeFormAdditions || [];
  const dimUnit = payload.dimensionUnit ?? "cm";

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
    const profileStr = it.profileName || "";
    const detailsStr = [it.details, (it.addons || []).filter((a) => a.checked).map((a) => `${a.name}`).join(" • ")]
      .filter(Boolean)
      .join(" — ");
    const rowLines = Math.max(
      1,
      wrapText(hebrewFont, latinFont, 12, profileStr, colW.profile - 8).length,
      wrapText(hebrewFont, latinFont, 12, detailsStr, colW.details - 8).length
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
    let by = y - 2 - lineH;
    const drawT = (t: string, xR: number, yy: number) => {
      drawTextRight(currentPage, hebrewFont, latinFont, 12, t, xR - 4, yy);
    };
    drawT(String(idx + 1), colRight.num, by);
    wrapText(hebrewFont, latinFont, 12, profileStr, colW.profile - 8).forEach((line) => {
      drawT(line, colRight.profile, by);
      by -= lineH;
    });
    by = y - 2 - lineH;
    drawT(dims, colRight.dims, by);
    if (it.location) drawT(it.location, colRight.location, by);
    wrapText(hebrewFont, latinFont, 12, detailsStr, colW.details - 8).forEach((line) => {
      drawT(line, colRight.details, by);
      by -= lineH;
    });
    by = y - 2 - lineH;
    drawT(formatNum(perItem), colRight.unitPrice, by);
    drawT(formatNum(qty), colRight.qty, by);
    drawT(formatNum(lineTotal) + " ₪", colRight.total, by);
    y -= rowH;
  });

  additions.forEach((add: PdfFreeFormAddition, addIdx: number) => {
    const price = parseNum(add.price);
    const qty = Math.max(0, parseNum(add.qty));
    const total = price * qty;
    const rowH = lineH + 6;
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
    const by = y - 2 - lineH;
    const drawAdd = (t: string, xR: number) => {
      drawTextRight(currentPage, hebrewFont, latinFont, 12, t, xR - 4, by);
    };
    drawAdd(String(items.length + addIdx + 1), colRight.num);
    if (add.name) drawAdd(add.name, colRight.details);
    drawAdd(formatNum(price), colRight.unitPrice);
    drawAdd(formatNum(qty), colRight.qty);
    drawAdd(formatNum(total) + " ₪", colRight.total);
    y -= rowH;
  });

  y -= 18;

  // Reserve space for footer (signature + date + notes) at bottom of page
  const FOOTER_HEIGHT = 130;
  if (y - 96 - FOOTER_HEIGHT < MARGIN_BOTTOM) {
    currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }

  // Totals
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
  const vat = totalSub * normalizeTax(parseNum(payload.taxPercentText));
  const grand = totalSub + vat;

  const boxW = 260;
  const boxX = MARGIN_X;
  let boxY = y - 96;
  currentPage.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: 96,
    borderColor: rgb(0.82, 0.82, 0.82),
    borderWidth: 0.3,
  });
  boxY += 70;
  drawTextRight(currentPage, hebrewFont, latinFont, 13, `מחיר: ${formatMoney(totalSub)}`, boxX + boxW - 12, boxY);
  boxY -= 26;
  drawTextRight(currentPage, hebrewFont, latinFont, 13, `מע״מ: ${formatMoney(vat)}`, boxX + boxW - 12, boxY);
  boxY -= 28;
  currentPage.drawRectangle({
    x: boxX + 10,
    y: boxY - 16,
    width: boxW - 20,
    height: 34,
    color: rgb(0.925, 0.973, 1),
    borderColor: rgb(0.82, 0.82, 0.82),
    borderWidth: 0.3,
  });
  drawTextRight(currentPage, hebrewFont, latinFont, 16, `סה״כ :לתשלום ${formatMoney(grand)}`, boxX + boxW - 18, boxY + 2);

  // Footer – fixed at bottom of last page (y=0 is bottom in pdf-lib)
  const footerBaseY = MARGIN_BOTTOM + 10;
  let footerY = footerBaseY;

  // Footer order (bottom to top): notes content, הערות:, date, signature, חתימה:
  // PDF y increases upward, so draw lower items first, then labels above their data

  // Notes section: notes content first (bottom), then "הערות:" above it
  if (payload.notes?.trim()) {
    payload.notes
      .trim()
      .split(/\r?\n/)
      .forEach((para) => {
        wrapText(hebrewFont, latinFont, 12, para.trim(), A4_WIDTH - MARGIN_X * 2).forEach((line) => {
          drawTextRight(currentPage, hebrewFont, latinFont, 12, line, right, footerY);
          footerY += 15;
        });
      });
    drawTextRight(currentPage, hebrewFont, latinFont, 13, "הערות:", right, footerY + 18);
    footerY += 46;
  }

  // Date
  drawTextRight(currentPage, hebrewFont, latinFont, 13, `תאריך: ${dateFmt.format(new Date())}`, right, footerY);
  footerY += 22;

  // Signature section: signature first (bottom), then "חתימה:" above it
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
