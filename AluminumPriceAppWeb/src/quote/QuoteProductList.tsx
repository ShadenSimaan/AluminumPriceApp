import { useState } from "react";
import { buildDiagram } from "../rfq/diagram";
import { DiagramSvg } from "../rfq/RfqDiagram";
import { describeConfigurationShort, describeGlass, dict } from "../rfq/i18n";
import type { LineItem } from "../types";
import { dimensionText } from "./customerSpecs";
import { lineQuantity, lineTotal, lineUnitPrice, priceBasisOf } from "./pricing";
import { EKLIEN_LOGO_CANDIDATES, mentionsEklien } from "./eklienLogo";

function ManufacturerLogo() {
  const [index, setIndex] = useState(0);
  if (index >= EKLIEN_LOGO_CANDIDATES.length) return null;
  return (
    <img
      src={EKLIEN_LOGO_CANDIDATES[index]}
      alt="EKLIEN"
      className="h-5 w-auto object-contain"
      onError={() => setIndex((i) => i + 1)}
    />
  );
}

const money = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS" });

/** One card per drawn window or door, laid out like the supplier request items. */
export default function QuoteProductList({
  items,
  onEditDrawing,
  onDuplicate,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  items: LineItem[];
  onEditDrawing: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const d = dict("he");
  const drawn = items.filter((item) => item.configuration);
  if (!drawn.length) {
    return <div className="text-sm text-slate-500 py-6 text-center">אין עדיין חלונות או דלתות עם שרטוט בהצעה.</div>;
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {drawn.map((item) => {
        const cfg = item.configuration!;
        const position = items.indexOf(item) + 1;
        const spec = buildDiagram(cfg, { width: 260, height: 200, customPlaceholder: "שרטוט מצורף", showDivisionDims: cfg.openingType !== "custom" });
        const glassText = describeGlass("he", cfg.glassSpec)[0] ?? "";
        const glass = glassText.includes("הספק") ? "" : glassText;
        return (
          <li key={item.id} className="rounded-lg border border-slate-200 p-3 grid gap-2 bg-white content-start">
            <div className="flex justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <bdi className="font-bold">{position}. {cfg.reference || item.profileName || "פריט"}</bdi>
                  {mentionsEklien(item) && <ManufacturerLogo />}
                </div>
                <div className="text-sm">{item.customerDescription || d.openingType[cfg.openingType]}</div>
                {item.location && <div className="text-xs text-slate-600"><bdi>{item.location}</bdi></div>}
              </div>
              <div className="text-sm text-end shrink-0">
                {d.ui.quantity}: <b>{lineQuantity(item)}</b>
              </div>
            </div>
            <div className="rounded border border-slate-100 bg-slate-50">
              <DiagramSvg spec={spec} className="w-full h-auto" title={cfg.reference || "שרטוט"} />
            </div>
            <p className="text-center text-xs text-slate-500 -mt-1">{d.ui.viewedFromOutside}</p>
            {item.configurationNeedsReview && (
              <p className="text-center text-xs text-amber-700">התצורה סומנה לבדיקה. מוצג שרטוט המקור, בלי ניחוש של כנפיים.</p>
            )}
            <div className="text-xs text-slate-700 grid gap-0.5">
              <div>
                {d.ui.width} <bdi dir="ltr">{dimensionText(cfg.widthCm, cfg.unit)}</bdi> · {d.ui.height} <bdi dir="ltr">{dimensionText(cfg.heightCm, cfg.unit)}</bdi>
              </div>
              {cfg.openingType !== "custom" && <div className="text-slate-600">{describeConfigurationShort("he", cfg)}</div>}
              {glass && <div className="text-slate-600">{d.ui.glass}: {glass}</div>}
              {(item.profileName || cfg.frameFinish) && <div className="text-slate-600">פרופיל: {item.profileName || cfg.frameFinish}</div>}
              {item.details && <div className="text-slate-600 whitespace-pre-wrap">{item.details}</div>}
            </div>
            <div className="text-sm font-medium text-sky-800">
              {priceBasisOf(item) === "per_m2" ? "לפי מ״ר" : "ליחידה"}: {money.format(lineUnitPrice(item))} · סה״כ {money.format(lineTotal(item))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="px-2 py-1 rounded bg-sky-600 text-white text-xs" onClick={() => onEditDrawing(item.id)}>עריכת שרטוט</button>
              <button type="button" className="px-2 py-1 rounded border text-xs" onClick={() => onDuplicate(item.id)}>שכפול</button>
              <button type="button" className="px-2 py-1 rounded border text-xs" aria-label="למעלה" title="למעלה" onClick={() => onMoveUp(item.id)}>▲</button>
              <button type="button" className="px-2 py-1 rounded border text-xs" aria-label="למטה" title="למטה" onClick={() => onMoveDown(item.id)}>▼</button>
              <button type="button" className="px-2 py-1 rounded border border-red-200 text-red-600 text-xs" onClick={() => onRemove(item.id)}>הסרה</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
