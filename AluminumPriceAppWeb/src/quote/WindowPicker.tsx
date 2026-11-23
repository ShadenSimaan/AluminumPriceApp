import { useMemo, useState } from "react";
import { buildDiagram } from "../rfq/diagram";
import { DiagramSvg } from "../rfq/RfqDiagram";
import RfqItemEditor from "../rfq/RfqItemEditor";
import { dict } from "../rfq/i18n";
import { createRfqItem, OPENING_TYPE_DEFS } from "../rfq/presets";
import { rfqUuid } from "../rfq/rfqState";
import type { RfqItem, RfqOpeningType, SupplierRequest } from "../rfq/types";
import { RFQ_OPENING_TYPES } from "../rfq/types";
import type { Addon, LineItem, Profile } from "../types";
import { lineItemFromWindow, profileOfferLine } from "./windowLine";

type Source = { key: string; label: string; item: RfqItem };

export default function WindowPicker({
  quoteItems,
  requests,
  profiles,
  addons,
  onAdd,
  onClose,
}: {
  quoteItems: LineItem[];
  requests: SupplierRequest[];
  profiles: Profile[];
  addons: Addon[];
  onAdd: (items: LineItem[]) => void;
  onClose: () => void;
}) {
  const saved = useMemo<Source[]>(() => {
    const fromQuote = quoteItems.flatMap((line) =>
      line.configuration ? [{ key: `q-${line.id}`, label: `בהצעה · ${line.configuration.reference || line.profileName || "פריט"}`, item: line.configuration }] : []
    );
    const fromRequests = requests.flatMap((request) =>
      request.items.map((item) => ({
        key: `r-${request.id}-${item.id}`,
        label: `${request.projectName || "בקשה לספק"} · ${item.reference}`,
        item,
      }))
    );
    return [...fromQuote, ...fromRequests];
  }, [quoteItems, requests]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState(saved[0]?.key ?? "");
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? "");
  const [includeAllProfiles, setIncludeAllProfiles] = useState(false);
  const [editing, setEditing] = useState<RfqItem | null>(null);
  const sources = saved;
  const current = sources.find((source) => source.key === focused)?.item ?? sources[0]?.item;
  const preview = current
    ? buildDiagram(current, { width: 320, height: 240, customPlaceholder: "שרטוט מצורף", showDivisionDims: current.openingType !== "custom" })
    : null;
  const d = dict("he");
  const chosen = sources.filter((source) => checked.has(source.key));

  const toggle = (key: string) => {
    setFocused(key);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const windowLine = (cfg: RfqItem, profile: Profile | undefined) =>
    lineItemFromWindow(cfg, addons, {
      profileId: profile?.id,
      profileName: profile?.name || cfg.frameFinish,
      unitPrice: profile ? String(profile.unitPrice) : "0",
      priceBasis: profile ? "per_m2" : "per_unit",
    });

  const addSelected = () => {
    const profile = profiles.find((entry) => entry.id === profileId);
    const lines = chosen.map((source) => windowLine(source.item, profile));
    if (includeAllProfiles) lines.push(...profiles.map((entry) => profileOfferLine(entry, addons)));
    if (!lines.length) return;
    onAdd(lines);
  };

  if (editing) {
    return (
      <div className="fixed inset-0 z-50 bg-white overflow-auto p-4" dir="rtl">
        <RfqItemEditor
          initial={editing}
          isNew
          lang="he"
          otherReferences={quoteItems.flatMap((line) => (line.configuration ? [line.configuration.reference] : []))}
          profile={undefined}
          askedKeys={[]}
          confirm={async (message) => window.confirm(message)}
          onCancel={() => setEditing(null)}
          saveLabel="הוסף להצעה"
          onSave={(item) => {
            const profile = profiles.find((entry) => entry.id === profileId);
            const lines = [windowLine(item, profile)];
            if (includeAllProfiles) lines.push(...profiles.map((entry) => profileOfferLine(entry, addons)));
            onAdd(lines);
            onClose();
          }}
        />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-5xl w-full my-6 p-4" dir="rtl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="text-xl font-semibold">בחירת חלונות ודלתות</h2>
          <div className="flex gap-2">
            <button type="button" className="px-3 py-1.5 rounded border" onClick={onClose}>סגירה</button>
          </div>
        </div>
        <div className="grid lg:grid-cols-[1fr_320px] gap-4">
          <div>
            <div className="flex items-center justify-between gap-2 mb-2 text-sm">
              <span className="text-slate-600">{chosen.length} נבחרו</span>
              <button
                type="button"
                className="text-sky-700"
                onClick={() => setChecked(checked.size === sources.length ? new Set() : new Set(sources.map((source) => source.key)))}
                disabled={!sources.length}
              >
                {checked.size === sources.length && sources.length > 0 ? "נקה בחירה" : "בחר הכל"}
              </button>
            </div>
            <div className="grid gap-2 max-h-[50vh] overflow-auto">
              {sources.length === 0 && <p className="text-sm text-slate-500">אין עדיין חלונות שמורים. אפשר לייבא קובץ ליד פריטי ההצעה, או להגדיר חלון חדש.</p>}
              {sources.map((source) => (
                <label
                  key={source.key}
                  className={`flex items-center gap-2 text-right rounded-lg border px-3 py-2 cursor-pointer ${focused === source.key ? "border-sky-500 bg-sky-50" : ""}`}
                >
                  <input type="checkbox" checked={checked.has(source.key)} onChange={() => toggle(source.key)} />
                  <button type="button" className="flex-1 text-right" onClick={() => setFocused(source.key)}>
                    {source.label}
                  </button>
                </label>
              ))}
            </div>
          </div>
          <div>
            {preview ? <DiagramSvg spec={preview} className="w-full h-auto border rounded-lg" /> : <div className="h-48 border border-dashed rounded-lg" />}
            <p className="text-xs text-slate-500 text-center mt-1">מבט חזית מחוץ למבנה</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            פרופיל ומחיר למ״ר לחלונות שנבחרו
            <select className="border rounded px-2 py-1.5" value={profileId} onChange={(event) => setProfileId(event.target.value)}>
              <option value="">בלי מחירון — מחיר ליחידה ייקבע אחר כך</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name} · {profile.unitPrice}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm max-w-md">
            <input type="checkbox" checked={includeAllProfiles} onChange={(event) => setIncludeAllProfiles(event.target.checked)} disabled={!profiles.length} />
            <span>הוסף את כל הפרופילים להצעת המחיר{profiles.length ? ` (${profiles.length})` : " — אין פרופילים במחירון"}</span>
          </label>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-sky-600 text-white disabled:opacity-40"
            disabled={!chosen.length && !(includeAllProfiles && profiles.length)}
            onClick={addSelected}
          >
            הוסף להצעה
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">כל פרופיל נכנס כשורה עם המחיר למ״ר. השורה לא משנה את הסיכום עד שמזינים לה מידות.</p>
        <div className="mt-4">
          <h3 className="font-medium mb-2">הגדרה חדשה</h3>
          <div className="flex flex-wrap gap-2">
            {RFQ_OPENING_TYPES.map((opening) => {
              const sample = createRfqItem({ id: "preview", openingType: opening as RfqOpeningType, unit: "cm", reference: "" });
              const thumb = buildDiagram(sample, { width: 120, height: 90, customPlaceholder: "?", showDimensions: false, showReference: false });
              return (
                <button
                  key={opening}
                  type="button"
                  className="w-36 rounded-lg border p-2 text-xs hover:border-sky-500"
                  onClick={() =>
                    setEditing(
                      createRfqItem({
                        id: rfqUuid(),
                        openingType: opening,
                        unit: "cm",
                        reference: nextRef(opening, quoteItems.flatMap((line) => (line.configuration ? [line.configuration.reference] : []))),
                        withDefaultSize: true,
                      })
                    )
                  }
                >
                  <DiagramSvg spec={thumb} className="w-full h-auto" />
                  <span className="block mt-1">{d.openingType[opening]}</span>
                  <span className="block text-slate-400">{OPENING_TYPE_DEFS[opening].defaultPanels().length} חלקים</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function nextRef(opening: RfqOpeningType, usedReferences: string[]): string {
  const prefix = opening.includes("door") ? "D" : "W";
  const used = new Set(usedReferences);
  let n = 1;
  while (used.has(`${prefix}-${String(n).padStart(2, "0")}`)) n += 1;
  return `${prefix}-${String(n).padStart(2, "0")}`;
}
