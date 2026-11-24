// Deterministic source verification: the amount the model reported must appear on the page it cites,
// with the unit wording nearby. Nothing here trusts the model.
import type { MarketUnit } from "./contract.ts";

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", shy: "" };

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>|<\/(?:p|div|li|tr|td|th|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v]+/g, " ");
}

/** Every number written on the page, with thousands separators (",", ".", thin/no-break spaces) removed. */
export function numbersIn(text: string): { value: number; index: number }[] {
  const out: { value: number; index: number }[] = [];
  const re = /\d{1,3}(?:[,.\u00a0\u202f ]\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d{1,2})?(?!\d)/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    let value: number;
    const grouped = raw.match(/^(\d{1,3}(?:[,.\u00a0\u202f ]\d{3})+)(?:([.,])(\d{1,2}))?$/);
    if (grouped) {
      value = Number(grouped[1].replace(/[^\d]/g, "")) + (grouped[3] ? Number(`0.${grouped[3]}`) : 0);
    } else {
      value = Number(raw.replace(",", "."));
    }
    if (isFinite(value)) out.push({ value, index: m.index ?? 0 });
  }
  return out;
}

const UNIT_WORDS: Record<MarketUnit, RegExp> = {
  m2: /מ["״׳']?\s?ר|מטר\s*(?:מרובע|רבוע)|למ"ר|m²|m2|sqm|מ"ר/i,
  linear_m: /מטר\s*(?:אורך|רץ)|מ["״]?\s?א(?![א-ת])|למטר|לכל\s*מטר|linear|per\s*m(?:eter|etre)?\b/i,
  opening: /לחלון|לפתח|לדלת|ליחידה|ליח["׳']?|יחידה|חלון|פתח|per\s*(?:window|unit)/i,
  unit: /ליחידה|ליח["׳']?|יחידה|יח["׳']|ל?כל\s*אחד|לפריט|per\s*(?:unit|piece)|each/i,
};

export type PageCheck = { amountFound: boolean; unitVerified: boolean };

export function checkAmountOnPage(text: string, amount: number, unit: MarketUnit, amountHigh?: number): PageCheck {
  const numbers = numbersIn(text);
  const hits = numbers.filter((n) => Math.abs(n.value - amount) < 0.5);
  if (!hits.length) return { amountFound: false, unitVerified: false };
  if (amountHigh !== undefined && !numbers.some((n) => Math.abs(n.value - amountHigh) < 0.5)) {
    return { amountFound: false, unitVerified: false };
  }
  const unitVerified = hits.some((h) => UNIT_WORDS[unit].test(text.slice(Math.max(0, h.index - 150), h.index + 150)));
  return { amountFound: true, unitVerified };
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$/i.test(p)) u.searchParams.delete(p);
    const path = decodeURI(u.pathname).replace(/\/+$/, "");
    return `${u.hostname.replace(/^www\./, "").toLowerCase()}${path}${u.search}`;
  } catch {
    return url.trim();
  }
}

/** Fetches a page ourselves (used when the model cited a search result it did not fetch). */
export async function fetchPageText(url: string, timeoutMs = 10000): Promise<string | undefined> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; price-check/1.0)", "accept-language": "he-IL,he;q=0.9,en;q=0.5" },
    });
    if (!res.ok) return undefined;
    const type = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/.test(type)) return undefined;
    const body = (await res.text()).slice(0, 2_000_000);
    return htmlToText(body);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
