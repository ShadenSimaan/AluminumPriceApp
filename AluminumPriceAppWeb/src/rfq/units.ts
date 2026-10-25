import type { RfqUnit } from "./types";

// Same convention as the quotation calculator: values are stored in cm, mm is a display/entry unit.
// Rounding to 0.01 removes floating-point noise (e.g. 120.3 * 10) without changing real sizes.

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cmToUnit(cm: number, unit: RfqUnit): number {
  return round2(unit === "mm" ? cm * 10 : cm);
}

export function unitToCm(value: number, unit: RfqUnit): number {
  return round2(unit === "mm" ? value / 10 : value) || 0;
}

export function convertUnitValue(value: number, from: RfqUnit, to: RfqUnit): number {
  return cmToUnit(unitToCm(value, from), to);
}

export function formatDimension(cm: number | null, unit: RfqUnit): string {
  if (cm == null || !isFinite(cm)) return "—";
  const v = cmToUnit(cm, unit);
  return Number.isInteger(v) ? String(v) : v.toFixed(unit === "mm" ? 1 : 2).replace(/\.?0+$/, "");
}

export function formatSize(widthCm: number | null, heightCm: number | null, unit: RfqUnit): string {
  return `${formatDimension(widthCm, unit)} × ${formatDimension(heightCm, unit)} ${unit}`;
}

/**
 * Strict number parser for user/import input: digits with at most one decimal separator.
 * Thousands separators and stray characters are rejected rather than guessed.
 */
export function parseStrictNumber(raw: string): number | null {
  const s = raw.trim();
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return null;
  // "1,200" could be a thousands separator or a decimal comma: refuse to guess.
  if (/^-?\d{1,3},\d{3}$/.test(s)) return null;
  const n = Number(s.replace(",", "."));
  return isFinite(n) ? n : null;
}
