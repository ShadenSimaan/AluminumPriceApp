// Deterministic market arithmetic. The model only finds and structures evidence; every conversion,
// VAT normalisation, average, discount allocation, quantity extension and percentage happens here.
import type { FreeFormAddition, LineItem } from "../types";
import { isOpenAreaRate, lineTotal, parseLooseNumber, type QuoteMoney } from "../quote/pricing";
import { normalizeText } from "../quote/series/matching";
import type { ComponentRole, MarketEvidence, MarketSpec, MarketUnit } from "./contract";
import type { MarketLineSnapshot } from "./types";

export type EvidenceRole = "point" | "midpoint" | "lower_bound";
export type EvidencePool = "exact" | "component" | "proxy";

export type EvidenceEvaluation = {
  evidence: MarketEvidence;
  included: boolean;
  /** Why the row is not part of the benchmark (shown in the sources list). */
  reason?: string;
  notes: string[];
  pool: EvidencePool;
  role: EvidenceRole;
  /** Before VAT, in the unit of the comparison (or the component's own unit). */
  value?: number;
  low?: number;
  high?: number;
  unit?: MarketUnit;
  sellerKey: string;
};

export type BenchmarkBasis = "multi_seller" | "single_source" | "component_estimate" | "proxy";

export const BASIS_LABELS: Record<BenchmarkBasis, string> = {
  multi_seller: "חציון מוכרים בלתי תלויים",
  single_source: "מקור יחיד",
  component_estimate: "הערכת רכיבים",
  proxy: "קירוב ממערכת אחרת",
};

export type PoolStats = {
  benchmark: number;
  low: number;
  high: number;
  sellerCount: number;
  sampleCount: number;
  hasMidpoint: boolean;
};

export type ComponentPart = { role: ComponentRole; perPiece: number; sellerCount: number; quantityNote: string };

export type LineBenchmark = {
  status: "ok" | "insufficient";
  unit: MarketUnit;
  basis?: BenchmarkBasis;
  benchmark?: number;
  low?: number;
  high?: number;
  sellerCount: number;
  sampleCount: number;
  hasMidpoint: boolean;
  /** "From" prices, before VAT, kept visible as lower bounds. */
  lowerBounds: { seller: string; value: number }[];
  components?: ComponentPart[];
  /** Proxy benchmark shown for information; excluded from the default quotation index. */
  proxy?: PoolStats;
  evaluations: EvidenceEvaluation[];
  notes: string[];
};

const SERIES_DIGITS = /(MD|M|S)?\s?-?(\d{3,4})D?/;

function seriesNorm(s: string | undefined): string {
  const m = normalizeText(s).match(SERIES_DIGITS);
  return m ? `${m[1] ?? ""}${m[2]}` : normalizeText(s);
}

