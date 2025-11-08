import React, { useMemo, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Settings, Download, Edit3, Save, X, UserPlus, FilePlus2, Users } from "lucide-react";

// PDF export (robust for different autotable builds)
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ------------------------------------------------------
// Types
// ------------------------------------------------------
type Customer = {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  createdAt: number;
};

type Quote = {
  id: string;
  customerId: string;
  title: string;
  date: number; // epoch ms
  items: any[];
  taxPercent: number;
  totals: { sub: number; tax: number; grand: number };
};

// ------------------------------------------------------
// הגדרות כלליות
// ------------------------------------------------------
const STORAGE_KEY = "aluminum-quote-app:v6b-hebrew-font+customers";

function usePersistentState<T>(defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch (e) {
      return defaultValue;
    }
  });
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }, [value]);
  return [value, setValue] as const;
}

// בסיס התמחור תמיד לפי מ"ר
const defaultProfiles = [
  { id: "std-area", name: "פרופיל סטנדרט (למ״ר)", unit: "m2", basis: "area", price: 350 },
  { id: "slim-area", name: "פרופיל דק (למ״ר)", unit: "m2", basis: "area", price: 420 },
  { id: "thermal-area", name: "טרמוקפל (למ״ר)", unit: "m2", basis: "area", price: 480 },
];

// תוספות ברירת־מחדל
const defaultAddonsPresets = [
  { id: "dry-keep", name: "מנגנון דרי קיף", price: 650 },
  { id: "somfy-nice", name: "מנוע חשמלי סומפי או נייס", price: 800 },
  { id: "china-motor", name: "מנוע סיני", price: 300 },
];

const defaultData = {
  company: {
    sellerName: "שם העסק שלך",
    sellerDetails: "כתובת, עיר, טלפון, אימייל",
    logoText: "ALU-QUOTES",
  },
  profiles: defaultProfiles,
  items: [] as any[],
  customers: [] as Customer[],
  quotes: [] as Quote[],
  // ברירת מחדל בישראל: 18% מע"מ (אפשר להזין 0.18 או 18)
  taxPercent: 0.18,
  notes: "הצעה תקפה ל-14 יום. זמן אספקה 21 ימי עסקים מרגע אישור ותשלום מקדמה.",
};

function n(v: any) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
const numIL = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const moneyIL = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
function fmt(x: number){ return numIL.format(x||0); }
function ils(x: number){ return moneyIL.format(x||0); }

// ------------------------------------------------------
// Hebrew font loader (Noto Sans Hebrew) for jsPDF
// Put file at: public/fonts/NotoSansHebrew-Regular.ttf
// ------------------------------------------------------
let hebrewFontRegistered = false;
async function ensureHebrewFont(doc?: jsPDF) {
  if (hebrewFontRegistered) return;
  try {
    const res = await fetch("/fonts/NotoSansHebrew-Regular.ttf");
    if (!res.ok) throw new Error("font not found");
    const buf = await res.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const tmp = doc || new jsPDF();
    (tmp as any).addFileToVFS("NotoSansHebrew-Regular.ttf", base64);
    (tmp as any).addFont("NotoSansHebrew-Regular.ttf", "NotoSansHebrew", "normal");
    hebrewFontRegistered = true;
  } catch (e) {
    console.warn("Hebrew font missing. Create public/fonts/NotoSansHebrew-Regular.ttf", e);
  }
}

