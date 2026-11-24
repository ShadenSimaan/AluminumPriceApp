import type { MarketUnit } from "./contract";

const ils = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const num = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });

export const UNIT_SUFFIX: Record<MarketUnit, string> = { m2: "למ״ר", linear_m: "למטר אורך", opening: "לפתח", unit: "ליח׳" };

export function money(n: number): string {
  return ils.format(n);
}

export function rate(n: number, unit: MarketUnit): string {
  return `${ils.format(n)} ${UNIT_SUFFIX[unit]}`;
}

/** Percent with an explicit sign: +5.0% / −3.2%. */
export function signedPercent(n: number): string {
  const s = pct.format(Math.abs(n));
  return n > 0.05 ? `+${s}%` : n < -0.05 ? `−${s}%` : `${s}%`;
}

export function plain(n: number): string {
  return num.format(n);
}

export function dateHe(iso: string | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export async function openExternal(url: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const opener = await import("@tauri-apps/plugin-opener");
      await opener.openUrl(url);
      return;
    } catch {
      /* fall back to the webview */
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
