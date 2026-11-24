import React from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { LineItem } from "../types";
import {
  MARKET_UNIT_LABELS,
  MATCH_LEVEL_LABELS,
  PRICE_KIND_LABELS,
  VERIFICATION_LABELS,
  type MarketEvidence,
} from "./contract";
import { BASIS_LABELS, directionLabel, roleLabel, type EvidenceEvaluation, type LineComparison } from "./compute";
import type { SpecBuild } from "./spec";
import { dateHe, money, openExternal, plain, rate, signedPercent, UNIT_SUFFIX } from "./format";
import type { MarketLineInputs } from "./types";

type Props = {
  line: LineItem;
  index: number;
  comparison: LineComparison;
  build: SpecBuild;
  running: boolean;
  discountPercent: number;
  onRefresh: () => void;
  onInputs: (inputs: MarketLineInputs) => void;
};

const VAT_LABEL = { incl: "כולל מע״מ", excl: "לפני מע״מ", unknown: "לא צוין" } as const;
const SCOPE_LABEL = { installed: "כולל התקנה", supply_only: "אספקה בלבד", unknown: "לא צוין" } as const;
const SOURCE_LABEL = { live: "בדיקה חיה", cache: "מתוצאה שמורה למפרט זהה", fixture: "נתוני בדיקה (fixture) — לא מחיר שוק אמיתי" } as const;

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-white/80 border border-slate-200 px-2 py-1.5">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="text-sm text-slate-800 whitespace-normal">{children}</div>
    </div>
  );
}

