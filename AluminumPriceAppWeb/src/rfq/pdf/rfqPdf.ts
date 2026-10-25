import { PDFDocument, StandardFonts, rgb, type PDFPage, type RGB } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { RfqContact, RfqItem, RfqLanguage, SupplierRequest } from "../types";
import { buildDiagram, buildLegendSymbol, type LegendSymbol } from "../diagram";
import { dict, fmt, itemSpecRows, describeConfigurationShort } from "../i18n";
import { totalUnits } from "../presets";
import { formatDimension } from "../units";
import { formatRfqNumber } from "../rfqState";
import { auto, firstStrongRtl, ltr } from "../bidi";
import { drawLine, wrap, type PdfFonts } from "./pdfText";
import { drawDiagramPdf, type ImageCache } from "./pdfDiagram";

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 40;
const CONTENT_W = PAGE_W - 2 * M;
const FOOTER_H = 26;
const BOTTOM = M + FOOTER_H;

const INK: RGB = rgb(0.09, 0.12, 0.18);
const MUTED: RGB = rgb(0.38, 0.43, 0.5);
const ACCENT: RGB = rgb(0.03, 0.4, 0.62);
const RULE: RGB = rgb(0.78, 0.82, 0.87);
const FILL: RGB = rgb(0.94, 0.97, 1);
const FILL_ALT: RGB = rgb(0.975, 0.98, 0.985);

export type RfqPdfOptions = {
  lang: RfqLanguage;
  /** Hebrew-capable TTF; loaded from the app's public fonts when omitted */
  fontBytes?: ArrayBuffer | Uint8Array;
};

