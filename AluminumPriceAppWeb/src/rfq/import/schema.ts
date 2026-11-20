import type {
  CavityFill,
  GlassAppearance,
  GlassCoating,
  GlassTreatment,
  GlazingConstruction,
  Requirement,
  RfqCategory,
  RfqOpeningType,
  RfqUnit,
  ShadingOperation,
  ShadingType,
  Side,
  Swing,
} from "../types";

export type ImportField =
  | "reference"
  | "category"
  | "openingType"
  | "width"
  | "height"
  | "unit"
  | "quantity"
  | "location"
  | "panels"
  | "fixedPanels"
  | "hingeSide"
  | "swing"
  | "activeLeaf"
  | "glass"
  | "frameFinish"
  | "insectScreen"
  | "shutter"
  | "hardware"
  | "otherRequirements"
  | "description"
  | "notes"
  | "layout"
  | "glassConstruction"
  | "glassTreatment"
  | "glassAppearance"
  | "glassTint"
  | "glassCoatings"
  | "glassMakeup"
  | "cavityFill"
  | "shading"
  | "shadingOperation"
  | "shadingColor"
  | "hardwareSet"
  | "alternatives"
  | "profile";

export const IMPORT_FIELDS: ImportField[] = [
  "reference",
  "category",
  "openingType",
  "width",
  "height",
  "unit",
  "quantity",
  "location",
  "panels",
  "fixedPanels",
  "layout",
  "hingeSide",
  "swing",
  "activeLeaf",
  "glass",
  "glassConstruction",
  "glassTreatment",
  "glassAppearance",
  "glassTint",
  "glassCoatings",
  "glassMakeup",
  "cavityFill",
  "frameFinish",
  "insectScreen",
  "shutter",
  "shading",
  "shadingOperation",
  "shadingColor",
  "hardware",
  "hardwareSet",
  "otherRequirements",
  "alternatives",
  "description",
  "notes",
  "profile",
];

export const REQUIRED_FIELDS: ImportField[] = ["category", "openingType", "width", "height", "quantity"];

export const FIELD_LABELS: Record<ImportField, { en: string; he: string }> = {
  reference: { en: "Reference", he: "מזהה" },
  category: { en: "Category", he: "קטגוריה" },
  openingType: { en: "Opening type", he: "סוג פתיחה" },
  width: { en: "Width", he: "רוחב" },
  height: { en: "Height", he: "גובה" },
  unit: { en: "Unit", he: "יחידה" },
  quantity: { en: "Quantity", he: "כמות" },
  location: { en: "Location", he: "מיקום" },
  panels: { en: "Panels", he: "מספר חלקים" },
  fixedPanels: { en: "Fixed panels", he: "חלקים קבועים" },
  hingeSide: { en: "Hinge side", he: "צד צירים" },
  swing: { en: "Opening direction", he: "כיוון פתיחה" },
  activeLeaf: { en: "Active leaf", he: "כנף פעילה" },
  glass: { en: "Glass", he: "זכוכית" },
  frameFinish: { en: "Frame finish", he: "צבע מסגרת" },
  insectScreen: { en: "Insect screen", he: "רשת" },
  shutter: { en: "Shutter", he: "תריס" },
  hardware: { en: "Hardware", he: "פרזול" },
  otherRequirements: { en: "Other requirements", he: "דרישות נוספות" },
  description: { en: "Description", he: "תיאור" },
  notes: { en: "Notes", he: "הערות" },
  layout: { en: "Layout", he: "חלוקה" },
  glassConstruction: { en: "Glazing construction", he: "מבנה זיגוג" },
  glassTreatment: { en: "Glass treatment", he: "עיבוד זכוכית" },
  glassAppearance: { en: "Glass appearance", he: "מראה זכוכית" },
  glassTint: { en: "Glass tint color", he: "גוון זכוכית" },
  glassCoatings: { en: "Glass coatings", he: "ציפויי זכוכית" },
  glassMakeup: { en: "Glass make-up (mm)", he: "הרכב זכוכית (מ״מ)" },
  cavityFill: { en: "Cavity fill", he: "מילוי מרווח" },
  shading: { en: "Blind / shading", he: "וילון / הצללה" },
  shadingOperation: { en: "Blind operation", he: "הפעלת וילון" },
  shadingColor: { en: "Blind color", he: "צבע וילון" },
  hardwareSet: { en: "Complete hardware set", he: "סט פרזול מלא" },
  alternatives: { en: "Alternatives", he: "חלופות" },
  profile: { en: "Profile", he: "פרופיל" },
};

