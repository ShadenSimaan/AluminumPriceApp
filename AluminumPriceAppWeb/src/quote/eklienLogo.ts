import type { RfqItem } from "../rfq/types";

/** Manufacturer logo for EKLIEN / Ekleindoor / KLEIN products. Never used as Alum Simaan company branding. */
export const EKLIEN_LOGO_URL = "/brand/eklien-logo.jpg";
export const EKLIEN_LOGO_CANDIDATES = [EKLIEN_LOGO_URL, "/brand/eklien-logo.png", "/brand/EKLIEN.png", "/brand/eklien.png"];

/** Matches the main supplier brand names used on quotes and RFQs. */
export const EKLIEN_BRAND_RE = /\b(EKLIEN|Ekleindoor|Eklein|KLEIN)\b/i;

export function mentionsEklien(item: {
  profileName?: string;
  details?: string;
  customerDescription?: string;
  configuration?: RfqItem;
}): boolean {
  const cfg = item.configuration;
  const text = [
    item.profileName,
    item.details,
    item.customerDescription,
    cfg?.hardware,
    cfg?.otherRequirements,
    cfg?.frameFinish,
    cfg?.notes,
    cfg?.supplierPrice?.profileSeries,
    cfg?.supplierPrice?.remarks,
  ]
    .filter(Boolean)
    .join(" ");
  return EKLIEN_BRAND_RE.test(text);
}

export function isEklienSupplierName(name: string | null | undefined): boolean {
  return EKLIEN_BRAND_RE.test(name ?? "");
}

let cached: Promise<Uint8Array | null> | null = null;

export function loadEklienLogoBytes(): Promise<Uint8Array | null> {
  if (!cached) {
    cached = (async () => {
      for (const url of EKLIEN_LOGO_CANDIDATES) {
        try {
          const response = await fetch(url);
          if (!response.ok) continue;
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (eklienLogoKind(bytes)) return bytes;
        } catch {
          /* try the next candidate */
        }
      }
      return null;
    })();
  }
  return cached;
}

export function eklienLogoKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}