export function sellerKeyOf(e: Pick<MarketEvidence, "seller" | "url">): string {
  const name = normalizeText(e.seller).replace(/[^A-Zא-ת0-9]/g, "");
  if (name) return name;
  try {
    return new URL(e.url).hostname.replace(/^www\./, "");
  } catch {
    return e.url;
  }
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pieceArea(spec: MarketSpec): number | undefined {
  return spec.widthCm && spec.heightCm ? (spec.widthCm * spec.heightCm) / 10000 : undefined;
}

const PIECE_UNITS: MarketUnit[] = ["opening", "unit"];

/** Converts a before-VAT amount from the source unit to `target`, or explains why it cannot. */
export function convertUnit(
  amount: number,
  from: MarketUnit,
  target: MarketUnit,
  e: Pick<MarketEvidence, "referenceWidthCm" | "referenceHeightCm" | "referenceLengthM">,
  spec: MarketSpec
): { value?: number; note?: string; reason?: string } {
  if (from === target) return { value: amount };
  const pieceLike = spec.category === "window" || spec.category === "door" || spec.category === "shutter" || spec.category === "louver";
  if (PIECE_UNITS.includes(from) && PIECE_UNITS.includes(target) && pieceLike) return { value: amount };
  if (target === "m2" && PIECE_UNITS.includes(from)) {
    if (e.referenceWidthCm && e.referenceHeightCm) {
      const a = (e.referenceWidthCm * e.referenceHeightCm) / 10000;
      return { value: amount / a, note: `הומר לפי מידות המקור ${e.referenceWidthCm}×${e.referenceHeightCm} ס״מ` };
    }
    return { reason: "מחיר ליחידה בלי מידות במקור — לא ניתן להמיר ל-₪/מ״ר" };
  }
  if (target === "linear_m" && PIECE_UNITS.includes(from)) {
    if (e.referenceLengthM) return { value: amount / e.referenceLengthM, note: `הומר לפי אורך המקור ${e.referenceLengthM} מ׳` };
    return { reason: "מחיר ליחידה בלי אורך במקור — לא ניתן להמיר ל-₪/מטר אורך" };
  }
  if (PIECE_UNITS.includes(target) && from === "m2" && pieceLike) {
    const a = pieceArea(spec);
    if (a) return { value: amount * a, note: "הומר לפי מידות השורה" };
  }
  return { reason: `יחידה שונה (${from} מול ${target}) — לא ניתן להשוות` };
}

/** Job quantity in a minimum-order unit, or undefined when the sizes are missing. */
function jobQuantity(spec: MarketSpec, unit: MarketUnit | "m2_total"): number | undefined {
  const a = pieceArea(spec);
  if (unit === "m2") return a;
  if (unit === "m2_total") return a !== undefined ? a * spec.quantity : undefined;
  if (unit === "linear_m") return spec.widthCm ? (spec.widthCm / 100) * spec.quantity : undefined;
  return spec.quantity;
}

function componentUnit(role: ComponentRole): MarketUnit {
  if (role === "motor") return "unit";
  if (role === "box") return "linear_m";
  return "m2";
}

/** Evaluates one evidence row against the spec it was retrieved for. */
export function evaluateEvidence(e: MarketEvidence, spec: MarketSpec, vatRate: number): EvidenceEvaluation {
  const notes: string[] = [];
  const sellerKey = sellerKeyOf(e);
  let pool: EvidencePool = e.matchLevel === "component" || e.componentRole ? "component" : e.matchLevel === "exact" ? "exact" : "proxy";
  const role: EvidenceRole =
    e.priceKind === "starting_price" ? "lower_bound" : e.priceKind === "published_range" && e.amountHigh && e.amountHigh > e.amount ? "midpoint" : "point";
  const base = { evidence: e, notes, pool, role, sellerKey };
  const exclude = (reason: string): EvidenceEvaluation => ({ ...base, pool, included: false, reason });

  if (e.priceKind === "manufacturer_tariff" && e.sellerType !== "manufacturer") {
    notes.push("סומן כמחירון יצרן אך המקור אינו היצרן — מוצג כמחיר מוכר");
  }
  // Series check: a different series on the page is never an exact match.
  const wanted = seriesNorm(spec.seriesConfirmed ?? spec.seriesEntered);
  if (pool === "exact" && e.seriesOnPage && wanted && seriesNorm(e.seriesOnPage) !== wanted) {
    pool = "proxy";
    notes.push(
      spec.seriesEntered && !spec.seriesConfirmed && seriesNorm(e.seriesOnPage) !== seriesNorm(spec.seriesEntered)
        ? `בעמוד מופיע ${e.seriesOnPage} ולא ${spec.seriesEntered} — נדרש אימות דגם`
        : `סדרה שונה בעמוד (${e.seriesOnPage})`
    );
  }
  base.pool = pool;

  if (e.verification !== "amount_found" && e.verification !== "fixture") {
    return exclude(
      e.verification === "amount_not_found"
        ? "הסכום לא נמצא בעמוד המקור"
        : e.verification === "url_not_in_results"
          ? "הקישור לא הופיע בתוצאות החיפוש"
          : "עמוד המקור לא נקרא — הסכום לא אומת"
    );
  }
  if (e.unitVerified === false && e.verification !== "fixture") return exclude("יחידת המחיר לא אומתה בעמוד");
  if ((e.currency || "ILS").toUpperCase() !== "ILS") return exclude("מטבע שאינו ₪");
  if (e.vat === "unknown") return exclude("לא ידוע אם המחיר כולל מע״מ — לא נכלל בממוצע");
  if (e.scope === "unknown") return exclude("לא ידוע אם המחיר כולל התקנה — לא נכלל בממוצע");
  if (spec.scope !== "unknown" && e.scope !== spec.scope) {
    return exclude(e.scope === "supply_only" ? "אספקה בלבד — אצלנו כולל התקנה" : "כולל התקנה — אצלנו אספקה בלבד");
  }
  if (e.minimumOrder) {
    const q = jobQuantity(spec, e.minimumOrder.unit);
    const unitLabel = e.minimumOrder.unit === "m2_total" ? "מ״ר להזמנה" : e.minimumOrder.unit === "m2" ? "מ״ר" : e.minimumOrder.unit === "linear_m" ? "מ׳" : "יח׳";
    if (q === undefined) return exclude(`מינימום הזמנה ${e.minimumOrder.value} ${unitLabel} — אין מידות לבדיקה`);
    if (q < e.minimumOrder.value) {
      return exclude(`מינימום הזמנה ${e.minimumOrder.value} ${unitLabel} — העבודה (${round(q)}) לא עומדת בתנאי`);
    }
    notes.push(`מינימום הזמנה ${e.minimumOrder.value} ${unitLabel} — מתקיים`);
  }

  const vatFactor = e.vat === "incl" ? 1 + vatRate : 1;
  if (e.vat === "incl") notes.push(`נוטרל מע״מ ${round(vatRate * 100)}%`);
  const targetUnit = pool === "component" ? componentUnit(e.componentRole ?? "other") : spec.unit;
  const lowRaw = e.amount / vatFactor;
  const highRaw = role === "midpoint" ? (e.amountHigh as number) / vatFactor : lowRaw;
  const convLow = convertUnit(lowRaw, e.unit, targetUnit, e, spec);
  if (convLow.reason) return exclude(convLow.reason);
  const convHigh = convertUnit(highRaw, e.unit, targetUnit, e, spec);
  if (convLow.note) notes.push(convLow.note);
  const low = convLow.value as number;
  const high = convHigh.value ?? low;
  const value = role === "midpoint" ? (low + high) / 2 : low;
  if (role === "midpoint") notes.push("נקודת אמצע של טווח מפורסם");
  if (role === "lower_bound") {
    return { ...base, included: false, reason: "מחיר ״החל מ-״ — מוצג כגבול תחתון בלבד", value, low, high: low, unit: targetUnit };
  }
  return { ...base, included: true, value, low, high, unit: targetUnit };
}

/** One representative value per seller (median of that seller's distinct listings), then the median across sellers. */
export function poolStats(evals: EvidenceEvaluation[]): PoolStats | undefined {
  const usable = evals.filter((x) => x.included && x.value !== undefined);
  if (!usable.length) return undefined;
  const bySeller = new Map<string, EvidenceEvaluation[]>();
  for (const x of usable) {
    const list = bySeller.get(x.sellerKey) ?? [];
    // The same seller's identical price (same page, or the same listing on another page) counts once.
    if (!list.some((y) => Math.abs((y.value as number) - (x.value as number)) < 0.005)) list.push(x);
    bySeller.set(x.sellerKey, list);
  }
  const reps = [...bySeller.values()].map((list) => median(list.map((x) => x.value as number)));
  const samples = [...bySeller.values()].flat();
  return {
    benchmark: median(reps),
    low: Math.min(...samples.map((x) => x.low as number)),
    high: Math.max(...samples.map((x) => x.high as number)),
    sellerCount: bySeller.size,
    sampleCount: samples.length,
    hasMidpoint: samples.some((x) => x.role === "midpoint"),
  };
}

/** Components a complete line needs, each counted once. */
function requiredRoles(spec: MarketSpec): ComponentRole[] {
  const roles: ComponentRole[] = [];
  if (spec.category === "window" || spec.category === "door") roles.push("window_glass");
  if (spec.shutter.type !== "none") roles.push("shutter");
  if (spec.screen.present) roles.push("screen");
  if (spec.shutter.motor === "electric") roles.push("motor");
  if (spec.shutter.box === "included") roles.push("box");
  return roles;
}

function componentEstimate(
  evals: EvidenceEvaluation[],
  spec: MarketSpec
): { perUnit?: number; parts: ComponentPart[]; missing: ComponentRole[]; lowPerUnit?: number; highPerUnit?: number } {
  const area = pieceArea(spec);
  const roles = requiredRoles(spec);
  const covered = new Set<ComponentRole>();
  const parts: ComponentPart[] = [];
  const missing: ComponentRole[] = [];
  let total = 0;
  let low = 0;
  let high = 0;
  for (const role of roles) {
    if (covered.has(role)) continue;
    const roleEvals = evals.filter((x) => x.pool === "component" && x.evidence.componentRole === role);
    const stats = poolStats(roleEvals);
    if (!stats) {
      missing.push(role);
      continue;
    }
    let qty: number | undefined;
    let qtyNote = "";
    if (role === "motor") {
      qty = 1;
      qtyNote = "יח׳ אחת";
    } else if (role === "box") {
      qty = spec.widthCm ? spec.widthCm / 100 : undefined;
      qtyNote = qty ? `${round(qty)} מ׳ אורך` : "";
    } else if (role === "screen") {
      qty = spec.screen.areaM2 ?? (spec.screen.coverage === "full" ? area : undefined);
      qtyNote = qty ? `${round(qty)} מ״ר רשת${spec.screen.assumption ? " (הנחה)" : ""}` : "";
    } else {
      qty = area;
      qtyNote = qty ? `${round(qty)} מ״ר` : "";
    }
    if (qty === undefined) {
      missing.push(role);
      continue;
    }
    covered.add(role);
    // A complete product that already contains other components (e.g. light shutter with motor and box) covers them.
    const used = roleEvals.filter((x) => x.included);
    for (const r of roles) {
      if (r !== role && used.length && used.every((x) => x.evidence.includes?.includes(r))) covered.add(r);
    }
    parts.push({ role, perPiece: stats.benchmark * qty, sellerCount: stats.sellerCount, quantityNote: qtyNote });
    total += stats.benchmark * qty;
    low += stats.low * qty;
    high += stats.high * qty;
  }
  if (missing.length || !parts.length) return { parts, missing };
  const divisor = spec.unit === "m2" ? area : spec.unit === "linear_m" ? (spec.widthCm ? spec.widthCm / 100 : undefined) : 1;
  if (!divisor) return { parts, missing: ["other"] };
  return { perUnit: total / divisor, lowPerUnit: low / divisor, highPerUnit: high / divisor, parts, missing };
}

const ROLE_LABELS: Record<ComponentRole, string> = {
  window_glass: "חלון וזיגוג",
  screen: "רשת",
  shutter: "תריס",
  motor: "מנוע",
  box: "ארגז",
  fixed_section: "חלק קבוע",
  other: "אחר",
};

export function roleLabel(role: ComponentRole): string {
  return ROLE_LABELS[role];
}

/** Benchmark for one stored snapshot. Exact sellers first, then a component estimate; proxies are information only. */
export function computeLineBenchmark(snapshot: Pick<MarketLineSnapshot, "spec" | "evidence" | "vatRate">): LineBenchmark {
  const { spec } = snapshot;
  const evaluations = snapshot.evidence.map((e) => evaluateEvidence(e, spec, snapshot.vatRate));
  const lowerBounds = evaluations
    .filter((x) => x.role === "lower_bound" && x.value !== undefined && x.pool !== "component")
    .map((x) => ({ seller: x.evidence.seller, value: x.value as number }));
  const notes: string[] = [];
  const exact = poolStats(evaluations.filter((x) => x.pool === "exact"));
  const proxy = poolStats(evaluations.filter((x) => x.pool === "proxy"));
  const empty = { sellerCount: 0, sampleCount: 0, hasMidpoint: false, lowerBounds, evaluations, unit: spec.unit, proxy };

  if (exact) {
    return {
      ...empty,
      status: "ok",
      basis: exact.sellerCount > 1 ? "multi_seller" : "single_source",
      benchmark: exact.benchmark,
      low: exact.low,
      high: exact.high,
      sellerCount: exact.sellerCount,
      sampleCount: exact.sampleCount,
      hasMidpoint: exact.hasMidpoint,
      notes,
    };
  }
  const comp = componentEstimate(evaluations, spec);
  if (comp.perUnit !== undefined) {
    return {
      ...empty,
      status: "ok",
      basis: "component_estimate",
      benchmark: comp.perUnit,
      low: comp.lowPerUnit,
      high: comp.highPerUnit,
      sellerCount: Math.min(...comp.parts.map((p) => p.sellerCount)),
      sampleCount: evaluations.filter((x) => x.pool === "component" && x.included).length,
      components: comp.parts,
      notes,
    };
  }
  if (comp.parts.length && comp.missing.length) {
    notes.push(`הערכת רכיבים חסרה: ${comp.missing.map(roleLabel).join(", ")}`);
  }
  return { ...empty, status: "insufficient", notes };
}

// ---------------- Our price ----------------

export type OurPrice = {
  unit: MarketUnit;
  /** Effective rate before VAT after the quotation discount, in `unit`. */
  rate?: number;
  /** Billable quantity in `unit` (area × qty, length × qty, or count) — each line extended exactly once. */
  billableQty?: number;
  /** Line total before VAT after the quotation discount. */
  effectiveTotal: number;
  note?: string;
};

/**
 * Our selling price as the quotation computes it (lineTotal = unit price × qty, add-ons included), with the
 * quotation discount allocated proportionally — the same split quoteMoney applies to the subtotal.
 */
export function ourPrice(line: LineItem, unit: MarketUnit, discountRate: number): OurPrice {
  const factor = 1 - discountRate;
  if (isOpenAreaRate(line)) {
    return { unit: "m2", rate: parseLooseNumber(line.unitPrice) * factor, effectiveTotal: 0, note: "מחיר למ״ר ללא מידות — לא נכלל במדד" };
  }
  const effectiveTotal = lineTotal(line) * factor;
  const qty = Math.max(0, parseLooseNumber(line.qty));
  const w = parseLooseNumber(line.widthCm);
  const h = parseLooseNumber(line.heightCm);
  let billableQty: number | undefined;
  if (unit === "m2") billableQty = w > 0 && h > 0 ? ((w * h) / 10000) * qty : undefined;
  else if (unit === "linear_m") billableQty = w > 0 ? (w / 100) * qty : undefined;
  else billableQty = qty;
  if (!billableQty) return { unit, effectiveTotal, note: "חסרות מידות או כמות" };
  return { unit, rate: effectiveTotal / billableQty, billableQty, effectiveTotal };
}

// ---------------- Line comparison ----------------

export type LineComparisonStatus = "ok" | "insufficient" | "not_comparable" | "not_checked" | "error_only";

export type LineComparison = {
  status: LineComparisonStatus;
  our: OurPrice;
  bench?: LineBenchmark;
  outdated: boolean;
  /** ₪ per unit, our − market. */
  diffPerUnit?: number;
  /** % = (our − market) / market × 100. */
  diffPercent?: number;
  /** Market benchmark × our billable quantity. */
  marketTotal?: number;
  diffTotal?: number;
  includedInIndex: boolean;
  excludedReason?: string;
};

export function compareLine(args: {
  line: LineItem;
  snapshot?: MarketLineSnapshot;
  currentSpecKey?: string;
  currentUnit: MarketUnit;
  comparable: boolean;
  notComparableReason?: string;
  discountRate: number;
}): LineComparison {
  const { line, snapshot, discountRate } = args;
  const unit = snapshot && snapshot.evidence.length ? snapshot.spec.unit : args.currentUnit;
  const our = ourPrice(line, unit, discountRate);
  const outdated = Boolean(snapshot && args.currentSpecKey && snapshot.specKey !== args.currentSpecKey);
  if (!args.comparable) {
    return { status: "not_comparable", our, outdated: false, includedInIndex: false, excludedReason: args.notComparableReason };
  }
  if (!snapshot) return { status: "not_checked", our, outdated: false, includedInIndex: false, excludedReason: "לא נבדק" };
  if (!snapshot.evidence.length && snapshot.lastError) {
    return { status: "error_only", our, outdated, includedInIndex: false, excludedReason: snapshot.lastError.message };
  }
  const bench = computeLineBenchmark(snapshot);
  if (bench.status !== "ok" || bench.benchmark === undefined || !(bench.benchmark > 0)) {
    return { status: "insufficient", our, bench, outdated, includedInIndex: false, excludedReason: "אין מספיק נתונים להשוואה" };
  }
  const out: LineComparison = { status: "ok", our, bench, outdated, includedInIndex: false };
  if (our.rate !== undefined) {
    out.diffPerUnit = our.rate - bench.benchmark;
    out.diffPercent = ((our.rate - bench.benchmark) / bench.benchmark) * 100;
  }
  if (our.billableQty) {
    out.marketTotal = bench.benchmark * our.billableQty;
    out.diffTotal = our.effectiveTotal - out.marketTotal;
  }
  if (outdated) out.excludedReason = "המפרט השתנה מאז הבדיקה";
  else if (!our.billableQty) out.excludedReason = our.note ?? "חסרה כמות לחיוב";
  else out.includedInIndex = true;
  return out;
}

// ---------------- Quotation summary ----------------

export type QuoteMarketSummary = {
  /** 100 × our matched total / market total for the same work; undefined when nothing matched. */
  index?: number;
  ourMatched: number;
  marketMatched: number;
  diff?: number;
  diffPercent?: number;
  matchedLines: number;
  totalLines: number;
  /** Share of the quotation value (after discount, before VAT) covered by matched lines, 0–1. */
  valueCoverage: number;
  /** Lines with evidence but outside the index (proxy only, outdated, missing sizes, insufficient). */
  excluded: { lineIndex: number; label: string; reason: string }[];
  /** Free-form additions are not compared. */
  additionsNotCompared: number;
  checkedLines: number;
};

/**
 * Index = 100 × Σ(our effective totals of matched lines) / Σ(benchmark × billable quantity of the same lines).
 * It is never an average of the line percentages.
 */
export function summarizeQuote(args: {
  items: LineItem[];
  comparisons: LineComparison[];
  freeFormAdditions: FreeFormAddition[];
  money: QuoteMoney;
}): QuoteMarketSummary {
  let ourMatched = 0;
  let marketMatched = 0;
  let matchedLines = 0;
  let checkedLines = 0;
  const excluded: QuoteMarketSummary["excluded"] = [];
  args.comparisons.forEach((c, i) => {
    const label = `${i + 1}. ${args.items[i]?.profileName?.trim() || "פריט"}`;
    if (c.status !== "not_checked" && c.status !== "not_comparable") checkedLines += 1;
    if (c.includedInIndex && c.marketTotal !== undefined) {
      ourMatched += c.our.effectiveTotal;
      marketMatched += c.marketTotal;
      matchedLines += 1;
      return;
    }
    let reason = c.excludedReason ?? "לא נבדק";
    if (c.status === "insufficient" && c.bench?.proxy) reason = "קיים רק קירוב ממערכת אחרת — לא נכלל במדד";
    excluded.push({ lineIndex: i, label, reason });
  });
  const totalLines = args.items.length + args.freeFormAdditions.length;
  const index = marketMatched > 0 ? (100 * ourMatched) / marketMatched : undefined;
  return {
    index,
    ourMatched,
    marketMatched,
    diff: index !== undefined ? ourMatched - marketMatched : undefined,
    diffPercent: index !== undefined ? index - 100 : undefined,
    matchedLines,
    totalLines,
    valueCoverage: args.money.net > 0 ? Math.min(1, ourMatched / args.money.net) : 0,
    excluded,
    additionsNotCompared: args.freeFormAdditions.length,
    checkedLines,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "מעל מחיר השוק" / "מתחת למחיר השוק" with the sign made explicit. */
export function directionLabel(diff: number): string {
  if (Math.abs(diff) < 0.005) return "זהה למחיר השוק";
  return diff > 0 ? "מעל מחיר השוק" : "מתחת למחיר השוק";
}
