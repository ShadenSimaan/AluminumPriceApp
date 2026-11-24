import { PDFString, rgb, type PDFDocument, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import { drawLine, wrap, type PdfFonts } from "../../rfq/pdf/pdfText";
import { imageKind, loadLogoBytes } from "../manufacturers";
import type { AppendixPlan, ChartPlan, SheetPlan } from "./appendix";
import { BRANDS, type SeriesAsset, type SeriesBrand, type SourceRef } from "./catalog";
import { PALETTE_DISCLAIMER, paletteSwatchCount, swatchName } from "./palettes";

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
const LINK: RGB = rgb(0.05, 0.33, 0.6);

type TextOpts = { size: number; bold?: boolean; color?: RGB; align?: "start" | "end" | "center"; ltr?: boolean };

type ImageCache = Map<string, PDFImage | null>;

async function embedImage(doc: PDFDocument, cache: ImageCache, url: string): Promise<PDFImage | null> {
  if (cache.has(url)) return cache.get(url)!;
  let image: PDFImage | null = null;
  try {
    const bytes = await loadLogoBytes(url);
    const kind = bytes ? imageKind(bytes) : null;
    if (bytes && kind) image = kind === "png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    image = null;
  }
  cache.set(url, image);
  return image;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hebrewDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}.${m}.${y}` : iso;
}

function itemsLabel(numbers: number[]): string {
  return numbers.length === 1 ? `פריט ${numbers[0]}` : `פריטים ${numbers.join(", ")}`;
}

/** Writes on a sequence of A4 pages, right-to-left, adding pages (with a running header) as needed. */
class PageWriter {
  page!: PDFPage;
  y = 0;
  pages: PDFPage[] = [];
  continuation: string | null = null;
  private readonly doc: PDFDocument;
  readonly fonts: PdfFonts;

  constructor(doc: PDFDocument, fonts: PdfFonts) {
    this.doc = doc;
    this.fonts = fonts;
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.pages.push(this.page);
    this.y = PAGE_H - M;
    if (this.continuation) {
      this.text(this.continuation, 0, CONTENT_W, this.y - 9, { size: 9, color: MUTED });
      this.page.drawLine({ start: { x: M, y: this.y - 15 }, end: { x: PAGE_W - M, y: this.y - 15 }, thickness: 0.6, color: RULE });
      this.y -= 26;
    }
  }

  /** Starts a new page unless `h` points still fit above the footer. */
  ensure(h: number): void {
    if (this.y - h < BOTTOM) this.newPage();
  }

  /** `off` is measured from the right margin (reading start); `w` is the box width. */
  text(text: string, off: number, w: number, baseline: number, o: TextOpts, page: PDFPage = this.page): void {
    const left = PAGE_W - M - off - w;
    const align = o.align === "center" ? "center" : o.align === "end" ? "left" : "right";
    const x = align === "center" ? left + w / 2 : align === "left" ? left : left + w;
    drawLine(page, this.fonts, text, x, baseline, {
      size: o.size,
      bold: o.bold,
      color: o.color ?? INK,
      align,
      docRtl: true,
      forceRtl: o.ltr ? false : undefined,
    });
  }

  /** Wrapped paragraph; each line may move to a new page. */
  paragraph(text: string, o: TextOpts & { off?: number; w?: number; lh?: number }): void {
    const off = o.off ?? 0;
    const w = o.w ?? CONTENT_W - off;
    const lh = o.lh ?? o.size * 1.42;
    for (const line of wrap(text, this.fonts, o.size, w, o.bold)) {
      this.ensure(lh);
      this.text(line, off, w, this.y - o.size, o);
      this.y -= lh;
    }
  }

  link(url: string, x: number, y: number, w: number, h: number, page: PDFPage = this.page): void {
    const annot = this.doc.context.obj({
      Type: "Annot",
      Subtype: "Link",
      Rect: [x, y, x + w, y + h],
      Border: [0, 0, 0],
      A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
    });
    page.node.addAnnot(this.doc.context.register(annot));
  }

  /** "label — host" line linking to the source. */
  sourceLine(label: string, url: string, size: number, off = 0): void {
    const text = `${label} — ${hostOf(url)}`;
    for (const line of wrap(text, this.fonts, size, CONTENT_W - off)) {
      this.ensure(size + 4);
      this.text(line, off, CONTENT_W - off, this.y - size, { size, color: LINK });
      this.link(url, M, this.y - size - 2, CONTENT_W - off, size + 4);
      this.y -= size + 4;
    }
  }

  sectionHeading(title: string, keepWith = 48): void {
    this.ensure(26 + keepWith);
    this.y -= 6;
    this.page.drawRectangle({ x: M, y: this.y - 18, width: CONTENT_W, height: 18, color: FILL, borderColor: RULE, borderWidth: 0.5 });
    this.text(title, 6, CONTENT_W - 12, this.y - 13, { size: 11.5, bold: true, color: ACCENT });
    this.y -= 26;
  }

  subHeading(title: string, keepWith = 30): void {
    this.ensure(16 + keepWith);
    this.text(title, 2, CONTENT_W - 2, this.y - 9.5, { size: 9.5, bold: true, color: MUTED });
    this.y -= 15;
  }

  /** Label column on the right, wrapped value beside it; the row is kept on one page. */
  row(label: string, value: string, o: { labelW?: number; size?: number; ltrLabel?: boolean; color?: RGB } = {}): void {
    const size = o.size ?? 9.5;
    const labelW = o.labelW ?? 92;
    const lh = size * 1.4;
    const valueOff = labelW + 10;
    const valueW = CONTENT_W - valueOff - 4;
    const labelLines = wrap(label, this.fonts, size, labelW - 4, true);
    const valueLines = wrap(value, this.fonts, size, valueW);
    const h = Math.max(labelLines.length, valueLines.length) * lh + 3;
    this.ensure(h);
    labelLines.forEach((l, i) => this.text(l, 4, labelW - 4, this.y - size - i * lh, { size, bold: true, color: MUTED, ltr: o.ltrLabel }));
    valueLines.forEach((l, i) => this.text(l, valueOff, valueW, this.y - size - i * lh, { size, color: o.color ?? INK }));
    this.y -= h;
    this.page.drawLine({ start: { x: M + 4, y: this.y + 1 }, end: { x: PAGE_W - M - 4, y: this.y + 1 }, thickness: 0.25, color: RULE });
  }
}

type ChartRef = { page: PDFPage; baseline: number; off: number; w: number; brand: SeriesBrand };

/** Photo block: the installation photo and, when available, a labelled close-up or exact cross-section beside it. */
async function drawPhotos(w: PageWriter, doc: PDFDocument, cache: ImageCache, sheet: SheetPlan): Promise<void> {
  const record = sheet.record;
  const mainAsset = record.assets.find((a) => a.kind === "photo");
  const secondAsset =
    record.assets.find((a) => a.kind === "section" && a.exactModel) ?? record.assets.find((a) => a.kind === "closeup" && a.exactModel);
  const main = mainAsset ? await embedImage(doc, cache, mainAsset.path) : null;
  const second = secondAsset ? await embedImage(doc, cache, secondAsset.path) : null;

  if (!main || !mainAsset) {
    const h = 46;
    w.ensure(h + 8);
    w.page.drawRectangle({ x: M, y: w.y - h, width: CONTENT_W, height: h, color: CARD_BG, borderColor: RULE, borderWidth: 0.6 });
    w.text("תמונת התקנה מאושרת של הסדרה אינה כלולה בקובץ זה.", 10, CONTENT_W - 20, w.y - 17, { size: 9.5, color: MUTED });
    const label = `לגלריה הרשמית של היצרן — ${hostOf(record.galleryUrl)}`;
    w.text(label, 10, CONTENT_W - 20, w.y - 33, { size: 9.5, color: LINK });
    w.link(record.galleryUrl, M, w.y - h, CONTENT_W, h);
    w.y -= h + 10;
    return;
  }

  const GAP = 12;
  const maxH = second ? 236 : 262;
  const mainBoxW = second ? 318 : CONTENT_W;
  const secondBoxW = CONTENT_W - mainBoxW - GAP;
  const fit = (img: PDFImage, boxW: number, boxH: number) => {
    const s = Math.min(boxW / img.width, boxH / img.height);
    return { w: img.width * s, h: img.height * s };
  };
  const mainSize = fit(main, mainBoxW, maxH);
  const secondSize = second ? fit(second, secondBoxW, maxH) : { w: 0, h: 0 };

  const captionOf = (asset: SeriesAsset, boxW: number) => [
    ...wrap(asset.caption, w.fonts, 8, boxW).map((t) => ({ t, size: 8, color: INK })),
    ...wrap(asset.credit, w.fonts, 6.8, boxW).map((t) => ({ t, size: 6.8, color: MUTED })),
  ];
  const mainCap = captionOf(mainAsset, mainSize.w);
  const secondCap = second && secondAsset ? captionOf(secondAsset, secondSize.w) : [];
  const capH = (lines: { size: number }[]) => lines.reduce((s, l) => s + l.size * 1.35, 0);
  const blockH = Math.max(mainSize.h + 6 + capH(mainCap), secondSize.h + 6 + capH(secondCap));
  w.ensure(blockH + 6);

  const top = w.y;
  const mainX = PAGE_W - M - mainSize.w;
  w.page.drawImage(main, { x: mainX, y: top - mainSize.h, width: mainSize.w, height: mainSize.h });
  w.page.drawRectangle({ x: mainX, y: top - mainSize.h, width: mainSize.w, height: mainSize.h, borderColor: RULE, borderWidth: 0.5 });
  let cy = top - mainSize.h - 4;
  for (const l of mainCap) {
    w.text(l.t, 0, mainSize.w, cy - l.size, { size: l.size, color: l.color });
    cy -= l.size * 1.35;
  }
  if (second && secondAsset) {
    const sx = M + (secondBoxW - secondSize.w) / 2;
    w.page.drawImage(second, { x: sx, y: top - secondSize.h, width: secondSize.w, height: secondSize.h });
    w.page.drawRectangle({ x: sx, y: top - secondSize.h, width: secondSize.w, height: secondSize.h, borderColor: RULE, borderWidth: 0.5 });
    let sy = top - secondSize.h - 4;
    const off = PAGE_W - M - (sx + secondSize.w);
    for (const l of secondCap) {
      w.text(l.t, off, secondSize.w, sy - l.size, { size: l.size, color: l.color });
      sy -= l.size * 1.35;
    }
  }
  w.y = top - blockH - 6;
}

function drawSwatchImage(page: PDFPage, img: PDFImage | null, x: number, y: number, size: number, highlight: boolean): void {
  if (img) {
    const s = Math.min(size / img.width, size / img.height);
    const iw = img.width * s;
    const ih = img.height * s;
    page.drawImage(img, { x: x + (size - iw) / 2, y: y + (size - ih) / 2, width: iw, height: ih });
  }
  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    borderColor: highlight ? ACCENT : RULE,
    borderWidth: highlight ? 1.8 : 0.5,
  });
}

async function drawSheet(
  w: PageWriter,
  doc: PDFDocument,
  cache: ImageCache,
  plan: AppendixPlan,
  sheet: SheetPlan,
  chartRefs: ChartRef[]
): Promise<void> {
  const { record } = sheet;
  const brand = BRANDS[record.brand];
  const content = plan.settings.content;

  w.continuation = null;
  w.newPage();
  w.continuation = `${record.title} — המשך`;

  // Heading: manufacturer + family + series, brand logo at the reading end.
  const logo = await embedImage(doc, cache, brand.logoUrl);
  w.text("דף מידע לסדרה", 0, CONTENT_W, w.y - 9, { size: 9, color: MUTED });
  if (logo) {
    const lh = 26;
    const lw = Math.min(120, (logo.width / logo.height) * lh);
    const lhh = (logo.height / logo.width) * lw;
    w.page.drawImage(logo, { x: M, y: w.y - 4 - lhh, width: lw, height: lhh });
  }
  w.text(record.title, 0, CONTENT_W - 130, w.y - 34, { size: 21, bold: true, color: INK });
  w.text(`יצרן: ${brand.nameHe} (${brand.nameLatin}) · משפחה: ${record.family} · סדרה: ${record.code}`, 0, CONTENT_W, w.y - 52, {
    size: 9.5,
    color: MUTED,
  });
  w.y -= 60;
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: PAGE_W - M, y: w.y }, thickness: 1.2, color: ACCENT });
  w.y -= 12;

  w.paragraph(record.usage, { size: 10.5, lh: 15.5 });
  w.y -= 8;

  if (content.photos) await drawPhotos(w, doc, cache, sheet);

  // What the customer is buying.
  w.sectionHeading("בפרויקט שלכם");
  for (const it of sheet.items) {
    const line = [`פריט ${it.number}`, it.location, it.label].filter(Boolean).join(" · ");
    w.paragraph(line, { size: 10, off: 4, lh: 14, bold: true });
  }
  w.y -= 4;

  for (const cfg of sheet.configs) {
    if (sheet.configs.length > 1 || sheet.items.length > 1) w.subHeading(`תצורה בהצעה — ${itemsLabel(cfg.itemNumbers)}`);
    for (const line of cfg.lines) w.row(line.label, line.value);
    w.y -= 6;
  }

  // Quoted finish, prominent; the full chart is referenced by page.
  w.subHeading("הגוון בהצעה", 40);
  for (const f of sheet.finishes) {
    const prefix = sheet.finishes.length > 1 ? `${itemsLabel(f.itemNumbers)}: ` : "";
    const swatches = content.colors ? f.swatches : [];
    if (swatches.length) {
      for (const s of swatches) {
        const SW = 40;
        w.ensure(SW + 8);
        const img = s.swatch.image ? await embedImage(doc, cache, s.swatch.image) : null;
        drawSwatchImage(w.page, img, PAGE_W - M - 4 - SW, w.y - SW, SW, true);
        const off = SW + 14;
        w.text(`${prefix}${swatchName(s.swatch) || s.code}`, off, CONTENT_W - off, w.y - 13, { size: 12, bold: true, color: ACCENT });
        w.text(
          [`קוד יצרן ${s.code}`, s.swatch.texture ? `גימור ${s.swatch.texture}` : "", `משפחת ״${s.group}״`].filter(Boolean).join(" · "),
          off,
          CONTENT_W - off,
          w.y - 28,
          { size: 9, color: INK }
        );
        w.y -= SW + 8;
      }
      if (f.text && f.recorded && !swatches.some((s) => f.text.includes(s.code) && f.text.length <= s.code.length + 2)) {
        w.paragraph(`כפי שנרשם בהצעה: ${f.text}`, { size: 9.5, off: 4 });
      }
    } else {
      w.paragraph(`${prefix}${f.text}`, { size: f.recorded ? 12 : 11, bold: f.recorded, color: f.recorded ? ACCENT : MUTED, off: 4, lh: 17 });
    }
  }
  if (content.colors && plan.charts.some((c) => c.brand === record.brand)) {
    w.ensure(16);
    chartRefs.push({ page: w.page, baseline: w.y - 10, off: 4, w: CONTENT_W - 4, brand: record.brand });
    w.y -= 16;
  }
  w.y -= 4;

  if (content.screens && sheet.accessories.length) {
    w.subHeading("תריסים ואביזרים בהצעה");
    for (const a of sheet.accessories) w.row(a.record.label, `${a.record.description} (${itemsLabel(a.itemNumbers)})`, { labelW: 150 });
    w.y -= 6;
  }

  if (content.glass && sheet.glass.length) {
    w.subHeading("הרכב הזכוכית בהצעה");
    for (const g of sheet.glass) w.row(g.formula, `${g.text} (${itemsLabel(g.itemNumbers)})`, { labelW: 70, ltrLabel: true });
    w.y -= 6;
  }

  // General catalog information, clearly separate from the quoted configuration.
  if (content.glass || content.screens) {
    w.sectionHeading("אפשרויות בסדרה");
    w.paragraph("מידע כללי מקטלוג היצרן. האפשרויות אינן כלולות בהצעה אלא אם הן מפורטות בסעיף ״בפרויקט שלכם״.", {
      size: 8.8,
      color: MUTED,
      off: 4,
    });
    w.y -= 2;
    if (content.glass) w.row("זיגוג", record.glazing);
    if (content.screens) w.row("רשתות ותריסים", record.screens);
    w.y -= 6;
  }

  drawSources(w, record.sources, `מידע נבדק: ${hebrewDate(record.verifiedDate)} · מקור: ${brand.credit}`);
}

function drawSources(w: PageWriter, sources: SourceRef[], footnote: string): void {
  w.ensure(16 + sources.length * 11);
  w.y -= 4;
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: PAGE_W - M, y: w.y }, thickness: 0.4, color: RULE });
  w.y -= 4;
  w.paragraph(footnote, { size: 7.5, color: MUTED, lh: 10.5 });
  for (const s of sources) w.sourceLine(s.label, s.url, 7.5);
}

/** Returns the chart's first page. */
async function drawChart(w: PageWriter, doc: PDFDocument, cache: ImageCache, chart: ChartPlan): Promise<PDFPage> {
  const { palette } = chart;
  const brand = BRANDS[chart.brand];
  w.continuation = null;
  w.newPage();
  const first = w.page;
  w.continuation = `${palette.title} — המשך`;

  const logo = await embedImage(doc, cache, brand.logoUrl);
  if (logo) {
    const lw = Math.min(110, (logo.width / logo.height) * 24);
    const lh = (logo.height / logo.width) * lw;
    w.page.drawImage(logo, { x: M, y: w.y - 2 - lh, width: lw, height: lh });
  }
  w.text(palette.title, 0, CONTENT_W - 120, w.y - 18, { size: 17, bold: true });
  w.text(`המניפה המלאה כפי שפורסמה על ידי היצרן · ${paletteSwatchCount(palette)} דוגמאות ב־${palette.groups.length} משפחות`, 0, CONTENT_W, w.y - 34, {
    size: 9.5,
    color: MUTED,
  });
  w.y -= 42;
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: PAGE_W - M, y: w.y }, thickness: 1.2, color: ACCENT });
  w.y -= 8;
  w.paragraph(PALETTE_DISCLAIMER, { size: 10, bold: true, lh: 14 });
  if (chart.quoted.length) w.paragraph(`הגוון שבהצעה מסומן במסגרת כחולה: ${chart.quoted.join(", ")}`, { size: 9, color: ACCENT, lh: 13 });
  w.y -= 4;

  const COLS = 6;
  const GAP = 8;
  const cellW = (CONTENT_W - GAP * (COLS - 1)) / COLS;
  const SW = 56;
  const nameSize = 7.4;

  for (const group of palette.groups) {
    const cells = group.swatches.map((s) => ({ s, name: wrap(swatchName(s) || "—", w.fonts, nameSize, cellW - 4).slice(0, 2) }));
    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += COLS) rows.push(cells.slice(i, i + COLS));
    const rowH = (row: typeof cells) => SW + 6 + 11 + Math.max(...row.map((c) => c.name.length)) * 9.2 + 10 + 10;

    const heading = (cont: boolean) => {
      w.y -= 4;
      w.page.drawRectangle({ x: M, y: w.y - 17, width: CONTENT_W, height: 17, color: FILL, borderColor: RULE, borderWidth: 0.5 });
      w.text(`${brand.nameHe} · ${group.name}${cont ? " (המשך)" : ""}`, 6, CONTENT_W - 12, w.y - 12.5, { size: 10.5, bold: true, color: ACCENT });
      w.text(`${group.swatches.length} גוונים`, 6, 80, w.y - 12.5, { size: 8.5, color: MUTED, align: "end" });
      w.y -= 24;
    };
    w.ensure(28 + rowH(rows[0]));
    heading(false);
    for (const row of rows) {
      const h = rowH(row);
      if (w.y - h < BOTTOM) {
        w.newPage();
        heading(true);
      }
      for (let c = 0; c < row.length; c++) {
        const { s, name } = row[c];
        const off = c * (cellW + GAP);
        const cellRight = PAGE_W - M - off;
        const quoted = chart.quoted.includes(s.code);
        const img = s.image ? await embedImage(doc, cache, s.image) : null;
        drawSwatchImage(w.page, img, cellRight - cellW / 2 - SW / 2, w.y - SW, SW, quoted);
        if (!img) w.text("אין דוגמה", off, cellW, w.y - SW / 2 - 3, { size: 7, color: MUTED, align: "center" });
        let ty = w.y - SW - 6;
        w.text(s.code, off, cellW, ty - 8.5, { size: 8.8, bold: true, align: "center", ltr: true });
        ty -= 11;
        for (const n of name) {
          w.text(n, off, cellW, ty - nameSize, { size: nameSize, align: "center" });
          ty -= 9.2;
        }
        if (s.texture) w.text(s.texture, off, cellW, ty - 6.8, { size: 6.6, color: MUTED, align: "center", ltr: true });
        ty -= 10;
        if (quoted) w.text("בהצעה", off, cellW, ty - 7, { size: 7, bold: true, color: ACCENT, align: "center" });
      }
      w.y -= h;
    }
  }

  drawSources(w, palette.sources, `${palette.credit} · ${PALETTE_DISCLAIMER} · נבדק: ${hebrewDate(palette.verifiedDate)}`);
  return first;
}

function drawChartLink(w: PageWriter, chart: ChartPlan, startNewPage: boolean): void {
  const { palette } = chart;
  const brand = BRANDS[chart.brand];
  if (startNewPage) {
    w.continuation = null;
    w.newPage();
  } else {
    w.ensure(130);
    w.y -= 16;
  }
  w.continuation = `${palette.title} — המשך`;
  w.text(palette.title, 0, CONTENT_W, w.y - 16, { size: 15, bold: true });
  w.y -= 24;
  w.page.drawLine({ start: { x: M, y: w.y }, end: { x: PAGE_W - M, y: w.y }, thickness: 1, color: ACCENT });
  w.y -= 10;
  w.paragraph(
    `המניפה המלאה של ${brand.nameLatin} אינה כלולה בקובץ זה. הגוונים, הקודים והגימורים המלאים מופיעים במניפה הרשמית של היצרן:`,
    { size: 10, lh: 14.5 }
  );
  w.y -= 2;
  for (const s of palette.sources) w.sourceLine(s.label, s.url, 10);
  w.y -= 4;
  w.paragraph(PALETTE_DISCLAIMER, { size: 10, bold: true, lh: 14 });
}

/**
 * Series information sheets after the quotation, then each brand's full colour chart once.
 * Draws nothing when the plan has no sheets. Prices are never drawn.
 */
export async function drawSeriesAppendix(args: { doc: PDFDocument; fonts: PdfFonts; plan: AppendixPlan }): Promise<void> {
  const { doc, fonts, plan } = args;
  if (!plan.settings.enabled || !plan.sheets.length) return;
  const cache: ImageCache = new Map();
  const w = new PageWriter(doc, fonts);
  const chartRefs: ChartRef[] = [];

  for (const sheet of plan.sheets) await drawSheet(w, doc, cache, plan, sheet, chartRefs);

  // Charts start on a fresh page after the sheets; a link-only block shares the previous chart's last page when it fits.
  const chartPage = new Map<SeriesBrand, number>();
  for (const chart of plan.charts) {
    if (chart.available) {
      chartPage.set(chart.brand, pageNumberOf(doc, await drawChart(w, doc, cache, chart)));
    } else {
      drawChartLink(w, chart, chartPage.size === 0 || w.y - 150 < BOTTOM);
      chartPage.set(chart.brand, pageNumberOf(doc, w.page));
    }
  }

  for (const ref of chartRefs) {
    const n = chartPage.get(ref.brand);
    const chart = plan.charts.find((c) => c.brand === ref.brand);
    if (!n || !chart) continue;
    const brand = BRANDS[ref.brand];
    const text = chart.available
      ? `מניפת הגוונים המלאה של ${brand.nameHe}: עמוד ${n}`
      : `קישור למניפת הגוונים הרשמית של ${brand.nameLatin}: עמוד ${n}`;
    w.text(text, ref.off, ref.w, ref.baseline, { size: 9.5, bold: true, color: LINK }, ref.page);
  }
}

function pageNumberOf(doc: PDFDocument, page: PDFPage): number {
  return doc.getPages().indexOf(page) + 1;
}
