import { useState, type ReactNode } from "react";
import type { Availability, RfqLanguage, SupplierProfile } from "../types";
import { dict } from "../i18n";
import { availabilityFor, needsConfirmation } from "../suppliers";
import { parseStrictNumber } from "../units";
import { Btn } from "../ui";

const num = (v: number | null) => (v == null ? "" : String(Math.round(v * 100) / 100));

/**
 * Number field that only reports valid values. While typing, the raw text is kept (so "1." or "" can be
 * typed); on blur it shows the last valid value again.
 */
export function NumberInput({
  value,
  onChange,
  integer,
  allowZero,
  placeholder,
  ariaLabel,
  className = "",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  integer?: boolean;
  allowZero?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? num(value);
  const parse = (t: string): number | null | undefined => {
    if (!t.trim()) return null;
    const n = parseStrictNumber(t);
    if (n == null || (integer && !Number.isInteger(n)) || (allowZero ? n < 0 : n <= 0)) return undefined;
    return n;
  };
  const invalid = draft != null && parse(draft) === undefined;
  return (
    <input
      dir="ltr"
      inputMode={integer ? "numeric" : "decimal"}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={`w-full rounded-md bg-white border px-2 py-1.5 text-sm ${invalid ? "border-rose-400 ring-1 ring-rose-300" : "border-slate-300"} ${className}`}
      value={text}
      onFocus={() => setDraft(num(value))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = parse(e.target.value);
        if (v !== undefined) onChange(v);
      }}
    />
  );
}

const BADGE: Record<Availability, string> = {
  listed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  listed_other_family: "bg-amber-50 text-amber-800 border-amber-200",
  not_verified: "bg-slate-100 text-slate-700 border-slate-300",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300",
  unavailable: "bg-rose-50 text-rose-800 border-rose-200",
};

export function AvailabilityBadge({ lang, availability, title }: { lang: RfqLanguage; availability: Availability; title?: string }) {
  return (
    <span title={title} className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-tight ${BADGE[availability]}`}>
      {dict(lang).availability[availability]}
    </span>
  );
}

/** Availability hint for an option of the selected supplier; nothing when no supplier is selected. */
export function OptionAvailability({
  lang,
  profile,
  optionKey,
  linkKey,
  asked,
  onAsk,
}: {
  lang: RfqLanguage;
  profile: SupplierProfile | undefined;
  optionKey: string;
  linkKey?: string;
  asked: (linkKey: string) => boolean;
  onAsk?: (linkKey: string) => void;
}) {
  if (!profile) return null;
  const { availability, entry } = availabilityFor(profile, optionKey);
  const d = dict(lang);
  const title = entry ? [entry.productFamily, entry.notes, entry.checkedDate].filter(Boolean).join(" · ") : undefined;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <AvailabilityBadge lang={lang} availability={availability} title={title} />
      {linkKey && onAsk && needsConfirmation(availability) ? (
        asked(linkKey) ? (
          <span className="text-[11px] text-emerald-700">✓ {d.q.asked}</span>
        ) : (
          <Btn small variant="ghost" className="!px-1.5 !py-0.5 text-sky-700 underline" onClick={() => onAsk(linkKey)}>
            {d.q.askSupplier}
          </Btn>
        )
      ) : null}
    </span>
  );
}

export function Section({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 p-3 grid gap-3 min-w-0">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {actions ? <div className="flex flex-wrap gap-2 -mt-1">{actions}</div> : null}
      {children}
    </fieldset>
  );
}

/** Multi-choice checkboxes for linking an entry to panels / glass sections. Empty = whole item. */
export function LinkPicker({
  options,
  value,
  onChange,
  wholeLabel,
}: {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  wholeLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" dir="ltr">
      <button
        type="button"
        onClick={() => onChange([])}
        className={`rounded border px-2 py-1 text-xs ${value.length === 0 ? "bg-sky-500 text-white border-sky-500" : "bg-white border-slate-300"}`}
        aria-pressed={value.length === 0}
      >
        {wholeLabel}
      </button>
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={`rounded border px-2 py-1 text-xs ${on ? "bg-sky-500 text-white border-sky-500" : "bg-white border-slate-300"}`}
            aria-pressed={on}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
