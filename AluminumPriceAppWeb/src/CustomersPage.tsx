// FILE: src/CustomersPage.tsx
import React, { useMemo } from "react";
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
  onCreateNewOrder: () => void;
  onExportPdf: (customerId: string) => void;
  onDeleteCustomer: (customerId: string) => void;
};

const CustomersPage: React.FC<CustomersPageProps> = ({
  customers,
  quotes,
  onOpenLast,
  onCreateNewOrder,
  onExportPdf,
  onDeleteCustomer,
}) => {
  const latestMap = useMemo(() => {
    const grouped: Record<string, Quote[]> = {};
    for (const q of quotes) (grouped[q.customerId] ||= []).push(q);
    const latest: Record<string, Quote> = {};
    for (const id in grouped)
      latest[id] = grouped[id].sort((a, b) => b.date - a.date)[0];
    return latest;
  }, [quotes]);

  return (
    <section className="grid gap-4">
      <div className="card p-4 w-full">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-lg font-semibold">לקוחות</h2>
          <button
            className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm hover:opacity-95"
            onClick={onCreateNewOrder}
          >
            הזמנה חדשה
          </button>
        </div>

        {/* Mobile: cards */}
        <div className="grid sm:hidden grid-cols-1 gap-3">
          {customers.length === 0 ? (
            <div className="text-slate-500 text-sm">אין לקוחות עדיין</div>
          ) : (
            customers.map((c) => {
              const last = latestMap[c.id];
              return (
                <div key={c.id} className="rounded-xl border p-3 bg-white">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-slate-600">
                        {last
                          ? `הצעה אחרונה: ${fmtDate.format(
                              new Date(last.date)
                            )} • ${fmtCurrency.format(last.totals.grand)}`
                          : "אין הצעה שמורה"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        className="px-3 py-1.5 rounded-md bg-sky-500 text-white"
                        onClick={() => onOpenLast(c.id)}
                      >
                        פתח הצעה
                      </button>
                      <button
                        className="px-3 py-1.5 rounded-md bg-white border"
                        onClick={() => onExportPdf(c.id)}
                      >
                        ייצוא ל-PDF
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      className="px-3 py-1.5 rounded-md bg-red-600 text-white"
                      onClick={() => onDeleteCustomer(c.id)}
                    >
                      מחיקה
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden sm:block table-scroll mt-2">
          <table className="table-inner-min w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th>שם</Th>
                <Th>טלפון</Th>
                <Th>אימייל</Th>
                <Th>הצעה אחרונה</Th>
                <Th>סכום אחרון</Th>
                <Th>פעולות</Th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">
                    אין לקוחות עדיין
                  </td>
                </tr>
              ) : (
                customers.map((c) => {
                  const last = latestMap[c.id];
                  return (
                    <tr key={c.id} className="border-t">
                      <Td>{c.name}</Td>
                      <Td>{c.phone ?? ""}</Td>
                      <Td>{c.email ?? ""}</Td>
                      <Td>{last ? fmtDate.format(new Date(last.date)) : ""}</Td>
                      <Td>
                        {last ? fmtCurrency.format(last.totals.grand) : ""}
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-2">
                          <button
                            className="px-3 py-1.5 rounded-md bg-sky-500 text-white"
                            onClick={() => onOpenLast(c.id)}
                          >
                            פתח הצעה
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md bg-white border"
                            onClick={() => onExportPdf(c.id)}
                          >
                            ייצוא ל-PDF
                          </button>
                          <button
                            className="px-3 py-1.5 rounded-md bg-red-600 text-white"
                            onClick={() => onDeleteCustomer(c.id)}
                          >
                            מחיקה
                          </button>
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-right px-3 py-2 text-slate-700 font-medium whitespace-nowrap">
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="text-right px-3 py-2 align-top whitespace-nowrap">
      {children}
    </td>
  );
}
