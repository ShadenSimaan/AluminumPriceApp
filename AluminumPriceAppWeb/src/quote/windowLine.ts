import type { Addon, LineItem, Profile } from "../types";
import type { RfqItem } from "../rfq/types";
import { reassignIds } from "../rfq/layout";
import { normalizeItemConfig } from "../rfq/presets";
import { lineQuantity, lineTotal, parseLooseNumber, type PriceBasis } from "./pricing";

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cloneConfiguration(item: RfqItem): RfqItem {
  const { layout, idMap } = reassignIds(item.layout);
  const mapId = (id: string) => idMap.get(id) ?? id;
  return normalizeItemConfig({
    ...item,
    id: newId(),
    layout,
    shading: item.shading.map((entry) => ({ ...entry, id: newId(), appliesTo: entry.appliesTo.map(mapId) })),
    accessories: item.accessories.map((entry) => ({ ...entry, id: newId(), appliesTo: entry.appliesTo.map(mapId) })),
    alternatives: item.alternatives.map((entry) => ({ ...entry, id: newId() })),
  });
}

export function withSyncedConfiguration(item: LineItem): LineItem {
  if (!item.configuration) return item;
  const width = item.widthCm.trim() ? parseLooseNumber(item.widthCm) : null;
  const height = item.heightCm.trim() ? parseLooseNumber(item.heightCm) : null;
  const qty = lineQuantity(item);
  return {
    ...item,
    configuration: {
      ...item.configuration,
      widthCm: width,
      heightCm: height,
      quantity: qty > 0 ? qty : item.configuration.quantity,
      location: item.location ?? item.configuration.location,
    },
  };
}

export function withSubtotal(item: LineItem): LineItem {
  const synced = withSyncedConfiguration(item);
  return { ...synced, subtotal: lineTotal(synced) };
}

export function lineItemFromWindow(
  configuration: RfqItem,
  addons: Addon[],
  opts: { profileId?: string; profileName?: string; unitPrice?: string; priceBasis?: PriceBasis; details?: string } = {}
): LineItem {
  const cfg = cloneConfiguration(configuration);
  const item: LineItem = {
    id: newId(),
    widthCm: cfg.widthCm != null ? String(cfg.widthCm) : "",
    heightCm: cfg.heightCm != null ? String(cfg.heightCm) : "",
    qty: String(cfg.quantity || 1),
    profileId: opts.profileId,
    profileName: opts.profileName || cfg.frameFinish || undefined,
    unitPrice: opts.unitPrice ?? "0",
    priceBasis: opts.priceBasis,
    location: cfg.location,
    details: opts.details ?? cfg.notes,
    customerDescription: cfg.customDescription,
    configuration: cfg,
    configurationNeedsReview: cfg.openingType === "custom" && Boolean(cfg.referenceImage),
    addons: addons.map((addon) => ({ ...addon, id: newId(), checked: false })),
    subtotal: 0,
  };
  return withSubtotal(item);
}

/** A catalog profile on the quotation, priced per square metre, with no size yet so it does not change the total. */
export function profileOfferLine(profile: Profile, addons: Addon[]): LineItem {
  const item: LineItem = {
    id: newId(),
    widthCm: "",
    heightCm: "",
    qty: "1",
    profileId: profile.id,
    profileName: profile.name,
    unitPrice: String(profile.unitPrice),
    priceBasis: "per_m2",
    details: "פרופיל שלם — המחיר הוא למ״ר ונכנס לסיכום אחרי הזנת מידות",
    addons: addons.map((addon) => ({ ...addon, id: newId(), checked: false })),
    subtotal: 0,
  };
  return withSubtotal(item);
}

export function duplicateLineItem(item: LineItem): LineItem {
  return withSubtotal({
    ...item,
    id: newId(),
    configuration: item.configuration ? cloneConfiguration(item.configuration) : undefined,
    addons: item.addons.map((addon) => ({ ...addon, id: newId() })),
  });
}

/** Stable key for grouping quote lines by the profile they currently use. */
export function profileRemapKey(item: LineItem): string {
  if (item.profileId) return item.profileId;
  const name = item.profileName?.trim();
  if (name) return `__name__:${name}`;
  return "__none__";
}

export type ProfileRemapSource = {
  key: string;
  profileId?: string;
  profileName: string;
  count: number;
  currentUnitPrice: string;
};

/** Distinct profiles currently used on quote lines (free-form additions are excluded). */
export function collectQuoteProfileSources(items: LineItem[]): ProfileRemapSource[] {
  const map = new Map<string, ProfileRemapSource>();
  for (const it of items) {
    const key = profileRemapKey(it);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    map.set(key, {
      key,
      profileId: it.profileId,
      profileName: it.profileName?.trim() || "ללא פרופיל",
      count: 1,
      currentUnitPrice: it.unitPrice ?? "0",
    });
  }
  return [...map.values()];
}

/** Apply a catalog profile to a line: name, m² rate, and clear manual unit price so totals follow the new rate. */
export function applyProfileToLineItem(item: LineItem, profile: Profile): LineItem {
  return withSubtotal({
    ...item,
    profileId: profile.id,
    profileName: profile.name,
    unitPrice: String(profile.unitPrice),
    priceBasis: "per_m2",
    manualUnitPrice: undefined,
  });
}

/**
 * Remap quote lines by source key → target catalog profile id.
 * Keys with no mapping (or empty target) are left unchanged. Free-form additions are not in `items`.
 */
export function remapQuoteItems(
  items: LineItem[],
  mapping: Record<string, string>,
  profiles: Profile[]
): LineItem[] {
  const byId = new Map(profiles.map((p) => [p.id, p]));
  return items.map((it) => {
    const targetId = mapping[profileRemapKey(it)];
    if (!targetId) return it;
    const profile = byId.get(targetId);
    if (!profile) return it;
    return applyProfileToLineItem(it, profile);
  });
}
