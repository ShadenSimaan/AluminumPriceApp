import React, { useEffect } from "react";

/**
 * `group` must be set when the children are buttons/radios: a <label> forwards clicks on its text to the
 * first button inside, which would silently change the selection.
 */
export function Field({
  label,
  hint,
  error,
  children,
  className = "",
  group,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  group?: boolean;
}) {
  const body = (
    <>
      <span className="text-sm text-slate-700">{label}</span>
      {children}
      {error ? <span className="text-xs text-rose-600">{error}</span> : hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
    </>
  );
  return group ? (
    <div role="group" className={`grid gap-1 min-w-0 content-start ${className}`}>
      {body}
    </div>
  ) : (
    <label className={`grid gap-1 min-w-0 content-start ${className}`}>{body}</label>
  );
}

const inputCls = (invalid?: boolean) =>
  `w-full rounded-md bg-white border px-3 py-2 text-base ${invalid ? "border-rose-400 ring-1 ring-rose-300" : "border-slate-300"}`;

export function TextInput({
  value,
  onChange,
  invalid,
  dir = "auto",
  ...rest
}: { value: string; onChange: (v: string) => void; invalid?: boolean; dir?: "auto" | "ltr" | "rtl" } & Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "dir"
>) {
  return <input {...rest} dir={dir} className={inputCls(invalid)} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  invalid?: boolean;
}) {
  return <textarea dir="auto" rows={rows} className={inputCls(invalid)} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  invalid,
  ariaLabel,
}: {
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T | ""; label: string; disabled?: boolean }[];
  invalid?: boolean;
  ariaLabel?: string;
}) {
  return (
    <select aria-label={ariaLabel} className={inputCls(invalid)} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value || "_empty"} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Two-to-four choice toggle. `dir="ltr"` keeps physical left/right choices in physical order. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  dir,
}: {
  value: T | undefined;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  dir?: "ltr" | "rtl";
}) {
  return (
    <div dir={dir} className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 gap-0.5 flex-wrap">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md text-sm ${value === o.value ? "bg-sky-500 text-white" : "hover:bg-slate-100 text-slate-700"}`}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "danger" | "success" | "ghost";
const btnCls: Record<BtnVariant, string> = {
  primary: "bg-sky-500 text-white hover:opacity-95",
  secondary: "bg-white border border-slate-300 text-slate-800 hover:bg-slate-50",
  danger: "bg-red-600 text-white hover:opacity-95",
  success: "bg-emerald-600 text-white hover:opacity-95",
  ghost: "text-slate-700 hover:bg-slate-100",
};

export function Btn({
  variant = "secondary",
  small,
  className = "",
  ...rest
}: { variant?: BtnVariant; small?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...rest}
      className={`${small ? "px-2.5 py-1 text-xs" : "px-3 py-2 text-sm"} rounded-lg disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 ${btnCls[variant]} ${className}`}
    />
  );
}

export function Card({ title, actions, children, className = "" }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card p-4 w-full ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          {title ? <h2 className="text-xl font-semibold">{title}</h2> : <span />}
          {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function RfqModal({
  title,
  onClose,
  children,
  footer,
  dir,
  wide,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dir: "ltr" | "rtl";
  wide?: boolean;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      {/* .modal-panel's max-height uses the unitless --vh, which makes the calc invalid. */}
      <div
        dir={dir}
        className="modal-panel card"
        style={{
          width: wide ? "min(calc(100vw - 16px), 76rem)" : undefined,
          maxHeight: "calc(100dvh - 16px)",
        }}
      >
        <div className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0">
          <h3 className="text-base font-semibold min-w-0 truncate">{title}</h3>
          <button className="px-3 py-1.5 rounded-md bg-white border hover:bg-slate-50 shrink-0" onClick={onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="modal-body flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto overscroll-contain">{children}</div>
        {footer ? <div className="p-3 border-t flex flex-wrap gap-2 justify-end shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}
