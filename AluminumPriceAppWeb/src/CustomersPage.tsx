// FILE: src/CustomersPage.tsx
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Copy, FileText, FolderOpen, MoreVertical, Trash2 } from "lucide-react";
import { Customer, Quote } from "./types";

const fmtCurrency = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
});
const fmtDate = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" });

type CustomersPageProps = {
  customers: Customer[];
  quotes: Quote[];
  onOpenLast: (customerId: string) => void;
  /** Open the folder where PDFs are saved (replaces per-customer export in list) */
  onOpenPdfFolder?: () => void;
  onDeleteCustomer: (customerId: string) => void;
  onDuplicateCustomer: (customerId: string) => void;
};

const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  quotes,
  onOpenLast,
  onOpenPdfFolder,
  onDeleteCustomer,
  onDuplicateCustomer,
}) => {
  const latestMap = useMemo(() => {
    const grouped: Record<string, Quote[]> = {};
    for (const q of quotes) (grouped[q.customerId] ||= []).push(q);
    const latest: Record<string, Quote> = {};
    for (const id in grouped)
      latest[id] = grouped[id].sort((a, b) => b.date - a.date)[0];
    return latest;
  }, [quotes]);

  const sortedCustomers = useMemo(
    () => [...customers].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    [customers]
  );

  return (
    <section className="grid gap-4 min-w-0 w-full">
      <div className="card p-4 sm:p-5 w-full border-slate-200/80 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4 pb-4 mb-1 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 tracking-tight">לקוחות</h2>
            <p className="text-xs text-slate-500 mt-0.5">ניהול לקוחות והצעות אחרונות</p>
          </div>
        </div>

        {/* Mobile: cards */}
        <div className="grid sm:hidden grid-cols-1 gap-3">
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
                      <div className="font-semibold text-slate-900 truncate">{c.name}</div>
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
                </div>
              );
            })
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden sm:block table-scroll mt-1 rounded-xl border border-slate-200/80">
          <table className="table-inner-min w-full text-sm">
            <thead className="bg-slate-50/95 border-b border-slate-200/80">
              <tr>
                <Th>שם</Th>
                <Th>טלפון</Th>
                <Th>אימייל</Th>
                <Th>הצעה אחרונה</Th>
                <Th>סכום אחרון</Th>
                <Th className="w-[1%] whitespace-nowrap">פעולות</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    אין לקוחות עדיין
                  </td>
                </tr>
              ) : (
                sortedCustomers.map((c) => {
                  const last = latestMap[c.id];
                  return (
                    <tr key={c.id} className="bg-white hover:bg-slate-50/70 transition-colors">
                      <Td>{c.name}</Td>
                      <Td>{c.phone ?? ""}</Td>
                      <Td className="max-w-[14rem] truncate" title={c.email ?? undefined}>
                        {c.email ?? ""}
                      </Td>
                      <Td>{last ? fmtDate.format(new Date(last.date)) : ""}</Td>
                      <Td>
                        {last ? fmtCurrency.format(last.totals.grand) : ""}
                      </Td>
                      <Td className="align-middle">
                        <div className="flex justify-end py-0.5">
                          <CustomerRowActions
                            onOpenLast={() => onOpenLast(c.id)}
                            onOpenPdfFolder={onOpenPdfFolder}
                            onDuplicate={() => onDuplicateCustomer(c.id)}
                            onDelete={() => onDeleteCustomer(c.id)}
                          />
                        </div>
                      </Td>
                    </tr>
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

type CustomerRowActionsProps = {
  onOpenLast: () => void;
  onOpenPdfFolder?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
};

function CustomerRowActions({
  onOpenLast,
  onOpenPdfFolder,
  onDuplicate,
  onDelete,
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
      >
        <FileText className="h-4 w-4 shrink-0 opacity-95" aria-hidden />
        <span className="hidden min-[420px]:inline">פתח מסמך</span>
        <span className="min-[420px]:hidden">פתח</span>
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
    <th
      className={`text-right px-3 py-2.5 text-slate-700 font-medium whitespace-nowrap ${className ?? ""}`}
    >
      {children}
    </th>
  );
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td
      className={`text-right px-3 py-2.5 align-top whitespace-nowrap text-slate-800 ${className ?? ""}`}
    >
      {children}
    </td>
  );
}
