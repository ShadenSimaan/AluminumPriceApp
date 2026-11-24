import { ALUMIL_ID, KLIL_ID } from "../manufacturers";

export type SeriesBrand = "klil" | "alumil";

export type SeriesAssetKind = "photo" | "section" | "closeup";

export type SeriesAsset = {
  kind: SeriesAssetKind;
  /** Bundled file under public/, loaded the same way as company logos. */
  path: string;
  caption: string;
  /** True only when the picture shows this exact model (never another series or a generic drawing). */
  exactModel: boolean;
  /** Manufacturer rendering rather than an installation photo; the caption must say so. */
  rendering?: boolean;
  sourceUrl: string;
  credit: string;
};

export type SourceRef = { label: string; url: string };

export type SeriesRecord = {
  /** Stable reference stored with quotes, e.g. "klil/4400". */
  key: string;
  brand: SeriesBrand;
  code: string;
  /** Other whole tokens that name this record (e.g. the 5500D door model). */
  aliases: string[];
  family: string;
  /** Shown as the sheet heading together with the brand and family. */
  title: string;
  usage: string;
  glazing: string;
  screens: string;
  /** Only matched by an explicit, prefixed code (never by a bare number). */
  conditional?: boolean;
  galleryUrl: string;
  sources: SourceRef[];
  assets: SeriesAsset[];
  language: "he";
  verifiedDate: string;
  /** Internal notes (source discrepancies); not printed. */
  notes?: string[];
};

export type BrandInfo = {
  brand: SeriesBrand;
  manufacturerId: string;
  nameHe: string;
  nameLatin: string;
  logoUrl: string;
  credit: string;
};

export const BRANDS: Record<SeriesBrand, BrandInfo> = {
  klil: {
    brand: "klil",
    manufacturerId: KLIL_ID,
    nameHe: "קליל",
    nameLatin: "KLIL",
    logoUrl: "/brand/klil-logo.png",
    credit: "קליל תעשיות בע״מ",
  },
  alumil: {
    brand: "alumil",
    manufacturerId: ALUMIL_ID,
    nameHe: "אלומיל",
    nameLatin: "ALUMIL",
    logoUrl: "/brand/alumil-logo.png",
    credit: "ALUMIL S.A.",
  },
};

const VERIFIED = "2026-11-23";
const KLIL_SERIES_BASE = "https://www.klil.co.il/%D7%9B%D7%9C-%D7%94%D7%A1%D7%92%D7%A0%D7%95%D7%A0%D7%95%D7%AA/";
const KLIL_FAMILY_PATH: Record<string, string> = {
  בלגי: "%D7%91%D7%9C%D7%92%D7%99",
  באוהאוס: "%D7%91%D7%90%D7%95%D7%94%D7%90%D7%95%D7%A1",
  בייסיק: "%D7%91%D7%99%D7%99%D7%A1%D7%99%D7%A7",
};
export const KLIL_CATALOG_2026 = "https://www.klil.co.il/media/hsybjglv/catalog-2026.pdf";
export const ALUMIL_IL_CATALOG = "https://static.alumil.com/userfiles/docs/default-source/israel/alumil_smartia-catalog-23x29-hebr_en-2021.pdf";

function klilPage(family: string, code: string): string {
  return `${KLIL_SERIES_BASE}${KLIL_FAMILY_PATH[family]}/${code}/`;
}

function klilPhoto(code: string, _page: string, mediaPath: string, caption: string, extra: Partial<SeriesAsset> = {}): SeriesAsset {
  return {
    kind: "photo",
    path: `/series/klil/${code}/photo.jpg`,
    caption,
    exactModel: true,
    sourceUrl: `https://www.klil.co.il${mediaPath}`,
    credit: `צילום: ${BRANDS.klil.credit}, מתוך גלריית הסדרה באתר היצרן`,
    ...extra,
  };
}

type KlilSeed = {
  code: string;
  family: string;
  usage: string;
  glazing: string;
  screens: string;
  aliases?: string[];
  assets: (page: string) => SeriesAsset[];
  catalogPage?: number;
  notes?: string[];
};

