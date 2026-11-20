import { useState } from "react";
import { windowImportChatPrompt, windowImportSampleCsv } from "./windowImport";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

/** Shows the CSV layout before a file is chosen, and copies a ChatGPT prompt for that layout. */
export default function WindowImportNote({ profileNames }: { profileNames: string[] }) {
  const [copied, setCopied] = useState(false);
  const sample = windowImportSampleCsv(profileNames);

  return (
    <div className="mb-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-slate-800">
          לפני בחירת הקובץ: השורה הראשונה היא הכותרת, וכל שורה אחריה היא חלון או דלת. הרוחב והגובה בס״מ.
        </p>
        <button
          type="button"
          className="shrink-0 px-3 py-1.5 rounded-lg border border-sky-300 bg-white text-sky-800 hover:bg-sky-100"
          onClick={() => {
            void copyText(windowImportChatPrompt(profileNames)).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2500);
            });
          }}
        >
          {copied ? "ההנחיה הועתקה" : "העתק הנחיה ל-ChatGPT"}
        </button>
      </div>
      <pre dir="ltr" className="mt-2 overflow-x-auto rounded border border-sky-100 bg-white p-2 text-xs leading-5 text-slate-800">
        {sample}
      </pre>
      <p className="mt-2 text-xs text-slate-600">
        ההעתקה כוללת את הפורמט ואת שמות הפרופילים מהמחירון. הדבק אותה בצ׳אט, ואחריה את הרשימה הגולמית.
      </p>
    </div>
  );
}
