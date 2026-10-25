// Simplified Unicode Bidirectional Algorithm (UAX #9) for single-paragraph PDF text lines.
// Covers what RFQ documents need: Hebrew/Latin mixing, numbers (incl. 1200.5, 1,200, -5, 50%),
// references like W-01, dimensions like "1200 × 1400 mm", bracket mirroring.
// No explicit embeddings/isolates (not produced by this app).

type BidiClass = "L" | "R" | "EN" | "ES" | "ET" | "CS" | "WS" | "ON" | "NSM";

const RTL_RANGES: [number, number][] = [
  [0x0590, 0x08ff], // Hebrew, Arabic, Syriac, Thaana, NKo …
  [0xfb1d, 0xfdff],
  [0xfe70, 0xfeff],
];

function inRanges(cp: number, ranges: [number, number][]): boolean {
  return ranges.some(([a, b]) => cp >= a && cp <= b);
}

export function bidiClass(ch: string): BidiClass {
  const cp = ch.codePointAt(0) ?? 0;
  if (cp >= 0x0591 && cp <= 0x05c7 && ![0x05be, 0x05c0, 0x05c3, 0x05c6].includes(cp)) return "NSM";
  if (inRanges(cp, RTL_RANGES)) return "R";
  if (cp >= 0x30 && cp <= 0x39) return "EN";
  if (ch === "+" || ch === "-" || ch === "\u2212") return "ES";
  if ("#$%°¢£¤¥₪€\u2030".includes(ch)) return "ET";
  if (ch === "," || ch === "." || ch === ":" || ch === "/" || ch === "\u00a0") return "CS";
  if (ch === " " || ch === "\t" || ch === "\u2009" || ch === "\u202f") return "WS";
  if (/\p{L}|\p{M}/u.test(ch)) return "L";
  return "ON";
}

export function hasRtl(text: string): boolean {
  for (const ch of text) if (bidiClass(ch) === "R") return true;
  return false;
}

const MIRROR: Record<string, string> = { "(": ")", ")": "(", "[": "]", "]": "[", "{": "}", "}": "{", "<": ">", ">": "<", "«": "»", "»": "«" };

/** Resolved embedding level per character (0 = LTR base). */
export function resolveLevels(chars: string[], baseRtl: boolean): number[] {
  const base = baseRtl ? 1 : 0;
  const sos: BidiClass = baseRtl ? "R" : "L";
  const types: BidiClass[] = chars.map(bidiClass);
  const n = types.length;

  // W1: NSM takes the type of the previous char
  for (let i = 0; i < n; i++) if (types[i] === "NSM") types[i] = i > 0 ? types[i - 1] : sos;

  // W4: single ES between EN EN -> EN ; single CS between EN EN -> EN
  for (let i = 1; i < n - 1; i++) {
    if ((types[i] === "ES" || types[i] === "CS") && types[i - 1] === "EN" && types[i + 1] === "EN") types[i] = "EN";
  }
  // W5: ET adjacent to EN -> EN
  for (let i = 0; i < n; i++) {
    if (types[i] !== "ET") continue;
    let j = i;
    while (j < n && types[j] === "ET") j++;
    const touchesEN = (i > 0 && types[i - 1] === "EN") || (j < n && types[j] === "EN");
    if (touchesEN) for (let k = i; k < j; k++) types[k] = "EN";
    i = j - 1;
  }
  // W6: remaining separators/terminators -> ON
  for (let i = 0; i < n; i++) if (types[i] === "ES" || types[i] === "ET" || types[i] === "CS") types[i] = "ON";
  // W7: EN preceded (strongly) by L or sos L -> L
  let lastStrong: BidiClass = sos;
  for (let i = 0; i < n; i++) {
    if (types[i] === "L" || types[i] === "R") lastStrong = types[i];
    else if (types[i] === "EN" && lastStrong === "L") types[i] = "L";
  }

  const strongOf = (t: BidiClass): "L" | "R" | null => (t === "L" ? "L" : t === "R" || t === "EN" ? "R" : null);
  const e: "L" | "R" = baseRtl ? "R" : "L";

  // N0: bracket pairs take the direction of their content/context
  const pairs: [number, number][] = [];
  const stack: { ch: string; i: number }[] = [];
  const OPEN: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  for (let i = 0; i < n; i++) {
    if (types[i] !== "ON") continue;
    const ch = chars[i];
    if (OPEN[ch]) {
      if (stack.length >= 63) break;
      stack.push({ ch, i });
    } else if (ch === ")" || ch === "]" || ch === "}") {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (OPEN[stack[k].ch] === ch) {
          pairs.push([stack[k].i, i]);
          stack.length = k;
          break;
        }
      }
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  for (const [o, c] of pairs) {
    let foundE = false;
    let foundOpp = false;
    for (let k = o + 1; k < c; k++) {
      const s = strongOf(types[k]);
      if (s === e) foundE = true;
      else if (s) foundOpp = true;
    }
    let dir: "L" | "R" | null = null;
    if (foundE) dir = e;
    else if (foundOpp) {
      let before: "L" | "R" = sos as "L" | "R";
      for (let k = o - 1; k >= 0; k--) {
        const s = strongOf(types[k]);
        if (s) {
          before = s;
          break;
        }
      }
      dir = before !== e ? before : e;
    }
    if (dir) {
      types[o] = dir;
      types[c] = dir;
    }
  }

  // N1/N2: neutrals between strong types (EN counts as R)
  for (let i = 0; i < n; i++) {
    if (types[i] !== "WS" && types[i] !== "ON") continue;
    let j = i;
    while (j < n && (types[j] === "WS" || types[j] === "ON")) j++;
    const before = i > 0 ? strongOf(types[i - 1]) : (sos as "L" | "R");
    const after = j < n ? strongOf(types[j]) : (sos as "L" | "R");
    const resolved: BidiClass = before === after && before ? before : baseRtl ? "R" : "L";
    for (let k = i; k < j; k++) types[k] = resolved;
    i = j - 1;
  }

  // I1/I2
  const levels = types.map((t) => {
    if (base === 0) return t === "R" ? 1 : t === "EN" ? 2 : 0;
    return t === "L" || t === "EN" ? 2 : 1;
  });

  // L1: trailing whitespace resets to base level
  for (let i = n - 1; i >= 0 && bidiClass(chars[i]) === "WS"; i--) levels[i] = base;
  return levels;
}

export type VisualRun = { text: string; rtl: boolean };

export const LRI = "\u2066";
export const RLI = "\u2067";
export const FSI = "\u2068";
export const PDI = "\u2069";
const PLACEHOLDER = "\ufffc";

/** Wrap a value so it is laid out left-to-right regardless of surrounding text (phone, e-mail, sizes, refs). */
export function ltr(value: string): string {
  return value ? `${LRI}${value}${PDI}` : value;
}

/** Isolate a user-entered value: it keeps its own direction (like HTML <bdi>). */
export function auto(value: string): string {
  return value ? `${FSI}${value}${PDI}` : value;
}

/** First strong direction, skipping isolated content (UAX #9 P2). null when there is none. */
export function firstStrongRtl(text: string): boolean | null {
  let depth = 0;
  for (const ch of text) {
    if (ch === LRI || ch === RLI || ch === FSI) depth++;
    else if (ch === PDI) depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const c = bidiClass(ch);
      if (c === "R") return true;
      if (c === "L") return false;
    }
  }
  return null;
}

