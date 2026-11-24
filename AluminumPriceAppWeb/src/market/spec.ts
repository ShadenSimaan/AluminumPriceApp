// Builds the product-only market specification of a quote line.
// Inputs are the line's product fields; customer data, location, free notes and our prices never enter the spec.
import type { LineItem, Manufacturer, Profile } from "../types";
import { lineManufacturer } from "../quote/manufacturers";
import { isOpenAreaRate, parseLooseNumber, priceBasisOf } from "../quote/pricing";
import { findSeries, HINGED_SERIES } from "../quote/series/catalog";
import { matchItemSeries, normalizeText } from "../quote/series/matching";
import {
  MARKET_CONTRACT_VERSION,
  scrubText,
  type InstallScope,
  type MarketCategory,
  type MarketSpec,
  type MarketUnit,
  type MotorKind,
  type ShutterType,
} from "./contract";

export type SeriesCheck =
  | { status: "ok"; code?: string }
  /** Entered code is not a known model; candidates are offered for confirmation (e.g. M9960 → M9660). */
  | { status: "needs_verification"; entered: string; candidates: string[] }
  | { status: "ambiguous"; candidates: string[] };

export type SpecBuild = {
  spec: MarketSpec;
  comparable: boolean;
  notComparableReason?: string;
  seriesCheck: SeriesCheck;
  /** Assumptions made while building the spec; shown beside the line. */
  assumptions: string[];
  /** Area of one piece in m² when width and height are known. */
  pieceAreaM2?: number;
};

export type QuoteContext = {
  profiles: Profile[];
  manufacturers: Manufacturer[];
  installationTerms?: string;
  /** True when the quotation has its own shutter-box line, so window lines do not include the box. */
  hasSeparateBoxLine?: boolean;
};

const RE = {
  curtainReplacement: /החלפת\s*(?:שדה|שלבי|וילון)|החלפת\s*שלבים/,
  box: /ארגז/,
  cylinder: /צילינדר|CYLINDER/,
  louver: /רפפה|LOUVER/,
  lightShutter: /תריס\s*אור|קלילאור/,
  roller: /גלילה|ROLLER/,
  shutter: /תריס|SHUTTER/,
  door: /דלת|DOOR|ויטרינה/,
  windowWord: /חלון|זכוכית|כנף|קבוע|WINDOW|GLASS/,
  screen: /רשת|SCREEN/,
  electric: /חשמלי|מנוע|MOTOR|ELECTRIC/,
  manual: /ידני|רצועה|ארכובה|MANUAL/,
  supplyOnly: /ללא\s*התקנה|לא\s*כולל\s*התקנה|אספקה\s*בלבד|SUPPLY\s*ONLY/,
  installed: /כולל\s*התקנה|התקנה\s*כלולה|INSTALL/,
  liftSlide: /הרם\s*-?\s*(?:ו)?הזז|LIFT/,
  tiltTurn: /דריי\s*-?\s*קיפ|ציר\s*-?\s*נטוי|TILT/,
  sliding: /הזזה|SLIDING/,
  casement: /ציר|פתיחה|CASEMENT/,
};

const OPENING_LABELS: Record<string, string> = {
  fixed_window: "חלון קבוע",
  sliding_window: "חלון הזזה",
  casement_window: "חלון פתיחה",
  tilt_turn_window: "חלון ציר־נטוי (דריי־קיפ)",
  top_hung_window: "חלון נטוי עליון",
  sliding_door: "דלת הזזה",
  hinged_door_single: "דלת ציר",
  hinged_door_double: "דלת ציר כפולה",
};

/** Product wording only: profile name, customer-facing product name, checked add-on names. */
function productTexts(line: LineItem): string[] {
  return [
    line.profileName ?? "",
    line.customerDescription ?? "",
    ...(line.addons ?? []).filter((a) => a.checked).map((a) => a.name),
  ].filter((t) => t.trim());
}

/** Series code as typed, e.g. "S350", "M9960", "7300". Never corrected. */
export function enteredSeriesToken(text: string): string | undefined {
  const n = normalizeText(text);
  const prefixed = n.match(/(?<![0-9A-Z])(MD|M|S)\s?-?(\d{3,4})(D)?(?![0-9])/);
  if (prefixed) return `${prefixed[1]}${prefixed[2]}${prefixed[3] ?? ""}`;
  for (const m of n.matchAll(/(?<![0-9A-Z.,])(\d{3,4})(?![0-9]|[.,]\d)/g)) {
    const code = m[1];
    const after = n.slice((m.index ?? 0) + code.length, (m.index ?? 0) + code.length + 6);
    if (/^\s?(?:ממ|סמ|MM|CM|X|×|\*)/.test(after)) continue;
    if ((code === "1200" || code === "1300") && RE.shutter.test(n)) continue;
    return code;
  }
  return undefined;
}