/** Normalize text for matching: lowercase, unify Hebrew geresh/quotes, drop punctuation and spacing. */
export function normKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u05f3\u05f4'"`׳״]/g, "")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const HEADER_ALIASES: Record<ImportField, string[]> = {
  reference: ["reference", "ref", "item ref", "item reference", "item", "item no", "id", "code", "mark", "מזהה", "מס", "מספר", "מספר פריט", "סימון", "קוד", "פריט"],
  category: ["category", "kind", "window door", "product", "קטגוריה", "סוג מוצר", "חלון דלת", "מוצר"],
  openingType: ["opening type", "type", "opening", "system type", "configuration type", "סוג פתיחה", "סוג", "פתיחה", "סוג חלון"],
  width: ["width", "w", "רוחב", "ר"],
  height: ["height", "h", "גובה", "ג"],
  unit: ["unit", "units", "dimension unit", "יחידה", "יחידות", "יחידת מידה"],
  quantity: ["quantity", "qty", "pcs", "count", "כמות", "יחידות להזמנה", "מס יחידות"],
  location: ["location", "room", "room location", "area", "מיקום", "חדר", "חדר מיקום"],
  panels: ["panels", "panel count", "leaves", "sashes", "number of panels", "חלקים", "מספר חלקים", "כנפות", "מספר כנפות"],
  fixedPanels: ["fixed panels", "fixed", "fixed panel numbers", "חלקים קבועים", "קבועים"],
  hingeSide: ["hinge side", "hinge", "hinged side", "handing", "צד צירים", "צירים", "צד ציר"],
  swing: ["opening direction", "swing", "opens", "direction", "כיוון פתיחה", "כיוון"],
  activeLeaf: ["active leaf", "active", "כנף פעילה"],
  glass: ["glass", "glazing", "זכוכית", "זיגוג"],
  frameFinish: ["frame finish", "finish", "color", "colour", "frame color", "frame colour", "צבע", "צבע מסגרת", "גימור"],
  insectScreen: ["insect screen", "screen", "fly screen", "mosquito net", "net", "רשת", "רשת נגד חרקים", "רשת יתושים"],
  shutter: ["shutter", "shutters", "roller shutter", "תריס", "תריסים"],
  hardware: ["hardware", "handles", "locks", "פרזול", "ידיות"],
  otherRequirements: ["other requirements", "requirements", "other", "דרישות נוספות", "דרישות"],
  description: ["description", "custom description", "תיאור"],
  notes: ["notes", "note", "remarks", "comments", "הערות", "הערה"],
  layout: ["layout", "layout notation", "partition", "partitions", "division", "חלוקה", "חלוקת חלון"],
  glassConstruction: ["glazing construction", "glazing type", "glass construction", "glazing units", "מבנה זיגוג", "סוג זיגוג"],
  glassTreatment: ["glass treatment", "glass type", "safety glass", "עיבוד זכוכית", "סוג זכוכית"],
  glassAppearance: ["glass appearance", "appearance", "privacy", "מראה זכוכית", "מראה", "פרטיות"],
  glassTint: ["glass tint", "glass tint color", "tint", "tint color", "גוון זכוכית", "גוון"],
  glassCoatings: ["glass coatings", "coatings", "coating", "glass performance", "ציפויי זכוכית", "ציפוי", "ציפויים"],
  glassMakeup: ["glass make up", "glass makeup", "make up", "makeup", "glass build up", "glass thickness", "הרכב זכוכית", "עובי זכוכית", "הרכב"],
  cavityFill: ["cavity fill", "gas fill", "spacer fill", "מילוי מרווח", "מילוי", "גז"],
  shading: ["blind", "blinds", "shading", "blind type", "וילון", "וילונות", "הצללה"],
  shadingOperation: ["blind operation", "shading operation", "blind control", "הפעלת וילון", "הפעלה"],
  shadingColor: ["blind color", "blind colour", "shading color", "צבע וילון"],
  hardwareSet: ["complete hardware set", "hardware set", "full hardware set", "סט פרזול מלא", "סט פרזול"],
  alternatives: ["alternatives", "alternative", "options", "חלופות", "חלופה"],
  profile: ["profile", "profile series", "series", "system", "פרופיל", "סדרה", "סדרת פרופיל", "מערכת"],
};

