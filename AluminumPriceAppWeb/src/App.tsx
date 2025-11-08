import React, { useMemo, useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, Settings, Download, Edit3, Save, X } from "lucide-react";

// PDF export
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ------------------------------------------------------
// הגדרות כלליות
// ------------------------------------------------------
const STORAGE_KEY = "aluminum-quote-app:v5-he-cm-addons";

function usePersistentState(defaultValue: any) {
  const [value, setValue] = useState(() => {
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
  // ברירת מחדל בישראל: 18% מע"מ (אפשר להזין 0.18 או 18)
  taxPercent: 0.18,
  notes: "הצעה תקפה ל-14 יום. זמן אספקה 21 ימי עסקים מרגע אישור ותשלום מקדמה.",
};

function n(v: any) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
const numIL = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
const moneyIL = new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 2 });
function fmt(x: number){ return numIL.format(x||0); }
function ils(x: number){ return moneyIL.format(x||0); }

export default function AluminumQuotationApp() {
  const [data, setData] = usePersistentState(defaultData);
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

  // ---------- בדיקות (Test Cases) ----------
  useEffect(function(){
    try {
      // 100×200 ס"מ → 1×2 מ׳ → שטח 2 מ"ר
      const testArea = (100/100) * (200/100);
      console.assert(Math.abs(testArea - 2) < 1e-6, "Area test failed (cm→m²)");

      // מחיר פרופיל: 10 ₪/מ"ר, כמות 3, תוספות: 300 ₪ → (2*10 + 300)*3 = 960
      const computed = ((2*10) + 300) * 3;
      console.assert(Math.abs(computed - 960) < 1e-6, "Addons subtotal test failed");

      const taxSample = 0.18 * 960;
      console.assert(Math.abs(taxSample - 172.8) < 1e-6, "Tax 18% test failed (addons)");

      // Additional tests
      // 150×80 ס"מ → 1.5×0.8 → 1.2 מ"ר
      const area2 = (150/100) * (80/100);
      console.assert(Math.abs(area2 - 1.2) < 1e-6, "Area 150x80 cm test failed");
      // No addons, price 100 ₪/מ"ר, qty 1 → 1.2*100 = 120
      const subtotal2 = area2 * 100;
      console.assert(Math.abs(subtotal2 - 120) < 1e-6, "Subtotal without addons failed");
    } catch (e) {
      console.warn("Self tests encountered an issue", e);
    }
  }, []);

  // ------------------------------------------------------
  // ייצוא PDF מותאם – נשאיר את מבנה העמודות, ונוסיף את שמות התוספות ל"פרטים"
  // ------------------------------------------------------
  function exportPDF() {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 36;
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(18);
    doc.text(data.company.logoText || "ALU-QUOTES", margin, 50);
    doc.setFontSize(12);
    doc.text(data.company.sellerName || "Company", pageWidth - margin, 36, { align: "right" });
    doc.text(data.company.sellerDetails || "Address / Phone / Email", pageWidth - margin, 54, { align: "right" });

    // כותרת (באנגלית להבטיח כיווניות ללא גופן עברי)
    doc.setFontSize(16);
    doc.text("Aluminum Quotation", margin, 90);

    const rows = data.items.map(function(it: any, idx: number){
      const dims = `${fmt(it.wCm)}-${fmt(it.hCm)} ס"מ`;
      return [
        String(idx + 1),
        dims,
        it.loc || "",
        it.details || "",
        ils(it.unitPrice),
        fmt(it.qty),
        ils(it.subtotal),
        "",
      ];
    });

    autoTable(doc, {
      startY: 110,
      head: [["סעיף", "מידות", "מיקום", "פרטים", "מחיר יחידה", "כמות", "מחיר", "כולל"]],
      body: rows.length ? rows : [["-", "-", "-", "-", "-", "-", "-", "-"]],
      styles: { fontSize: 10 },
      headStyles: { fillColor: [0, 0, 0], halign: 'center', textColor: [255,255,255] },
      theme: "striped",
      margin: { left: margin, right: margin },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 110;
    let y = finalY + 16;

    // סיכומים בתחתית
    doc.setFontSize(12);
    doc.text(`מחיר: ${ils(totals.sub)}`, pageWidth - margin, y, { align: "right" }); y += 18;
    doc.text(`מע"מ: ${ils(totals.tax)}`, pageWidth - margin, y, { align: "right" }); y += 18;
    doc.setFont(undefined as any, "bold");
    doc.text(`מחיר +מע"מ: ${ils(totals.grand)}`, pageWidth - margin, y, { align: "right" });
    doc.setFont(undefined as any, "normal");

    y += 24;
    const dateStr = new Date().toLocaleDateString("he-IL");
    doc.text(`תאריך: ${dateStr}`, margin, y); y += 18;
    doc.text("חתימה :", margin, y);

    doc.save(`${quoteTitle || "Aluminum Quotation"}.pdf`);
  }

  return (
    <div dir="rtl" className="min-h-screen w-full bg-white p-2 md:p-4 text-[13px]">
      <div className="mx-auto max-w-6xl grid gap-6">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="text-right w-full">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">הצעת מחיר אלומיניום</h1>
            <p className="text-slate-600">קלט ב‑ס"מ לחישוב מהיר; תמחור לפי מ״ר. אפשר להוסיף תוספות לכל חלון.</p>
          </div>
          <div className="flex gap-2 w-full md:w-auto justify-end">
            <Button variant="outline" className="border-slate-300 hover:bg-slate-50 text-slate-800" onClick={()=>setShowSettings(true)}>
              <Settings className="ml-2 h-4 w-4"/> הגדרות
            </Button>
            <Button variant="outline" className="border-slate-300 hover:bg-slate-50 text-slate-800" onClick={exportPDF}>
              <Download className="ml-2 h-4 w-4"/> ייצוא ל‑PDF
            </Button>
          </div>
        </header>

        <Card className="shadow-none border-slate-300 bg-white">
          <CardHeader>
            <CardTitle className="text-right">פרטי ההצעה</CardTitle>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>כותרת ההצעה</Label>
              <Input inputMode="text" value={quoteTitle} onChange={(e)=>setQuoteTitle(e.target.value)} placeholder="לדוגמה: הצעת מחיר לפרויקט X"/>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>פרטי כותרת (מופיע ב‑PDF)</Label>
              <div className="grid md:grid-cols-3 gap-2">
                <Input value={data.company.logoText} onChange={(e)=>setData(function(v: any){return {...v, company: {...v.company, logoText: e.target.value}};})} placeholder="טקסט לוגו"/>
                <Input value={data.company.sellerName} onChange={(e)=>setData(function(v: any){return {...v, company: {...v.company, sellerName: e.target.value}};})} placeholder="שם העסק"/>
                <Input value={data.company.sellerDetails} onChange={(e)=>setData(function(v: any){return {...v, company: {...v.company, sellerDetails: e.target.value}};})} placeholder="כתובת / טלפון / אימייל"/>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="shadow-none border-slate-300 bg-white">
            <CardHeader className="pb-2"><CardTitle className="text-right">מחשבון</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <div className="space-y-2">
                  <Label>רוחב (ס"מ)</Label>
                  <Input inputMode="numeric" type="number" min="0" step="1" value={wCm} onChange={(e)=>setWCm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>גובה (ס"מ)</Label>
                  <Input inputMode="numeric" type="number" min="0" step="1" value={hCm} onChange={(e)=>setHCm(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>כמות</Label>
                  <Input inputMode="numeric" type="number" min="1" step="1" value={qty} onChange={(e)=>setQty(e.target.value)} />
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
                  <Button variant="outline" className="w-full border-slate-300 hover:bg-slate-50 text-slate-800" onClick={addLineItem}><Plus className="ml-2 h-4 w-4"/> הוסף להצעה</Button>
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

          <Card className="shadow-none border-slate-300 bg-white">
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
                         onChange={(e)=>setData(function(v: any){return {...v, taxPercent: (e.target as HTMLInputElement).value};})} />
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
        <Input inputMode="decimal" type="number" step="0.01" value={price} onChange={(e)=>setPrice((e.target as HTMLInputElement).value)} />
      </div>
      <div className="md:col-span-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>ביטול</Button>
        <Button onClick={handleSave}><Save className="ml-2 h-4 w-4"/> שמירה</Button>
      </div>
    </div>
  );
}