function categoryOf(text: string, line: LineItem): MarketCategory {
  if (RE.curtainReplacement.test(text) && RE.shutter.test(text)) return "curtain_replacement";
  if (RE.cylinder.test(text)) return "cylinder";
  const glassy = RE.windowWord.test(text) || RE.screen.test(text);
  if (RE.box.test(text) && !glassy) return "shutter_box";
  if (RE.louver.test(text) && !glassy) return "louver";
  if (RE.shutter.test(text) && !glassy && !RE.door.test(text)) return "shutter";
  if (line.configuration?.category === "door" || RE.door.test(text)) return "door";
  if (glassy || line.configuration || enteredSeriesToken(text)) return "window";
  return "other";
}

function shutterTypeOf(text: string, category: MarketCategory): ShutterType {
  if (RE.lightShutter.test(text)) return "light_shutter";
  if (RE.louver.test(text)) return /1300/.test(text) ? "louver_1300" : /1200/.test(text) ? "louver_1200" : "other";
  if (RE.roller.test(text)) return "roller";
  if (category === "shutter" || category === "curtain_replacement" || category === "shutter_box") return RE.shutter.test(text) ? "roller" : "other";
  if (RE.shutter.test(text)) return "other";
  return "none";
}

function openingTypeOf(line: LineItem, text: string, seriesKey: string | undefined): string | undefined {
  const cfg = line.configuration?.openingType;
  if (cfg && OPENING_LABELS[cfg]) return OPENING_LABELS[cfg];
  if (RE.liftSlide.test(text) || seriesKey === "alumil/S560") return "הרם־הזז";
  if (RE.tiltTurn.test(text) || seriesKey === "alumil/M9660") return "ציר־נטוי (דריי־קיפ)";
  if (RE.sliding.test(text)) return "הזזה";
  if (seriesKey && HINGED_SERIES.has(seriesKey)) return "ציר / פתיחה";
  if (seriesKey && findSeries(seriesKey)) return "הזזה";
  if (RE.casement.test(text)) return "ציר / פתיחה";
  return undefined;
}

function glazingOf(line: LineItem, text: string): string | undefined {
  const g = line.configuration?.glassSpec;
  if (g && g.construction !== "unspecified") {
    const panes = g.panes.map((p) => p.thicknessMm).filter((x): x is number => x != null);
    const cav = g.cavities.map((c) => c.widthMm).filter((x): x is number => x != null);
    const formula = panes.length ? panes.join("+") + (cav.length ? ` (מרווח ${cav.join("/")} מ״מ)` : "") : "";
    const kind = { single: "זכוכית יחידה", double: "זכוכית בידודית כפולה", triple: "זכוכית משולשת", custom: "זיגוג מיוחד", supplier: "זיגוג לפי ספק" }[
      g.construction as "single" | "double" | "triple" | "custom" | "supplier"
    ];
    return [kind, formula, g.treatment === "tempered" ? "מחוסמת" : g.treatment === "laminated" ? "שכבתית" : ""].filter(Boolean).join(" ");
  }
  if (/בידודית|דו\s*-?\s*שכבתי|DOUBLE|THERMAL|תרמי/.test(text)) return "זכוכית בידודית";
  if (/שכבתית|טריפלקס|LAMINATED/.test(text)) return "זכוכית שכבתית";
  if (/זכוכית|GLASS/.test(text)) return "זכוכית (סוג לא צוין)";
  return undefined;
}

function scopeOf(terms: string | undefined): { scope: InstallScope; assumption?: string } {
  const t = normalizeText(terms);
  if (RE.supplyOnly.test(t)) return { scope: "supply_only" };
  if (RE.installed.test(t)) return { scope: "installed" };
  return { scope: "installed", assumption: "הנחה: המחיר שלנו כולל התקנה (תנאי ההתקנה בהצעה לא מציינים אחרת)" };
}

