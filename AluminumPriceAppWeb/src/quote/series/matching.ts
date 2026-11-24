import { ALUMIL_ID, EKLEIN_ID, KLIL_ID } from "../manufacturers";
import { ACCESSORIES, HINGED_SERIES, SERIES_CATALOG, type SeriesBrand, type SeriesRecord } from "./catalog";

/** The parts of a quote line (as sent to the PDF) that may name a window or door series. */
export type MatchableItem = {
  profileName?: string;
  customerDescription?: string;
  details?: string;
  manufacturer?: { id: string; name: string };
  configuration?: { customDescription?: string; notes?: string; glass?: string; hardware?: string };
  addons?: { name: string; checked: boolean }[];
  seriesRefs?: string[];
};

export type ItemSeriesStatus =
  /** Recognised from the quote data. */
  | "matched"
  /** Chosen by the estimator on this line. */
  | "explicit"
  /** Several series are possible (e.g. "7500-7300"); the estimator picks one. */
  | "ambiguous"
  /** The code belongs to a different manufacturer than the one on the line. */
  | "conflict"
  /** Looks like a series reference but has no catalog record. */
  | "unresolved"
  /** Service / accessory line (repair, pergola, LED, ...) that never gets a series sheet. */
  | "excluded"
  | "none";

export type ItemSeriesMatch = {
  status: ItemSeriesStatus;
  seriesKeys: string[];
  /** Possible series for ambiguous / conflicting / unresolved values. */
  candidates: string[];
  /** The quoted wording that was examined. */
  raw: string;
  reason?: string;
  /** Accessory keys (louvers, shutter boxes) actually named on this line. */
  accessories: string[];
  /** Internal remarks for the estimator; never printed. */
  reviewFlags: string[];
};

type Brand = SeriesBrand | "other";

