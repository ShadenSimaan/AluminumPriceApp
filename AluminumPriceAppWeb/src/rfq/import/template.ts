import { toCsv } from "./csv";
import { writeXlsx } from "./xlsx";
import { FIELD_LABELS, IMPORT_FIELDS, OPENING_TYPE_VALUES, REQUIRED_FIELDS, type ImportField } from "./schema";
import { dict } from "../i18n";
import { RFQ_OPENING_TYPES } from "../types";

function header(field: ImportField): string {
  const l = FIELD_LABELS[field];
  if (field === "width" || field === "height") return `${l.en} (mm) / ${l.he} (מ״מ)`;
  return `${l.en} / ${l.he}`;
}

export const TEMPLATE_HEADERS: string[] = IMPORT_FIELDS.filter((f) => f !== "unit").map(header);
export const TEMPLATE_FIELDS: ImportField[] = IMPORT_FIELDS.filter((f) => f !== "unit");

type Example = Partial<Record<ImportField, string | number>>;

const EXAMPLES: Example[] = [
  { reference: "W-01", category: "window", openingType: "sliding window", width: 1800, height: 1300, quantity: 4, location: "Living room", panels: 2, glass: "6-12-6 Low-E", frameFinish: "RAL 9016 matt", insectScreen: "yes", shutter: "no" },
  { reference: "W-02", category: "חלון", openingType: "חלון פתיחה", width: 600, height: 1200, quantity: 6, location: "חדר שינה", panels: 1, hingeSide: "ימין", swing: "פנימה", insectScreen: "כן" },
  { reference: "W-03", category: "window", openingType: "tilt and turn", width: 1200, height: 1400, quantity: 2, location: "Kitchen", panels: 2, fixedPanels: "1", hingeSide: "right", glass: "Laminated 4+4 / 16 / 6" },
  { reference: "W-04", category: "window", openingType: "top hung", width: 800, height: 500, quantity: 3, location: "Bathroom", glass: "Frosted" },
  { reference: "D-01", category: "door", openingType: "sliding door", width: 3600, height: 2300, quantity: 1, location: "Salon", panels: 4, fixedPanels: "1,4", shutter: "yes", hardware: "Lockable handle" },
  { reference: "D-02", category: "דלת", openingType: "דלת שתי כנפיים", width: 1600, height: 2200, quantity: 1, location: "כניסה", swing: "החוצה", activeLeaf: "ימין", notes: "דלת כניסה ראשית" },
  { reference: "W-05", category: "window", openingType: "casement", width: 3600, height: 1500, quantity: 1, location: "Living room", panels: 6, fixedPanels: "1,6", swing: "inward", glassConstruction: "double", glassTreatment: "tempered", glassAppearance: "clear", glassCoatings: "Low-E", glassMakeup: "6-16-6", cavityFill: "argon", hardwareSet: "yes" },
  { reference: "W-06", category: "window", openingType: "casement", width: 1500, height: 2000, quantity: 2, location: "Bedroom", layout: "F:400/(OL[G/G]|F|OR)", swing: "inward", glassConstruction: "double", glassAppearance: "clear", shading: "integrated", shadingOperation: "manual", shadingColor: "White", alternatives: "Same layout with triple glazing; Top light as top-hung opening" },
  { reference: "", category: "window", openingType: "custom", width: 2000, height: 1000, quantity: 1, location: "Staircase", description: "Trapezoid fixed window, high side on the left" },
];

export function templateRows(): (string | number)[][] {
  return [TEMPLATE_HEADERS, ...EXAMPLES.map((ex) => TEMPLATE_FIELDS.map((f) => ex[f] ?? ""))];
}