/** Fraction of the line's panels that carry the insect screen, from the drawn configuration. */
function screenFractionFromConfig(line: LineItem): number | undefined {
  const cfg = line.configuration;
  if (!cfg || !cfg.panels.length) return undefined;
  const screen = cfg.accessories.find((a) => a.kind === "insect_screen" && a.mode !== "excluded");
  if (!screen) return undefined;
  if (!screen.appliesTo.length) return 1;
  return Math.min(1, screen.appliesTo.length / cfg.panels.length);
}

export function buildMarketSpec(line: LineItem, ctx: QuoteContext): SpecBuild {
  const texts = productTexts(line);
  const joined = normalizeText(texts.join(" · "));
  const assumptions: string[] = [];
  const manufacturer = lineManufacturer(line, ctx.profiles, ctx.manufacturers);
  const match = matchItemSeries({
    profileName: line.profileName,
    customerDescription: line.customerDescription,
    details: line.details,
    manufacturer: manufacturer ? { id: manufacturer.id, name: manufacturer.name } : undefined,
    configuration: line.configuration,
    addons: line.addons,
    seriesRefs: line.seriesRefs,
  });
  const category = categoryOf(joined, line);
  const seriesKey = match.seriesKeys[0];
  const entered = enteredSeriesToken([line.profileName, line.customerDescription].join(" "));
  const record = findSeries(seriesKey);

  let seriesCheck: SeriesCheck = { status: "ok", code: entered ?? record?.code };
  if (match.status === "unresolved" && entered) {
    const candidates = match.candidates
      .map((k) => findSeries(k)?.code)
      .filter((c): c is string => Boolean(c))
      .filter((c) => (category === "door" ? c.startsWith("MD") : !c.startsWith("MD")));
    seriesCheck = { status: "needs_verification", entered, candidates };
  } else if (match.status === "ambiguous") {
    seriesCheck = { status: "ambiguous", candidates: match.candidates.map((k) => findSeries(k)?.code ?? k) };
  }
  const confirmed = (line.marketInputs?.seriesConfirmed ?? "").trim() || undefined;

  const w = parseLooseNumber(line.widthCm);
  const h = parseLooseNumber(line.heightCm);
  const qty = Math.max(0, parseLooseNumber(line.qty));
  const pieceAreaM2 = w > 0 && h > 0 ? (w * h) / 10000 : undefined;

  // Unit our line is compared in. Area-priced lines stay ₪/מ״ר; per-piece prices convert only when sizes are known.
  const perM2 = priceBasisOf(line) === "per_m2" && !(line.manualUnitPrice ?? "").trim();
  let unit: MarketUnit;
  if (category === "cylinder") unit = "unit";
  else if (category === "shutter_box") unit = w > 0 ? "linear_m" : "unit";
  else if (perM2 || isOpenAreaRate(line)) unit = "m2";
  else if (category === "other") unit = "unit";
  else unit = pieceAreaM2 ? "m2" : "opening";

  const shutterType = category === "cylinder" ? "none" : shutterTypeOf(joined, category);
  const hasShutter = shutterType !== "none";
  const motor: MotorKind = !hasShutter && category !== "shutter_box" ? "none" : RE.electric.test(joined) ? "electric" : RE.manual.test(joined) ? "manual" : "unknown";
  let box: MarketSpec["shutter"]["box"] = "none";
  if (category === "shutter_box") box = "separate";
  else if (hasShutter && (shutterType === "light_shutter" || shutterType === "roller" || category === "shutter")) {
    box = ctx.hasSeparateBoxLine ? "separate" : "included";
    if (!ctx.hasSeparateBoxLine && !RE.box.test(joined)) {
      assumptions.push("הנחה: התריס בשורה כולל ארגז (אין בהצעה שורת ארגז נפרדת)");
    }
  }
  if (category === "curtain_replacement") box = "none";

  // Screen coverage: typed area > drawing > labelled assumption.
  const screenPresent = RE.screen.test(joined) && category !== "shutter_box" && category !== "cylinder";
  let screen: MarketSpec["screen"] = { present: false, coverage: "none" };
  if (screenPresent) {
    const typed = parseLooseNumber(line.marketInputs?.screenAreaM2 ?? "");
    if (typed > 0) {
      const perPiece = typed / Math.max(1, qty);
      const full = pieceAreaM2 !== undefined && perPiece >= pieceAreaM2 * 0.98;
      screen = { present: true, coverage: full ? "full" : "partial", areaM2: round2(perPiece) };
    } else {
      const frac = screenFractionFromConfig(line);
      if (frac !== undefined && pieceAreaM2) {
        screen = {
          present: true,
          coverage: frac >= 0.98 ? "full" : "partial",
          areaM2: round2(pieceAreaM2 * frac),
          assumption: frac < 0.98 ? "שטח הרשת חושב מהשרטוט (כנפיים ברוחב שווה)" : undefined,
        };
      } else {
        const opening = openingTypeOf(line, joined, seriesKey) ?? "";
        const sliding = /הזזה/.test(opening);
        const fraction = sliding ? 0.5 : 1;
        const assumption = sliding
          ? "הנחה: רשת על כנף הזזה אחת (כמחצית משטח החלון) — לא הוזן שטח רשת בפועל"
          : "הנחה: רשת על כל הפתח — לא הוזן שטח רשת בפועל";
        screen = {
          present: true,
          coverage: sliding ? "partial" : "full",
          areaM2: pieceAreaM2 ? round2(pieceAreaM2 * fraction) : undefined,
          assumption,
        };
        assumptions.push(assumption);
      }
    }
  }

  const fixedSections = line.configuration?.panels.filter((p) => p.operation === "fixed").length || undefined;
  const scope = scopeOf(ctx.installationTerms);
  if (scope.assumption) assumptions.push(scope.assumption);

  const spec: MarketSpec = {
    contractVersion: MARKET_CONTRACT_VERSION,
    category,
    manufacturer: manufacturer?.name,
    seriesEntered: entered,
    seriesConfirmed: confirmed,
    openingType: openingTypeOf(line, joined, seriesKey),
    widthCm: w > 0 ? w : undefined,
    heightCm: h > 0 ? h : undefined,
    quantity: qty,
    productText: scrubText(texts.join(" · ")).slice(0, 300),
    glazing: category === "window" || category === "door" ? glazingOf(line, joined) : undefined,
    screen,
    shutter: { type: shutterType, motor, box },
    fixedSections,
    unit,
    scope: scope.scope,
  };

  let comparable = true;
  let notComparableReason: string | undefined;
  if (match.status === "excluded") {
    comparable = false;
    notComparableReason = "שורת שירות או אביזר — אין מוצר להשוואה";
  } else if (!texts.length) {
    comparable = false;
    notComparableReason = "לשורה אין שם מוצר";
  } else if (category === "other" && !entered) {
    comparable = false;
    notComparableReason = "לא זוהה סוג מוצר להשוואה";
  }
  return { spec, comparable, notComparableReason, seriesCheck, assumptions, pieceAreaM2 };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a(s: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

/** Exact fingerprint: any change to the product, sizes, quantity, screen or scope marks a stored comparison outdated. */
export function specKey(spec: MarketSpec): string {
  return fnv1a(stable({ ...spec, productText: normalizeText(spec.productText) }));
}

/** Size class used for research reuse: windows of a similar size share one search. */
export function sizeClass(spec: MarketSpec): string {
  if (spec.unit === "linear_m" && spec.widthCm) {
    const m = spec.widthCm / 100;
    return m < 1.5 ? "L<1.5" : m < 3 ? "L1.5-3" : m < 5 ? "L3-5" : "L5+";
  }
  if (spec.widthCm && spec.heightCm) {
    const a = (spec.widthCm * spec.heightCm) / 10000;
    return a < 1 ? "A<1" : a < 2 ? "A1-2" : a < 3.5 ? "A2-3.5" : a < 6 ? "A3.5-6" : a < 10 ? "A6-10" : "A10+";
  }
  return "nosize";
}

/**
 * Research cache key: the assembly (manufacturer, series, opening, glazing, screen, shutter, motor, box, unit,
 * scope) plus size class. Exact sizes, quantity and minimum-order checks are applied in code per line.
 */
export function researchKey(spec: MarketSpec): string {
  return fnv1a(
    stable({
      v: spec.contractVersion,
      category: spec.category,
      manufacturer: normalizeText(spec.manufacturer),
      series: normalizeText(spec.seriesConfirmed ?? spec.seriesEntered),
      opening: spec.openingType,
      glazing: spec.glazing,
      screen: { present: spec.screen.present, coverage: spec.screen.coverage },
      shutter: spec.shutter,
      unit: spec.unit,
      scope: spec.scope,
      text: normalizeText(spec.productText),
      size: sizeClass(spec),
    })
  );
}
