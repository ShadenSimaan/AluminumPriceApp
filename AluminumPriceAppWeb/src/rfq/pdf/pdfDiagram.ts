import { rgb, type PDFDocument, type PDFImage, type PDFPage, type RGB } from "pdf-lib";
import type { DiagramSpec } from "../diagram";
import { drawLine, type PdfFonts } from "./pdfText";

function hex(c: string | undefined): RGB | undefined {
  if (!c) return undefined;
  const m = /^#?([0-9a-f]{6})$/i.exec(c);
  if (!m) return undefined;
  const n = parseInt(m[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export type ImageCache = Map<string, PDFImage | null>;

async function embedImage(doc: PDFDocument, dataUrl: string, mime: string, cache: ImageCache): Promise<PDFImage | null> {
  if (cache.has(dataUrl)) return cache.get(dataUrl) ?? null;
  let img: PDFImage | null = null;
  try {
    const bytes = dataUrlToBytes(dataUrl);
    img = mime === "image/png" ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    img = null;
  }
  cache.set(dataUrl, img);
  return img;
}

/**
 * Render a DiagramSpec onto a PDF page. (left, top) is the top-left corner of the diagram box in PDF
 * coordinates (y up). The spec itself is identical to the one rendered as SVG on screen.
 */
export async function drawDiagramPdf(
  doc: PDFDocument,
  page: PDFPage,
  spec: DiagramSpec,
  left: number,
  top: number,
  fonts: PdfFonts,
  cache: ImageCache
): Promise<void> {
  const X = (x: number) => left + x;
  const Y = (y: number) => top - y;
  for (const s of spec.shapes) {
    switch (s.kind) {
      case "rect":
        page.drawRectangle({
          x: X(s.x),
          y: Y(s.y + s.h),
          width: s.w,
          height: s.h,
          color: hex(s.fill),
          borderColor: hex(s.stroke),
          borderWidth: s.stroke ? s.strokeWidth ?? 0.5 : 0,
          borderDashArray: s.dash,
        });
        break;
      case "line":
        page.drawLine({
          start: { x: X(s.x1), y: Y(s.y1) },
          end: { x: X(s.x2), y: Y(s.y2) },
          thickness: s.strokeWidth,
          color: hex(s.stroke) ?? rgb(0, 0, 0),
          dashArray: s.dash,
        });
        break;
      case "poly": {
        // drawSvgPath uses SVG orientation (y down) relative to the given origin.
        const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ") + (s.closed ? " Z" : "");
        page.drawSvgPath(d, {
          x: left,
          y: top,
          color: hex(s.fill),
          borderColor: hex(s.stroke),
          borderWidth: s.stroke ? s.strokeWidth ?? 0.5 : 0,
          borderDashArray: s.dash,
          borderLineCap: 1,
        });
        break;
      }
      case "text":
        drawLine(page, fonts, s.text, X(s.x), Y(s.y), {
          size: s.size,
          bold: s.bold,
          color: hex(s.color),
          align: s.anchor === "start" ? "left" : s.anchor === "end" ? "right" : "center",
          docRtl: false,
          rotate90: s.rotate === -90,
        });
        break;
      case "image": {
        const img = await embedImage(doc, s.dataUrl, s.mime, cache);
        if (!img) break;
        const ratio = Math.min(s.w / img.width, s.h / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        page.drawImage(img, { x: X(s.x + (s.w - w) / 2), y: Y(s.y + (s.h + h) / 2), width: w, height: h });
        break;
      }
    }
  }
}
