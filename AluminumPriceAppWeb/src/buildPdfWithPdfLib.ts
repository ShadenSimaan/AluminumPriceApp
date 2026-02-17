/**
 * Build quote PDF with pdf-lib + @pdf-lib/fontkit.
 * Uses Hebrew WOFF2 from CDN so Hebrew text renders correctly (no jsPDF font/metrics issues).
 */
import type { PdfQuotePayload, PdfLineItem, PdfFreeFormAddition } from "./pdfExporter";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_X = 40;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;

const HEBREW_FONT_URL =
  "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-hebrew@5.2.8/files/noto-sans-hebrew-hebrew-400-normal.woff2";

function parseNum(value: string | number | null | undefined): number {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9,.\-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

const moneyFmt = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2, minimumFractionDigits: 0 });
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

/** Load Hebrew font bytes (WOFF2) from CDN. */
async function loadHebrewFontBytes(): Promise<ArrayBuffer> {
  const resp = await fetch(HEBREW_FONT_URL);
  if (!resp.ok) throw new Error(`Hebrew font failed to load: ${resp.status}`);
  return resp.arrayBuffer();
}

/** Draw text right-aligned (for RTL). x = right edge. */
function drawTextRight(
  page: PDFPage,
  font: PDFFont,
  size: number,
  text: string,
  xRight: number,
  y: number
): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xRight - w, y, size, font, color: rgb(0, 0, 0) });
}

/** Draw text centered. */
function drawTextCenter(
  page: PDFPage,
  font: PDFFont,
  size: number,
  text: string,
  xCenter: number,
  y: number
): void {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: xCenter - w / 2, y, size, font, color: rgb(0, 0, 0) });
}

/** Wrap text to fit width (simple: split by space, accumulate). */
function wrapText(font: PDFFont, size: number, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
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
  const font = await doc.embedFont(fontBytes);
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
    "פסוטה   ת.ד 528             טל/פקס : 9870933          נייד0526475531",
    "ע.מ. מס' 023107659",
  ];
  headerLines.forEach((line) => {
    drawTextCenter(page, font, 18, line, A4_WIDTH / 2, y);
    y -= 22;
  });
  y -= 12;

  // Customer
  const customerName = payload.customerName.trim();
  const nameWithPrefix = customerName
    ? customerName.startsWith("לכבוד")
      ? customerName
      : `לכבוד ${customerName}`
    : "";
  if (nameWithPrefix) {
    drawTextRight(page, font, 16, nameWithPrefix, right, y);
    y -= 24;
  }
  if (payload.customerPhone?.trim()) {
    drawTextRight(page, font, 13, payload.customerPhone.trim(), right, y);
    y -= 19;
  }
  if (payload.customerEmail?.trim()) {
    drawTextRight(page, font, 13, payload.customerEmail.trim(), right, y);
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
  const headerH = 24;

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
      borderColor: rgb(0.82, 0.82, 0.82),
      borderWidth: 0.3,
    });
    const cy = y - headerH / 2 + 4;
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
      const w = font.widthOfTextAtSize(text, 12);
      currentPage.drawText(text, { x: x - w, y: cy, size: 12, font, color: rgb(0, 0, 0) });
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
      wrapText(font, 12, profileStr, colW.profile - 8).length,
      wrapText(font, 12, detailsStr, colW.details - 8).length
    );
    const rowH = rowLines * lineH + 6;
    checkNewPage(rowH);
    currentPage.drawRectangle({
      x: MARGIN_X,
      y: y - rowH,
      width: right - MARGIN_X,
      height: rowH,
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 0.3,
    });
    let by = y - 2 - lineH;
    currentPage.drawText(String(idx + 1), {
      x: colRight.num - 4 - font.widthOfTextAtSize(String(idx + 1), 12),
      y: by,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    });
    wrapText(font, 12, profileStr, colW.profile - 8).forEach((line) => {
      currentPage.drawText(line, { x: colRight.profile - 4 - font.widthOfTextAtSize(line, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
      by -= lineH;
    });
    by = y - 2 - lineH;
    currentPage.drawText(dims, { x: colRight.dims - 4 - font.widthOfTextAtSize(dims, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    if (it.location) {
      currentPage.drawText(it.location, { x: colRight.location - 4 - font.widthOfTextAtSize(it.location, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    }
    wrapText(font, 12, detailsStr, colW.details - 8).forEach((line) => {
      currentPage.drawText(line, { x: colRight.details - 4 - font.widthOfTextAtSize(line, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
      by -= lineH;
    });
    by = y - 2 - lineH;
    const unitStr = formatNum(perItem);
    currentPage.drawText(unitStr, { x: colRight.unitPrice - 4 - font.widthOfTextAtSize(unitStr, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    currentPage.drawText(formatNum(qty), { x: colRight.qty - 4 - font.widthOfTextAtSize(formatNum(qty), 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    const totalStr = formatNum(lineTotal);
    currentPage.drawText(totalStr, { x: colRight.total - 4 - font.widthOfTextAtSize(totalStr, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
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
      borderColor: rgb(0.9, 0.9, 0.9),
      borderWidth: 0.3,
    });
    const by = y - 2 - lineH;
    currentPage.drawText(String(items.length + addIdx + 1), { x: colRight.num - 4 - font.widthOfTextAtSize(String(items.length + addIdx + 1), 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    currentPage.drawText(add.name, { x: colRight.profile - 4 - font.widthOfTextAtSize(add.name, 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    currentPage.drawText(formatNum(price), { x: colRight.unitPrice - 4 - font.widthOfTextAtSize(formatNum(price), 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    currentPage.drawText(formatNum(qty), { x: colRight.qty - 4 - font.widthOfTextAtSize(formatNum(qty), 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    currentPage.drawText(formatNum(total), { x: colRight.total - 4 - font.widthOfTextAtSize(formatNum(total), 12), y: by, size: 12, font, color: rgb(0, 0, 0) });
    y -= rowH;
  });

  y -= 18;

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
  drawTextRight(currentPage, font, 13, `מחיר: ${formatMoney(totalSub)}`, boxX + boxW - 12, boxY);
  boxY -= 26;
  drawTextRight(currentPage, font, 13, `מע״מ: ${formatMoney(vat)}`, boxX + boxW - 12, boxY);
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
  drawTextRight(currentPage, font, 16, `סה״כ לתשלום: ${formatMoney(grand)}`, boxX + boxW - 18, boxY + 2);

  // Footer (on last page, near bottom)
  let footerY = A4_HEIGHT - MARGIN_BOTTOM - 80;
  if (payload.notes?.trim()) {
    drawTextRight(currentPage, font, 13, "הערות:", right, footerY);
    footerY -= 20;
    payload.notes
      .trim()
      .split(/\r?\n/)
      .forEach((para) => {
        wrapText(font, 12, para.trim(), A4_WIDTH - MARGIN_X * 2).forEach((line) => {
          drawTextRight(currentPage, font, 12, line, right, footerY);
          footerY -= 15;
        });
      });
    footerY -= 8;
  }
  drawTextRight(currentPage, font, 13, `תאריך: ${dateFmt.format(new Date())}`, right, footerY);
  footerY -= 20;
  footerY -= 10;
  drawTextRight(currentPage, font, 13, "חתימה:", right, footerY);

  const pdfBytes = await doc.save();
  return pdfBytes;
}
