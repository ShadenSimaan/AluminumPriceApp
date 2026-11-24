// Wire contract between the quotation app and the market-research endpoint (market-proxy/).
// Pure types and validators only: imported by both sides, so it must not depend on app code.
//
// Privacy rule: a MarketSpec describes the product only. It never carries a customer name, address,
// phone, e-mail, private note, PDF, location in the house, or any of our own prices.

export const MARKET_CONTRACT_VERSION = 1;

/** Unit a price is quoted in. Never mixed without an explicit conversion in compute.ts. */
export type MarketUnit = "m2" | "linear_m" | "opening" | "unit";

export const MARKET_UNIT_LABELS: Record<MarketUnit, string> = {
  m2: "₪/מ״ר",
  linear_m: "₪/מטר אורך",
  opening: "₪/פתח",
  unit: "₪/יח׳",
};

export type MarketCategory =
  /** A window or door assembly (frame, sashes, glazing; optionally screen / shutter). */
  | "window"
  | "door"
  /** Roller-shutter box sold by length. */
  | "shutter_box"
  /** Lock cylinder, priced per piece. */
  | "cylinder"
  /** A complete shutter (curtain + box + operation) without a window. */
  | "shutter"
  /** החלפת שדה תריס: replacing the shutter curtain only. */
  | "curtain_replacement"
  /** Separate louver system, e.g. תריס רפפה 1200. */
  | "louver"
  | "other";

export type InstallScope = "installed" | "supply_only" | "unknown";
export type VatBasis = "incl" | "excl" | "unknown";

export type ShutterType = "none" | "light_shutter" | "roller" | "louver_1200" | "louver_1300" | "other";
export type MotorKind = "none" | "electric" | "manual" | "unknown";

export type MarketSpec = {
  contractVersion: number;
  category: MarketCategory;
  /** Manufacturer / system company as it appears in our catalogue, e.g. "קליל", "Alumil". */
  manufacturer?: string;
  /** Series exactly as entered (e.g. "7300", "S350", "M9960"). Never silently corrected. */
  seriesEntered?: string;
  /** A series interpretation the estimator confirmed for comparison only (e.g. "M9660"). */
  seriesConfirmed?: string;
  openingType?: string;
  widthCm?: number;
  heightCm?: number;
  quantity: number;
  /** Product wording (profile name, checked add-ons). Scrubbed of contact details and prices. */
  productText: string;
  glazing?: string;
  screen: { present: boolean; coverage: "full" | "partial" | "none" | "unknown"; areaM2?: number; assumption?: string };
  shutter: {
    type: ShutterType;
    motor: MotorKind;
    /** Shutter box: part of a complete shutter, a separate line, or absent. */
    box: "included" | "separate" | "none" | "unknown";
  };
  fixedSections?: number;
  /** Unit our line is compared in. */
  unit: MarketUnit;
  scope: InstallScope;
};

export type PriceKind =
  | "manufacturer_tariff"
  | "installer_price"
  | "starting_price"
  | "published_range"
  | "comparable_estimate";

export const PRICE_KIND_LABELS: Record<PriceKind, string> = {
  manufacturer_tariff: "מחירון יצרן",
  installer_price: "מחיר מתקין/יצרן חלונות",
  starting_price: "מחיר ״החל מ-״",
  published_range: "טווח מפורסם",
  comparable_estimate: "הערכה למערכת דומה",
};

export type SellerType = "manufacturer" | "fabricator" | "installer" | "dealer" | "retailer" | "aggregator" | "other";

/** How closely the evidence matches our assembly. */
export type MatchLevel = "exact" | "component" | "proxy";

export const MATCH_LEVEL_LABELS: Record<MatchLevel, string> = {
  exact: "אותה מערכת",
  component: "רכיב",
  proxy: "מערכת אחרת (קירוב)",
};

export type ComponentRole = "window_glass" | "screen" | "shutter" | "motor" | "box" | "fixed_section" | "other";

/** Code-side check that the page really shows the amount (done by the endpoint, not by the model). */
export type Verification =
  | "amount_found"
  | "amount_not_found"
  | "page_not_fetched"
  | "url_not_in_results"
  | "fixture";

export const VERIFICATION_LABELS: Record<Verification, string> = {
  amount_found: "המחיר אומת בעמוד",
  amount_not_found: "המחיר לא נמצא בעמוד",
  page_not_fetched: "העמוד לא נקרא",
  url_not_in_results: "הקישור לא הופיע בתוצאות החיפוש",
  fixture: "נתוני בדיקה (לא חי)",
};

