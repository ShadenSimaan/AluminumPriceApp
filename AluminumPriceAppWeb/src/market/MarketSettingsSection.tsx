import React from "react";
import { checkMarketEndpoint } from "./client";
import type { MarketSettings } from "./types";

export default function MarketSettingsSection({ value, onChange }: { value: MarketSettings; onChange: (next: MarketSettings) => void }) {
  const [status, setStatus] = React.useState<{ tone: "ok" | "error" | "info"; text: string } | null>(null);
  const test = async () => {
    setStatus({ tone: "info", text: "בודק חיבור…" });
    try {
      const r = await checkMarketEndpoint(value);
      setStatus(
        r.providerConfigured
          ? { tone: r.provider === "fixture" ? "info" : "ok", text: r.provider === "fixture" ? "מחובר — השרת במצב נתוני בדיקה (fixture), לא חיפוש חי" : "מחובר — ספק החיפוש מוגדר" }
          : { tone: "error", text: "מחובר, אבל מפתח ספק החיפוש חסר בשרת" }
      );
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "החיבור נכשל" });
    }
  };
  return (
    <div className="border rounded-lg p-4 bg-slate-50 border-slate-200">
      <div className="text-base font-semibold text-slate-800 mb-1">בדיקת מחירי שוק</div>
      <div className="text-sm text-slate-600 mb-3">
        כתובת שירות בדיקת המחירים וקוד הגישה של המחשב הזה. מפתח ספק החיפוש נשמר רק בשרת. לחיפוש נשלח מפרט המוצר בלבד — בלי פרטי לקוח ובלי המחירים שלנו.
      </div>
      <div className="grid gap-2">
        <label className="text-sm">
          כתובת השירות
          <input
            type="url"
            dir="ltr"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 bg-white"
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
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 bg-white"
            value={value.accessToken}
            onChange={(e) => onChange({ ...value, accessToken: e.target.value })}
          />
        </label>
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
    </div>
  );
}
