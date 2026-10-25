import { degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { visualRuns, hasRtl, bidiClass, firstStrongRtl } from "../bidi";

export type PdfFonts = {
  hebrew: PDFFont;
  latin: PDFFont;
  latinBold: PDFFont;
  hebrewChars: Set<number>;
};

// Characters encodable by the standard Helvetica font (WinAnsi).
const WIN_ANSI_EXTRA = new Set(
  Array.from("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ").map((c) => c.codePointAt(0)!)
);
function isWinAnsi(cp: number): boolean {
  return (cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff) || WIN_ANSI_EXTRA.has(cp);
}

type FontKind = "hebrew" | "latin";

function fontKindFor(ch: string, fonts: PdfFonts): { kind: FontKind; ch: string } {
  const cp = ch.codePointAt(0) ?? 0x3f;
  if (bidiClass(ch) === "R" || cp === 0x20aa) {
    return fonts.hebrewChars.has(cp) ? { kind: "hebrew", ch } : { kind: "latin", ch: "?" };
  }
  if (isWinAnsi(cp)) return { kind: "latin", ch };
  if (cp === 0x2212) return { kind: "latin", ch: "-" };
  if (cp === 0x200e || cp === 0x200f) return { kind: "latin", ch: "" };
  if (fonts.hebrewChars.has(cp)) return { kind: "hebrew", ch };
  return { kind: "latin", ch: "?" };
}

type Seg = { text: string; kind: FontKind };

/** Visual-order font segments for a single line. */
function lineSegments(text: string, fonts: PdfFonts, baseRtl: boolean): Seg[] {
  const segs: Seg[] = [];
  for (const run of visualRuns(text, baseRtl)) {
    for (const raw of run.text) {
      const { kind, ch } = fontKindFor(raw, fonts);
      if (!ch) continue;
      const last = segs[segs.length - 1];
      if (last && last.kind === kind && kind === "latin") last.text += ch;
      else segs.push({ text: ch, kind });
    }
  }
  return segs;
}

function fontFor(kind: FontKind, fonts: PdfFonts, bold: boolean): PDFFont {
  if (kind === "hebrew") return fonts.hebrew;
  return bold ? fonts.latinBold : fonts.latin;
}

function segWidth(seg: Seg, fonts: PdfFonts, size: number, bold: boolean): number {
  return fontFor(seg.kind, fonts, bold).widthOfTextAtSize(seg.text, size);
}

/** Paragraph direction from the first strong character (like dir="auto"); falls back to the document direction. */
export function paragraphRtl(text: string, docRtl: boolean): boolean {
  return firstStrongRtl(text) ?? docRtl;
}

export function measure(text: string, fonts: PdfFonts, size: number, bold = false): number {
  return lineSegments(text, fonts, hasRtl(text)).reduce((w, s) => w + segWidth(s, fonts, size, bold), 0);
}

export type DrawOpts = {
  size: number;
  bold?: boolean;
  color?: RGB;
  /** x is the left edge ("left"), right edge ("right") or center ("center") */
  align: "left" | "right" | "center";
  docRtl: boolean;
  /** Force a paragraph direction (e.g. dimensions are always LTR) */
  forceRtl?: boolean;
  /** Rotate 90° counter-clockwise (text reads bottom-to-top); x/y anchor then applies along the rotated axis */
  rotate90?: boolean;
};

/** Draw one line at baseline y (PDF coordinates). Returns the drawn width. */
export function drawLine(page: PDFPage, fonts: PdfFonts, text: string, x: number, y: number, opts: DrawOpts): number {
  if (!text) return 0;
  const bold = !!opts.bold;
  const baseRtl = opts.forceRtl ?? paragraphRtl(text, opts.docRtl);
  const segs = lineSegments(text, fonts, baseRtl);
  const total = segs.reduce((w, s) => w + segWidth(s, fonts, opts.size, bold), 0);
  let start = opts.align === "left" ? x : opts.align === "right" ? x - total : x - total / 2;
  const color = opts.color ?? rgb(0, 0, 0);
  const rotate = opts.rotate90;
  if (rotate) {
    // Anchor coordinate runs along y for rotated text.
    start = opts.align === "left" ? y : opts.align === "right" ? y - total : y - total / 2;
  }
  let adv = 0;
  for (const seg of segs) {
    const font = fontFor(seg.kind, fonts, bold);
    const w = segWidth(seg, fonts, opts.size, bold);
    const px = rotate ? x : start + adv;
    const py = rotate ? start + adv : y;
    const base = { size: opts.size, font, color, rotate: rotate ? degrees(90) : undefined };
    if (seg.kind === "hebrew") {
      // Draw RTL glyphs one by one in visual order so no shaping engine can re-order them.
      let a = 0;
      for (const ch of seg.text) {
        const cw = font.widthOfTextAtSize(ch, opts.size);
        const cx = rotate ? px : px + a;
        const cy = rotate ? py + a : py;
        page.drawText(ch, { ...base, x: cx, y: cy });
        if (bold) page.drawText(ch, { ...base, x: cx + (rotate ? 0 : opts.size * 0.03), y: cy + (rotate ? opts.size * 0.03 : 0) });
        a += cw;
      }
    } else {
      page.drawText(seg.text, { ...base, x: px, y: py });
    }
    adv += w;
  }
  return total;
}

function breakWord(word: string, fonts: PdfFonts, size: number, bold: boolean, maxWidth: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const ch of word) {
    if (cur && measure(cur + ch, fonts, size, bold) > maxWidth) {
      out.push(cur);
      cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

/** Wrap logical text into lines that fit maxWidth. Explicit newlines start new lines. */
export function wrap(text: string, fonts: PdfFonts, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split("\n")) {
    const words = para.split(/[ \t]+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (measure(candidate, fonts, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (measure(word, fonts, size, bold) <= maxWidth) line = word;
      else {
        const pieces = breakWord(word, fonts, size, bold, maxWidth);
        lines.push(...pieces.slice(0, -1));
        line = pieces[pieces.length - 1] ?? "";
      }
    }
    if (line) lines.push(line);
  }
  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}