const KLIL_SEEDS: KlilSeed[] = [
  {
    code: "1700",
    family: "בלגי",
    usage: "חלון הזזה לחדר. מסגרת צרה וחלוקות בסגנון בלגי. מתאים לפתח קטן במטבח או בחדר שינה. אפשר להוסיף חלק קבוע מתחת לכנפיים.",
    glazing: "זכוכית רגילה בעובי 3, 4, 5, 6 או 10 מ״מ. בידודית בעובי 14 מ״מ.",
    screens: "רשת הזזה, תריס רפפה 1200 או ארגז גלילה. שלושה נתיבים הם תצורה של אותו חלון.",
    catalogPage: 49,
    assets: (page) => [
      klilPhoto("1700", page, "/media/jsyjou4g/קליל-בלגי-1700-חלון-הזזה-בשילוב-קבוע-תחתון-מצפה-עדי-בלגי-חדר-שינה-לבן.jpg", "חלון הזזה KLIL 1700 בשילוב קבוע תחתון"),
    ],
  },
  {
    code: "4300",
    family: "בלגי",
    usage: "חלון או דלת על ציר. חלוקות דקות מעניקות לחלון מראה של עבודת ברזל. אפשר לתכנן דלת, חלון נפתח או שדה זכוכית קבוע באותה שפה.",
    glazing: "חלון 4–14 מ״מ. דלת או קבוע 4–16 מ״מ, ובתצורה עם צלון פנימי 28–34 מ״מ.",
    screens: "רשת קבועה או נשלפת. ניתן לשלב תריס גלילה או תריס ציר בלגי 1300.",
    assets: (page) => [
      klilPhoto("4300", page, "/media/o5rpbggd/קליל-בלגי-4300-חלון-ציר-על-קבוע-צד-בשילוב-קבוע-תחתון-plus-2-כנפי-ציר-בשילוב-קבוע-אמצעי-ותחתון-קיבוץ-בחן-בלגי-מטבח-לבן-1-1.jpg", "חלונות ציר KLIL 4300 בשילוב שדות קבועים"),
    ],
  },
  {
    code: "7300",
    family: "בלגי",
    usage: "חלון או דלת הזזה. ממשיך את החלוקה הבלגית על פני פתח בינוני או גדול. מתאים ליציאה לגינה כשרוצים שהכנפיים יחליקו הצידה.",
    glazing: "כנף הזזה 4–22 מ״מ, כנף מג׳יקליל לניקוי 4–14 מ״מ וחלק קבוע 4–34 מ״מ.",
    screens: "רשת הזזה, תריס רפפה או גלילה. קליל מציינת במפורש גם שלבי תריס אור.",
    assets: (page) => [
      klilPhoto("7300", page, "/media/cesen5tw/דלתות-הזזה-לחדר-השינה-בפרופיל-דק-ליצירת-אווירה-רכה-וביתית-מסדרת-7300-בלגי-של-קליל.jpg", "דלת הזזה KLIL 7300 בחדר שינה"),
    ],
  },
  {
    code: "1600",
    family: "באוהאוס",
    usage: "חלון הזזה לחדר או למטבח. פרופיל בעל קווים ישרים וגימור מוקפד משני צדי החלון. מיועד לפתחים קטנים ובינוניים שבהם רוצים להשאיר את האדן פנוי.",
    glazing: "6–18 מ״מ. ניתן לבחור זכוכית חד־שכבתית, רבודה או בידודית לפי הרכב החלון.",
    screens: "רשת הזזה צרה הייעודית לסדרה. קליל מציינת שילוב עם ארגז תריס סמוי.",
    catalogPage: 20,
    assets: (page) => [
      klilPhoto("1600", page, "/media/dvwclsub/קליל-באוהאוס-1600-חלון-הזזה-מתן-באוהאוס-מטבח-שחור-1-1.jpg", "חלון הזזה KLIL 1600 במטבח"),
      {
        kind: "section",
        path: "/series/klil/1600/section.jpg",
        caption: "חתך פרופיל KLIL 1600",
        exactModel: true,
        sourceUrl: "https://www.klil.co.il/media/20dibe0i/קליל-באוהאוס-1600-חתך-פרופיל-אלומיניום.jpg",
        credit: `איור: ${BRANDS.klil.credit}`,
      },
    ],
  },
  {
    code: "5600",
    family: "באוהאוס",
    usage: "חלון או דלת על ציר. כנף שנפתחת על צירים, עם אפשרות לשדות קבועים בצדדים או מתחת לחלון. מתאימה לדלת יציאה או לחלון שרוצים לפתוח לרווחה.",
    glazing: "4–24 מ״מ, זכוכית רגילה או בידודית.",
    screens: "רשת קבועה הניתנת לשליפה. אפשר לשלב גלילה בארגז או תריס ציר 1300. הציר והתריס צריכים מרווח פתיחה.",
    catalogPage: 17,
    assets: (page) => [
      klilPhoto("5600", page, "/media/ihxdy2lt/קליל-באוהאוס-5600-חלון-ציר-דו-כנפי-בשילוב-קבוע-תחתון-תלמי-מנשה-פינת-אוכל-שחור-1-1.jpg", "חלון ציר דו־כנפי KLIL 5600 בשילוב קבוע תחתון"),
    ],
  },
  {
    code: "7600",
    family: "באוהאוס",
    usage: "חלונות ודלתות הזזה. לפתחים בינוניים וגדולים, למשל ויטרינה לסלון. קווים ישרים מאפשרים להמשיך את המראה של חלונות הציר 5600 בחדר סמוך.",
    glazing: "6–12 מ״מ בזכוכית רגילה או רבודה. 14–28 מ״מ בזכוכית בידודית.",
    screens: "רשת הזזה תואמת, גלילה בארגז או רפפת הזזה 1200 לפי תכנון המסילות.",
    catalogPage: 16,
    assets: (page) => [
      klilPhoto("7600", page, "/media/jtin5mzv/קליל-באוהאוס-7600-דלת-הזזה-תלמי-מנשה-מבט-מהגינה-שחור-1-1.jpg", "דלת הזזה KLIL 7600 — מבט מהגינה"),
    ],
  },
  {
    code: "2600",
    family: "באוהאוס",
    usage: "דלת הרם־הזז למפתח רחב במיוחד. בסיבוב הידית המנגנון מרים מעט את הכנף כדי שתנוע על המסילה. מיועדת לדלתות זכוכית גדולות וכבדות, כגון יציאה רחבה לגינה.",
    glazing: "דף הסדרה מציין 6–47 מ״מ. האפשרויות כוללות זכוכית חד־שכבתית, רבודה ובידודית, לרבות הרכבים עם צלון פנימי.",
    screens: "קיימת רשת הזזה ייעודית. בפתח רחב מתאימים בנפרד את חלוקת התריס ואת מידות הארגז.",
    catalogPage: 21,
    assets: (page) => [
      klilPhoto("2600", page, "/media/rboduer3/2022_2600_black_001-1.jpg", "הדמיית יצרן: דלת הרם־הזז KLIL 2600", { rendering: true }),
      {
        kind: "section",
        path: "/series/klil/2600/section.jpg",
        caption: "חתך פרופיל KLIL 2600",
        exactModel: true,
        sourceUrl: "https://www.klil.co.il/media/0jrjlbid/קליל-באוהאוס-2600-חתך-פרופיל-אלומיניום.jpg",
        credit: `איור: ${BRANDS.klil.credit}`,
      },
    ],
    notes: ["בגלריית 2600 באתר קליל מופיעות הדמיות בלבד; התמונה מסומנת כהדמיה."],
  },
  {
    code: "7500",
    family: "בייסיק",
    usage: "הזזה בקווים נקיים. חלון או דלת הזזה למפתח בינוני או גדול. בחלונות מתאימים אפשר לבחור כנף מג׳יקליל שנפתחת גם לצורך ניקוי.",
    glazing: "כנף הזזה 4–22 מ״מ, מג׳יקליל 4–14 מ״מ וקבוע 4–34 מ״מ.",
    screens: "רשת הזזה תואמת, רפפה או גלילה בארגז. אפשר לבחור את מראה ההזזה הזה גם עם רשת בלבד.",
    catalogPage: 67,
    assets: (page) => [
      klilPhoto("7500", page, "/media/vrinoinv/קליל-בייסיק-7500-דלת-הזזה-הרצךיה-אופיס-סלון-שחור-1-1.jpg", "דלת הזזה KLIL 7500 בסלון"),
    ],
  },
  {
    code: "9000",
    family: "בייסיק",
    usage: "הזזה קלאסית למפתח גדול. מתאימה לחלונות ולדלתות רחבות. מספר הכנפיים והמסילות קובע איזה חלק מהפתח אפשר להשאיר פתוח.",
    glazing: "רגילה 4–12 מ״מ או בידודית 14–24 מ״מ. להרכב עבה יותר יש לבדוק את הכנף הספציפית.",
    screens: "רשת הזזה, תריס רפפה או תריס גלילה. רפפה על מסילה מאפשרת לכוון את האור גם כשהיא מול הזכוכית.",
    catalogPage: 71,
    assets: (page) => [
      klilPhoto("9000", page, "/media/22zdpsbo/קליל-בייסיק-9000-דלת-הזזה-בית-פרטי-בייסיק-סלון-1.jpg", "דלת הזזה KLIL 9000 בסלון"),
    ],
  },
  {
    code: "9200",
    family: "בייסיק",
    usage: "הזזה עם דגש על איטום. סדרה לפתחים גדולים שבהם חשוב לתת מענה לרוח ולגשם. מתאימה גם כשרוצים יחידת זכוכית בידודית עבה.",
    glazing: "רגילה או רבודה 6–12 מ״מ. בידודית 14–45 מ״מ, או 37–45 מ״מ עם צלון מובנה.",
    screens: "רשת ייעודית, מונובלוק או ארגז גלילה סמוי. ניתן לפרט בהצעה בנפרד את הארגז ואת סוג שלבי התריס.",
    assets: (page) => [
      klilPhoto("9200", page, "/media/rnfnge4g/קליל_בייסיק_9200_דלת_הזזה_הבית_במתן_באוהאוס_פינת_אוכלplusסלון_שחור-1.jpg", "דלת הזזה KLIL 9200 בפינת אוכל וסלון"),
    ],
  },
  {
    code: "4400",
    family: "בייסיק",
    usage: "חלון ציר, דלת או שדה קבוע. ניתן לתכנן דלת עם כנף אחת או שתיים, וכן שדה מזוגג קבוע. בוחרים את מספר הכנפיים לפי רוחב המעבר הדרוש.",
    glazing: "חד־שכבתית או רבודה 4–12 מ״מ. בידודית 14–34 מ״מ. בשדה 4+4 מפרטים גם את שכבת הביניים.",
    screens: "רשת קבועה או נשלפת. אפשרויות ההצללה כוללות רפפה ומערכות גלילה.",
    assets: (page) => [
      klilPhoto("4400", page, "/media/e0bdkxfa/2022_basic_4400_window_4k-1.jpg", "חלון ציר KLIL 4400"),
      {
        kind: "closeup",
        path: "/series/klil/4400/closeup.jpg",
        caption: "תקריב כנף וידית KLIL 4400",
        exactModel: true,
        sourceUrl: "https://www.klil.co.il/media/v35jxhgc/קליל-בייסיק-4400-דלתplusחלון-צירplusקיפ-עליון-בית-בסביון-basic-יציאה-למרפסת-אלומיניום-טבעי.jpg",
        credit: `צילום: ${BRANDS.klil.credit}`,
      },
    ],
  },
  {
    code: "4500",
    family: "בייסיק",
    usage: "חלונות ציר וויטרינות גבוהות. מתאימה למפתחים בינוניים וגדולים ולשילוב דלת או חלון נפתח בתוך חזית מזוגגת מהרצפה לתקרה.",
    glazing: "חלון 4–40 מ״מ, לרבות 37–40 מ״מ עם צלון פנימי. בדף הסדרה מפורטים 4–33 מ״מ לדלת או לקבוע.",
    screens: "רשת קבועה או נשלפת, תריס רפפה או גלילה. מיקום השדה הקבוע משנה את רוחב המעבר.",
    catalogPage: 75,
    assets: (page) => [
      klilPhoto("4500", page, "/media/4bxj23ft/basic-קליל-4500-מטבח-חלון-ציר-שחור.jpg", "חלונות ציר KLIL 4500 במטבח"),
    ],
    notes: ["קטלוג קליל 2026 עמ׳ 74 מציין לדלת או לקבוע 4–34 מ״מ; דף הסדרה מציין 4–33 מ״מ. מוצג הערך הנמוך עד לבירור."],
  },
  {
    code: "5500",
    family: "בייסיק",
    aliases: ["5500D"],
    usage: "חלון ציר למפתח בינוני. חלון במראה מעודן עם אפשרויות פתיחה שונות, בהן פתיחת ציר והטיה לאוורור. בקטלוג קליל דגם הדלת הייעודי מסומן 5500D.",
    glazing: "רגילה או רבודה 4–13 מ״מ. בידודית 14–32 מ״מ או 37–40 מ״מ, בהתאם להרכב.",
    screens: "רשת קבועה או נשלפת. קליל מציעה פתרונות גלילה וכן תריס ציר 1300.",
    catalogPage: 74,
    assets: (page) => [
      klilPhoto("5500", page, "/media/n3qdq1iw/קליל-ביזנס-5500-חלון-ציר-בשילוב-קבוע-עליון-ותחתון-פתח-תקווה-אופיס-מטבח-לבן-1.jpg", "חלון ציר KLIL 5500 בשילוב קבוע עליון ותחתון"),
    ],
  },
];

