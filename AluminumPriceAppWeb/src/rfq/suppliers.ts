// Supplier directory and offline catalog hints. A website listing is never treated as confirmation of stock,
// pricing, exact construction or compatibility, and a missing listing never means "unavailable".

import type { Availability, CatalogCategory, CatalogEntry, RfqContact, SupplierProfile } from "./types";
import { AVAILABILITIES } from "./types";
import { EKLIEN_LOGO_URL } from "../quote/eklienLogo";

export const EKLEINDOOR_KEY = "ekleindoor";
export const EKLEINDOOR_CHECKED = "2026-10-28";
export const EKLEINDOOR_LOGO_URL = EKLIEN_LOGO_URL;

const URL_CASEMENT = "https://ekleindoor.com/product/aluminium-casement-window-2/";
const URL_SLIDING = "https://ekleindoor.com/product/aluminium-sliding-windows-2/";
const URL_FOLDING = "https://ekleindoor.com/product/aluminium-folding-door/";
const URL_CURTAIN = "https://ekleindoor.com/product/glass-curtain-wall/";

const WINDOW_PAGES = "Aluminium casement window; Aluminium sliding window";
const OTHER_PAGES = "Other Ekleindoor product families (aluminium folding door / glass curtain wall pages)";
const CONFIRM_WINDOW = "Listed for another product family. Confirm compatibility with the selected window system.";
const LISTING_ONLY = "Website listing only: not a confirmation of stock, pricing, exact glass construction or compatibility.";

function entry(id: string, category: CatalogCategory, label: string, optionKeys: string[], availability: Availability, productFamily: string, sourceUrls: string[], notes: string): CatalogEntry {
  return { id, category, label, optionKeys, availability, productFamily, sourceUrls, checkedDate: EKLEINDOOR_CHECKED, notes };
}

export function ekleindoorProfile(): SupplierProfile {
  const win = [URL_CASEMENT, URL_SLIDING];
  const other = [URL_FOLDING, URL_CURTAIN];
  const all = [URL_CASEMENT, URL_SLIDING, URL_FOLDING, URL_CURTAIN];
  return {
    id: "sup-ekleindoor",
    builtinKey: EKLEINDOOR_KEY,
    displayName: "Ekleindoor / KLEIN (EKLIEN)",
    website: "https://ekleindoor.com/",
    logoUrl: EKLEINDOOR_LOGO_URL,
    contact: {
      name: "Ekleindoor / KLEIN (EKLIEN)",
      contactPerson: "Klein Intelligent Technology Co., Ltd.",
      phone: "+86 19050809598",
      email: "sales@ekleindoor.com",
      address: "1309, Hongteng Lakeside Fortune Center, Quehua Ave, Licheng Dist., Jinan, Shandong, China",
      website: "https://ekleindoor.com/",
    },
    notes: "Main supplier. Catalog hints from ekleindoor.com (checked 2026-10-28). Confirm every option for the selected system and dimensions.",
    catalog: [
      entry("ek-clear-tempered", "glass", "Clear tempered glazing", ["glass.appearance.clear", "glass.treatment.tempered"], "listed", WINDOW_PAGES, win, LISTING_ONLY),
      entry("ek-double-tempered", "glass", "Double tempered glazing", ["glass.construction.double"], "listed", WINDOW_PAGES, win, LISTING_ONLY),
      entry("ek-low-e", "glass", "Low-E", ["glass.coating.low_e"], "listed", WINDOW_PAGES, win, LISTING_ONLY),
      entry("ek-reflective", "glass", "Reflective", ["glass.appearance.reflective"], "listed", WINDOW_PAGES, win, LISTING_ONLY),
      entry("ek-frosted", "glass", "Frosted", ["glass.appearance.frosted"], "listed", WINDOW_PAGES, win, LISTING_ONLY),
      entry("ek-tinted", "glass", "Tinted", ["glass.appearance.tinted"], "listed", WINDOW_PAGES, win, LISTING_ONLY),
      entry("ek-triple", "glass", "Triple glazing", ["glass.construction.triple"], "listed_other_family", OTHER_PAGES, other, CONFIRM_WINDOW),
      entry("ek-laminated", "glass", "Laminated glass", ["glass.treatment.laminated", "glass.treatment.tempered_laminated"], "listed_other_family", OTHER_PAGES, other, CONFIRM_WINDOW),
      entry("ek-ultra-clear", "glass", "Ultra-clear glass", ["glass.appearance.low_iron"], "listed_other_family", OTHER_PAGES, other, CONFIRM_WINDOW),
      entry("ek-solar-control", "glass", "Solar-control coated glass", ["glass.coating.solar_control"], "listed_other_family", OTHER_PAGES, other, CONFIRM_WINDOW),
      entry("ek-handles", "hardware", "Handles", ["hardware.handles"], "listed", "Ekleindoor aluminium windows and doors (product-specific)", all, "Exact models, finishes, spare-part availability and compatibility need confirmation."),
      entry("ek-hinges", "hardware", "Adjustable hinges", ["hardware.hinges"], "listed", "Ekleindoor aluminium windows and doors (product-specific)", all, "Exact models, finishes, load ratings and compatibility need confirmation."),
      entry("ek-seals", "hardware", "Sealing strips", ["hardware.gaskets"], "listed", "Ekleindoor aluminium windows and doors (product-specific)", all, "Exact profiles and compatibility need confirmation."),
      entry("ek-locks-tracks", "hardware", "Product-specific locking / track hardware", ["hardware.locks", "hardware.rollers_tracks"], "listed", "Ekleindoor aluminium windows and doors (product-specific)", all, "Exact models, finishes and compatibility need confirmation."),
      entry("ek-integrated-blinds", "shading", "Integrated blinds between glass panes", ["shading.integrated"], "not_verified", "", [], "Ekleindoor integrated-blind availability has not been verified. Ask the supplier."),
    ],
  };
}