/** Hebrew niqqud, Hebrew/Latin quote marks, dashes, case and spacing are normalised before matching. */
export function normalizeText(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .replace(/[\u0591-\u05C7]/g, "")
    .replace(/[\u05F3\u05F4"'`´\u2018\u2019\u201C\u201D]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const HEB_PREFIX = "[והבלמכש]?";
const BRAND_PATTERNS: [Brand, RegExp][] = [
  ["klil", new RegExp(`(?:^|[^A-Zא-ת])(?:${HEB_PREFIX}קליל|KLIL|KALIL)(?![A-Zא-ת])`)],
  ["alumil", new RegExp(`(?:^|[^A-Zא-ת])(?:${HEB_PREFIX}אלומיל|ALUMIL|SMARTIA|${HEB_PREFIX}סמארטיה)(?![A-Zא-ת])`)],
  ["other", new RegExp(`(?:^|[^A-Zא-ת])(?:EKLEIN|EKLIEN|EKLIN|${HEB_PREFIX}אקליין|${HEB_PREFIX}אקלין)(?![A-Zא-ת])`)],
];

export function brandsInText(normalized: string): Brand[] {
  return BRAND_PATTERNS.filter(([, re]) => re.test(normalized)).map(([b]) => b);
}

function brandOfManufacturer(m: MatchableItem["manufacturer"]): Brand | undefined {
  if (!m) return undefined;
  if (m.id === KLIL_ID) return "klil";
  if (m.id === ALUMIL_ID) return "alumil";
  if (m.id === EKLEIN_ID) return "other";
  const found = brandsInText(normalizeText(m.name));
  return found.length === 1 ? found[0] : "other";
}

/** Service and accessory lines; their numbers (repair descriptions, rail lengths, ...) are never series codes. */
const NON_PRODUCT = new RegExp(
  `(?:^|[^A-Zא-ת])(?:${HEB_PREFIX}(?:פרגולה|פרגולות|תיקון|תיקונים|לד|תאורה|תאורת|מסילה|מסילות|ידית|ידיות|פירוק|שירות)|החלפת רשת|החלפת רשתות|LED|REPAIR|PERGOLA)(?![A-Zא-ת])`
);

type CodeToken = { code: string; prefix: string; suffix: string; start: number; end: number };

const CODE_RE = /(?<![0-9A-Z.,])(MD|M|S)?\s?-?(\d{3,4})(D)?(?![0-9]|[.,]\d|[A-Z])/g;
const UNIT_AFTER = /^\s?(?:ממ|סמ|MM|CM|מטר|מ|₪|שח|NIS|ILS|%|יח)(?![A-Zא-ת])/;
const DIM_AFTER = /^\s?[X×*]\s?\d/;
const DIM_BEFORE = /\d\s?[X×*]\s?$/;
const CONTEXT_BEFORE = /(?:₪|\$|מחיר|כמות|QTY|לקוח|ID|תז|מס|#|טלפון|טל)\s?[:.]?\s?$/;
const SHUTTER_WORD = /תריס|רפפה|LOUVER|SHUTTER/;

function codeTokens(normalized: string): CodeToken[] {
  const out: CodeToken[] = [];
  for (const m of normalized.matchAll(CODE_RE)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    const before = normalized.slice(Math.max(0, start - 14), start);
    const after = normalized.slice(end, end + 8);
    if (UNIT_AFTER.test(after) || DIM_AFTER.test(after) || DIM_BEFORE.test(before) || CONTEXT_BEFORE.test(before)) continue;
    out.push({ code: m[2], prefix: m[1] ?? "", suffix: m[3] ?? "", start, end });
  }
  return out;
}

function tokenName(t: CodeToken): string {
  return `${t.prefix}${t.code}${t.suffix}`;
}

/** Catalog records a single token can stand for (by code or alias). */
function recordsForToken(t: CodeToken): SeriesRecord[] {
  const full = tokenName(t);
  return SERIES_CATALOG.filter((r) => {
    const names = [r.code, ...r.aliases];
    if (t.prefix) return names.includes(full) || names.includes(`${t.prefix}${t.code}`);
    if (t.suffix) return names.includes(full);
    return names.includes(t.code);
  });
}

const ACCESSORY_CODES = new Set(["1200", "1300"]);
const COMPONENT_WORD = /דלת|חלון|קבוע|ויטרינה|כנף|DOOR|WINDOW|FIXED/;

type FieldResult =
  | { kind: "match"; keys: string[] }
  | { kind: "ambiguous"; candidates: string[]; reason: string }
  | { kind: "conflict"; candidates: string[]; reason: string }
  | { kind: "unresolved"; candidates: string[]; reason: string }
  | { kind: "nothing" };

/**
 * One field. `bareAllowed` is true only for the profile field: a plain number there may match when exactly one
 * catalog record has it and no conflicting brand is present. Free text must name the brand.
 */
function analyseField(text: string, structured: Brand | undefined, bareAllowed: boolean): FieldResult {
  const n = normalizeText(text);
  if (!n) return { kind: "nothing" };
  const textBrands = brandsInText(n);
  const known = textBrands.filter((b) => b !== "other");
  if (structured && known.length && known.some((b) => b !== structured)) {
    return { kind: "conflict", candidates: [], reason: "היצרן בשורה שונה מהיצרן הכתוב בטקסט" };
  }
  if (known.length > 1) return { kind: "conflict", candidates: [], reason: "בטקסט מופיעים שני יצרנים" };
  const brand: Brand | undefined = structured ?? (textBrands.length === 1 ? textBrands[0] : textBrands.includes("other") ? "other" : undefined);

  const tokens = codeTokens(n).filter((t) => !(ACCESSORY_CODES.has(t.code) && !t.prefix && (SHUTTER_WORD.test(n) || brand)));
  if (!tokens.length) {
    if (brand === "other" && textBrands.includes("other")) {
      return { kind: "unresolved", candidates: [], reason: "יצרן ללא רשומה בקטלוג הסדרות" };
    }
    return { kind: "nothing" };
  }
  if (!bareAllowed && !textBrands.length) return { kind: "nothing" };

  const resolved: { token: CodeToken; keys: string[] }[] = [];
  const unknown: CodeToken[] = [];
  const conflicts: string[] = [];
  for (const t of tokens) {
    let recs = recordsForToken(t);
    if (!t.prefix) recs = recs.filter((r) => !r.conditional);
    if (!recs.length) {
      unknown.push(t);
      continue;
    }
    const sameBrand = brand && brand !== "other" ? recs.filter((r) => r.brand === brand) : recs;
    if (brand === "other" || (brand && !sameBrand.length)) {
      conflicts.push(...recs.map((r) => r.key));
      continue;
    }
    if (!t.prefix && !brand && recs.length !== 1) {
      unknown.push(t);
      continue;
    }
    resolved.push({ token: t, keys: sameBrand.map((r) => r.key) });
  }

  if (conflicts.length) {
    return { kind: "conflict", candidates: [...new Set(conflicts)], reason: "הקוד שייך ליצרן אחר מזה שבשורה" };
  }
  const distinct = [...new Set(resolved.flatMap((r) => r.keys))];
  if (!distinct.length) {
    return {
      kind: "unresolved",
      candidates: suggestionsFor(n, unknown),
      reason: `קוד ללא התאמה ודאית בקטלוג: ${unknown.map(tokenName).join(", ")}`,
    };
  }
  if (distinct.length === 1) return { kind: "match", keys: distinct };

  // Two systems: either alternatives the estimator chooses between, or a clearly structured assembly.
  const ordered = resolved.sort((a, b) => a.token.start - b.token.start);
  for (let i = 1; i < ordered.length; i++) {
    const between = n.slice(ordered[i - 1].token.end, ordered[i].token.start);
    if (/^\s?[-/\\]\s?$/.test(between) || /(^|\s)(או|OR)(\s|$)/.test(between)) {
      return { kind: "ambiguous", candidates: distinct, reason: "צוינו כמה סדרות חלופיות — יש לבחור את הסדרה בפועל" };
    }
  }
  const parts = n.split(/\s\+\s|\+|;|\||\sPLUS\s|\sועם\s/);
  const assembly =
    parts.length >= 2 &&
    ordered.every(({ token }) => {
      const name = tokenName(token);
      const part = parts.find((p) => new RegExp(`(?<![0-9A-Z])${name}(?![0-9A-Z])`).test(p));
      return part !== undefined && COMPONENT_WORD.test(part);
    });
  if (assembly) return { kind: "match", keys: distinct };
  return { kind: "ambiguous", candidates: distinct, reason: "צוינו כמה סדרות — יש לבחור את הסדרה בפועל" };
}

function suggestionsFor(n: string, unknown: CodeToken[]): string[] {
  const out: string[] = [];
  for (const t of unknown) {
    if (t.code === "560" && /הרם|LIFT/.test(n)) out.push("alumil/S560");
    if (t.code === "9960" || t.code === "9660") out.push("alumil/M9660", "alumil/MD9660");
  }
  return [...new Set(out)];
}

function accessoriesIn(texts: string[]): string[] {
  const found = new Set<string>();
  for (const raw of texts) {
    const n = normalizeText(raw);
    if (!n) continue;
    const louverContext = SHUTTER_WORD.test(n) || brandsInText(n).includes("klil");
    for (const t of codeTokens(n)) {
      if (!t.prefix && louverContext && (t.code === "1200" || t.code === "1300")) found.add(`klil/${t.code}`);
    }
    if (/תריס אור/.test(n)) found.add("light-shutter");
    if (/OPEN\s?-?ART|אופן\s?-?ארט|אופנארט/.test(n)) {
      if (/CLASSIC|קלאסיק/.test(n)) found.add("openart/classic");
      if (/PREMIUM|פרימיום/.test(n)) found.add("openart/premium");
    }
  }
  return [...found].filter((k) => ACCESSORIES[k]);
}

function itemTexts(item: MatchableItem): string[] {
  return [
    item.profileName ?? "",
    item.customerDescription ?? "",
    item.details ?? "",
    item.configuration?.customDescription ?? "",
    item.configuration?.hardware ?? "",
    ...(item.addons ?? []).filter((a) => a.checked).map((a) => a.name),
  ];
}

export function matchItemSeries(item: MatchableItem): ItemSeriesMatch {
  const texts = itemTexts(item);
  const raw = [item.profileName, item.customerDescription, item.details].filter((t) => t?.trim()).join(" · ");
  const accessories = accessoriesIn(texts);
  const base = { candidates: [] as string[], raw, accessories, reviewFlags: [] as string[] };
  const withFlags = (m: ItemSeriesMatch): ItemSeriesMatch => {
    if (m.seriesKeys.some((k) => HINGED_SERIES.has(k)) && accessories.includes("klil/1200")) {
      m.reviewFlags.push("סדרת ציר עם תריס רפפה הזזה 1200 — יש לבדוק מסילה נפרדת לתריס. השילוב נשמר כפי שצוין.");
    }
    return m;
  };

  if (item.seriesRefs !== undefined) {
    const keys = item.seriesRefs.filter((k) => SERIES_CATALOG.some((r) => r.key === k));
    return withFlags({ ...base, status: keys.length ? "explicit" : "none", seriesKeys: keys, reason: "נבחר ידנית" });
  }

  const head = normalizeText([item.profileName, item.customerDescription].join(" "));
  if (NON_PRODUCT.test(head)) {
    return { ...base, status: "excluded", seriesKeys: [], reason: "שורת שירות או אביזר" };
  }

  const structured = brandOfManufacturer(item.manufacturer);
  const fields: { text: string; bare: boolean }[] = [
    { text: item.profileName ?? "", bare: true },
    { text: item.customerDescription ?? "", bare: false },
    { text: item.details ?? "", bare: false },
    { text: item.configuration?.customDescription ?? "", bare: false },
  ];
  let pending: ItemSeriesMatch | undefined;
  for (const field of fields) {
    if (field.bare === false && NON_PRODUCT.test(normalizeText(field.text))) continue;
    const r = analyseField(field.text, structured, field.bare);
    if (r.kind === "nothing") continue;
    if (r.kind === "match") return withFlags({ ...base, status: "matched", seriesKeys: r.keys });
    const status: ItemSeriesStatus = r.kind;
    const result: ItemSeriesMatch = { ...base, status, seriesKeys: [], candidates: r.candidates, reason: r.reason };
    // The profile field decides; free text is only consulted when the profile says nothing.
    if (field.bare) return result;
    pending ??= result;
  }
  return pending ?? { ...base, status: "none", seriesKeys: [] };
}