function klilRecord(seed: KlilSeed): SeriesRecord {
  const page = klilPage(seed.family, seed.code);
  const sources: SourceRef[] = [{ label: "דף הסדרה והגלריה הרשמית", url: page }];
  if (seed.catalogPage) sources.push({ label: `קטלוג קליל 2026, עמ׳ ${seed.catalogPage}`, url: KLIL_CATALOG_2026 });
  return {
    key: `klil/${seed.code}`,
    brand: "klil",
    code: seed.code,
    aliases: seed.aliases ?? [],
    family: seed.family,
    title: `${BRANDS.klil.nameHe} ${seed.family} ${seed.code}`,
    usage: seed.usage,
    glazing: seed.glazing,
    screens: seed.screens,
    galleryUrl: page,
    sources,
    assets: seed.assets(page),
    language: "he",
    verifiedDate: VERIFIED,
    notes: seed.notes,
  };
}

const ALUMIL_SCREENS =
  "אם בהצעה מופיע תריס, הסוג והארגז מוצגים לפי השדות שנבחרו. התאמת הרשת, המסילות והארגז נקבעת לפי הפתח והמפרט.";

const ALUMIL_RECORDS: SeriesRecord[] = [
  {
    key: "alumil/S350",
    brand: "alumil",
    code: "S350",
    aliases: [],
    family: "SMARTIA",
    title: "ALUMIL SMARTIA S350",
    usage:
      "מערכת הזזה מבודדת לחלונות ולדלתות, בעלת קווי מסגרת שטוחים. רכיב פוליאמיד מפריד בין חלקי האלומיניום ומפחית מעבר חום דרך המסגרת.",
    glazing: "בקטלוג הישראלי מצוין זיגוג עד 24 מ״מ. יש להתאים את ההרכב לכנף הנבחרת.",
    screens: ALUMIL_SCREENS,
    galleryUrl: "https://www.alumil.com/international/aluminium-systems/all-architectural-aluminium-systems/sliding-insulated-system-smartia-s350",
    sources: [
      { label: "דף המוצר הרשמי", url: "https://www.alumil.com/international/aluminium-systems/all-architectural-aluminium-systems/sliding-insulated-system-smartia-s350" },
      { label: "קטלוג ALUMIL ישראל 2021, עמ׳ 46", url: ALUMIL_IL_CATALOG },
    ],
    assets: [],
    language: "he",
    verifiedDate: VERIFIED,
    notes: ["תמונות היצרן לא נשמרו: שרת static.alumil.com חסם הורדה בזמן ההכנה."],
  },
  {
    key: "alumil/S560",
    brand: "alumil",
    code: "S560",
    aliases: [],
    family: "SMARTIA",
    title: "ALUMIL SMARTIA S560",
    usage: "מערכת הזזה והרם־הזז מבודדת לדלתות גדולות.",
    glazing: "בקטלוג הישראלי מצוין זיגוג 22–44 מ״מ. יש להתאים את ההרכב לכנף הנבחרת.",
    screens: ALUMIL_SCREENS,
    conditional: true,
    galleryUrl: "https://www.alumil.com/",
    sources: [{ label: "קטלוג ALUMIL ישראל 2021, עמ׳ 42", url: ALUMIL_IL_CATALOG }],
    assets: [],
    language: "he",
    verifiedDate: VERIFIED,
    notes: ["נבחר רק בבחירה מפורשת של ALUMIL S560. ״560 הרם הזז״ ללא קידומת דורש אישור."],
  },
  {
    key: "alumil/M9660",
    brand: "alumil",
    code: "M9660",
    aliases: [],
    family: "SMARTIA",
    title: "ALUMIL SMARTIA M9660",
    usage: "מערכת חלונות ציר־נטוי (פתיחה והטיה) מבודדת.",
    glazing: "בקטלוג הישראלי מצוין זיגוג עד 49 מ״מ. העובי בפועל נקבע לפי הכנף הנבחרת.",
    screens: ALUMIL_SCREENS,
    conditional: true,
    galleryUrl: "https://www.alumil.com/",
    sources: [{ label: "קטלוג ALUMIL ישראל 2021, עמ׳ 32–33", url: ALUMIL_IL_CATALOG }],
    assets: [],
    language: "he",
    verifiedDate: VERIFIED,
  },
  {
    key: "alumil/MD9660",
    brand: "alumil",
    code: "MD9660",
    aliases: [],
    family: "SMARTIA",
    title: "ALUMIL SMARTIA MD9660",
    usage: "מערכת דלת כניסה מבודדת, מאותה משפחה של חלונות M9660.",
    glazing: "הרכב הזיגוג והמילוי נקבע לפי דגם הכנף ויאומת מול קטלוג היצרן.",
    screens: ALUMIL_SCREENS,
    conditional: true,
    galleryUrl: "https://www.alumil.com/",
    sources: [{ label: "קטלוג ALUMIL ישראל 2021, עמ׳ 32–33", url: ALUMIL_IL_CATALOG }],
    assets: [],
    language: "he",
    verifiedDate: VERIFIED,
  },
];