/** Map file headers to fields. A bilingual header like "Width (mm) / רוחב" matches on either part. */
export function autoMapHeaders(headers: string[]): Partial<Record<ImportField, number>> {
  const mapping: Partial<Record<ImportField, number>> = {};
  const used = new Set<number>();
  const keyed = headers.map((h) => h.split("/").map(normKey).filter(Boolean));
  for (const field of IMPORT_FIELDS) {
    const aliases = HEADER_ALIASES[field].map(normKey);
    const idx = keyed.findIndex((parts, i) => !used.has(i) && parts.some((p) => aliases.includes(p)));
    if (idx >= 0) {
      mapping[field] = idx;
      used.add(idx);
    }
  }
  return mapping;
}

/** Unit stated in a header such as "Width (mm)" / "רוחב (ס״מ)". */
export function unitFromHeader(header: string | undefined): RfqUnit | null {
  if (!header) return null;
  const h = header.toLowerCase();
  if (/\bmm\b|מ["״']?מ|מילימטר/.test(h)) return "mm";
  if (/\bcm\b|ס["״']?מ|סנטימטר/.test(h)) return "cm";
  return null;
}

type Parsed<T> = { ok: true; value: T } | { ok: false };

function lookup<T extends string>(raw: string, table: Record<T, string[]>): Parsed<T> {
  const k = normKey(raw);
  if (!k) return { ok: false };
  for (const [value, aliases] of Object.entries(table) as [T, string[]][]) {
    if (value === k || aliases.some((a) => normKey(a) === k)) return { ok: true, value };
  }
  return { ok: false };
}

export const CATEGORY_VALUES: Record<RfqCategory, string[]> = {
  window: ["window", "windows", "w", "חלון", "חלונות"],
  door: ["door", "doors", "d", "דלת", "דלתות"],
};

export const OPENING_TYPE_VALUES: Record<RfqOpeningType, string[]> = {
  fixed_window: ["fixed", "fixed window", "fixed light", "picture window", "קבוע", "חלון קבוע", "ויטרינה קבועה"],
  sliding_window: ["sliding", "sliding window", "slider", "horizontal slider", "הזזה", "חלון הזזה"],
  casement_window: ["casement", "casement window", "side hung", "side-hung", "פתיחה", "ציר", "חלון פתיחה", "חלון ציר", "ציר צד"],
  tilt_turn_window: ["tilt and turn", "tilt turn", "tilt & turn", "tilt-and-turn", "tilt-turn", "dreh kipp", "דרי קיפ", "דריי קיפ", "דרי-קיפ", "חלון דרי קיפ", "קיפ פתיחה"],
  top_hung_window: ["top hung", "top-hung", "awning", "top hung window", "ציר עליון", "חלון ציר עליון"],
  sliding_door: ["sliding door", "patio door", "דלת הזזה"],
  hinged_door_single: ["single door", "single hinged door", "hinged door", "door single", "דלת", "דלת ציר", "דלת פתיחה", "דלת כנף אחת", "דלת ציר כנף אחת"],
  hinged_door_double: ["double door", "double hinged door", "french door", "דלת כפולה", "דלת שתי כנפיים", "דלת ציר שתי כנפיים", "דלת דו כנפית"],
  custom: ["custom", "other", "special", "מותאם", "מותאם אישית", "אחר", "מיוחד"],
};

const SIDE_VALUES: Record<Side, string[]> = {
  left: ["left", "l", "lh", "left hand", "שמאל", "שמאלי", "שמאלית"],
  right: ["right", "r", "rh", "right hand", "ימין", "ימני", "ימנית"],
};

const SWING_VALUES: Record<Swing, string[]> = {
  inward: ["inward", "in", "inwards", "opens in", "inside", "פנימה", "פנימי", "פנים"],
  outward: ["outward", "out", "outwards", "opens out", "outside", "החוצה", "חיצוני", "חוץ"],
};

const REQUIREMENT_VALUES: Record<Exclude<Requirement, "unspecified">, string[]> = {
  required: ["yes", "y", "required", "true", "1", "with", "כן", "נדרש", "עם", "יש"],
  not_required: ["no", "n", "not required", "false", "0", "without", "none", "לא", "לא נדרש", "בלי", "אין"],
};

const UNIT_VALUES: Record<RfqUnit, string[]> = {
  mm: ["mm", "millimeter", "millimetre", "millimeters", "מ״מ", "ממ", "מילימטר"],
  cm: ["cm", "centimeter", "centimetre", "centimeters", "ס״מ", "סמ", "סנטימטר"],
};

const CONSTRUCTION_VALUES: Record<Exclude<GlazingConstruction, "unspecified">, string[]> = {
  single: ["single", "single glazing", "single glazed", "1", "יחיד", "זיגוג יחיד", "זכוכית יחידה"],
  double: ["double", "double glazing", "double glazed", "dgu", "igu", "insulated", "2", "כפול", "זיגוג כפול", "בידודית", "זכוכית בידודית"],
  triple: ["triple", "triple glazing", "triple glazed", "tgu", "3", "משולש", "זיגוג משולש"],
  custom: ["custom", "other", "מותאם", "אחר"],
  supplier: ["ask supplier", "supplier", "supplier recommendation", "recommend", "לשאול את הספק", "ספק", "המלצת ספק"],
};

const TREATMENT_VALUES: Record<Exclude<GlassTreatment, "unspecified">, string[]> = {
  annealed: ["annealed", "float", "standard", "רגילה", "מקוררת", "פלואט"],
  heat_strengthened: ["heat strengthened", "heat-strengthened", "hs", "מחוזקת", "מחוזקת בחום"],
  tempered: ["tempered", "toughened", "מחוסמת", "מחוסם", "חסום"],
  laminated: ["laminated", "lami", "triplex", "שכבתית", "טריפלקס", "למינציה"],
  tempered_laminated: ["tempered laminated", "toughened laminated", "laminated tempered", "שכבתית מחוסמת", "טריפלקס מחוסם"],
  supplier: ["ask supplier", "supplier", "supplier recommendation", "לשאול את הספק", "המלצת ספק"],
};

const APPEARANCE_VALUES: Record<Exclude<GlassAppearance, "unspecified">, string[]> = {
  clear: ["clear", "transparent", "שקופה", "שקוף"],
  low_iron: ["low iron", "low-iron", "ultra clear", "ultra-clear", "extra clear", "אולטרה שקופה", "אולטרה-שקופה"],
  tinted: ["tinted", "tint", "colored", "coloured", "כהה", "בגוון", "צבועה"],
  reflective: ["reflective", "mirror", "רפלקטיבית", "מראה", "רפלקטיבי"],
  frosted: ["frosted", "satin", "acid etched", "sandblasted", "חלבית", "חלבי", "חומצה"],
  patterned: ["patterned", "obscure", "textured", "מעוטרת", "עמומה"],
  custom: ["custom", "other", "מותאם", "אחר"],
};

const COATING_VALUES: Record<GlassCoating, string[]> = {
  low_e: ["low e", "low-e", "lowe", "low emissivity", "בידוד תרמי"],
  solar_control: ["solar control", "solar", "sun control", "anti sun", "בקרת שמש", "אנטי סאן"],
  uv: ["uv", "uv protection", "הגנת uv"],
  acoustic: ["acoustic", "sound", "אקוסטי", "בידוד אקוסטי"],
  custom: ["custom", "other", "אחר"],
};

const FILL_VALUES: Record<Exclude<CavityFill, "unspecified">, string[]> = {
  air: ["air", "אוויר"],
  argon: ["argon", "ar", "ארגון"],
  other: ["other", "אחר"],
};

const SHADING_VALUES: Record<ShadingType, string[]> = {
  integrated: ["integrated", "integrated blind", "between glass", "between panes", "built in", "מובנה", "וילון מובנה", "בין הזכוכיות"],
  interior: ["interior", "internal", "inside", "פנימי", "וילון פנימי"],
  exterior: ["exterior", "external", "outside", "חיצוני", "וילון חיצוני"],
  roller_shutter: ["roller shutter", "shutter", "roller", "תריס", "תריס גלילה"],
  other: ["other", "custom", "אחר"],
  supplier: ["ask supplier", "supplier", "לשאול את הספק"],
};

const NONE_VALUES = ["none", "no", "n", "-", "לא", "אין", "ללא"];

const SHADING_OP_VALUES: Record<Exclude<ShadingOperation, "unspecified">, string[]> = {
  manual: ["manual", "hand", "ידני"],
  motorized: ["motorized", "motorised", "electric", "motor", "חשמלי", "ממונע"],
};

export const parseCategory = (raw: string) => lookup(raw, CATEGORY_VALUES);
export const parseConstruction = (raw: string) => lookup(raw, CONSTRUCTION_VALUES);
export const parseTreatment = (raw: string) => lookup(raw, TREATMENT_VALUES);
export const parseAppearance = (raw: string) => lookup(raw, APPEARANCE_VALUES);
export const parseCavityFill = (raw: string) => lookup(raw, FILL_VALUES);
export const parseShadingOperation = (raw: string) => lookup(raw, SHADING_OP_VALUES);

/** "none" is a valid answer meaning no blind; returns null for it. */
export function parseShading(raw: string): Parsed<ShadingType | null> {
  if (NONE_VALUES.includes(normKey(raw))) return { ok: true, value: null };
  return lookup(raw, SHADING_VALUES);
}

/** Comma/semicolon/plus separated list; any unknown part fails the whole cell so nothing is silently dropped. */
export function parseCoatings(raw: string): Parsed<GlassCoating[]> {
  const parts = raw.split(/[,;+]/).map((s) => s.trim()).filter(Boolean);
  const out: GlassCoating[] = [];
  for (const p of parts) {
    const r = lookup(p, COATING_VALUES);
    if (!r.ok) return { ok: false };
    if (!out.includes(r.value)) out.push(r.value);
  }
  return { ok: true, value: out };
}
export const parseSide = (raw: string) => lookup(raw, SIDE_VALUES);
export const parseSwing = (raw: string) => lookup(raw, SWING_VALUES);
export const parseRequirement = (raw: string) => lookup(raw, REQUIREMENT_VALUES);
export const parseUnit = (raw: string) => lookup(raw, UNIT_VALUES);

/**
 * Opening type, optionally disambiguated by category: a bare "sliding"/"fixed" in a door row is not
 * silently turned into a door type; it is reported as invalid for the category instead.
 */
export function parseOpeningType(raw: string): Parsed<RfqOpeningType> {
  return lookup(raw, OPENING_TYPE_VALUES);
}
