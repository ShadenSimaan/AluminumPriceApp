// FILE: src/CustomersPage.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp, Copy, FileText, FolderOpen, MoreVertical, Trash2, Upload } from "lucide-react";
import { Customer, Quote, documentTypeLabel } from "./types";
import type { DraftRow } from "./customers/customerImport";

const CustomerImportDialog = React.lazy(() => import("./customers/CustomerImportDialog"));

const fmtCurrency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
});
const fmtDate = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" });
const fmtDateTime = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium", timeStyle: "short" });

type CustomersPageProps = {
  customers: Customer[];
  quotes: Quote[];
  /** Saved quote currently open in the הצעה tab */
  openQuoteId?: string;
  onOpenLast: (customerId: string) => void;
  onOpenQuote: (quoteId: string) => void;
  onDeleteQuote: (quoteId: string) => void;
  /** Open the folder where PDFs are saved (replaces per-customer export in list) */
  onOpenPdfFolder?: () => void;
  onDeleteCustomer: (customerId: string) => void;
  onDuplicateCustomer: (customerId: string) => void;
  onImportCustomers: (rows: DraftRow[]) => void;
};

const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  quotes,
  openQuoteId,
  onOpenLast,
  onOpenQuote,
  onDeleteQuote,
  onOpenPdfFolder,
  onDeleteCustomer,
  onDuplicateCustomer,
  onImportCustomers,
}) => {
  const [importOpen, setImportOpen] = useState(false);
  const quotesByCustomer = useMemo(() => {
    const grouped: Record<string, Quote[]> = {};
    for (const q of quotes) (grouped[q.customerId] ||= []).push(q);
    for (const id in grouped) grouped[id] = [...grouped[id]].sort((a, b) => b.date - a.date);
    return grouped;
  }, [quotes]);
  const latestMap = useMemo(() => {
    const latest: Record<string, Quote> = {};
    for (const id in quotesByCustomer) latest[id] = quotesByCustomer[id][0];
    return latest;
  }, [quotesByCustomer]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpanded = (customerId: string) =>
    setExpandedId((cur) => (cur === customerId ? null : customerId));

  const sortedCustomers = useMemo(
    () =>
      [...customers].sort((a, b) => {
        const latestA = latestMap[a.id]?.date ?? 0;
        const latestB = latestMap[b.id]?.date ?? 0;
        if (latestB !== latestA) return latestB - latestA;
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
      }),
    [customers, latestMap]
  );

  return (
    <section className="grid gap-4 min-w-0 w-full max-w-full">
      <div className="card p-4 sm:p-5 w-full min-w-0 max-w-full border-slate-200/80 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-1 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">לקוחות</h2>
            <p className="text-xs text-slate-500 mt-0.5">ניהול לקוחות והצעות אחרונות</p>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center gap-1.5 shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setImportOpen(true)}
            title="ייבוא לקוחות מקובץ CSV / Excel / אנשי קשר"
          >
            <Upload className="h-4 w-4 shrink-0" aria-hidden />
            ייבוא לקוחות
          </button>
        </div>
        {importOpen && (
          <React.Suspense fallback={null}>
            <CustomerImportDialog
              customers={customers}
              onClose={() => setImportOpen(false)}
              onImport={(rows) => {
                onImportCustomers(rows);
                setImportOpen(false);
              }}
            />
          </React.Suspense>
        )}

        {/* Narrow and medium windows: stacked cards so nothing is clipped */}
        <div className="grid lg:hidden grid-cols-1 gap-3">
          {sortedCustomers.length === 0 ? (
            <div className="text-slate-500 text-sm">אין לקוחות עדיין</div>
          ) : (
            sortedCustomers.map((c) => {
              const last = latestMap[c.id];
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-slate-200/90 p-4 bg-gradient-to-br from-white to-slate-50/40 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900 break-words">{c.name}</div>
                      {(c.phone || c.email) && (
                        <div className="mt-1 grid gap-0.5 text-sm text-slate-600">
                          {c.phone ? (
                            <span dir="ltr" className="text-right">
                              {c.phone}
                            </span>
                          ) : null}
                          {c.email ? (
                            <span dir="ltr" className="text-right break-all">
                              {c.email}
                            </span>
                          ) : null}
                        </div>
                      )}
                      <div className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {last
                          ? `הצעה אחרונה: ${fmtDate.format(
                              new Date(last.date)
                            )} • ${fmtCurrency.format(last.totals.grand)}`
                          : "אין הצעה שמורה"}
                      </div>
                    </div>
                    <CustomerRowActions
                      onOpenLast={() => onOpenLast(c.id)}
                      onOpenPdfFolder={onOpenPdfFolder}
                      onDuplicate={() => onDuplicateCustomer(c.id)}
                      onDelete={() => onDeleteCustomer(c.id)}
                    />
                  </div>
                  <QuotesToggle
                    count={quotesByCustomer[c.id]?.length ?? 0}
                    expanded={expandedId === c.id}
                    onToggle={() => toggleExpanded(c.id)}
                    className="mt-3"
                  />
                  {expandedId === c.id && (
                    <CustomerQuotesList
                      quotes={quotesByCustomer[c.id] ?? []}
                      openQuoteId={openQuoteId}
                      onOpen={onOpenQuote}
                      onDelete={onDeleteQuote}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Wide windows: table that stays inside the card */}
        <div className="hidden lg:block table-scroll mt-1 rounded-xl border border-slate-200/80">
          <table className="table-customers text-sm">
            <thead className="bg-slate-50/95 border-b border-slate-200/80">
              <tr>
                <Th className="col-flex">שם</Th>
                <Th className="col-fit">טלפון</Th>
                <Th className="col-ellipsis">אימייל</Th>
                <Th className="col-fit">הצעות שמורות</Th>
                <Th className="col-fit">הצעה אחרונה</Th>
                <Th className="col-fit">סכום אחרון</Th>
                <Th className="col-fit">פעולות</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    אין לקוחות עדיין
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((c) => {
                  const last = latestMap[c.id];
                  const expanded = expandedId === c.id;
                  return (
                    <React.Fragment key={c.id}>
                    <tr className="bg-white hover:bg-slate-50/70 transition-colors">
                      <Td className="col-flex">{c.name}</Td>
                      <Td className="col-fit" dir="ltr">
                        {c.phone ?? ""}
                      </Td>
                      <Td className="col-ellipsis" dir="ltr" title={c.email ?? undefined}>
                        {c.email ?? ""}
                      </Td>
                      <Td className="col-fit">
                        <QuotesToggle
                          count={quotesByCustomer[c.id]?.length ?? 0}
                          expanded={expanded}
                          onToggle={() => toggleExpanded(c.id)}
                        />
                      </Td>
                      <Td className="col-fit">{last ? fmtDate.format(new Date(last.date)) : ""}</Td>
                      <Td className="col-fit">
                        {last ? fmtCurrency.format(last.totals.grand) : ""}
                      </Td>
                      <Td className="col-fit align-middle">
                        <div className="flex justify-end py-0.5">
                          <CustomerRowActions
                            compact
                            onOpenLast={() => onOpenLast(c.id)}
                            onOpenPdfFolder={onOpenPdfFolder}
                            onDuplicate={() => onDuplicateCustomer(c.id)}
                            onDelete={() => onDeleteCustomer(c.id)}
                          />
                        </div>
                      </Td>
                    </tr>
                    {expanded && (
                      <tr className="bg-slate-50/60">
                        <td colSpan={7} className="px-3 pb-3">
                          <CustomerQuotesList
                            quotes={quotesByCustomer[c.id] ?? []}
                            openQuoteId={openQuoteId}
                            onOpen={onOpenQuote}
                            onDelete={onDeleteQuote}
                          />
                        </td>
                      </tr>
                    )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
};

export default CustomersPage;

function QuotesToggle({
  count,
  expanded,
  onToggle,
  className,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (count === 0) return <span className={`text-xs text-slate-400 ${className ?? ""}`}>אין</span>;
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 ${className ?? ""}`}
      onClick={onToggle}
      aria-expanded={expanded}
    >
      {count === 1 ? "הצעה אחת" : `${count} הצעות`}
      {expanded ? (
        <ChevronUp className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
      )}
    </button>
  );
}

function CustomerQuotesList({
  quotes,
  openQuoteId,
  onOpen,
  onDelete,
}: {
  quotes: Quote[];
  openQuoteId?: string;
  onOpen: (quoteId: string) => void;
  onDelete: (quoteId: string) => void;
}) {
  return (
    <ul className="mt-2 grid gap-2 whitespace-normal">
      {quotes.map((q) => {
        const isPaymentRequest = q.documentType === "payment_request";
        const itemCount = (q.items?.length ?? 0) + (q.freeFormAdditions?.length ?? 0);
        return (
          <li
            key={q.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"
          >
            <div className="min-w-0 text-sm text-slate-800">
              <span className="font-medium">
                {documentTypeLabel(q.documentType)}
                {isPaymentRequest && q.documentNumber
                  ? ` מס׳ ${String(q.documentNumber).padStart(4, "0")}`
                  : ""}
              </span>
              <span className="text-slate-500">
                {" • "}
                {fmtDateTime.format(new Date(q.date))}
                {" • "}
                {itemCount === 1 ? "פריט אחד" : `${itemCount} פריטים`}
                {" • "}
                {fmtCurrency.format(q.totals?.grand ?? 0)}
              </span>
              {q.id === openQuoteId && (
                <span className="mr-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-800">
                  פתוח כעת
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-sm font-medium text-white hover:bg-sky-600"
                onClick={() => onOpen(q.id)}
              >
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                פתח
              </button>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50"
                onClick={() => onDelete(q.id)}
                aria-label="מחיקת הצעה"
                title="מחיקת הצעה"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type CustomerRowActionsProps = {
  onOpenLast: () => void;
  onOpenPdfFolder?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Shorter label so the actions column fits beside the other fields */
  compact?: boolean;
};

function CustomerRowActions({
  onOpenLast,
  onOpenPdfFolder,
  onDuplicate,
  onDelete,
  compact = false,
}: CustomerRowActionsProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const closeMenu = () => setOpen(false);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPos(null);
      return;
    }
    const updatePos = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      const menuWidth = 200;
      const gap = 6;
      // Align to the end of the trigger
      let left = rect.right - menuWidth;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));
      let top = rect.bottom + gap;
      const estimatedHeight = onOpenPdfFolder ? 140 : 100;
      if (top + estimatedHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - estimatedHeight - gap);
      }
      setMenuPos({ top, left });
    };
    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open, onOpenPdfFolder]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[100] min-w-[12.5rem] overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-lg shadow-slate-900/10 ring-1 ring-black/[0.04]"
            style={{ top: menuPos.top, left: menuPos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            {onOpenPdfFolder && (
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-right"
                onClick={() => {
                  onOpenPdfFolder();
                  closeMenu();
                }}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
                תיקיית PDF
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 text-right"
              title="לקוח חדש עם אותם פרטי קשר והעתקת כל ההצעות השמורות ללקוח המקורי"
              onClick={() => {
                onDuplicate();
                closeMenu();
              }}
            >
              <Copy className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
              שכפול לקוח
            </button>
            <div className="my-0.5 h-px bg-slate-100" />
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 text-right"
              onClick={() => {
                onDelete();
                closeMenu();
              }}
            >
              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
              מחיקה
            </button>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
      <button
        type="button"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-500 px-3 text-sm font-medium text-white shadow-sm shadow-sky-500/25 hover:bg-sky-600 transition-colors"
        onClick={onOpenLast}
        title="פתח מסמך"
      >
        <FileText className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
        {compact ? "פתח" : "פתח מסמך"}
      </button>

      <button
        ref={triggerRef}
        type="button"
        className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 transition-colors"
        aria-label="עוד פעולות"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="h-4 w-4" aria-hidden />
      </button>
      {menu}
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`text-right px-2 py-2.5 text-slate-700 font-medium align-bottom ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({
  children,
  className,
  title,
  dir,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <td
      title={title}
      dir={dir}
      className={`text-right px-2 py-2.5 align-middle text-slate-800 ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