export const SERIES_CATALOG: SeriesRecord[] = [...KLIL_SEEDS.map(klilRecord), ...ALUMIL_RECORDS];

export function findSeries(key: string | undefined): SeriesRecord | undefined {
  return key ? SERIES_CATALOG.find((r) => r.key === key) : undefined;
}

export function seriesLabel(record: SeriesRecord): string {
  return `${BRANDS[record.brand].nameLatin} ${record.code}`;
}

/** Accessories are linked to the quote item that names them; they never create a sheet of their own. */
export type AccessoryRecord = {
  key: string;
  brand?: SeriesBrand;
  label: string;
  description: string;
  sourceUrl?: string;
};

export const ACCESSORIES: Record<string, AccessoryRecord> = {
  "klil/1200": {
    key: "klil/1200",
    brand: "klil",
    label: "תריס רפפה הזזה KLIL 1200",
    description: "תריס רפפה בהזזה על מסילה; השלבים מאפשרים לכוון את האור.",
    sourceUrl: "https://www.klil.co.il/תריסים-ופתרונות-הצללה/תריסים-ושלבי-תריס/תריס-רפפה/",
  },
  "klil/1300": {
    key: "klil/1300",
    brand: "klil",
    label: "תריס רפפה על ציר KLIL 1300",
    description: "תריס רפפה הנפתח על צירים.",
    sourceUrl: "https://www.klil.co.il/תריסים-ופתרונות-הצללה/תריסים-ושלבי-תריס/תריס-רפפה/",
  },
  "light-shutter": {
    key: "light-shutter",
    label: "תריס אור",
    description: "תריס גלילה שבמצב ביניים נפתחים בו מרווחים בין השלבים ומכניסים אור ואוויר.",
    sourceUrl:
      "https://www.klil.co.il/%D7%AA%D7%A8%D7%99%D7%A1%D7%99%D7%9D-%D7%95%D7%A4%D7%AA%D7%A8%D7%95%D7%A0%D7%95%D7%AA-%D7%94%D7%A6%D7%9C%D7%9C%D7%94/%D7%AA%D7%A8%D7%99%D7%A1%D7%99%D7%9D-%D7%95%D7%A9%D7%9C%D7%91%D7%99-%D7%AA%D7%A8%D7%99%D7%A1/%D7%A7%D7%9C%D7%99%D7%9C%D7%90%D7%95%D7%A8/",
  },
  "openart/classic": {
    key: "openart/classic",
    label: "ארגז תריס סמוי OpenArt CLASSIC",
    description: "ארגז תריס סמוי עם גישה מלפנים.",
    sourceUrl: "https://open-art.co.il/solutions_more.aspx?cat=20",
  },
  "openart/premium": {
    key: "openart/premium",
    label: "ארגז תריס סמוי OpenArt PREMIUM",
    description: "ארגז תריס סמוי עם פתרונות גישה מלפנים, מהתקרה ובפינה.",
    sourceUrl: "https://open-art.co.il/solutions_more.aspx?cat=12",
  },
};

/** Hinged / casement series: a sliding louver beside them needs its own track and estimator review. */
export const HINGED_SERIES = new Set(["klil/4300", "klil/5600", "klil/4400", "klil/4500", "klil/5500", "alumil/M9660", "alumil/MD9660"]);