export type MarketEvidence = {
  id: string;
  seller: string;
  sellerType: SellerType;
  url: string;
  pageTitle?: string;
  /** Exactly as printed on the page, e.g. "החל מ-1,250 ₪ למ״ר כולל מע״מ". */
  observedPriceText: string;
  amount: number;
  /** Upper bound of a published range. */
  amountHigh?: number;
  currency: string;
  unit: MarketUnit;
  vat: VatBasis;
  scope: InstallScope;
  priceKind: PriceKind;
  matchLevel: MatchLevel;
  componentRole?: ComponentRole;
  /** Components a complete product already contains (e.g. a light shutter including motor and box). */
  includes?: ComponentRole[];
  /** Specification described on the source page. */
  specification: string;
  seriesOnPage?: string;
  /** Size the source price refers to, when stated; used to convert ₪/opening to ₪/מ״ר. */
  referenceWidthCm?: number;
  referenceHeightCm?: number;
  referenceLengthM?: number;
  minimumOrder?: { value: number; unit: MarketUnit | "m2_total" };
  publishedDate?: string;
  /** ISO time the endpoint retrieved / verified this source. */
  checkedAt: string;
  verification: Verification;
  /** Unit wording found next to the amount on the page. */
  unitVerified?: boolean;
  notes?: string;
};

export type MarketResearchRequest = {
  spec: MarketSpec;
};

export type MarketResearchResponse = {
  contractVersion: number;
  /** "live" = searched now; "fixture" = test data, never to be shown as a live result. */
  source: "live" | "fixture";
  provider: string;
  model?: string;
  retrievedAt: string;
  evidence: MarketEvidence[];
  assumptions: string[];
  warnings: string[];
  /** Evidence suggests a different model code than entered (e.g. M9660 for M9960). */
  suggestedSeries?: string[];
  searches?: number;
  dropped?: { url: string; reason: string }[];
};

export type MarketErrorCode =
  | "missing_config"
  | "unauthorized"
  | "provider_not_configured"
  | "provider_error"
  | "bad_request"
  | "network"
  | "timeout";

export const MARKET_ERROR_LABELS: Record<MarketErrorCode, string> = {
  missing_config: "לא הוגדר שירות בדיקת מחירים (הגדרות ← בדיקת מחירי שוק)",
  unauthorized: "קוד הגישה לשירות בדיקת המחירים שגוי",
  provider_not_configured: "מפתח ספק החיפוש חסר בשרת בדיקת המחירים",
  provider_error: "ספק החיפוש החזיר שגיאה",
  bad_request: "הבקשה נדחתה על ידי השירות",
  network: "אין חיבור לשירות בדיקת המחירים",
  timeout: "הבדיקה ארכה יותר מדי זמן",
};

const UNITS: MarketUnit[] = ["m2", "linear_m", "opening", "unit"];
const SCOPES: InstallScope[] = ["installed", "supply_only", "unknown"];
const VATS: VatBasis[] = ["incl", "excl", "unknown"];
const KINDS: PriceKind[] = ["manufacturer_tariff", "installer_price", "starting_price", "published_range", "comparable_estimate"];
const SELLERS: SellerType[] = ["manufacturer", "fabricator", "installer", "dealer", "retailer", "aggregator", "other"];
const LEVELS: MatchLevel[] = ["exact", "component", "proxy"];
const ROLES: ComponentRole[] = ["window_glass", "screen", "shutter", "motor", "box", "fixed_section", "other"];
const VERIFS: Verification[] = ["amount_found", "amount_not_found", "page_not_fetched", "url_not_in_results", "fixture"];

