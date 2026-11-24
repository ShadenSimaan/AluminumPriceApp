import { KLIL_CATALOG_2026, type SeriesBrand } from "./catalog";

export type PaletteSwatch = {
  /** Manufacturer code exactly as printed on the chart. */
  code: string;
  nameHe?: string;
  /** Published English name, used only when no Hebrew name is published for the code. */
  nameEn?: string;
  /** Finish / texture as published (e.g. FINE IRON). Blank when the sources do not state it. */
  texture?: string;
  ral?: string;
  /** Bundled swatch artwork. */
  image?: string;
  imageSource?: "web" | "catalog";
  note?: string;
};

export type PaletteGroup = { name: string; swatches: PaletteSwatch[] };

export type ManufacturerPalette = {
  brand: SeriesBrand;
  title: string;
  /** "available" = complete chart bundled for offline use; otherwise only the official link is printed. */
  status: "available" | "unavailable";
  groups: PaletteGroup[];
  sources: { label: string; url: string }[];
  credit: string;
  verifiedDate: string;
  /** Internal notes about missing data or source discrepancies; not printed. */
  notes: string[];
};

export const PALETTE_DISCLAIMER = "הגוונים להמחשה. לבחירה סופית יש לאשר דוגמה פיזית וזמינות לסדרה.";

const FINE = "FINE IRON";
const IRON = "IRON";

type Row = [code: string, nameHe: string | undefined, texture: string | undefined, source: "web" | "catalog", extra?: Partial<PaletteSwatch>];

function group(name: string, rows: Row[]): PaletteGroup {
  return {
    name,
    swatches: rows.map(([code, nameHe, texture, imageSource, extra]) => ({
      code,
      nameHe,
      texture,
      image: `/series/klil/colors/${code}.jpg`,
      imageSource,
      ...extra,
    })),
  };
}

