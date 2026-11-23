/**
 * Build quote PDF with pdf-lib + @pdf-lib/fontkit.
 * Uses Hebrew font (WOFF2/TTF) from CDN – proper Unicode/Identity-H support, no local fonts needed.
 * Implements RTL (Right-to-Left) reversal so Hebrew displays correctly.
 */
import type { PdfQuotePayload, PdfLineItem, PdfFreeFormAddition } from "./pdfExporter";
import { ADDITION_PROFILE_LABEL, documentTypeLabel, normalizeDocumentType } from "./types";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { isOpenAreaRate, lineTotal as pricedLineTotal, lineUnitPrice, parseLooseNumber, quoteMoney } from "./quote/pricing";
import { drawQuoteProducts } from "./quote/quotePdfProducts";
import { imageKind, loadLogoBytes } from "./quote/manufacturers";
import { drawCompanyLogoHeader, embedCompanyLogo } from "./brand/logoAsset";

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

/** Spaces that may wrap. A non-breaking space keeps a price such as "(650 ₪)" on one line. */
function splitWords(text: string): string[] {
  return text.split(/[^\S\u00A0]+/).filter((word) => word.length > 0);
}

/** Reverse word order for RTL – words are correct but sentence order is opposite. */
function reverseWordOrder(text: string): string {
  if (!text || !HEBREW_OR_SYMBOL.test(text)) return text;
  return splitWords(text).reverse().join(" ");
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
  // Non-breaking space keeps the shekel attached to the digits when laid out LTR beside a Hebrew label.
  return `${moneyFmt.format(v)}\u00A0₪`;
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
export async function loadHebrewFontBytes(): Promise<ArrayBuffer> {
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

/**
 * Draw one table-cell line right-aligned. Words separated by a non-breaking space (for example
 * "(650 ₪)") are kept together as one unit so the price is not split or reversed.
 */
function drawCellText(
  page: PDFPage,
  hebrewFont: PDFFont,
  latinFont: PDFFont,
  size: number,
  text: string,
  xRight: number,
  y: number,
  color = rgb(0, 0, 0)
): void {
  const rtlToken = (token: string): string => {
    // Hebrew joined to other text without spaces (e.g. "סמפי/נייס") must flip its parts for RTL.
    // Tokens with digits (prices, sizes) keep their order.
    if (!HEBREW_OR_SYMBOL.test(token) || /\d/.test(token)) return token;
    const parts = segmentForFonts(token).map((s) => s.text);
    if (parts.length < 2) return token;
    return parts
      .reverse()
      .join("")
      .replace(/[()]/g, (ch) => (ch === "(" ? ")" : "("));
  };
  const ordered = HEBREW_OR_SYMBOL.test(text) ? splitWords(text).reverse().map(rtlToken).join(" ") : text;
  const segments = segmentForFonts(ordered.replace(/\u00A0/g, " "));
  let x = xRight;
  for (let i = segments.length - 1; i >= 0; i--) {
    const { text: seg, useHebrew } = segments[i];
    const font = useHebrew ? hebrewFont : latinFont;
    x -= font.widthOfTextAtSize(seg, size);
    page.drawText(seg, { x, y, size, font, color });
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

/** Wrap text to fit width (words first; overlong tokens are split by character). Newlines force a new line. */
function wrapText(hebrewFont: PDFFont, latinFont: PDFFont, size: number, text: string, maxWidth: number): string[] {
  if (!text) return [];
  if (text.includes("\n")) {
    return text.split(/\n/).flatMap((part) => wrapText(hebrewFont, latinFont, size, part, maxWidth));
  }
  const words = splitWords(text);
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
  const words = splitWords(text);
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
  const latinBold = doc.embedStandardFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const right = A4_WIDTH - MARGIN_X;
  let y = A4_HEIGHT - MARGIN_TOP;

  const drawRule = (thickness = 0.5, color = rgb(0.78, 0.82, 0.87)): void => {
    page.drawLine({
      start: { x: MARGIN_X, y },
      end: { x: right, y },
      thickness,
      color,
    });
    y -= 10;
  };

  // Document title (both types) goes below מס מ.ע in the company header
  const documentType = normalizeDocumentType(payload.documentType);
  const docTitle =
    (payload.title && payload.title.trim()) || documentTypeLabel(documentType);
  const pdfDate = payload.pdfDateMs ? new Date(payload.pdfDateMs) : new Date();
  const dateText = dateFmt.format(pdfDate);

  // Company header: logo, then the company details below it. Text baselines are drawn at y.
  const headerTop = A4_HEIGHT - MARGIN_TOP + 14;
  const logoBottom = drawCompanyLogoHeader(page, await embedCompanyLogo(doc), headerTop);
  const hasLogo = logoBottom !== headerTop;
  if (hasLogo) y = logoBottom - 10;
  const headerLines = [
    "אלום סמעאן סאמי",
    "ביצוע עבודות אלומיניום ותריס",
    "פסוטה      ד.ת 528      :פקס/טל 9870933     :נייד 0526475531",
    "'מס מ.ע  023107659 ",
  ];
  headerLines.forEach((line, index) => {
    const size = hasLogo ? (index === 0 ? 16 : 11) : 18;
    drawTextCenter(page, hebrewFont, latinFont, size, line, A4_WIDTH / 2, y);
    y -= hasLogo ? (index === 0 ? 18 : 14) : 22;
  });

  y -= 4;
  drawTextCenter(page, hebrewFont, latinFont, 20, docTitle, A4_WIDTH / 2, y);
  y -= 18;

  // Meta strip: quotation / payment-request number, date, validity — polished RTL row.
  const metaParts: string[] = [];
  if (
    documentType === "payment_request" &&
    payload.documentNumber != null &&
    payload.documentNumber > 0
  ) {
    metaParts.push(`מס׳ ${String(Math.floor(payload.documentNumber)).padStart(4, "0")}`);
  }
  if (documentType === "quote" && payload.quoteNumber != null && payload.quoteNumber > 0) {
    metaParts.push(`הצעה מס׳ ${String(Math.floor(payload.quoteNumber)).padStart(4, "0")}`);
  }
  metaParts.push(`תאריך: ${dateText}`);
  if (payload.validityText?.trim()) {
    metaParts.push(`תוקף: ${payload.validityText.trim()}`);
  }
  if (metaParts.length) {
    const metaH = 26;
    page.drawRectangle({
      x: MARGIN_X,
      y: y - metaH,
      width: right - MARGIN_X,
      height: metaH,
      color: rgb(0.94, 0.97, 1),
      borderColor: rgb(0.78, 0.82, 0.87),
      borderWidth: 0.6,
    });
    drawTextCenter(page, hebrewFont, latinFont, 11, metaParts.join("   ·   "), A4_WIDTH / 2, y - 17);
    // Small gap between the meta strip and לכבוד so the name does not sit against the bar.
    y -= metaH + 16;
  } else {
    y -= 4;
  }

  // Customer block (לכבוד + contact). Draw Hebrew label and name as separate runs so Latin
  // names (e.g. Thaber Assaf) keep their LTR word order beside RTL "לכבוד".
  const customerName = payload.customerName.trim().replace(/^לכבוד\s+/, "");
  if (customerName) {
    const label = "לכבוד";
    const size = 15;
    const labelW = textWidth(hebrewFont, latinFont, size, label);
    const gap = latinFont.widthOfTextAtSize(" ", size);
    const nameW = textWidth(hebrewFont, latinFont, size, customerName);
    drawTextRight(page, hebrewFont, latinFont, size, label, right, y);
    const nameRight = right - labelW - gap;
    if (HEBREW_OR_SYMBOL.test(customerName)) {
      drawTextRight(page, hebrewFont, latinFont, size, customerName, nameRight, y);
    } else {
      // Latin / digits: place as one LTR block immediately left of "לכבוד"
      let x = nameRight - nameW;
      for (const { text: seg, useHebrew } of segmentForFonts(customerName)) {
        const font = useHebrew ? hebrewFont : latinFont;
        page.drawText(seg, { x, y, size, font, color: rgb(0, 0, 0) });
        x += font.widthOfTextAtSize(seg, size);
      }
    }
    page.drawLine({
      start: { x: nameRight - nameW, y: y - 3 },
      end: { x: nameRight, y: y - 3 },
      thickness: 0.8,
      color: rgb(0.03, 0.4, 0.62),
    });
    y -= 20;
  }
  if (payload.customerPhone?.trim()) {
    drawTextRight(page, hebrewFont, latinFont, 11, `טלפון: ${payload.customerPhone.trim()}`, right, y);
    y -= 15;
  }
  if (payload.customerEmail?.trim()) {
    drawTextRight(page, hebrewFont, latinFont, 11, payload.customerEmail.trim(), right, y);
    y -= 15;
  }

  const items = payload.items || [];

  // Profile companies used in this quote, by logo (name when a logo is unavailable).
  const companies = items.flatMap((it, i) =>
    it.manufacturer && items.findIndex((o) => o.manufacturer?.id === it.manufacturer!.id) === i ? [it.manufacturer] : []
  );
  const companyLogos = new Map<string, PDFImage>();
  for (const company of companies) {
    if (!company.logoUrl) continue;
    const bytes = await loadLogoBytes(company.logoUrl);
    const kind = bytes ? imageKind(bytes) : null;
    if (bytes && kind) companyLogos.set(company.id, kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes));
  }
  if (companies.length) {
    const LOGO_H = 22;
    const label = companies.length > 1 ? "מערכות אלומיניום" : "מערכת אלומיניום";
    const labelSize = 11;
    y -= 4;
    const rowMid = y - LOGO_H / 2 + 4;
    drawTextRight(page, hebrewFont, latinFont, labelSize, label, right, rowMid - 4);
    let x = right - textWidth(hebrewFont, latinFont, labelSize, label) - 14;
    for (const company of companies) {
      const logo = companyLogos.get(company.id);
      if (logo) {
        const w = Math.min(110, (logo.width / logo.height) * LOGO_H);
        const h = (logo.height / logo.width) * w;
        if (x - w < MARGIN_X) break;
        page.drawImage(logo, { x: x - w, y: rowMid - h / 2, width: w, height: h });
        x -= w + 18;
      } else {
        const w = textWidth(hebrewFont, latinFont, 12, company.name);
        if (x - w < MARGIN_X) break;
        drawTextRight(page, hebrewFont, latinFont, 12, company.name, x, rowMid - 4);
        x -= w + 18;
      }
    }
    y -= LOGO_H + 6;
  }
  drawRule(0.8, rgb(0.03, 0.4, 0.62));

  // Items table
  const additions = payload.freeFormAdditions || [];
  const dimUnit = payload.dimensionUnit ?? "cm";
  const taxRate = normalizeTax(parseNum(payload.taxPercentText));
  const showTotalsBox = payload.showTotals !== false;

  const rows = items.map((it: PdfLineItem) => {
    const w = parseNum(it.widthCm);
    const h = parseNum(it.heightCm);
    const rateOnly = isOpenAreaRate(it);
    const dims = rateOnly
      ? "—"
      : dimUnit === "mm" ? `${Math.round(w * 10)}×${Math.round(h * 10)}` : `${Math.round(w)}×${Math.round(h)}`;
    const qty = Math.max(0, parseNum(it.qty));
    const perItem = rateOnly ? parseLooseNumber(it.unitPrice) : lineUnitPrice(it);
    const lineTotal = pricedLineTotal(it);
    const unitPriceText = rateOnly ? `${formatNum(perItem)} למ״ר` : formatNum(perItem);
    const totalText = rateOnly ? "—" : `${formatNum(lineTotal)} ₪`;
    const profileStr = it.profileName || "";
    const locationStr = it.location || "";
    const addonLines = (it.addons || [])
      .filter((a) => a.checked)
      .map((a) => `${a.name} (${formatNum(parseLooseNumber(a.price))}\u00A0₪)`);
    const detailsStr = [it.details?.trim(), ...addonLines].filter(Boolean).join("\n");
    // With several companies in one quote, each row names its company under the profile.
    const company = companies.length > 1 ? it.manufacturer : undefined;
    return { dims, qty, perItem, lineTotal, unitPriceText, totalText, rateOnly, profileStr, locationStr, detailsStr, company };
  });

  const CELL_PAD = 10;
  const tableWidth = right - MARGIN_X;
  const dimsHeader = dimUnit === "mm" ? "מידות (מ״מ)" : "מידות (ס״מ)";

  const numValues = [...rows.map((_, i) => String(i + 1)), ...additions.map((_, i) => String(items.length + i + 1))];
  const unitPriceValues = [...rows.map((r) => r.unitPriceText), ...additions.map((a) => formatNum(parseNum(a.price)))];
  const qtyValues = [...rows.map((r) => formatNum(r.qty)), ...additions.map((a) => formatNum(Math.max(0, parseNum(a.qty))))];
  const lineTotals = [
    ...rows.map((r) => r.lineTotal),
    ...additions.map((a) => parseNum(a.price) * Math.max(0, parseNum(a.qty))),
  ];
  // When the totals box is hidden each total also gets a wrapped "עם מע״מ ..." line; size for its amount part.
  const totalValues = [
    ...rows.map((r) => r.totalText),
    ...lineTotals.slice(rows.length).map((t) => formatNum(t) + " ₪"),
    ...(showTotalsBox ? [] : lineTotals.map((t) => formatNum(t * (1 + taxRate)) + " ₪")),
  ];

  // Column layout: every column tries to fit its content on one line. Money, quantity, number and
  // dimensions are never wrapped; when the table is too wide the font steps down first, and only
  // then do the text columns (details, location, profile) wrap — at word boundaries, never inside a price.
  const locationHasContent = rows.some((r) => r.locationStr.trim());
  const detailsHasContent =
    rows.some((r) => r.detailsStr.trim()) || additions.some((a) => (a.name || "").trim());
  const textColumns = [
    {
      key: "profile" as const,
      header: "פרופיל",
      texts: [
        ...rows.flatMap((r) => [r.profileStr, ...(r.company && !companyLogos.get(r.company.id) ? [r.company.name] : [])]),
        ...(additions.length ? [ADDITION_PROFILE_LABEL] : []),
      ],
      hide: false,
    },
    { key: "location" as const, header: "מיקום", texts: rows.map((r) => r.locationStr), hide: !locationHasContent },
    {
      key: "details" as const,
      header: "פרטים",
      texts: [...rows.flatMap((r) => r.detailsStr.split("\n")), ...additions.map((a) => a.name || "")],
      hide: !detailsHasContent,
    },
  ];

  const layoutAt = (size: number) => {
    const headerSize = Math.min(11, size + 0.5);
    const measure = (t: string, s = size) => (t ? textWidth(hebrewFont, latinFont, s, t) : 0);
    const fit = (header: string, values: string[]) =>
      Math.ceil(Math.max(measure(header, headerSize), ...values.map((v) => measure(v))) + CELL_PAD);
    const widths = {
      num: fit("מס׳", numValues),
      profile: 0,
      dims: Math.ceil(Math.max(measure(dimsHeader, Math.min(10, headerSize)), ...rows.map((r) => measure(r.dims))) + CELL_PAD),
      location: 0,
      details: 0,
      unitPrice: fit("מחיר ליח׳", unitPriceValues),
      qty: fit("כמות", qtyValues),
      total: fit("סה״כ", totalValues),
    };
    const text = textColumns.map((c) => {
      if (c.hide) return { key: c.key, natural: 0, min: 0 };
      const longestToken = Math.max(0, ...c.texts.flatMap((t) => splitWords(t).map((w) => measure(w))));
      const headerW = measure(c.header, headerSize);
      const min = Math.ceil(Math.max(headerW, longestToken) + CELL_PAD);
      const natural = Math.ceil(Math.max(min, ...c.texts.map((t) => measure(t) + CELL_PAD)));
      return { key: c.key, natural, min };
    });
    const fixed = widths.num + widths.dims + widths.unitPrice + widths.qty + widths.total;
    const naturalSum = fixed + text.reduce((s, c) => s + c.natural, 0);
    return { size, headerSize, widths, text, fixed, naturalSum };
  };

  const SIZES = [11, 10.5, 10, 9.5, 9, 8.5, 8];
  let layout = layoutAt(SIZES[SIZES.length - 1]);
  for (const s of SIZES) {
    const candidate = layoutAt(s);
    if (candidate.naturalSum <= tableWidth) {
      layout = candidate;
      break;
    }
  }
  const FS = layout.size;
  const HEADER_FS = layout.headerSize;
  const colW = { ...layout.widths };
  const available = tableWidth - layout.fixed;
  const visibleText = layout.text.filter((c) => c.natural > 0);
  const naturalText = visibleText.reduce((s, c) => s + c.natural, 0);
  if (naturalText <= available) {
    // Everything fits on one line: share the spare width among the text columns.
    const spare = available - naturalText;
    visibleText.forEach((c) => {
      colW[c.key] = c.natural + (naturalText > 0 ? (spare * c.natural) / naturalText : spare / visibleText.length);
    });
  } else {
    // Still too wide at the smallest size: shrink text columns toward their longest word, widest first.
    const slack = visibleText.reduce((s, c) => s + (c.natural - c.min), 0);
    const over = naturalText - available;
    visibleText.forEach((c) => {
      const cut = slack > 0 ? Math.min(c.natural - c.min, (over * (c.natural - c.min)) / slack) : 0;
      colW[c.key] = c.natural - cut;
    });
    const used = visibleText.reduce((s, c) => s + colW[c.key], 0);
    if (used > available && used > 0) visibleText.forEach((c) => (colW[c.key] *= available / used));
  }

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
  const lineH = Math.round(FS * 1.4);
  const headerH = 36;

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
      { text: "מס׳", xCenter: colRight.num - colW.num / 2, show: true },
      { text: "פרופיל", xCenter: colRight.profile - colW.profile / 2, show: colW.profile > 1 },
      { text: "מיקום", xCenter: colRight.location - colW.location / 2, show: colW.location > 1 },
      { text: "פרטים", xCenter: colRight.details - colW.details / 2, show: colW.details > 1 },
      { text: "מחיר ליח׳", xCenter: colRight.unitPrice - colW.unitPrice / 2, show: true },
      { text: "כמות", xCenter: colRight.qty - colW.qty / 2, show: true },
      { text: "סה״כ", xCenter: colRight.total - colW.total / 2, show: true },
    ];
    headers.forEach(({ text, xCenter, show }) => {
      if (show) drawTextCenter(currentPage, hebrewFont, latinFont, HEADER_FS, text, xCenter, cy);
    });
    // מידות: title + order hint (width × height) matching the values below
    drawTextCenter(
      currentPage,
      hebrewFont,
      latinFont,
      Math.min(10, HEADER_FS),
      dimsHeader,
      dimsX,
      y - 14
    );
    drawTextCenter(currentPage, hebrewFont, latinFont, 8, "רוחב × גובה", dimsX, y - 28, {
      reverseWords: false,
    });
    y -= headerH;
  };

  drawTableHeader();

  rows.forEach(({ dims, qty, lineTotal, unitPriceText, totalText, rateOnly, profileStr, locationStr, detailsStr, company }, idx: number) => {
    const lineTotalWithVat = lineTotal * (1 + taxRate);
    const companyLogo = company ? companyLogos.get(company.id) : undefined;
    const cellW = (w: number) => w - CELL_PAD + 2;
    const profileLines = [
      ...wrapText(hebrewFont, latinFont, FS, profileStr, cellW(colW.profile)),
      ...(company && !companyLogo ? [company.name] : []),
    ];
    const ROW_LOGO_H = 11;
    const locationLines = wrapText(hebrewFont, latinFont, FS, locationStr, cellW(colW.location));
    const detailsLines = wrapText(hebrewFont, latinFont, FS, detailsStr, cellW(colW.details));
    const unitPriceLines = [unitPriceText];
    const qtyLines = [formatNum(qty)];
    const baseTotalText = rateOnly ? totalText : `${formatNum(lineTotal)} ₪`;
    const vatTotalText = `עם מע״מ ${formatNum(lineTotalWithVat)} ₪`;
    const baseTotalLines = [baseTotalText];
    const vatTotalLines = !showTotalsBox
      ? wrapText(hebrewFont, latinFont, FS, vatTotalText, cellW(colW.total))
      : [];
    const totalLinesWrapped: string[] = [...baseTotalLines, ...vatTotalLines];
    const rowLines = Math.max(
      1,
      profileLines.length,
      locationLines.length,
      detailsLines.filter(Boolean).length,
      totalLinesWrapped.length
    );
    const profileH = profileLines.length * lineH + (companyLogo ? ROW_LOGO_H + 4 : 0);
    const rowH = Math.max(rowLines * lineH, profileH) + 8;
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
    const rowBaseline = y - 4 - FS;
    const drawT = (t: string, xR: number, yy: number, color = rgb(0, 0, 0)) =>
      drawCellText(currentPage, hebrewFont, latinFont, FS, t, xR - CELL_PAD / 2, yy, color);
    const drawColLines = (lines: string[], xR: number) => {
      let yy = rowBaseline;
      for (const line of lines) {
        if (line) drawT(line, xR, yy);
        yy -= lineH;
      }
    };
    drawT(String(idx + 1), colRight.num, rowBaseline);
    drawColLines(profileLines, colRight.profile);
    if (companyLogo) {
      const w = Math.min(colW.profile - 8, (companyLogo.width / companyLogo.height) * ROW_LOGO_H);
      const h = (companyLogo.height / companyLogo.width) * w;
      currentPage.drawImage(companyLogo, {
        x: colRight.profile - 4 - w,
        y: rowBaseline - profileLines.length * lineH + lineH - 4 - h,
        width: w,
        height: h,
      });
    }
    // מידות stays on one line so the full WxH number is readable at a glance
    drawT(dims, colRight.dims, rowBaseline);
    drawColLines(locationLines, colRight.location);
    drawColLines(detailsLines.filter(Boolean), colRight.details);
    drawColLines(unitPriceLines, colRight.unitPrice);
    drawColLines(qtyLines, colRight.qty);
    // Total column: base total and, when overall box is hidden, extra wrapped line(s) "עם מע״מ ..." with background highlight
    let totalY = rowBaseline;
    totalLinesWrapped.forEach((line, lineIdx) => {
      const isVatLine = lineIdx >= baseTotalLines.length;
      if (isVatLine) {
        // Light background marker behind the "עם מע״מ" line only (single-line height, aligned to this line’s baseline)
        const rectX = colRight.total - colW.total;
        const rectHeight = FS;
        const rectY = totalY - 2;
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
    const cellW = (w: number) => w - CELL_PAD + 2;
    const profileLines = wrapText(hebrewFont, latinFont, FS, ADDITION_PROFILE_LABEL, cellW(colW.profile));
    const nameLines = wrapText(hebrewFont, latinFont, FS, add.name || "", cellW(colW.details));
    const unitPriceLines = [formatNum(price)];
    const qtyLines = [formatNum(qty)];
    const baseTotalLines = [baseTotalText];
    const vatTotalLines = !showTotalsBox
      ? wrapText(hebrewFont, latinFont, FS, vatTotalText, cellW(colW.total))
      : [];
    const totalLinesWrapped: string[] = [...baseTotalLines, ...vatTotalLines];
    const rowLines = Math.max(
      1,
      profileLines.length,
      nameLines.length,
      unitPriceLines.length,
      qtyLines.length,
      totalLinesWrapped.length
    );
    const rowH = rowLines * lineH + 8;
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
    const rowBaseline = y - 4 - FS;
    const drawAdd = (t: string, xR: number, yy: number, color = rgb(0, 0, 0)) =>
      drawCellText(currentPage, hebrewFont, latinFont, FS, t, xR - CELL_PAD / 2, yy, color);
    const drawColLines = (lines: string[], xR: number) => {
      let yy = rowBaseline;
      for (const line of lines) {
        if (line) drawAdd(line, xR, yy);
        yy -= lineH;
      }
    };
    drawAdd(String(items.length + addIdx + 1), colRight.num, rowBaseline);
    drawColLines(profileLines, colRight.profile);
    drawColLines(nameLines, colRight.details);
    drawColLines(unitPriceLines, colRight.unitPrice);
    drawColLines(qtyLines, colRight.qty);
    // Total column for free-form additions (possibly multi-line, wrapped, with background highlight for "עם מע״מ")
    let totalY = rowBaseline;
    totalLinesWrapped.forEach((line, lineIdx) => {
      const isVatLine = lineIdx >= baseTotalLines.length;
      if (isVatLine) {
        const rectX = colRight.total - colW.total;
        const rectHeight = FS;
        const rectY = totalY - 2;
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

  // Totals box and footer (חתימה, הערות) sit side by side in one bottom band – they do not
  // affect each other; we only add a new page when the table would run into this band.
  // Leave a reserved strip for page numbers below the signature/notes band.
  const PAGE_NUM_STRIP = 28;
  const footerBaseY = PAGE_NUM_STRIP + 8;
  const money = quoteMoney({
    lines: items,
    freeForm: additions,
    taxPercentText: payload.taxPercentText,
    discountPercentText: payload.discountPercentText,
  });
  const hasDiscount = money.discount > 0;
  const TOTALS_BOX_HEIGHT = hasDiscount ? 122 : 96;
  const FOOTER_ZONE_HEIGHT = 130;
  const BOTTOM_BAND_HEIGHT = Math.max(TOTALS_BOX_HEIGHT, FOOTER_ZONE_HEIGHT) + PAGE_NUM_STRIP;

  // Only add a new page when table content would extend into the bottom band (footer zone).
  if (y < footerBaseY + BOTTOM_BAND_HEIGHT) {
    currentPage = doc.addPage([A4_WIDTH, A4_HEIGHT]);
    y = A4_HEIGHT - MARGIN_TOP;
  }

  // Wide enough for large amounts (e.g. 180,567 ₪) next to Hebrew labels.
  const boxW = 280;
  const boxX = MARGIN_X;
  let totalsBoxBottomY: number | null = null;

  /** Hebrew label on the right, LTR money amount immediately to its left — keeps ₪ with the number. */
  const drawPriceLine = (
    page: PDFPage,
    label: string,
    amount: number,
    xRight: number,
    baseline: number,
    size: number,
    color = rgb(0, 0, 0)
  ): void => {
    const moneyText = formatMoney(amount);
    drawTextRight(page, hebrewFont, latinFont, size, label, xRight, baseline);
    const labelW = textWidth(hebrewFont, latinFont, size, label);
    const gap = latinFont.widthOfTextAtSize(" ", size);
    const moneyW = textWidth(hebrewFont, latinFont, size, moneyText);
    let x = xRight - labelW - gap - moneyW;
    for (const { text: seg, useHebrew } of segmentForFonts(moneyText)) {
      const font = useHebrew ? hebrewFont : latinFont;
      page.drawText(seg, { x, y: baseline, size, font, color });
      x += font.widthOfTextAtSize(seg, size);
    }
  };

  // Totals box: original style (מחיר / מע״מ / סה״כ לתשלום) with amounts that fit cleanly.
  if (showTotalsBox) {
    const totalSub = money.sub;
    const vat = money.tax;
    const grand = money.grand;

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
    let textY = boxY + (hasDiscount ? 96 : 70);
    drawPriceLine(currentPage, "מחיר:", totalSub, boxX + boxW - 12, textY, 13);
    if (hasDiscount) {
      textY -= 22;
      drawPriceLine(currentPage, "הנחה:", money.discount, boxX + boxW - 12, textY, 13);
    }
    textY -= 26;
    drawPriceLine(currentPage, "מע״מ:", vat, boxX + boxW - 12, textY, 13);
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
    drawPriceLine(currentPage, "סה״כ לתשלום:", grand, boxX + boxW - 18, textY + 2, 16);
  }

  // Footer (חתימה, תאריך, הערות) – fixed position on the right of the same bottom band.
  const GAP_BETWEEN_BOX_AND_FOOTER = 24;
  const FULL_NOTES_WIDTH = right - MARGIN_X;
  const NARROW_NOTES_WIDTH = right - (boxX + boxW + GAP_BETWEEN_BOX_AND_FOOTER);
  const NOTES_LINE_STEP = 15;
  const GAP_LABEL_ABOVE_FIRST_LINE = 20;

  // Validity already appears in the header meta strip — do not repeat it in the footer notes.
  const noteParagraphs = [
    ...(payload.notes?.trim()
      ? payload.notes
          .trim()
          .split(/\r?\n/)
          .map((p) => p.trim())
          .filter(Boolean)
      : []),
    payload.paymentTerms?.trim() ? `תנאי תשלום: ${payload.paymentTerms.trim()}` : "",
    payload.installationTerms?.trim() ? `התקנה: ${payload.installationTerms.trim()}` : "",
  ].filter(Boolean);

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

  // Footer order (top → bottom on page): "הערות:", note lines, then signature.
  // Date already appears in the header meta strip.

  if (wrappedNoteLines.length > 0) {
    const noteLines = wrappedNoteLines;
    const n = noteLines.length;
    const firstLineY = footerBaseY + (n > 0 ? (n - 1) * NOTES_LINE_STEP : 0);
    for (let i = 0; i < n; i++) {
      drawTextRight(currentPage, hebrewFont, latinFont, 11, noteLines[i], right, firstLineY - i * NOTES_LINE_STEP);
    }
    const labelY = firstLineY + GAP_LABEL_ABOVE_FIRST_LINE;
    drawTextRight(currentPage, hebrewFont, latinFont, 12, "הערות:", right, labelY);
    footerY = labelY + 36;
  }

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
        const sigW = 110;
        const sigH = 36;
        currentPage.drawImage(sigImg, { x: right - sigW, y: footerY, width: sigW, height: sigH });
        break;
      }
    } catch {
      /* ignore */
    }
  }
  drawTextRight(currentPage, hebrewFont, latinFont, 12, "חתימה:", right, footerY + 42);

  const customerLabel = payload.customerName.trim() || docTitle;
  const quoteLabel =
    documentType === "quote" && payload.quoteNumber != null && payload.quoteNumber > 0
      ? `הצעה מס׳ ${String(Math.floor(payload.quoteNumber)).padStart(4, "0")}`
      : docTitle;

  if (payload.includeProductDetails !== false) {
    await drawQuoteProducts({
      doc,
      fonts: {
        hebrew: hebrewFont,
        latin: latinFont,
        latinBold,
        hebrewChars: new Set(hebrewFont.getCharacterSet()),
      },
      items,
      companyLogos,
      footerLabel: `${quoteLabel} · ${customerLabel}`,
    });
  }

  // Page numbers + thin footer rule on every page (pricing pages and product appendix).
  const allPages = doc.getPages();
  const pageCount = allPages.length;
  for (let i = 0; i < pageCount; i++) {
    const p = allPages[i];
    const footerYPos = 14;
    p.drawLine({
      start: { x: MARGIN_X, y: footerYPos + 12 },
      end: { x: right, y: footerYPos + 12 },
      thickness: 0.4,
      color: rgb(0.78, 0.82, 0.87),
    });
    // Footer identity: Hebrew quote label (RTL) + Latin customer name kept LTR.
    const footerSize = 8;
    if (customerLabel && !HEBREW_OR_SYMBOL.test(customerLabel)) {
      const sep = " · ";
      const labelW = textWidth(hebrewFont, latinFont, footerSize, quoteLabel);
      const sepW = latinFont.widthOfTextAtSize(sep, footerSize);
      const nameW = textWidth(hebrewFont, latinFont, footerSize, customerLabel);
      drawTextRight(p, hebrewFont, latinFont, footerSize, quoteLabel, right, footerYPos);
      let nx = right - labelW - sepW - nameW;
      p.drawText(sep, { x: right - labelW - sepW, y: footerYPos, size: footerSize, font: latinFont, color: rgb(0, 0, 0) });
      for (const { text: seg, useHebrew } of segmentForFonts(customerLabel)) {
        const font = useHebrew ? hebrewFont : latinFont;
        p.drawText(seg, { x: nx, y: footerYPos, size: footerSize, font, color: rgb(0, 0, 0) });
        nx += font.widthOfTextAtSize(seg, footerSize);
      }
    } else {
      drawTextRight(
        p,
        hebrewFont,
        latinFont,
        footerSize,
        customerLabel ? `${quoteLabel} · ${customerLabel}` : quoteLabel,
        right,
        footerYPos
      );
    }
    const pageText = `עמוד ${i + 1} מתוך ${pageCount}`;
    // Physical left (document end in RTL)
    const pageW = textWidth(hebrewFont, latinFont, footerSize, pageText);
    drawTextRight(p, hebrewFont, latinFont, footerSize, pageText, MARGIN_X + pageW, footerYPos);
  }

  const pdfBytes = await doc.save();
  return pdfBytes;
}