export default function MarketLinePanel({ line, index, comparison: c, build, running, discountPercent, onRefresh, onInputs }: Props) {
  const [showSources, setShowSources] = React.useState(false);
  const snap = line.marketCheck;
  const bench = c.bench;
  const unit = c.our.unit;
  const check = build.seriesCheck;
  const confirmed = line.marketInputs?.seriesConfirmed;

  if (c.status === "not_comparable") {
    return <div className="text-xs text-slate-500 px-2 py-1">השוואת שוק: {c.excludedReason}</div>;
  }

  const above = (c.diffPerUnit ?? 0) > 0;
  const accent = c.status === "ok" && c.diffPerUnit !== undefined ? (Math.abs(c.diffPercent ?? 0) < 0.05 ? "border-r-slate-300" : above ? "border-r-amber-400" : "border-r-sky-400") : "border-r-slate-200";

  return (
    <div className={`market-line rounded-lg border border-slate-200 border-r-4 ${accent} bg-slate-50 px-2 py-2 text-right`} aria-label={`השוואת שוק לשורה ${index + 1}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-700">השוואת שוק (פנימי)</span>
          {snap?.retrievedAt ? (
            <span>
              נבדק: {dateHe(snap.retrievedAt)} · {SOURCE_LABEL[snap.source]}
            </span>
          ) : (
            !running && <span>טרם נבדק</span>
          )}
          {c.outdated && <span className="rounded bg-amber-100 text-amber-900 px-1.5 py-0.5">לא עדכני — המפרט השתנה מאז הבדיקה</span>}
          {snap?.lastError && (
            <span className="rounded bg-rose-50 text-rose-800 px-1.5 py-0.5">
              בדיקה מ-{dateHe(snap.lastError.at)} נכשלה: {snap.lastError.message}
              {snap.evidence.length ? ` — מוצגת התוצאה הקודמת מ-${dateHe(snap.retrievedAt)}` : ""}
            </span>
          )}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          onClick={onRefresh}
          disabled={running}
          title="חיפוש מחדש לשורה זו (ללא שימוש בתוצאה שמורה)"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} aria-hidden />
          {running ? "בודק…" : "רענון שורה"}
        </button>
      </div>

      {check.status === "needs_verification" && (
        <div className="mb-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900 flex flex-wrap items-center gap-2">
          <span className="font-semibold">נדרש אימות דגם</span>
          <span>
            הוזן ״{check.entered}״ — הדגם לא מוכר בקטלוג.
            {(check.candidates.length || snap?.suggestedSeries?.length) ? ` ייתכן שהכוונה ל-${[...new Set([...check.candidates, ...(snap?.suggestedSeries ?? [])])].join(" / ")}.` : ""}
          </span>
          {confirmed ? (
            <>
              <span className="rounded bg-white px-1.5 py-0.5 border border-amber-300">מושווה כ-{confirmed} (אושר להשוואה בלבד; השורה בהצעה לא שונתה)</span>
              <button type="button" className="underline" onClick={() => onInputs({ ...line.marketInputs, seriesConfirmed: undefined })}>
                ביטול
              </button>
            </>
          ) : (
            [...new Set([...check.candidates, ...(snap?.suggestedSeries ?? [])])].map((cand) => (
              <button
                key={cand}
                type="button"
                className="rounded border border-amber-400 bg-white px-1.5 py-0.5 hover:bg-amber-100"
                onClick={() => onInputs({ ...line.marketInputs, seriesConfirmed: cand })}
              >
                השווה כ-{cand}
              </button>
            ))
          )}
        </div>
      )}
      {check.status === "ambiguous" && (
        <div className="mb-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          צוינו כמה סדרות ({check.candidates.join(" / ")}) — ההשוואה מתייחסת לנוסח כפי שהוזן.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-1.5">
        <Cell label="המחיר שלנו">
          {c.our.rate !== undefined ? (
            <>
              <span className="font-semibold">{rate(c.our.rate, unit)}</span>
              <div className="text-[11px] text-slate-500">
                לפני מע״מ{discountPercent > 0 ? `, אחרי הנחה ${plain(discountPercent)}%` : ""}
                {c.our.billableQty ? ` · ${plain(c.our.billableQty)} ${UNIT_SUFFIX[unit].replace("ל", "")}` : ""}
              </div>
            </>
          ) : (
            <span className="text-slate-500">{c.our.note ?? "—"}</span>
          )}
        </Cell>
        <Cell label="טווח שוק משוער">
          {bench?.status === "ok" && bench.low !== undefined && bench.high !== undefined ? (
            <span>
              {money(bench.low)}–{money(bench.high)} {UNIT_SUFFIX[bench.unit]}
            </span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
          {bench?.lowerBounds.length ? (
            <div className="text-[11px] text-slate-500">
              ״החל מ-״ (גבול תחתון): {bench.lowerBounds.map((b) => `${money(b.value)} (${b.seller})`).join(", ")}
            </div>
          ) : null}
        </Cell>
        <Cell label="מחיר שוק להשוואה">
          {running && !snap?.evidence.length ? (
            <span className="text-slate-500">בודק…</span>
          ) : bench?.status === "ok" && bench.benchmark !== undefined && bench.basis ? (
            <>
              <span className="font-semibold">{rate(bench.benchmark, bench.unit)}</span>
              <div className="text-[11px] text-slate-600">
                <span className="rounded bg-slate-200 px-1">{BASIS_LABELS[bench.basis]}</span> · {bench.sellerCount} מוכרים · {bench.sampleCount} רשומות
                {bench.hasMidpoint ? " · כולל אמצע טווח" : ""}
              </div>
              {bench.components && (
                <div className="text-[11px] text-slate-500">
                  {bench.components.map((p) => `${roleLabel(p.role)} ${money(p.perPiece)} (${p.quantityNote})`).join(" + ")} ליחידה
                </div>
              )}
            </>
          ) : snap ? (
            <span className="font-semibold text-slate-700">אין מספיק נתונים להשוואה</span>
          ) : (
            <span className="text-slate-500">—</span>
          )}
          {bench?.proxy && (
            <div className="text-[11px] text-slate-500">
              קירוב ממערכת אחרת (לא נכלל במדד): {rate(bench.proxy.benchmark, bench.unit)} · {bench.proxy.sellerCount} מוכרים
            </div>
          )}
          {bench?.notes.map((n) => (
            <div key={n} className="text-[11px] text-slate-500">
              {n}
            </div>
          ))}
        </Cell>
        <Cell label="פער מהשוק">
          {c.status === "ok" && c.diffPerUnit !== undefined && c.diffPercent !== undefined ? (
            <>
              <span className={`font-semibold ${above ? "text-amber-800" : "text-sky-800"}`}>
                {money(Math.abs(c.diffPerUnit))} {UNIT_SUFFIX[unit]} {directionLabel(c.diffPerUnit)} ({signedPercent(c.diffPercent)})
              </span>
              {c.diffTotal !== undefined && (
                <div className="text-[11px] text-slate-500">
                  לשורה כולה: {money(Math.abs(c.diffTotal))} {directionLabel(c.diffTotal)}
                </div>
              )}
              {!c.includedInIndex && c.excludedReason && <div className="text-[11px] text-amber-800">לא נכלל במדד: {c.excludedReason}</div>}
            </>
          ) : (
            <span className="text-slate-500">—</span>
          )}
        </Cell>
        <Cell label="מקורות">
          {snap ? (
            <button type="button" className="text-sky-700 underline text-sm" onClick={() => setShowSources((v) => !v)} aria-expanded={showSources}>
              {showSources ? "הסתר" : "הצג"} מקורות ({snap.evidence.length})
            </button>
          ) : (
            <span className="text-slate-500">—</span>
          )}
          {build.spec.screen.present && (
            <label className="mt-1 flex items-center gap-1 text-[11px] text-slate-600">
              שטח רשת בפועל (מ״ר, לכל השורה):
              <input
                type="text"
                inputMode="decimal"
                className="w-16 rounded border border-slate-300 px-1 py-0.5 text-xs"
                value={line.marketInputs?.screenAreaM2 ?? ""}
                placeholder={build.spec.screen.areaM2 ? plain(build.spec.screen.areaM2 * Math.max(1, build.spec.quantity)) : "?"}
                onChange={(e) => onInputs({ ...line.marketInputs, screenAreaM2: e.target.value })}
                aria-label="שטח רשת בפועל במ״ר"
              />
            </label>
          )}
        </Cell>
      </div>

      {[...(snap?.assumptions ?? build.assumptions)].length > 0 && (
        <ul className="mt-1.5 text-[11px] text-slate-600 list-disc pr-4">
          {[...new Set(snap?.assumptions ?? build.assumptions)].map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {showSources && snap && <SourcesTable snap={snap.evidence} evaluations={bench?.evaluations ?? []} warnings={snap.warnings} dropped={snap.dropped} />}
    </div>
  );
}

export function SourcesTable({
  snap,
  evaluations,
  warnings,
  dropped,
}: {
  snap: MarketEvidence[];
  evaluations: EvidenceEvaluation[];
  warnings: string[];
  dropped?: { url: string; reason: string }[];
}) {
  const byId = new Map(evaluations.map((e) => [e.evidence.id, e]));
  return (
    <div className="mt-2">
      {warnings.length > 0 && (
        <ul className="mb-1 text-[11px] text-amber-800 list-disc pr-4">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {snap.length === 0 ? (
        <div className="text-xs text-slate-500">לא נמצאו מקורות עם מחיר.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse bg-white">
            <thead>
              <tr className="bg-slate-100 text-slate-600">
                {["מוכר", "עמוד", "מחיר שנצפה", "מפרט", "יחידה", "מע״מ", "התקנה", "סוג", "התאמה", "נבדק", "בהשוואה"].map((h) => (
                  <th key={h} className="px-1.5 py-1 text-right font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snap.map((e) => {
                const ev = byId.get(e.id);
                return (
                  <tr key={e.id} className="border-t align-top">
                    <td className="px-1.5 py-1">{e.seller}</td>
                    <td className="px-1.5 py-1">
                      <button type="button" className="inline-flex items-center gap-0.5 text-sky-700 underline break-all text-right" onClick={() => void openExternal(e.url)} title={e.url}>
                        {e.pageTitle || new URL(e.url).hostname}
                        <ExternalLink className="w-3 h-3 shrink-0" aria-hidden />
                      </button>
                    </td>
                    <td className="px-1.5 py-1">
                      <div>{e.observedPriceText}</div>
                      <div className="text-slate-500">
                        {money(e.amount)}
                        {e.amountHigh ? `–${money(e.amountHigh)}` : ""}
                      </div>
                    </td>
                    <td className="px-1.5 py-1 max-w-[16rem]">
                      {e.specification}
                      {e.seriesOnPage ? ` · סדרה בעמוד: ${e.seriesOnPage}` : ""}
                      {e.minimumOrder ? ` · מינימום ${e.minimumOrder.value} ${e.minimumOrder.unit === "m2_total" ? "מ״ר להזמנה" : MARKET_UNIT_LABELS[e.minimumOrder.unit]}` : ""}
                    </td>
                    <td className="px-1.5 py-1 whitespace-nowrap">{MARKET_UNIT_LABELS[e.unit]}</td>
                    <td className="px-1.5 py-1 whitespace-nowrap">{VAT_LABEL[e.vat]}</td>
                    <td className="px-1.5 py-1 whitespace-nowrap">{SCOPE_LABEL[e.scope]}</td>
                    <td className="px-1.5 py-1">{PRICE_KIND_LABELS[e.priceKind]}</td>
                    <td className="px-1.5 py-1">
                      {MATCH_LEVEL_LABELS[ev?.pool ?? e.matchLevel]}
                      {e.componentRole ? ` · ${roleLabel(e.componentRole)}` : ""}
                    </td>
                    <td className="px-1.5 py-1 whitespace-nowrap">
                      {dateHe(e.checkedAt)}
                      <div className="text-slate-500">{VERIFICATION_LABELS[e.verification]}</div>
                    </td>
                    <td className="px-1.5 py-1">
                      {ev?.included ? (
                        <span className="text-emerald-700">
                          ✓ {ev.value !== undefined && ev.unit ? rate(ev.value, ev.unit) : ""} לפני מע״מ
                        </span>
                      ) : (
                        <span className="text-slate-600">{ev?.reason ?? "—"}</span>
                      )}
                      {ev?.notes.map((n) => (
                        <div key={n} className="text-slate-500">
                          {n}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {dropped && dropped.length > 0 && (
        <div className="mt-1 text-[11px] text-slate-500">
          {dropped.length} מקורות נפסלו בשרת (קישור שלא הופיע בתוצאות החיפוש או בלי סכום) ואינם מוצגים.
        </div>
      )}
    </div>
  );
}