function instructionRows(): string[][] {
  const en = dict("en");
  const he = dict("he");
  const rows: string[][] = [
    ["Supplier RFQ import template / תבנית ייבוא לבקשה לספק", ""],
    ["Required columns / עמודות חובה", REQUIRED_FIELDS.map((f) => `${FIELD_LABELS[f].en} / ${FIELD_LABELS[f].he}`).join(", ")],
    ["Units / יחידות", "Width and height in this template are in millimetres (mm). If your file uses cm, change the header to \"(cm)\" or choose the unit during import. / רוחב וגובה בתבנית זו במילימטרים. לשימוש בס״מ יש לשנות את הכותרת ל-\"(cm)\" או לבחור יחידה בזמן הייבוא."],
    ["Reference / מזהה", "Optional. Generated automatically (W-01, D-01 …) when empty. Must be unique. / לא חובה. ייווצר אוטומטית אם ריק. חייב להיות ייחודי."],
    ["Category / קטגוריה", "window / חלון, door / דלת"],
    ["Quantity / כמות", "Whole number, 1 or more / מספר שלם, 1 ומעלה"],
    ["Panels / מספר חלקים", "Optional. Number of panels or leaves, counted from the left as viewed from outside. / לא חובה. מספר החלקים, נספרים משמאל במבט מבחוץ."],
    ["Fixed panels / חלקים קבועים", "Optional. Panel numbers from the left, e.g. 1 or 1,4 / לא חובה. מספרי החלקים משמאל, למשל 1 או 1,4"],
    ["Hinge side / צד צירים", "left / שמאל, right / ימין — viewed from outside / במבט מבחוץ"],
    ["Opening direction / כיוון פתיחה", "inward / פנימה, outward / החוצה"],
    ["Insect screen, Shutter / רשת, תריס", "yes / כן, no / לא, or empty = not specified / ריק = לא צוין"],
    [
      "Layout / חלוקה",
      "Optional; replaces Panels / Fixed panels. | = side by side, / = stacked, ( ) groups. F = fixed panel, O = opening panel, add L or R for hinge side / slide direction. [G/G] = glass divided by glazing bars inside the panel, G#2x1 = decorative bars (2 vertical, 1 horizontal). :400 = size in the row's unit; omitted sizes share the rest equally. Example: F:400/(OL[G/G]|F|OR) / לא חובה; מחליף את מספר החלקים. | = זה לצד זה, / = זה מעל זה. F = קבוע, O = נפתח, L/R = צד. [G/G] = חלוקת זכוכית, G#2x1 = סרגלים דקורטיביים. :400 = מידה ביחידת השורה.",
    ],
    ["Glazing construction / מבנה זיגוג", "single / יחיד, double / כפול, triple / משולש, custom / מותאם, ask supplier / לשאול את הספק"],
    ["Glass treatment / עיבוד זכוכית", "annealed / רגילה, heat strengthened / מחוזקת בחום, tempered / מחוסמת, laminated / שכבתית, tempered laminated / שכבתית מחוסמת, ask supplier"],
    ["Glass appearance / מראה זכוכית", "clear / שקופה, low iron / אולטרה-שקופה, tinted / כהה (put the color in Glass tint color), reflective / רפלקטיבית, frosted / חלבית, patterned / מעוטרת, custom"],
    ["Glass coatings / ציפויי זכוכית", "Comma-separated: Low-E, solar control, UV, acoustic, custom / מופרדים בפסיק"],
    ["Glass make-up (mm) / הרכב זכוכית (מ״מ)", "Always millimetres, regardless of the width/height unit: pane-cavity-pane, e.g. 6-16-6, 4+4-12-6, 6-14-4-14-6. Empty = supplier to propose. / תמיד במ״מ: זכוכית-מרווח-זכוכית. ריק = הספק יציע."],
    ["Cavity fill / מילוי מרווח", "air / אוויר, argon / ארגון, other / אחר"],
    ["Blind / shading / וילון / הצללה", "none / ללא, integrated / מובנה, interior / פנימי, exterior / חיצוני, roller shutter / תריס גלילה, other, ask supplier. Integrated blinds need double or triple glazing. / וילון מובנה דורש זיגוג כפול או משולש."],
    ["Blind operation / הפעלת וילון", "manual / ידני, motorized / חשמלי"],
    ["Complete hardware set / סט פרזול מלא", "yes / כן to request a complete compatible hardware set / כן לבקשת סט פרזול מלא ותואם"],
    ["Alternatives / חלופות", "Separate several alternatives with ; — priced separately from the main configuration / מספר חלופות מופרדות ב-;"],
    ["Other columns / עמודות נוספות", "Free text, kept exactly as written (not translated). / טקסט חופשי, נשמר בדיוק כפי שנכתב (ללא תרגום)."],
    ["Limits / מגבלות", "Max 5 MB, 1000 rows. Formulas are not calculated; macros are not supported. / עד 5MB ו-1000 שורות. נוסחאות אינן מחושבות; מאקרו אינו נתמך."],
    ["", ""],
    ["Accepted opening-type values / ערכים מותרים לסוג פתיחה", ""],
  ];
  for (const t of RFQ_OPENING_TYPES) {
    rows.push([`${en.openingType[t]} / ${he.openingType[t]}`, OPENING_TYPE_VALUES[t].join(", ")]);
  }
  return rows;
}

export function buildTemplateCsv(): string {
  return toCsv(templateRows().map((r) => r.map(String)));
}

export function buildTemplateXlsx(): Uint8Array {
  return writeXlsx([
    { name: "Items", rows: templateRows(), colWidths: TEMPLATE_HEADERS.map((h) => Math.min(34, Math.max(12, h.length * 0.9))) },
    { name: "Instructions", rows: instructionRows(), colWidths: [42, 120] },
  ]);
}