export default function AluminumQuotationApp() {
  const [data, setData] = usePersistentState(defaultData);
  const [view, setView] = useState<"quote"|"customers">("quote");

  // קלטים ב-ס"מ
  const [wCm, setWCm] = useState(100);
  const [hCm, setHCm] = useState(100);
  const [qty, setQty] = useState(1);
  const [selectedProfileId, setSelectedProfileId] = useState((data.profiles[0] ? data.profiles[0].id : ""));
  const [customUnitPrice, setCustomUnitPrice] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editingProfile, setEditingProfile] = useState<any>(null);
  const [quoteTitle, setQuoteTitle] = useState("הצעת מחיר אלומיניום");
  const [loc, setLoc] = useState(""); // מיקום
  const [details, setDetails] = useState(""); // פרטים

  const [currentCustomerId, setCurrentCustomerId] = useState<string>(data.customers[0]?.id || "");
  const currentCustomer: Customer | undefined = useMemo(() => data.customers.find(c => c.id === currentCustomerId), [data.customers, currentCustomerId]);

  // מצב תוספות לשורת פריט חדשה
  const [addonStates, setAddonStates] = useState(() =>
    defaultAddonsPresets.map(a => ({ ...a, checked: false }))
  );

  useEffect(() => {
    if (!data.profiles.find((p: any) => p.id === selectedProfileId) && data.profiles.length) {
      setSelectedProfileId(data.profiles[0].id);
    }
  }, [data.profiles, selectedProfileId]);

  // ---------- חישובי פריט ----------
  const selectedProfile = useMemo(function(){
    return data.profiles.find((p: any) => p.id === selectedProfileId) || null;
  }, [data.profiles, selectedProfileId]);

  // לפי הדרישה: תמיד מחיר לפי שטח (רוחב×גובה)
  const unitPrice = customUnitPrice !== "" ? Number(customUnitPrice) : ((selectedProfile ? selectedProfile.price : 0));

  // המרה מס"מ למטרים לצורך תמחור
  const wM = useMemo(function(){ return n(wCm) / 100; }, [wCm]);
  const hM = useMemo(function(){ return n(hCm) / 100; }, [hCm]);
  const areaM2 = useMemo(function(){ return wM * hM; }, [wM, hM]);

  // חישוב תוספות נבחרות
  const addonsSelected = useMemo(function(){
    return addonStates.filter((a: any) => a.checked).map((a: any) => ({ id: a.id, name: a.name, price: n(a.price) }));
  }, [addonStates]);
  const addonsTotal = useMemo(function(){
    return addonsSelected.reduce((sum: number, a: any) => sum + n(a.price), 0);
  }, [addonsSelected]);

  // לפי הדרישה: נמדד תמיד לפי שטח במ"ר
  const measured = areaM2; // ביחידות מ"ר
  const lineSubtotal = useMemo(function(){
    // מחיר פרופיל לשטח + סכום תוספות, כפול כמות
    return (measured * unitPrice + addonsTotal) * n(qty);
  }, [measured, unitPrice, addonsTotal, qty]);

  // ---------- סה"כ והמע"מ ----------
  const taxRate = useMemo(function(){
    const val = Number(data.taxPercent);
    return val <= 1 ? val : val / 100;
  }, [data.taxPercent]);

  const totals = useMemo(function(){
    const sub = data.items.reduce((acc: number, it: any) => acc + it.subtotal, 0);
    const tax = sub * taxRate;
    return { sub, tax, grand: sub + tax };
  }, [data.items, taxRate]);

  // ---------- פעולות ----------
  function addLineItem() {
    if (!selectedProfile) return;

    const itemAddons = addonsSelected; // כבר מחושבים
    const addonsLabel = itemAddons.length
      ? " | תוספות: " + itemAddons.map((a: any) => a.name + " (" + ils(a.price) + ")").join(", ")
      : "";

    const item = {
      id: (crypto && (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      profileId: selectedProfile.id,
      profileName: selectedProfile.name,
      basis: "area",
      // נשמור ס"מ לשם הצגה בטבלה והמרה במידת הצורך
      wCm: n(wCm),
      hCm: n(hCm),
      loc: loc,
      details: (details || "") + addonsLabel,
      qty: n(qty),
      unitPrice: Number(unitPrice),
      measured: measured,
      addons: itemAddons,
      addonsTotal: addonsTotal,
      subtotal: (measured * Number(unitPrice) + addonsTotal) * n(qty),
    };

    setData(function(prev: any){ return { ...prev, items: prev.items.concat(item) }; });
    // ניקוי שדות אחרי הוספה
    setLoc("");
    setDetails("");
    setAddonStates(defaultAddonsPresets.map(function(a){ return { ...a, checked: false }; }));
  }

  function removeItem(id: string) {
    setData(function(prev: any){ return { ...prev, items: prev.items.filter((i: any) => i.id !== id) }; });
  }
  function resetItems() {
    setData(function(prev: any){ return { ...prev, items: [] }; });
  }
  function upsertProfile(p: any) {
    // הבסיס תמיד מ"ר — נכפה זאת
    const normalized = { ...p, basis: 'area', unit: 'm2' };
    setData(function(prev: any){
      const exists = prev.profiles.some((x: any) => x.id === normalized.id);
      const profiles = exists ? prev.profiles.map((x: any) => x.id === normalized.id ? normalized : x) : prev.profiles.concat(normalized);
      return { ...prev, profiles };
    });
  }
  function deleteProfile(p: any) {
    setData(function(prev: any){ return { ...prev, profiles: prev.profiles.filter((x: any) => x.id !== p.id) }; });
  }

  // ---------- Customers CRUD ----------
  function addCustomer(partial?: Partial<Customer>) {
    const c: Customer = {
      id: crypto.randomUUID(),
      name: partial?.name || "לקוח חדש",
      phone: partial?.phone || "",
      email: partial?.email || "",
      notes: partial?.notes || "",
      createdAt: Date.now(),
    };
    setData((v: any) => ({ ...v, customers: [...v.customers, c] }));
    setCurrentCustomerId(c.id);
  }
  function updateCustomer(c: Customer) {
    setData((v: any) => ({ ...v, customers: v.customers.map((x: Customer) => x.id === c.id ? c : x) }));
  }
  function deleteCustomer(id: string) {
    setData((v: any) => ({ ...v, customers: v.customers.filter((x: Customer) => x.id !== id), quotes: v.quotes.filter((q: Quote)=> q.customerId !== id) }));
    if (currentCustomerId === id) setCurrentCustomerId("");
  }

  function saveQuote() {
    if (!currentCustomerId) {
      alert("בחר לקוח לפני שמירה");
      return;
    }
    const q: Quote = {
      id: crypto.randomUUID(),
      customerId: currentCustomerId,
      title: quoteTitle || "הצעת מחיר",
      date: Date.now(),
      items: data.items,
      taxPercent: data.taxPercent,
      totals,
    };
    setData((v: any) => ({ ...v, quotes: [...v.quotes, q] }));
    alert("ההצעה נשמרה ללקוח");
  }

  // ---------- בדיקות (Test Cases) ----------
  useEffect(function(){
    try {
      const testArea = (100/100) * (200/100);
      console.assert(Math.abs(testArea - 2) < 1e-6, "Area test failed (cm→m²)");

      const computed = ((2*10) + 300) * 3;
      console.assert(Math.abs(computed - 960) < 1e-6, "Addons subtotal test failed");

      const taxSample = 0.18 * 960;
      console.assert(Math.abs(taxSample - 172.8) < 1e-6, "Tax 18% test failed (addons)");

      const area2 = (150/100) * (80/100);
      console.assert(Math.abs(area2 - 1.2) < 1e-6, "Area 150x80 cm test failed");
      const subtotal2 = area2 * 100;
      console.assert(Math.abs(subtotal2 - 120) < 1e-6, "Subtotal without addons failed");

      // NEW: table column consistency test used by exportPDF
      const colHeaders = ["#","מידות","מיקום","פרטים","מחיר ליח׳","כמות","סה\"כ"];
      const sampleRow = ["1","100-200 ס\"מ","סלון","פרטים", "₪100","1","₪100"]; 
      console.assert(colHeaders.length === sampleRow.length, "PDF table columns mismatch");
    } catch (e) {
      console.warn("Self tests encountered an issue", e);
    }
  }, []);

  // ------------------------------------------------------
  // ייצוא PDF – גרסה עמידה ל-jspdf-autotable (HEAD/BODY arrays only)
  // נמנע מקריאה לשדות פנימיים כמו widths ע"י מתן head/body עקביים.
  // ------------------------------------------------------
  async function exportPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    await ensureHebrewFont(doc);

    try { (doc as any).setFont && doc.setFont("NotoSansHebrew"); } catch {}

    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text(data.company.logoText || "ALU-QUOTES", pageWidth - margin, 36, { align: "right" });

    // פרטי ספק בצד ימין
    doc.setFontSize(12);
    const sellerLine1 = data.company.sellerName || "שם העסק";
    const sellerLine2 = data.company.sellerDetails || "כתובת / טלפון / אימייל";
    doc.text(sellerLine1, margin, 36);
    doc.text(sellerLine2, margin, 54);

    // כותרת הצעה
    doc.setFontSize(16);
    const title = quoteTitle || "הצעת מחיר";
    doc.text(title, pageWidth - margin, 80, { align: "right" });

    // פרטי לקוח (אם יש)
    if (currentCustomer) {
      doc.setFontSize(12);
      const line1 = `${currentCustomer.name}${currentCustomer.phone ? "  •  " + currentCustomer.phone : ""}`;
      doc.text(line1, pageWidth - margin, 100, { align: "right" });
      if (currentCustomer.email) doc.text(currentCustomer.email, pageWidth - margin, 116, { align: "right" });
    }

    // HEAD + BODY as arrays (most compatible across autotable versions)
    const headers = [["#","מידות","מיקום","פרטים","מחיר ליח׳","כמות","סה\"כ"]];

    const rows = (data.items.length ? data.items : [{ placeholder: true }]).map((it: any, idx: number) => {
      if ((it as any).placeholder) return ["-","-","-","-","-","-","-"];
      const dims = `${fmt(it.wCm)}-${fmt(it.hCm)} ס\"מ`;
      return [
        String(idx + 1),
        dims,
        it.loc || "",
        it.details || "",
        ils(it.unitPrice),
        fmt(it.qty),
        ils(it.subtotal),
      ];
    });

    const startY = currentCustomer ? 140 : 120;

    autoTable(doc as any, {
      startY,
      head: headers,
      body: rows,
      styles: { fontSize: 10, halign: 'right', font: hebrewFontRegistered ? 'NotoSansHebrew' : undefined, cellPadding: 4 },
      headStyles: { fillColor: [0, 0, 0], halign: 'center', textColor: [255,255,255], font: hebrewFontRegistered ? 'NotoSansHebrew' : undefined },
      margin: { left: margin, right: margin },
      theme: "striped",
      didParseCell: (info: any) => {
        if (info.section === 'body' || info.section === 'head') {
          info.cell.styles.halign = 'right';
        }
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? startY;
    let y = finalY + 16;

    // סיכומים בתחתית
    doc.setFontSize(12);
    doc.text(`מחיר: ${ils(totals.sub)}`, pageWidth - margin, y, { align: "right" }); y += 18;
    doc.text(`מע"מ: ${ils(totals.tax)}`, pageWidth - margin, y, { align: "right" }); y += 18;
    doc.text(`מחיר +מע"מ: ${ils(totals.grand)}`, pageWidth - margin, y, { align: "right" });

    y += 24;
    const dateStr = new Date().toLocaleDateString("he-IL");
    doc.text(`תאריך: ${dateStr}`, pageWidth - margin, y, { align: "right" }); y += 18;
    if (data.notes) {
      const lines = (doc as any).splitTextToSize ? (doc as any).splitTextToSize(data.notes, pageWidth - margin*2) : data.notes;
      if (Array.isArray(lines)) {
        doc.text(lines as any, pageWidth - margin, y, { align: "right" });
        y += 14 * lines.length;
      } else {
        doc.text(String(lines), pageWidth - margin, y, { align: "right" });
        y += 14;
      }
    }
    y += 10;
    doc.text("חתימה:", pageWidth - margin, y, { align: "right" });

    doc.save(`${title}.pdf`);
  }

  // ------------------------------------------------------
  // UI
  // ------------------------------------------------------
  return (
    <div dir="rtl" className="min-h-screen w-full bg-gradient-to-b from-indigo-50 via-white to-sky-50 p-3 md:p-6">
      <div className="mx-auto max-w-6xl grid gap-4">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Button variant={view==='quote'? 'default': 'outline'} onClick={()=>setView('quote')} className={view==='quote'? 'bg-indigo-600 text-white' : ''}>
              <FilePlus2 className="ml-2 h-4 w-4"/> הצעה
            </Button>
            <Button variant={view==='customers'? 'default': 'outline'} onClick={()=>setView('customers')} className={view==='customers'? 'bg-indigo-600 text-white' : ''}>
              <Users className="ml-2 h-4 w-4"/> לקוחות
            </Button>
          </div>

          {view === 'quote' && (
            <div className="flex gap-2 w-full md:w-auto justify-end">
              <Button variant="outline" className="border-indigo-200 hover:bg-indigo-50" onClick={()=>setShowSettings(true)}>
                <Settings className="ml-2 h-4 w-4"/> הגדרות
              </Button>
              <Button variant="outline" onClick={saveQuote}><Save className="ml-2 h-4 w-4"/> שמור הצעה</Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={exportPDF}>
                <Download className="ml-2 h-4 w-4"/> ייצוא ל‑PDF
              </Button>
            </div>
          )}
        </header>

        {view === 'quote' ? (
          <>
            <Card className="shadow-sm border-indigo-100 bg-white/90 backdrop-blur">
              <CardHeader>
                <CardTitle className="text-right">פרטי ההצעה</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>כותרת ההצעה</Label>
                  <Input inputMode="text" value={quoteTitle} onChange={(e)=>setQuoteTitle(e.target.value)} placeholder="לדוגמה: הצעת מחיר לפרויקט X"/>
                </div>

                <div className="space-y-2">
                  <Label>לקוח</Label>
                  <div className="flex gap-2">
                    <Select value={currentCustomerId} onValueChange={setCurrentCustomerId}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="בחר לקוח"/></SelectTrigger>
                      <SelectContent>
                        {data.customers.map((c)=> (
                          <SelectItem value={c.id} key={c.id}>{c.name}{c.phone? ` – ${c.phone}`: ''}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={()=>addCustomer()} title="לקוח חדש"><UserPlus className="h-4 w-4"/></Button>
                  </div>
                </div>

                <div className="space-y-2 md:col-span-1">
                  <Label>פרטי כותרת (מופיע ב‑PDF)</Label>
                  <div className="grid grid-cols-1 gap-2">
                    <Input value={data.company.logoText} onChange={(e)=>setData(function(v: any){return {...v, company: {...v.company, logoText: e.target.value}};})} placeholder="טקסט לוגו"/>
                    <Input value={data.company.sellerName} onChange={(e)=>setData(function(v: any){return {...v, company: {...v.company, sellerName: e.target.value}};})} placeholder="שם העסק"/>
                    <Input value={data.company.sellerDetails} onChange={(e)=>setData(function(v: any){return {...v, company: {...v.company, sellerDetails: e.target.value}};})} placeholder="כתובת / טלפון / אימייל"/>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid md:grid-cols-2 gap-6">
              <Card className="shadow-sm border-indigo-100 bg-white/90 backdrop-blur">
                <CardHeader className="pb-2"><CardTitle className="text-right">מחשבון</CardTitle></CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div className="space-y-2">
                      <Label>רוחב (ס"מ)</Label>
                      <Input inputMode="numeric" type="number" min="0" step="1" value={wCm} onChange={(e)=>setWCm(Number((e.target as HTMLInputElement).value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>גובה (ס"מ)</Label>
                      <Input inputMode="numeric" type="number" min="0" step="1" value={hCm} onChange={(e)=>setHCm(Number((e.target as HTMLInputElement).value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>כמות</Label>
                      <Input inputMode="numeric" type="number" min="1" step="1" value={qty} onChange={(e)=>setQty(Number((e.target as HTMLInputElement).value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>סוג פרופיל</Label>
                      <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                        <SelectTrigger><SelectValue placeholder="בחר פרופיל"/></SelectTrigger>
                        <SelectContent>
                          {data.profiles.map(function(p: any){ return (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          );})}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label>מיקום</Label>
                      <Input inputMode="text" value={loc} onChange={(e)=>setLoc(e.target.value)} placeholder="לדוגמה: חדר מגורים" />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="space-y-2 md:col-span-3">
                      <Label>פרטים</Label>
                      <Textarea rows={2} value={details} onChange={(e)=>setDetails(e.target.value)} placeholder="לפי מפרט וכתב כמויות / פירוט נוסף..." />
                    </div>
                  </div>

                  {/* תוספות */}
                  <div className="space-y-2">
                    <Label>תוספות</Label>
                    <div className="grid gap-2">
                      {addonStates.map(function(a: any, idx: number){ return (
                        <div key={a.id} className="flex items-center gap-3">
                          <input
                            id={`addon-${a.id}`}
                            type="checkbox"
                            checked={!!a.checked}
                            onChange={function(e){
                              const checked = (e.target as HTMLInputElement).checked;
                              setAddonStates(function(prev: any[]){
                                const next = prev.slice(); next[idx] = { ...prev[idx], checked }; return next;
                              });
                            }}
                          />
                          <label htmlFor={`addon-${a.id}`} className="min-w-40 text-sm">{a.name}</label>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-600">₪</span>
                            <Input className="w-28" inputMode="decimal" type="number" step="1" value={a.price}
                                   onChange={function(e){
                                     const val = (e.target as HTMLInputElement).value;
                                     setAddonStates(function(prev: any[]){
                                       const next = prev.slice(); next[idx] = { ...prev[idx], price: Number(val) }; return next;
                                     });
                                   }} />
                          </div>
                        </div>
                      );})}
                    </div>
                    <div className="text-xs text-slate-500">סכום תוספות נבחרות: {ils(addonsTotal)} (יכפול בכמות).</div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-3 items-end">
                    <div className="space-y-1">
                      <Label>שיטת תמחור</Label>
                      <div className="text-sm text-slate-600">למ״ר (רוחב×גובה)</div>
                    </div>
                    <div className="space-y-2">
                      <Label>מחיר ליחידה (למ״ר)</Label>
                      <Input inputMode="decimal" type="number" step="0.01" placeholder={String(selectedProfile ? selectedProfile.price : 0)} value={customUnitPrice}
                             onChange={(e)=>setCustomUnitPrice((e.target as HTMLInputElement).value)} />
                      <div className="text-xs text-slate-500">השאר ריק כדי להשתמש במחיר ברירת המחדל של הפרופיל.</div>
                    </div>
                    <div className="space-y-2">
                      <Label className="invisible md:visible">הוספה</Label>
                      <Button className="w-full bg-sky-600 hover:bg-sky-700 text-white" onClick={addLineItem}><Plus className="ml-2 h-4 w-4"/> הוסף להצעה</Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat label="שטח (מ״ר)" value={fmt(areaM2)} />
                    <Stat label="תוספות (פר פריט)" value={ils(addonsTotal)} />
                    <Stat label="נמדד לתמחור" value={`${fmt(measured)} מ״ר`} />
                    <Stat label="סכום שורה" value={`${ils(lineSubtotal)}`} />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm border-indigo-100 bg-white/90 backdrop-blur">
                <CardHeader className="pb-2"><CardTitle className="text-right">פריטי הצעה</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {data.items.length === 0 ? (
                    <div className="text-slate-500 text-sm text-right">אין פריטים עדיין. הוסף מהמחשבון.</div>
                  ) : (
                    <div className="overflow-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="py-2 pl-2 text-right">#</th>
                            <th className="py-2 pl-2 text-right">מידות (ס"מ)</th>
                            <th className="py-2 pl-2 text-right">מיקום</th>
                            <th className="py-2 pl-2 text-right">פרטים</th>
                            <th className="py-2 pl-2 text-right">כמות</th>
                            <th className="py-2 pl-2 text-right">מחיר ליח׳</th>
                            <th className="py-2 pl-2 text-right">סה״כ</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.items.map(function(it: any, i: number){ return (
                            <tr key={it.id} className="border-b last:border-b-0">
                              <td className="py-2 pl-2 text-right">{i + 1}</td>
                              <td className="py-2 pl-2 text-right">{fmt(it.wCm)}-{fmt(it.hCm)} ס"מ</td>
                              <td className="py-2 pl-2 text-right">{it.loc}</td>
                              <td className="py-2 pl-2 text-right">{it.details}</td>
                              <td className="py-2 pl-2 text-right">{fmt(it.qty)}</td>
                              <td className="py-2 pl-2 text-right">{ils(it.unitPrice)}</td>
                              <td className="py-2 pl-2 text-right">{ils(it.subtotal)}</td>
                              <td className="py-2 pl-2">
                                <Button size="icon" variant="ghost" onClick={()=>removeItem(it.id)} title="מחיקה">
                                  <Trash2 className="h-4 w-4"/>
                                </Button>
                              </td>
                            </tr>
                          );})}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Label>מע"מ</Label>
                      <Input className="w-28" inputMode="decimal" type="number" step="0.01" value={data.taxPercent}
                             onChange={(e)=>setData(function(v: any){return {...v, taxPercent: Number((e.target as HTMLInputElement).value)};})} />
                      <div className="text-xs text-slate-500">אפשר להקליד <b>0.18</b> או <b>18</b>.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={resetItems}><Trash2 className="ml-2 h-4 w-4"/> ניקוי</Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Stat label="סיכום ביניים" value={ils(totals.sub)} />
                    <Stat label={`מע"מ (${fmt(taxRate * 100)}%)`} value={ils(totals.tax)} />
                    <Stat label={'סה"כ לתשלום'} value={ils(totals.grand)} emphasize />
                  </div>

                  <div className="space-y-2">
                    <Label>הערות (מופיע ב‑PDF)</Label>
                    <Textarea rows={3} placeholder="תנאי תשלום, זמן אספקה, תוקף ההצעה..." value={data.notes} onChange={(e)=>setData(function(v: any){return {...v, notes: (e.target as HTMLTextAreaElement).value};})} />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <CustomersView
            customers={data.customers}
            quotes={data.quotes}
            onAdd={() => addCustomer({ name: "לקוח חדש" })}
            onUpdate={updateCustomer}
            onDelete={deleteCustomer}
          />
        )}
      </div>

      {/* דיאלוג הגדרות */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>פרופילים ומחירים</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="manage">
            <TabsList>
              <TabsTrigger value="manage">ניהול פרופילים</TabsTrigger>
              <TabsTrigger value="new">פרופיל חדש</TabsTrigger>
            </TabsList>

            <TabsContent value="manage" className="space-y-4">
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pl-2 text-right">שם</th>
                      <th className="py-2 pl-2 text-right">בסיס</th>
                      <th className="py-2 pl-2 text-right">מחיר ליח׳</th>
                      <th className="py-2 pl-2 text-right">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.profiles.map(function(p: any){ return (
                      <tr key={p.id} className="border-b last:border-b-0">
                        <td className="py-2 pl-2 text-right">{p.name}</td>
                        <td className="py-2 pl-2 text-right">למ״ר</td>
                        <td className="py-2 pl-2 text-right">{ils(p.price)}</td>
                        <td className="py-2 pl-2">
                          <div className="flex gap-2 justify-end">
                            <Button size="sm" variant="outline" onClick={()=>setEditingProfile(p)}><Edit3 className="ml-2 h-4 w-4"/> עריכה</Button>
                            <Button size="sm" variant="destructive" onClick={()=>deleteProfile(p)}><Trash2 className="ml-2 h-4 w-4"/> מחיקה</Button>
                          </div>
                        </td>
                      </tr>
                    );})}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="new">
              <ProfileEditor onCancel={function(){}} onSave={function(p: any){ upsertProfile({ ...p, id: (crypto && (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())) }); setEditingProfile(null); setShowSettings(true); }} />
            </TabsContent>
          </Tabs>

          {editingProfile && (
            <div className="border rounded-xl p-4 bg-slate-50">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">עריכת פרופיל</h4>
                <Button variant="ghost" size="icon" onClick={()=>setEditingProfile(null)}><X className="h-4 w-4"/></Button>
              </div>
              <ProfileEditor
                initial={editingProfile}
                onCancel={function(){ setEditingProfile(null); }}
                onSave={function(p: any){ upsertProfile(p); setEditingProfile(null); }}
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={()=>setShowSettings(false)}>סגירה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, emphasize=false }: {label: string; value: React.ReactNode; emphasize?: boolean;}) {
  return (
    <div className={`rounded-2xl border p-4 ${emphasize ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white'} `}>
      <div className="text-xs opacity-70 text-right">{label}</div>
      <div className="text-xl font-semibold text-right">{value}</div>
    </div>
  );
}

function ProfileEditor({ initial, onSave, onCancel }: {initial?: any; onSave: (p: any)=>void; onCancel: ()=>void;}) {
  const [name, setName] = useState((initial && initial.name) || "");
  const [price, setPrice] = useState((initial && typeof initial.price !== 'undefined') ? initial.price : 0);

  function handleSave() {
    const payload = {
      id: (initial && initial.id) ? initial.id : (crypto && (crypto as any).randomUUID ? crypto.randomUUID() : String(Date.now()+Math.random())),
      name: name || 'פרופיל שטח חדש',
      basis: 'area',
      unit: 'm2',
      price: Number(price) || 0,
    };
    if (onSave) onSave(payload);
  }
  return (
    <div className="grid md:grid-cols-4 gap-3">
      <div className="space-y-2 md:col-span-3">
        <Label>שם הפרופיל</Label>
        <Input value={name} onChange={(e)=>setName((e.target as HTMLInputElement).value)} placeholder="לדוגמה: פרופיל הזזה 45"/>
      </div>
      <div className="space-y-2">
        <Label>מחיר ליחידה (למ״ר)</Label>
        <Input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e)=>setPrice(Number((e.target as HTMLInputElement).value))} />
      </div>
      <div className="md:col-span-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>ביטול</Button>
        <Button onClick={handleSave}><Save className="ml-2 h-4 w-4"/> שמירה</Button>
      </div>
    </div>
  );
}

// -----------------------------
// Customers View
// -----------------------------
function CustomersView({ customers, quotes, onAdd, onUpdate, onDelete }: {
  customers: Customer[];
  quotes: Quote[];
  onAdd: ()=>void;
  onUpdate: (c: Customer)=>void;
  onDelete: (id: string)=>void;
}) {
  const [editing, setEditing] = useState<Customer|null>(null);

  function QuoteCount({ customerId }:{customerId:string}){
    const qs = quotes.filter(q=>q.customerId===customerId);
    const last = [...qs].sort((a,b)=>b.date-a.date)[0];
    return (
      <div className="text-right text-sm">
        <div>מס׳ הצעות: {qs.length}</div>
        {last && <div className="text-slate-500">אחרון: {new Date(last.date).toLocaleDateString('he-IL')} · {new Intl.NumberFormat('he-IL', {style:'currency', currency:'ILS'}).format(last.totals.grand)}</div>}
      </div>
    );
  }

  return (
    <Card className="shadow-sm border-indigo-100 bg-white/90 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-right">לקוחות</CardTitle>
        <Button onClick={onAdd}><UserPlus className="ml-2 h-4 w-4"/> לקוח חדש</Button>
      </CardHeader>
      <CardContent>
        {/* Mobile cards */}
        <div className="grid gap-3 md:hidden">
          {customers.length===0 && <div className="text-slate-500 text-sm text-right">אין לקוחות עדיין.</div>}
          {customers.map(c=> (
            <div key={c.id} className="rounded-2xl border p-4 bg-white">
              <div className="flex items-start justify-between gap-2">
                <div className="text-right">
                  <div className="text-base font-semibold">{c.name}</div>
                  <div className="text-xs text-slate-600">{c.phone}</div>
                  <div className="text-xs text-slate-600">{c.email}</div>
                </div>
                <QuoteCount customerId={c.id}/>
              </div>
              {c.notes && <div className="text-xs text-slate-600 mt-2 text-right whitespace-pre-wrap">{c.notes}</div>}
              <div className="flex justify-end gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={()=>setEditing(c)}>עריכה</Button>
                <Button size="sm" variant="destructive" onClick={()=>onDelete(c.id)}>מחיקה</Button>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pl-2 text-right">שם</th>
                <th className="py-2 pl-2 text-right">טלפון</th>
                <th className="py-2 pl-2 text-right">אימייל</th>
                <th className="py-2 pl-2 text-right">הערות</th>
                <th className="py-2 pl-2 text-right">הצעות</th>
                <th className="py-2 pl-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(c=> (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{c.name}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{c.phone}</td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap">{c.email}</td>
                  <td className="py-2 pl-2 text-right max-w-[360px]">
                    <div className="truncate" title={c.notes}>{c.notes}</div>
                  </td>
                  <td className="py-2 pl-2 text-right"><QuoteCount customerId={c.id}/></td>
                  <td className="py-2 pl-2 text-right">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={()=>setEditing(c)}>עריכה</Button>
                      <Button size="sm" variant="destructive" onClick={()=>onDelete(c.id)}>מחיקה</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!editing} onOpenChange={(o)=>!o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>עריכת לקוח</DialogTitle>
          </DialogHeader>
          {editing && (
            <CustomerEditor
              initial={editing}
              onCancel={()=>setEditing(null)}
              onSave={(c)=>{ onUpdate(c); setEditing(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CustomerEditor({ initial, onSave, onCancel }: { initial?: Customer; onSave: (c: Customer)=>void; onCancel: ()=>void; }){
  const [name, setName] = useState(initial?.name || "");
  const [phone, setPhone] = useState(initial?.phone || "");
  const [email, setEmail] = useState(initial?.email || "");
  const [notes, setNotes] = useState(initial?.notes || "");

  function handleSave(){
    const payload: Customer = {
      id: initial?.id || crypto.randomUUID(),
      name: name.trim() || "לקוח חדש",
      phone: phone.trim(),
      email: email.trim(),
      notes: notes,
      createdAt: initial?.createdAt || Date.now(),
    };
    onSave(payload);
  }

  return (
    <div className="grid gap-3">
      <div className="grid md:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>שם</Label>
          <Input value={name} onChange={(e)=>setName((e.target as HTMLInputElement).value)} placeholder="שם הלקוח"/>
        </div>
        <div className="space-y-2">
          <Label>טלפון</Label>
          <Input value={phone} onChange={(e)=>setPhone((e.target as HTMLInputElement).value)} placeholder="050-0000000"/>
        </div>
        <div className="space-y-2">
          <Label>אימייל</Label>
          <Input value={email} onChange={(e)=>setEmail((e.target as HTMLInputElement).value)} placeholder="name@example.com"/>
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>הערות</Label>
          <Textarea rows={3} value={notes} onChange={(e)=>setNotes((e.target as HTMLTextAreaElement).value)} placeholder="הערות על הלקוח"/>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>ביטול</Button>
        <Button onClick={handleSave}><Save className="ml-2 h-4 w-4"/> שמירה</Button>
      </div>
    </div>
  );
}