function str(v: unknown, max = 400): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}
function num(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}
function oneOf<T extends string>(v: unknown, list: readonly T[], fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Tolerant parse of one evidence row; returns undefined when it has no usable amount or URL. */
export function parseEvidence(raw: unknown): MarketEvidence | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const amount = num(r.amount);
  const url = str(r.url, 600);
  if (amount === undefined || amount <= 0 || !/^https?:\/\//i.test(url)) return undefined;
  const minRaw = r.minimumOrder as Record<string, unknown> | undefined;
  const minValue = minRaw ? num(minRaw.value) : undefined;
  const includes = Array.isArray(r.includes) ? r.includes.filter((x): x is ComponentRole => ROLES.includes(x as ComponentRole)) : undefined;
  return {
    id: str(r.id, 80) || url,
    seller: str(r.seller, 120) || new URL(url).hostname,
    sellerType: oneOf(r.sellerType, SELLERS, "other"),
    url,
    pageTitle: str(r.pageTitle, 200) || undefined,
    observedPriceText: str(r.observedPriceText, 300),
    amount,
    amountHigh: num(r.amountHigh),
    currency: str(r.currency, 8) || "ILS",
    unit: oneOf(r.unit, UNITS, "unit"),
    vat: oneOf(r.vat, VATS, "unknown"),
    scope: oneOf(r.scope, SCOPES, "unknown"),
    priceKind: oneOf(r.priceKind, KINDS, "installer_price"),
    matchLevel: oneOf(r.matchLevel, LEVELS, "proxy"),
    componentRole: r.componentRole ? oneOf(r.componentRole, ROLES, "other") : undefined,
    includes: includes?.length ? includes : undefined,
    specification: str(r.specification, 500),
    seriesOnPage: str(r.seriesOnPage, 60) || undefined,
    referenceWidthCm: num(r.referenceWidthCm),
    referenceHeightCm: num(r.referenceHeightCm),
    referenceLengthM: num(r.referenceLengthM),
    minimumOrder:
      minValue !== undefined && minValue > 0
        ? { value: minValue, unit: minRaw?.unit === "m2_total" ? "m2_total" : oneOf(minRaw?.unit, UNITS, "m2") }
        : undefined,
    publishedDate: str(r.publishedDate, 40) || undefined,
    checkedAt: str(r.checkedAt, 40) || new Date(0).toISOString(),
    verification: oneOf(r.verification, VERIFS, "page_not_fetched"),
    unitVerified: typeof r.unitVerified === "boolean" ? r.unitVerified : undefined,
    notes: str(r.notes, 400) || undefined,
  };
}

/** Accept only the product fields of a spec; anything else a client sends is dropped. */
export function sanitizeSpec(raw: unknown): MarketSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const screen = (r.screen ?? {}) as Record<string, unknown>;
  const shutter = (r.shutter ?? {}) as Record<string, unknown>;
  const categories: MarketCategory[] = ["window", "door", "shutter_box", "cylinder", "shutter", "curtain_replacement", "louver", "other"];
  const dim = (v: unknown) => {
    const n = num(v);
    return n !== undefined && n > 0 && n < 5000 ? Math.round(n * 10) / 10 : undefined;
  };
  return {
    contractVersion: MARKET_CONTRACT_VERSION,
    category: oneOf(r.category, categories, "other"),
    manufacturer: scrubText(str(r.manufacturer, 60)) || undefined,
    seriesEntered: scrubText(str(r.seriesEntered, 40)) || undefined,
    seriesConfirmed: scrubText(str(r.seriesConfirmed, 40)) || undefined,
    openingType: scrubText(str(r.openingType, 60)) || undefined,
    widthCm: dim(r.widthCm),
    heightCm: dim(r.heightCm),
    quantity: Math.max(0, Math.min(10000, num(r.quantity) ?? 1)),
    productText: scrubText(str(r.productText, 300)),
    glazing: scrubText(str(r.glazing, 120)) || undefined,
    screen: {
      present: screen.present === true,
      coverage: oneOf(screen.coverage, ["full", "partial", "none", "unknown"] as const, "unknown"),
      areaM2: num(screen.areaM2),
      assumption: scrubText(str(screen.assumption, 200)) || undefined,
    },
    shutter: {
      type: oneOf(shutter.type, ["none", "light_shutter", "roller", "louver_1200", "louver_1300", "other"] as const, "none"),
      motor: oneOf(shutter.motor, ["none", "electric", "manual", "unknown"] as const, "unknown"),
      box: oneOf(shutter.box, ["included", "separate", "none", "unknown"] as const, "unknown"),
    },
    fixedSections: num(r.fixedSections),
    unit: oneOf(r.unit, UNITS, "unit"),
    scope: oneOf(r.scope, SCOPES, "unknown"),
  };
}

/**
 * Removes anything that is not product wording: e-mail addresses, phone-like digit runs, URLs,
 * and money amounts (₪ / ש״ח / NIS). Used on both sides of the wire.
 */
export function scrubText(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    // Phone numbers: a run of digits/spaces/dashes holding 9+ digits. Series codes (7300, S350) stay.
    .replace(/\+?\d[\d\s-]*\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? " " : m))
    .replace(/(?:₪|ש["״']?ח|NIS|ILS)\s*[\d.,]+|[\d.,]+\s*(?:₪|ש["״']?ח|NIS|ILS)/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
