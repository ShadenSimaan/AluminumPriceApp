import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";

/** Alum Simaan Sami logo with the surrounding white margin trimmed, so the visible mark fills its box. */
export const COMPANY_LOGO_URL = "/brand/alum-simaan-sami-logo.png";
export const COMPANY_LOGO_WIDTH = 944;
export const COMPANY_LOGO_HEIGHT = 716;
export const COMPANY_LOGO_ALT = "Alum Simaan Sami — אלום סמעאן סאמי";

/** Height of the logo in every exported document (points). */
export const PDF_LOGO_HEIGHT = 62;
export const PDF_LOGO_GAP = 12;

let cached: Promise<Uint8Array | null> | null = null;

export function loadCompanyLogoBytes(): Promise<Uint8Array | null> {
  if (!cached) {
    cached = (async () => {
      try {
        const response = await fetch(COMPANY_LOGO_URL);
        if (!response.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return bytes[0] === 0x89 && bytes[1] === 0x50 ? bytes : null;
      } catch {
        return null;
      }
    })();
  }
  return cached;
}

export async function embedCompanyLogo(doc: PDFDocument): Promise<PDFImage | null> {
  const bytes = await loadCompanyLogoBytes();
  if (!bytes) return null;
  try {
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

/**
 * Shared document header: the logo centred at the top of the first page.
 * Returns the y below the logo, or `top` unchanged when the asset is unavailable.
 */
export function drawCompanyLogoHeader(page: PDFPage, logo: PDFImage | null, top: number): number {
  if (!logo) return top;
  const height = PDF_LOGO_HEIGHT;
  const width = (logo.width / logo.height) * height;
  page.drawImage(logo, { x: (page.getWidth() - width) / 2, y: top - height, width, height });
  return top - height - PDF_LOGO_GAP;
}
