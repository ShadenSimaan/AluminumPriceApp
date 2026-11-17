import type { CatalogCategory, RfqLanguage } from "./types";
import { ACCESSORY_KINDS, SHADING_TYPES } from "./types";
import { APPEARANCES, COATINGS, CONSTRUCTIONS, TREATMENTS } from "./glass";
import { dict } from "./i18n";
import { openExternalUrl } from "./rfqExport";

export const ALL_OPTION_KEYS: string[] = [
  ...CONSTRUCTIONS.filter((c) => !["unspecified", "supplier", "custom"].includes(c)).map((c) => `glass.construction.${c}`),
  ...TREATMENTS.filter((t) => !["unspecified", "supplier"].includes(t)).map((t) => `glass.treatment.${t}`),
  ...APPEARANCES.filter((a) => !["unspecified", "custom"].includes(a)).map((a) => `glass.appearance.${a}`),
  ...COATINGS.filter((c) => c !== "custom").map((c) => `glass.coating.${c}`),
  ...SHADING_TYPES.filter((s) => s !== "supplier" && s !== "other").map((s) => `shading.${s}`),
  ...ACCESSORY_KINDS.filter((k) => k !== "custom").map((k) => `hardware.${k}`),
];

export const CATALOG_CATEGORIES: CatalogCategory[] = ["glass", "shading", "hardware", "other"];

export function catLabel(lang: RfqLanguage, c: CatalogCategory): string {
  const S = dict(lang).sup;
  return c === "glass" ? S.catGlass : c === "shading" ? S.catShading : c === "hardware" ? S.catHardware : S.catOther;
}

export async function openWebsite(url: string, onError: (m: string) => void) {
  try {
    if (!(await openExternalUrl(url))) onError(url);
  } catch (e) {
    onError(e instanceof Error ? e.message : String(e));
  }
}
