import type { LineItem, Manufacturer, Profile } from "../types";
import { mentionsEklien } from "./eklienLogo";

export const ALUMIL_ID = "mfr-alumil";
export const KLIL_ID = "mfr-klil";
export const EKLEIN_ID = "mfr-eklein";

export const DEFAULT_MANUFACTURERS: Manufacturer[] = [
  { id: ALUMIL_ID, name: "Alumil", logoUrl: "/brand/alumil-logo.png", website: "https://www.alumil.com/", builtin: true },
  { id: KLIL_ID, name: "קליל", logoUrl: "/brand/klil-logo.png", website: "https://www.klil.co.il/", builtin: true },
  { id: EKLEIN_ID, name: "EKLEIN", logoUrl: "/brand/eklein-logo.png", website: "https://ekleindoor.com/", builtin: true },
];

/** Built-in companies are always present; their logo is bundled with the app. Custom ones are kept as saved. */
export function normalizeManufacturers(raw: unknown): Manufacturer[] {
  const saved = Array.isArray(raw) ? (raw as Partial<Manufacturer>[]) : [];
  const custom: Manufacturer[] = saved
    .filter((m) => m && typeof m.id === "string" && typeof m.name === "string" && !DEFAULT_MANUFACTURERS.some((d) => d.id === m.id))
    .map((m) => ({
      id: m.id!,
      name: m.name!,
      logoUrl: typeof m.logoUrl === "string" && m.logoUrl ? m.logoUrl : undefined,
      website: typeof m.website === "string" && m.website ? m.website : undefined,
    }));
  const builtins = DEFAULT_MANUFACTURERS.map((d) => {
    const s = saved.find((m) => m?.id === d.id);
    return { ...d, name: typeof s?.name === "string" && s.name.trim() ? s.name : d.name };
  });
  return [...builtins, ...custom];
}

export function findManufacturer(manufacturers: Manufacturer[], id: string | undefined): Manufacturer | undefined {
  return id ? manufacturers.find((m) => m.id === id) : undefined;
}

/**
 * Company of a quote line: from its catalog profile (by id, then by exact name).
 * Lines already labelled EKLIEN (e.g. converted from a supplier request) keep that mark.
 */
export function lineManufacturer(
  item: Pick<LineItem, "profileId" | "profileName" | "details" | "customerDescription" | "configuration">,
  profiles: Profile[],
  manufacturers: Manufacturer[]
): Manufacturer | undefined {
  const profile =
    (item.profileId && profiles.find((p) => p.id === item.profileId)) ||
    (item.profileName ? profiles.find((p) => p.name === item.profileName) : undefined);
  if (profile) {
    const found = findManufacturer(manufacturers, profile.manufacturerId);
    if (found || profile.manufacturerId) return found;
  }
  return mentionsEklien(item) ? findManufacturer(manufacturers, EKLEIN_ID) : undefined;
}

/** Distinct companies used by the given lines, in first-seen order. */
export function quoteManufacturers(
  items: LineItem[],
  profiles: Profile[],
  manufacturers: Manufacturer[]
): Manufacturer[] {
  const out: Manufacturer[] = [];
  for (const item of items) {
    const m = lineManufacturer(item, profiles, manufacturers);
    if (m && !out.some((x) => x.id === m.id)) out.push(m);
  }
  return out;
}

/** Profiles grouped by company in catalog order; profiles without a (known) company come last. */
export function groupProfilesByManufacturer(
  profiles: Profile[],
  manufacturers: Manufacturer[]
): { manufacturer?: Manufacturer; profiles: Profile[] }[] {
  const groups = manufacturers
    .map((m) => ({ manufacturer: m as Manufacturer | undefined, profiles: profiles.filter((p) => p.manufacturerId === m.id) }))
    .filter((g) => g.profiles.length);
  const rest = profiles.filter((p) => !findManufacturer(manufacturers, p.manufacturerId));
  if (rest.length) groups.push({ manufacturer: undefined, profiles: rest });
  return groups;
}

export function imageKind(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  return null;
}

const logoCache = new Map<string, Promise<Uint8Array | null>>();

/** PNG/JPG bytes of a logo (bundled path or data URL); null when it cannot be loaded. */
export function loadLogoBytes(url: string): Promise<Uint8Array | null> {
  let cached = logoCache.get(url);
  if (!cached) {
    cached = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const bytes = new Uint8Array(await response.arrayBuffer());
        return imageKind(bytes) ? bytes : null;
      } catch {
        return null;
      }
    })();
    logoCache.set(url, cached);
  }
  return cached;
}

/** Reads an uploaded image and re-encodes it as a PNG data URL (max 480×160) so the PDF can embed it. */
export function logoFileToPngDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("not an image"));
      img.onload = () => {
        const scale = Math.min(1, 480 / (img.naturalWidth || 1), 160 / (img.naturalHeight || 1));
        const w = Math.max(1, Math.round((img.naturalWidth || 240) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 80) * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