/** Codes and grouping follow the printed chart (catalog 2026, p. 88); names and textures from klil.co.il/גוונים. */
const KLIL_PALETTE: ManufacturerPalette = {
  brand: "klil",
  title: "מניפת הגוונים של קליל",
  status: "available",
  groups: [
    group("הבית הניטרלי", [
      ["11F", "עננים", FINE, "web"],
      ["12F", "לבן לאטה", FINE, "catalog"],
      ["14F", undefined, undefined, "web", { nameEn: "Cream Butter" }],
      ["15I", "חימר מינרלי", IRON, "catalog"],
      ["16F", "קרם קפה", FINE, "web"],
      ["16I", "חלב סויה", IRON, "catalog"],
      ["17I", "שיבולת", IRON, "web"],
      ["21F", "לבן אבן גיר", FINE, "web"],
      ["73F", "פרח וניל", FINE, "web"],
      ["K001", "לבן מט", undefined, "web"],
    ]),
    group("הבית הנוכח", [
      ["31F", "ערפל מטאוריטי", FINE, "catalog"],
      ["34F", "סלע מנצנץ", FINE, "catalog"],
      ["34I", "קוורץ מעושן", IRON, "catalog"],
      ["38F", "חלל עמוק", FINE, "web"],
      ["38I", "מגע תעשייתי", IRON, "catalog"],
      ["40F", "מתכת אורבנית", FINE, "catalog"],
      ["40I", "גרפיט גס", IRON, "web"],
      ["43F", "לילה ביער", FINE, "web"],
      ["45F", "שחור אדמדם", FINE, "catalog"],
      ["47I", "אור כוכבים", IRON, "web"],
      ["49F", "סגסוגת אנודייז", FINE, "catalog"],
      ["66F", undefined, undefined, "web", { note: "שם הגוון לא אומת" }],
      ["66I", "אינוקס גס", IRON, "web"],
    ]),
    group("הבית בחורש", [
      ["19I", "ירוק נעים", IRON, "catalog"],
      ["33I", "אפור ירק", IRON, "web"],
      ["61I", "ליים מנצנץ", undefined, "web", { note: "באתר: 61F" }],
      ["63I", "קציר זיתים", IRON, "catalog"],
      ["67I", "טחב עירוני", IRON, "web"],
      ["68F", "יער אמרלד", FINE, "web"],
    ]),
    group("הבית המתוחכם", [
      ["42I", "כחול מלכותי", IRON, "catalog"],
      ["51I", "קוביית קרח", IRON, "web"],
      ["52F", "כחול בהיר", FINE, "catalog"],
      ["53I", "דמדומי חלום", IRON, "catalog"],
      ["55I", "כחול נורדי", IRON, "catalog"],
      ["57I", "לילה מעורפל", IRON, "catalog"],
      ["59I", "כחול חצות", IRON, "catalog"],
      ["65F", "שיר ערש חצות", FINE, "web"],
    ]),
    group("בית של חופש", [
      ["35I", "גרייג׳", IRON, "web"],
      ["36I", "חום בזלת", IRON, "catalog"],
      ["37F", undefined, undefined, "catalog", { nameEn: "Pebble Gray" }],
      ["39I", "לוסטר מוקה", IRON, "web"],
      ["73F", "פרח וניל", FINE, "web"],
      ["74I", "פלדה חלודה", IRON, "web"],
      ["75I", "חום אגוז", IRON, "catalog"],
      ["76I", "סוכר קינמון", IRON, "catalog"],
      ["77I", "דיונת מדבר", IRON, "catalog"],
      ["79F", "דמדומי סתיו", FINE, "catalog"],
    ]),
  ],
  sources: [
    { label: "קטלוג קליל 2026, מניפת הגוונים המודפסת (עמ׳ 88)", url: KLIL_CATALOG_2026 },
    { label: "דף הגוונים באתר קליל", url: "https://www.klil.co.il/%D7%92%D7%95%D7%95%D7%A0%D7%99%D7%9D/" },
  ],
  credit: "דוגמאות הגוונים: קליל תעשיות בע״מ",
  verifiedDate: "2026-11-23",
  notes: [
    "הקטלוג המודפס מציג 47 דוגמאות (46 קודים; 73F מופיע בשתי משפחות). הקודים והחלוקה נלקחו ממנו.",
    "האתר מציג ׳שחור מט 95F׳ שאינו בקטלוג המודפס, ובקטלוג מופיע 66F; לשם 66F אין מקור תואם.",
    "הקטלוג מדפיס 61I והאתר 61F עבור ׳ליים מנצנץ׳; הגימור לא סומן עד לבירור.",
    "ל־14F ול־37F אין שם עברי באתר; מוצג השם האנגלי שפורסם.",
  ],
};

const ALUMIL_PALETTE: ManufacturerPalette = {
  brand: "alumil",
  title: "מניפת הגוונים ALUMIL Essentia",
  status: "unavailable",
  groups: [],
  sources: [
    {
      label: "ALUMIL Essentia — מדריך הגוונים הרשמי",
      url: "https://static.alumil.com/userfiles/docs/default-source/private/colours-guidlines/alumil_new_colours_guideline_2026.html",
    },
  ],
  credit: "ALUMIL S.A.",
  verifiedDate: "2026-11-23",
  notes: [
    "המניפה המלאה (כולל Ferra, Terrae וגרסאות LSA) לא נשמרה: השרת static.alumil.com החזיר שגיאה 400 לכל בקשה בזמן ההכנה. מודפס קישור רשמי בלבד.",
  ],
};

export const PALETTES: Record<SeriesBrand, ManufacturerPalette> = { klil: KLIL_PALETTE, alumil: ALUMIL_PALETTE };

export function paletteSwatchCount(p: ManufacturerPalette): number {
  return p.groups.reduce((n, g) => n + g.swatches.length, 0);
}

/** Finds the swatch for a quoted finish by its exact manufacturer code (e.g. "66F", "K001"). */
export function findSwatch(brand: SeriesBrand, code: string): { group: string; swatch: PaletteSwatch } | undefined {
  const wanted = code.toUpperCase();
  for (const g of PALETTES[brand].groups) {
    const swatch = g.swatches.find((s) => s.code.toUpperCase() === wanted);
    if (swatch) return { group: g.name, swatch };
  }
  return undefined;
}

export function swatchName(s: PaletteSwatch): string {
  return s.nameHe ?? s.nameEn ?? "";
}