function formatDate(iso: string, lang: RfqLanguage): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return lang === "he"
    ? new Intl.DateTimeFormat("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d)
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

function contactLines(c: RfqContact, d: ReturnType<typeof dict>): { text: string; bold?: boolean }[] {
  const out: { text: string; bold?: boolean }[] = [];
  if (c.name.trim()) out.push({ text: auto(c.name.trim()), bold: true });
  if (c.contactPerson.trim()) out.push({ text: `${d.ui.contactPerson}: ${auto(c.contactPerson.trim())}` });
  if (c.phone.trim()) out.push({ text: `${d.ui.phone}: ${ltr(c.phone.trim())}` });
  if (c.email.trim()) out.push({ text: `${d.ui.email}: ${ltr(c.email.trim())}` });
  if (c.address.trim()) out.push({ text: `${d.ui.address}: ${auto(c.address.trim())}` });
  return out;
}

const hasContact = (c: RfqContact) => Object.values(c).some((v) => v.trim());

export async function buildRfqPdfBytes(req: SupplierRequest, opts: RfqPdfOptions): Promise<Uint8Array> {
  const lang = opts.lang;
  const d = dict(lang);
  const rtl = lang === "he";

  const fontBytes = opts.fontBytes ?? (await (await import("../../buildPdfWithPdfLib")).loadHebrewFontBytes());
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const hebrew = await doc.embedFont(fontBytes, { subset: false });
  const fonts: PdfFonts = {
    hebrew,
    latin: doc.embedStandardFont(StandardFonts.Helvetica),
    latinBold: doc.embedStandardFont(StandardFonts.HelveticaBold),
    hebrewChars: new Set(hebrew.getCharacterSet()),
  };
  const rfqNo = formatRfqNumber(req.number);
  const projectTitle = req.projectName.trim() || d.ui.untitled;
  doc.setTitle(`${d.pdf.title} ${rfqNo} ${projectTitle}`.trim());
  doc.setLanguage(rtl ? "he-IL" : "en-GB");
  doc.setCreator("AluPrice");

  const imageCache: ImageCache = new Map();
  const pages: PDFPage[] = [];
  let page!: PDFPage;
  let y = 0;

  // ---------- direction-aware helpers ----------
  /** Physical left x of a box at logical offset `off` (from the reading start) with width `w`. */
  const boxLeft = (off: number, w: number) => (rtl ? PAGE_W - M - off - w : M + off);
  const startAlign = rtl ? ("right" as const) : ("left" as const);
  const endAlign = rtl ? ("left" as const) : ("right" as const);

  /**
   * Draw text aligned to the reading start of the box [off, off + w].
   * dir "doc" = composed text (labels + isolated values) laid out in the document direction;
   * "auto" = a standalone user value, laid out by its first strong character; "ltr" = data.
   */
  const textAt = (
    text: string,
    off: number,
    w: number,
    baseline: number,
    o: { size: number; bold?: boolean; color?: RGB; align?: "start" | "end" | "center"; dir?: "doc" | "auto" | "ltr" } = { size: 9 }
  ) => {
    const left = boxLeft(off, w);
    const a = o.align ?? "start";
    const align = a === "center" ? "center" : a === "start" ? startAlign : endAlign;
    const x = align === "center" ? left + w / 2 : align === "left" ? left : left + w;
    const forceRtl = o.dir === "ltr" ? false : o.dir === "auto" ? undefined : rtl;
    drawLine(page, fonts, text, x, baseline, { size: o.size, bold: o.bold, color: o.color ?? INK, align, docRtl: rtl, forceRtl });
  };

  const rule = (yy: number, color = RULE, thickness = 0.6) =>
    page.drawLine({ start: { x: M, y: yy }, end: { x: PAGE_W - M, y: yy }, thickness, color });

  const continuationTitle = `${d.pdf.title}${rfqNo ? ` · ${ltr(rfqNo)}` : ""} · ${auto(projectTitle)}`;

  const addPage = (continuation: boolean) => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    y = PAGE_H - M;
    if (continuation) {
      textAt(`${continuationTitle} — ${d.pdf.continued}`, 0, CONTENT_W, y - 9, { size: 8.5, color: MUTED });
      rule(y - 15);
      y -= 26;
    }
  };

  const ensure = (h: number, onNewPage?: () => void): boolean => {
    if (y - h >= BOTTOM) return false;
    addPage(true);
    onNewPage?.();
    return true;
  };

  const heading = (text: string, size = 12) => {
    ensure(size + 26);
    y -= 8;
    textAt(text, 0, CONTENT_W, y - size, { size, bold: true, color: ACCENT });
    y -= size + 5;
    rule(y, ACCENT, 0.8);
    y -= 8;
  };

  /** Composed text in the document direction. */
  const paragraph = (text: string, size = 9, color: RGB = INK, indent = 0) => {
    const lh = size * 1.35;
    for (const line of wrap(text, fonts, size, CONTENT_W - indent)) {
      ensure(lh);
      textAt(line, indent, CONTENT_W - indent, y - size, { size, color });
      y -= lh;
    }
  };

  /** User-written text: each paragraph keeps its own direction and alignment; never translated. */
  const userParagraphs = (text: string, size = 9) => {
    const lh = size * 1.35;
    for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
      const paraRtl = firstStrongRtl(para) ?? rtl;
      for (const line of wrap(para, fonts, size, CONTENT_W)) {
        ensure(lh);
        drawLine(page, fonts, line, paraRtl ? PAGE_W - M : M, y - size, {
          size,
          color: INK,
          align: paraRtl ? "right" : "left",
          docRtl: rtl,
          forceRtl: paraRtl,
        });
        y -= lh;
      }
    }
  };

  // ---------- page 1 header ----------
  addPage(false);
  textAt(d.pdf.title, 0, CONTENT_W, y - 20, { size: 20, bold: true, color: ACCENT });
  if (rfqNo) textAt(`${d.pdf.rfqNo} ${ltr(rfqNo)}`, 0, CONTENT_W, y - 12, { size: 10.5, bold: true, align: "end" });
  textAt(`${d.pdf.date}: ${ltr(formatDate(req.requestDate, lang))}`, 0, CONTENT_W, y - 26, { size: 9.5, align: "end" });
  y -= 34;
  textAt(d.featureTitle, 0, CONTENT_W, y - 9, { size: 9.5, color: MUTED });
  y -= 16;
  rule(y, ACCENT, 1.2);
  y -= 16;

  for (const line of wrap(`${d.pdf.project}: ${auto(projectTitle)}`, fonts, 12, CONTENT_W, true)) {
    textAt(line, 0, CONTENT_W, y - 11, { size: 12, bold: true });
    y -= 17;
  }
  y -= 1;
  if (req.projectReference.trim()) {
    textAt(`${d.pdf.projectRef}: ${auto(req.projectReference.trim())}`, 0, CONTENT_W, y - 9.5, { size: 9.5 });
    y -= 15;
  }
  y -= 6;

  // From / To boxes
  const boxes: { title: string; lines: { text: string; bold?: boolean }[] }[] = [
    { title: d.pdf.from, lines: contactLines(req.company, d) },
  ];
  if (hasContact(req.supplier)) boxes.push({ title: d.pdf.to, lines: contactLines(req.supplier, d) });
  const gap = 12;
  const bw = (CONTENT_W - gap) / 2;
  const wrapped: { text: string; bold?: boolean }[][] = boxes.map((b) =>
    b.lines.flatMap((l) => wrap(l.text, fonts, 9, bw - 16, l.bold).map((t) => ({ text: t, bold: l.bold })))
  );
  const boxH = 26 + Math.max(1, ...wrapped.map((w) => w.length)) * 12.5;
  boxes.forEach((b, i) => {
    const off = i * (bw + gap);
    const left = boxLeft(off, bw);
    page.drawRectangle({ x: left, y: y - boxH, width: bw, height: boxH, color: FILL_ALT, borderColor: RULE, borderWidth: 0.6 });
    textAt(b.title, off + 8, bw - 16, y - 14, { size: 8.5, bold: true, color: ACCENT });
    let ly = y - 28;
    for (const l of wrapped[i].length ? wrapped[i] : [{ text: "—" }]) {
      textAt(l.text, off + 8, bw - 16, ly, { size: 9, bold: l.bold });
      ly -= 12.5;
    }
  });
  y -= boxH + 10;

  if (req.deliveryDestination.trim()) {
    paragraph(`${d.pdf.delivery}: ${auto(req.deliveryDestination.trim())}`, 9.5);
    y -= 4;
  }

  // Dimension basis statement
  {
    const lines = wrap(d.basisStatement[req.dimensionBasis], fonts, 9, CONTENT_W - 20, true);
    const h = 12 + lines.length * 12.5;
    ensure(h + 6);
    page.drawRectangle({ x: M, y: y - h, width: CONTENT_W, height: h, color: rgb(1, 0.97, 0.9), borderColor: rgb(0.9, 0.7, 0.3), borderWidth: 0.7 });
    let ly = y - 15;
    for (const l of lines) {
      textAt(l, 10, CONTENT_W - 20, ly, { size: 9, bold: true });
      ly -= 12.5;
    }
    y -= h + 10;
  }

  // Summary: designs vs units, deliberately two separate labelled figures
  {
    const designs = req.items.length;
    const units = totalUnits(req.items);
    const sw = (CONTENT_W - gap) / 2;
    const sh = 34;
    ensure(sh + 8);
    [
      { label: d.pdf.designs, value: String(designs) },
      { label: d.pdf.units, value: String(units) },
    ].forEach((s, i) => {
      const off = i * (sw + gap);
      page.drawRectangle({ x: boxLeft(off, sw), y: y - sh, width: sw, height: sh, color: FILL, borderColor: RULE, borderWidth: 0.6 });
      textAt(s.label, off + 10, sw - 60, y - 21, { size: 9.5 });
      textAt(s.value, off + 10, sw - 20, y - 23, { size: 16, bold: true, align: "end", color: ACCENT });
    });
    y -= sh + 8;
  }

  // Request to supplier
  heading(d.pdf.requestHeading, 11);
  for (const r of [d.pdf.req1, d.pdf.req2, d.pdf.req3, d.pdf.req4, d.pdf.req5, d.pdf.req6]) {
    const lines = wrap(r, fonts, 9, CONTENT_W - 16);
    lines.forEach((l, i) => {
      ensure(12.5);
      if (i === 0) {
        const cx = rtl ? PAGE_W - M - 5 : M + 5;
        page.drawCircle({ x: cx, y: y - 6.2, size: 1.6, color: INK });
      }
      textAt(l, 14, CONTENT_W - 14, y - 9, { size: 9 });
      y -= 12.5;
    });
  }

  // ---------- schedule ----------
  heading(d.pdf.schedule);
  const cols = [
    { key: "ref", w: 44, title: d.pdf.colRef },
    { key: "img", w: 50, title: "" },
    { key: "type", w: 92, title: d.pdf.colType },
    { key: "loc", w: 72, title: d.pdf.colLocation },
    { key: "w", w: 50, title: d.ui.width },
    { key: "h", w: 50, title: d.ui.height },
    { key: "qty", w: 32, title: d.pdf.colQty },
    { key: "cfg", w: CONTENT_W - 390, title: d.pdf.colConfig },
  ];
  const colOff: number[] = [];
  cols.reduce((acc, c) => (colOff.push(acc), acc + c.w), 0);
  const TS = 8.5;
  const TLH = 11;

  const drawTableHeader = () => {
    const titles = cols.map((c) => wrap(c.title, fonts, TS, c.w - 6, true));
    const hh = 8 + Math.max(...titles.map((t) => t.length)) * TLH;
    page.drawRectangle({ x: M, y: y - hh, width: CONTENT_W, height: hh, color: FILL, borderColor: RULE, borderWidth: 0.6 });
    cols.forEach((c, i) => {
      titles[i].forEach((t, li) => textAt(t, colOff[i] + 3, c.w - 6, y - 11 - li * TLH, { size: TS, bold: true }));
    });
    y -= hh;
  };

  ensure(60);
  drawTableHeader();
  for (let idx = 0; idx < req.items.length; idx++) {
    const it = req.items[idx];
    const cells: Record<string, string[]> = {
      ref: wrap(it.reference, fonts, TS, 38, true),
      type: wrap(d.openingType[it.openingType], fonts, TS, cols[2].w - 6),
      loc: wrap(it.location.trim() || "—", fonts, TS, cols[3].w - 6),
      w: [`${formatDimension(it.widthCm, it.unit)} ${it.unit}`],
      h: [`${formatDimension(it.heightCm, it.unit)} ${it.unit}`],
      qty: [String(it.quantity)],
      cfg: wrap(describeConfigurationShort(lang, it), fonts, TS, cols[7].w - 6),
    };
    const lines = Math.max(...Object.values(cells).map((c) => c.length));
    const rowH = Math.max(46, 8 + lines * TLH);
    if (ensure(rowH)) drawTableHeader();
    if (idx % 2 === 1) page.drawRectangle({ x: M, y: y - rowH, width: CONTENT_W, height: rowH, color: FILL_ALT });
    page.drawLine({ start: { x: M, y: y - rowH }, end: { x: PAGE_W - M, y: y - rowH }, thickness: 0.4, color: RULE });
    cols.forEach((c, i) => {
      if (c.key === "img") return;
      const dir =
        c.key === "w" || c.key === "h" || c.key === "qty" || c.key === "ref"
          ? "ltr"
          : c.key === "loc" || (c.key === "cfg" && it.openingType === "custom")
            ? "auto"
            : "doc";
      cells[c.key].forEach((t, li) => textAt(t, colOff[i] + 3, c.w - 6, y - 11 - li * TLH, { size: TS, bold: c.key === "ref", dir }));
    });
    const thumb = buildDiagram(it, { width: cols[1].w - 4, height: rowH - 6, customPlaceholder: "?", showDimensions: false, showReference: false });
    await drawDiagramPdf(doc, page, thumb, boxLeft(colOff[1] + 2, cols[1].w - 4), y - 3, fonts, imageCache);
    y -= rowH;
  }
  y -= 6;
  textAt(`${d.pdf.designs}: ${req.items.length}    ${d.pdf.units}: ${totalUnits(req.items)}`, 0, CONTENT_W, y - 9, { size: 9, bold: true, align: "end" });
  y -= 18;

  // ---------- item details ----------
  heading(d.pdf.details);
  for (const it of req.items) await drawItemBlock(it);

  async function drawItemBlock(it: RfqItem) {
    const DW = 220;
    const DH = 190;
    const specOff = DW + 16;
    const specW = CONTENT_W - specOff;
    const labelW = 92;
    const valueW = specW - labelW - 6;
    const SS = 8.8;
    const SLH = 11.6;

    const rows: { label: string; value: string; ltr?: boolean; user?: boolean }[] = [
      { label: d.ui.width, value: `${formatDimension(it.widthCm, it.unit)} ${it.unit}`, ltr: true },
      { label: d.ui.height, value: `${formatDimension(it.heightCm, it.unit)} ${it.unit}`, ltr: true },
      { label: d.pdf.dimensions, value: d.basis[req.dimensionBasis] },
      { label: d.ui.quantity, value: String(it.quantity), ltr: true },
      ...itemSpecRows(lang, it),
    ];
    // Long values are split into chunks so a page break can fall inside them (never off the page).
    const CHUNK = 8;
    const laid = rows.flatMap((r) => {
      const labelLines = r.label ? wrap(r.label, fonts, SS, labelW, true) : [];
      const valueLines = r.label ? wrap(r.value, fonts, SS, valueW) : wrap(r.value, fonts, SS, specW - 10);
      const chunks: string[][] = [];
      for (let i = 0; i < Math.max(1, valueLines.length); i += CHUNK) chunks.push(valueLines.slice(i, i + CHUNK));
      return chunks.map((lines, ci) => {
        const lbl = ci === 0 ? labelLines : [];
        const last = ci === chunks.length - 1;
        return { ...r, labelLines: lbl, valueLines: lines, sep: last, h: Math.max(lbl.length, lines.length, 1) * SLH + (last ? 3 : 0) };
      });
    });
    const captionLines = wrap(d.ui.schematicNote, fonts, 7, DW);
    const diagH = DH + 14 + captionLines.length * 9;
    const specsH = laid.reduce((s, r) => s + r.h, 0);
    const barH = 20;
    const blockH = barH + 8 + Math.max(diagH, specsH) + 14;
    const fullPage = PAGE_H - M - 26 - BOTTOM;
    if (y - blockH < BOTTOM && blockH <= fullPage) addPage(true);
    else ensure(barH + 8 + diagH);

    const drawBar = (cont: boolean) => {
      page.drawRectangle({ x: M, y: y - barH, width: CONTENT_W, height: barH, color: FILL, borderColor: RULE, borderWidth: 0.6 });
      textAt(`${ltr(it.reference)} — ${d.openingType[it.openingType]}${cont ? ` (${d.pdf.continued})` : ""}`, 8, CONTENT_W - 16, y - 13.5, { size: 10, bold: true });
      textAt(`${d.ui.quantity}: ${it.quantity}`, 8, CONTENT_W - 16, y - 13.5, { size: 10, bold: true, align: "end" });
      y -= barH + 8;
    };
    drawBar(false);
    const top = y;

    const spec = buildDiagram(it, { width: DW, height: DH, customPlaceholder: d.pdf.customPlaceholder });
    page.drawRectangle({ x: boxLeft(0, DW), y: top - DH, width: DW, height: DH, borderColor: RULE, borderWidth: 0.5 });
    await drawDiagramPdf(doc, page, spec, boxLeft(0, DW), top, fonts, imageCache);
    let cy = top - DH - 10;
    const caption = it.openingType === "custom" && it.referenceImage ? `${d.ui.viewedFromOutside} · ${d.pdf.referenceImage}` : d.ui.viewedFromOutside;
    textAt(caption, 0, DW, cy, { size: 7.5, bold: true, color: MUTED, align: "center" });
    cy -= 10;
    for (const l of captionLines) {
      textAt(l, 0, DW, cy, { size: 7, color: MUTED, align: "center" });
      cy -= 9;
    }
    const diagBottom = cy;

    let sy = top;
    let continued = false;
    for (const r of laid) {
      if (sy - r.h < BOTTOM) {
        addPage(true);
        drawBar(true);
        sy = y;
        continued = true;
      }
      const rowTop = sy;
      if (r.label) {
        r.labelLines.forEach((l, i) => textAt(l, specOff, labelW, rowTop - 9 - i * SLH, { size: SS, bold: true, color: MUTED }));
        r.valueLines.forEach((l, i) =>
          textAt(l, specOff + labelW + 6, valueW, rowTop - 9 - i * SLH, { size: SS, dir: r.ltr ? "ltr" : r.user ? "auto" : "doc" })
        );
      } else {
        r.valueLines.forEach((l, i) => textAt(l, specOff + 10, specW - 10, rowTop - 9 - i * SLH, { size: SS }));
      }
      sy -= r.h;
      if (r.sep) {
        page.drawLine({
          start: { x: boxLeft(specOff, specW), y: sy + 1 },
          end: { x: boxLeft(specOff, specW) + specW, y: sy + 1 },
          thickness: 0.3,
          color: RULE,
        });
      }
    }
    y = (continued ? sy : Math.min(sy, diagBottom)) - 14;
  }

  // ---------- general specs, notes, legend ----------
  if (req.generalSpecifications.trim()) {
    heading(d.pdf.generalSpecs);
    userParagraphs(req.generalSpecifications.trim());
  }
  if (req.notes.trim()) {
    heading(d.pdf.generalNotes);
    userParagraphs(req.notes.trim());
  }

  heading(d.pdf.legend);
  const legend: { symbol: LegendSymbol; text: string }[] = [
    { symbol: "fixed", text: d.ui.legendFixed },
    { symbol: "sliding", text: d.ui.legendSliding },
    { symbol: "hinged_out", text: d.ui.legendHingedOut },
    { symbol: "hinged_in", text: d.ui.legendHingedIn },
    { symbol: "tilt_turn", text: d.ui.legendTilt },
    { symbol: "hinges", text: d.ui.legendHinges },
  ];
  for (const e of legend) {
    const lines = wrap(e.text, fonts, 8.8, CONTENT_W - 44);
    const h = Math.max(34, lines.length * 11.5 + 8);
    ensure(h);
    await drawDiagramPdf(doc, page, buildLegendSymbol(e.symbol, 30), boxLeft(0, 30), y - 1, fonts, imageCache);
    lines.forEach((l, i) => textAt(l, 42, CONTENT_W - 42, y - 18 - i * 11.5, { size: 8.8 }));
    y -= h;
  }
  y -= 4;
  paragraph(d.ui.sideHint, 8.5, MUTED);
  paragraph(d.pdf.schematic, 8.5, MUTED);
  paragraph(d.ui.noPricing, 8.5, MUTED);

  // ---------- footers ----------
  const n = pages.length;
  pages.forEach((p, i) => {
    page = p;
    page.drawLine({ start: { x: M, y: M + 12 }, end: { x: PAGE_W - M, y: M + 12 }, thickness: 0.5, color: RULE });
    textAt(`${rfqNo ? `${ltr(rfqNo)} · ` : ""}${auto(projectTitle)}`, 0, CONTENT_W * 0.7, M, { size: 8, color: MUTED });
    textAt(fmt(d.pdf.page, { p: i + 1, n }), 0, CONTENT_W, M, { size: 8, color: MUTED, align: "end" });
  });

  return doc.save();
}