/** Replace each top-level isolate with one neutral placeholder; returns the isolated contents in order. */
function extractIsolates(chars: string[]): { outer: string[]; isolates: { text: string; rtl: boolean | "auto" }[] } {
  const outer: string[] = [];
  const isolates: { text: string; rtl: boolean | "auto" }[] = [];
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i];
    if (ch === LRI || ch === RLI || ch === FSI) {
      let depth = 1;
      let j = i + 1;
      while (j < chars.length && depth > 0) {
        if (chars[j] === LRI || chars[j] === RLI || chars[j] === FSI) depth++;
        else if (chars[j] === PDI) depth--;
        if (depth > 0) j++;
      }
      isolates.push({ text: chars.slice(i + 1, j).join(""), rtl: ch === LRI ? false : ch === RLI ? true : "auto" });
      outer.push(PLACEHOLDER);
      i = j + 1;
    } else {
      if (ch !== PDI) outer.push(ch);
      i++;
    }
  }
  return { outer, isolates };
}

/**
 * Visual (left-to-right on the page) character runs. Characters inside each run are already in
 * visual order; `rtl` tells whether the run came from right-to-left text (useful for font choice only).
 */
export function visualRuns(text: string, baseRtl: boolean): VisualRun[] {
  const { outer: chars, isolates } = extractIsolates(Array.from(text));
  if (!chars.length) return [];
  // Isolate contents are laid out independently and inserted where their placeholder lands.
  const isolateRuns = isolates.map((iso) =>
    visualRuns(iso.text, iso.rtl === "auto" ? firstStrongRtl(iso.text) ?? baseRtl : iso.rtl)
  );
  let isoIdx = 0;
  const placeholderRuns = new Map<number, VisualRun[]>();
  chars.forEach((c, i) => {
    if (c === PLACEHOLDER && isoIdx < isolateRuns.length) placeholderRuns.set(i, isolateRuns[isoIdx++]);
  });
  const levels = resolveLevels(chars, baseRtl);
  const order = chars.map((_, i) => i);
  const maxLevel = Math.max(...levels);
  const minOdd = levels.reduce((m, l) => (l % 2 === 1 && l < m ? l : m), Infinity);
  for (let lvl = maxLevel; lvl >= (isFinite(minOdd) ? minOdd : maxLevel + 1); lvl--) {
    let i = 0;
    while (i < order.length) {
      if (levels[order[i]] >= lvl) {
        let j = i;
        while (j < order.length && levels[order[j]] >= lvl) j++;
        const seg = order.slice(i, j).reverse();
        order.splice(i, j - i, ...seg);
        i = j;
      } else i++;
    }
  }
  const runs: VisualRun[] = [];
  for (const idx of order) {
    const inserted = placeholderRuns.get(idx);
    if (inserted) {
      for (const r of inserted) {
        const last = runs[runs.length - 1];
        if (last && last.rtl === r.rtl) last.text += r.text;
        else runs.push({ ...r });
      }
      continue;
    }
    const rtl = levels[idx] % 2 === 1;
    let ch = chars[idx];
    if (rtl && MIRROR[ch]) ch = MIRROR[ch];
    const last = runs[runs.length - 1];
    if (last && last.rtl === rtl) last.text += ch;
    else runs.push({ text: ch, rtl });
  }
  return runs;
}

/** Visual string (for tests / debugging). */
export function toVisual(text: string, baseRtl: boolean): string {
  return visualRuns(text, baseRtl)
    .map((r) => r.text)
    .join("");
}
