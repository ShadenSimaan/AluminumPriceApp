import React from "react";
import { checkMarketEndpoint } from "./client";
import { isMarketConfigured, type MarketSettings } from "./types";

const input = "mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 bg-white";

/** Connection used by בדיקת מחירי שוק (quotation screen and profile prices). */
export default function MarketSettingsSection({ value, onChange }: { value: MarketSettings; onChange: (next: MarketSettings) => void }) {
  const [status, setStatus] = React.useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const configured = isMarketConfigured(value);
  const [open, setOpen] = React.useState(!configured);

  const test = async () => {
    setStatus({ tone: "info", text: "בודק חיבור…" });
    try {
      const r = await checkMarketEndpoint(value);
      setStatus(
        r.providerConfigured
          ? {
              tone: r.provider === "fixture" ? "info" : "ok",
              text: r.provider === "fixture" ? "מחובר — השרת במצב נתוני בדיקה (fixture), לא חיפוש חי" : "מחובר — החיפוש באינטרנט מוכן",
            }
          : { tone: "error", text: "מחובר, אבל מפתח ספק החיפוש חסר בשרת" }
      );
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "החיבור נכשל" });
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-right"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-800">חיבור לאינטרנט ול-AI</span>
        <span className={`text-xs ${configured ? "text-emerald-700" : "text-rose-700"}`}>
          {configured ? (value.mode === "direct" ? "מחובר ישירות ל-Claude ✓" : "דרך שרת ביניים ✓") : "לא הוגדר — לחצו להגדרה"}
          <span className="mr-2 text-slate-400">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-slate-200 px-3 py-3">
          <div className="text-sm text-slate-600">
            הבדיקה מתחברת לאינטרנט דרך Claude (חיפוש וקריאת דפים), מחפשת מחירים אצל היצרנים המקוריים ואצל מתקינים מובילים, ומחשבת ממוצע למ״ר.
            לחיפוש נשלח מפרט המוצר בלבד — בלי פרטי לקוח ובלי המחירים שלנו.
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="marketMode" checked={value.mode === "direct"} onChange={() => onChange({ ...value, mode: "direct" })} />
              חיבור ישיר (מומלץ)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="marketMode" checked={value.mode === "proxy"} onChange={() => onChange({ ...value, mode: "proxy" })} />
              דרך שרת ביניים
            </label>
          </div>
          {value.mode === "direct" ? (
            <label className="text-sm">
              מפתח Claude API
              <input
                type="password"
                dir="ltr"
                autoComplete="off"
                className={input}
                placeholder="sk-ant-..."
                value={value.apiKey}
                onChange={(e) => onChange({ ...value, apiKey: e.target.value })}
              />
              <span className="mt-1 block text-xs text-slate-500">
                פעם אחת בלבד: יוצרים מפתח ב-console.anthropic.com ← API keys ומדביקים כאן. המפתח נשמר רק במחשב הזה, בקובץ הנתונים של האפליקציה.
                עלות משוערת: כ-1–3 ₪ לכל בדיקת פרופיל.
              </span>
            </label>
          ) : (
            <>
              <label className="text-sm">
                כתובת השירות
                <input
                  type="url"
                  dir="ltr"
                  className={input}
                  placeholder="https://alum-market-proxy.example.workers.dev"
                  value={value.endpointUrl}
                  onChange={(e) => onChange({ ...value, endpointUrl: e.target.value })}
                />
              </label>
              <label className="text-sm">
                קוד גישה
                <input
                  type="password"
                  dir="ltr"
                  autoComplete="off"
                  className={input}
                  value={value.accessToken}
                  onChange={(e) => onChange({ ...value, accessToken: e.target.value })}
                />
              </label>
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="px-3 py-1.5 rounded-lg bg-white border text-sm hover:bg-slate-100" onClick={() => void test()}>
              בדיקת חיבור
            </button>
            {status && (
              <span className={`text-sm ${status.tone === "error" ? "text-rose-700" : status.tone === "ok" ? "text-emerald-700" : "text-slate-600"}`} role="status">
                {status.text}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