export const SEEDED_SUPPLIERS: Record<string, () => SupplierProfile> = { [EKLEINDOOR_KEY]: ekleindoorProfile };

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export function normalizeContactLike(raw: unknown): RfqContact {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return { name: str(o.name), contactPerson: str(o.contactPerson), phone: str(o.phone), email: str(o.email), address: str(o.address), website: str(o.website) };
}

function normalizeEntry(raw: unknown, i: number): CatalogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cats: CatalogCategory[] = ["glass", "shading", "hardware", "other"];
  return {
    id: str(o.id) || `entry-${i}`,
    category: cats.includes(o.category as CatalogCategory) ? (o.category as CatalogCategory) : "other",
    label: str(o.label),
    optionKeys: Array.isArray(o.optionKeys) ? (o.optionKeys as unknown[]).map(str).filter(Boolean) : [],
    availability: AVAILABILITIES.includes(o.availability as Availability) ? (o.availability as Availability) : "not_verified",
    productFamily: str(o.productFamily),
    sourceUrls: Array.isArray(o.sourceUrls) ? (o.sourceUrls as unknown[]).map(str).filter(Boolean) : [],
    checkedDate: /^\d{4}-\d{2}-\d{2}$/.test(str(o.checkedDate)) ? str(o.checkedDate) : "",
    notes: str(o.notes),
  };
}

export function normalizeSupplierProfile(raw: unknown): SupplierProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = str(o.id);
  if (!id) return null;
  const catalog = Array.isArray(o.catalog) ? (o.catalog as unknown[]).map(normalizeEntry).filter((e): e is CatalogEntry => !!e) : [];
  const p: SupplierProfile = {
    id,
    displayName: str(o.displayName),
    website: str(o.website),
    contact: normalizeContactLike(o.contact),
    notes: str(o.notes),
    catalog,
  };
  if (typeof o.builtinKey === "string" && o.builtinKey) p.builtinKey = o.builtinKey;
  if (typeof o.logoUrl === "string" && o.logoUrl.trim()) p.logoUrl = o.logoUrl.trim();
  // Keep the seeded EKLIEN mark on the builtin profile even if an older save omitted it.
  if (p.builtinKey === EKLEINDOOR_KEY && !p.logoUrl) p.logoUrl = EKLEINDOOR_LOGO_URL;
  return p;
}

/** Fill missing logo/contact on an already-seeded builtin profile from the current seed. */
function refreshBuiltinProfile(p: SupplierProfile): SupplierProfile {
  if (!p.builtinKey || !SEEDED_SUPPLIERS[p.builtinKey]) return p;
  const seed = SEEDED_SUPPLIERS[p.builtinKey]();
  return {
    ...p,
    logoUrl: p.logoUrl || seed.logoUrl,
    displayName: p.displayName.trim() || seed.displayName,
    website: p.website.trim() || seed.website,
    contact: {
      name: p.contact.name.trim() || seed.contact.name,
      contactPerson: p.contact.contactPerson.trim() || seed.contact.contactPerson,
      phone: p.contact.phone.trim() || seed.contact.phone,
      email: p.contact.email.trim() || seed.contact.email,
      address: p.contact.address.trim() || seed.contact.address,
      website: p.contact.website.trim() || seed.contact.website,
    },
  };
}

/** Stored suppliers plus seeded suppliers that were never seeded before. */
export function normalizeSupplierDirectory(rawList: unknown, rawSeeded: unknown): { suppliers: SupplierProfile[]; seededSuppliers: string[] } {
  const suppliers: SupplierProfile[] = [];
  const seen = new Set<string>();
  if (Array.isArray(rawList)) {
    for (const r of rawList) {
      const p = normalizeSupplierProfile(r);
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        suppliers.push(refreshBuiltinProfile(p));
      }
    }
  }
  const seeded = Array.isArray(rawSeeded) ? (rawSeeded as unknown[]).map(str).filter(Boolean) : [];
  for (const [key, make] of Object.entries(SEEDED_SUPPLIERS)) {
    if (seeded.includes(key)) continue;
    if (!suppliers.some((s) => s.builtinKey === key)) suppliers.push(make());
    seeded.push(key);
  }
  return { suppliers, seededSuppliers: seeded };
}

const CERTAINTY: Record<Availability, number> = { confirmed: 5, unavailable: 4, listed: 3, listed_other_family: 2, not_verified: 1 };

export function availabilityFor(profile: SupplierProfile | undefined, optionKey: string): { availability: Availability; entry?: CatalogEntry } {
  if (!profile) return { availability: "not_verified" };
  let best: CatalogEntry | undefined;
  for (const e of profile.catalog) {
    if (!e.optionKeys.includes(optionKey)) continue;
    if (!best || CERTAINTY[e.availability] > CERTAINTY[best.availability]) best = e;
  }
  return best ? { availability: best.availability, entry: best } : { availability: "not_verified" };
}

/** Options that warrant asking the supplier before relying on them. */
export function needsConfirmation(a: Availability): boolean {
  return a === "not_verified" || a === "listed_other_family";
}

export function newSupplierProfile(id: string): SupplierProfile {
  return { id, displayName: "", website: "", contact: normalizeContactLike({}), notes: "", catalog: [] };
}

/** Contact block written into the request when a supplier is selected. */
export function contactFromProfile(p: SupplierProfile): RfqContact {
  return { ...p.contact, name: p.contact.name.trim() || p.displayName, website: p.website || p.contact.website };
}

export function safeExternalUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}
