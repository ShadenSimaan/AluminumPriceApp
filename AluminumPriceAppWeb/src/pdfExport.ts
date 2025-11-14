// // === PDF EXPORT (drop-in) =====================================
// // Requirements:
// // - npm i jspdf jspdf-autotable
// // - Works with Hebrew + English (RTL), centered header,
// //   neat table, and opens PDF in new tab (with fallback download).
// //
// // HOW TO USE:
// // 1. Put this code in App.tsx (or src/pdfExport.ts).
// // 2. Call generateAndExportPDF(current, items, taxPercentText) from your button,
// //    where:
// //    - current = {
// //        customerName, customerPhone, customerEmail, notes, title
// //      }
// //    - items = LineItem[]
// //    - taxPercentText = string ("17" / "0.17")
// // 3. Fill NOTO_SANS_HEBREW_TTF_BASE64 with real Base64 of a Hebrew TTF.
// //
// // You can create the Base64 once (offline) with Node:
// //
// //   const fs = require("fs");
// //   const b64 = fs.readFileSync("NotoSansHebrew-Regular.ttf").toString("base64");
// //   console.log(b64);
// //
// // Then paste the console output into NOTO_SANS_HEBREW_TTF_BASE64 below.
// //
// // ===============================================================

// import type { LineItem } from "./App"; // or copy the LineItem type here

// // 1) Put your real Base64 TTF string here (one long line)
// const NOTO_SANS_HEBREW_TTF_BASE64 = "PASTE_REAL_BASE64_STRING_HERE";

// /** Helper formatters (keep consistent with the rest of the app) */
// const pdfFmtNumber = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });
// const pdfFmtCurrency = new Intl.NumberFormat("he-IL", {
//   style: "currency",
//   currency: "ILS",
// });
// const pdfFmtDate = new Intl.DateTimeFormat("he-IL", { dateStyle: "medium" });

// function pdfParseLooseNumber(s: string): number {
//   if (!s || !s.trim()) return 0;
//   const cleaned = s.replace(/[^\d.,-]/g, "").replace(",", ".");
//   const n = parseFloat(cleaned);
//   return isFinite(n) ? n : 0;
// }

// function pdfNormalizeTaxPercent(n: number): number {
//   if (n === 0) return 0;
//   if (n > 1) return n / 100;
//   return n;
// }

// /**
//  * Registers the embedded Hebrew font with jsPDF if Base64 provided.
//  * If NOTO_SANS_HEBREW_TTF_BASE64 is empty, it falls back to default fonts.
//  */
// function registerHebrewFont(doc: any) {
//   if (!NOTO_SANS_HEBREW_TTF_BASE64 || NOTO_SANS_HEBREW_TTF_BASE64 === "PASTE_REAL_BASE64_STRING_HERE") {
//     console.warn(
//       "[PDF] Hebrew font Base64 not set. PDF will use default font (Hebrew may look wrong)."
//     );
//     return;
//   }
//   try {
//     doc.addFileToVFS("NotoSansHebrew-Regular.ttf", NOTO_SANS_HEBREW_TTF_BASE64);
//     doc.addFont("NotoSansHebrew-Regular.ttf", "NotoHebrew", "normal");
//     doc.setFont("NotoHebrew");
//   } catch (err) {
//     console.warn("[PDF] Failed to register Hebrew font, using default font instead.", err);
//   }
// }

// /**
//  * Main export function
//  */
// export async function generateAndExportPDF(
//   current: {
//     customerName: string;
//     customerPhone: string;
//     customerEmail: string;
//     notes: string;
//     title: string;
//   },
//   items: LineItem[],
//   taxPercentText: string
// ) {
//   if (!current.customerName.trim()) {
//     alert("אנא הזן/י שם לקוח לפני יצוא PDF");
//     return;
//   }
//   if (items.length === 0) {
//     alert("ההצעה ריקה. הוסף/י פריטים לפני יצוא PDF.");
//     return;
//   }

//   let jsPDFMod: any;
//   let autoTableMod: any;
//   try {
//     jsPDFMod = await import("jspdf");
//     autoTableMod = await import("jspdf-autotable");
//   } catch (e) {
//     alert("חסרות חבילות PDF. התקן/י: npm i jspdf jspdf-autotable");
//     return;
//   }
//   const jsPDF = jsPDFMod.default || jsPDFMod;
//   const autoTable = (autoTableMod.default || autoTableMod) as any;

//   // Create doc
//   const doc = new jsPDF({
//     orientation: "portrait",
//     unit: "pt",
//     format: "a4",
//   });

//   // Enable RTL for jsPDF (where supported)
//   (doc as any).setR2L?.(true);

//   // Register embedded Hebrew font (no fetch / no external file)
//   registerHebrewFont(doc);

//   doc.setFontSize(12);

//   const pageWidth = doc.internal.pageSize.getWidth();
//   const marginX = 40;
//   let cursorY = 40;

//   // 1) Company header – neat, centered, fixed text
//   const headerLines = [
//     "אלום סמעאן סאמי",
//     "ביצוע עבודות אלומיניום ותריס",
//     "פסוטה   ת.ד 528             טל/פקס : 9870933          נייד0526475531",
//     "ע.מ. מס' 023107659",
//   ];
//   doc.setFontSize(13);
//   headerLines.forEach((line) => {
//     doc.text(line, pageWidth / 2, cursorY, { align: "center" });
//     cursorY += 18;
//   });
//   doc.setFontSize(12);
//   cursorY += 10;

//   // 2) Customer info – supports Hebrew + English
//   const customerLine = [current.customerName, current.customerPhone]
//     .filter(Boolean)
//     .join(" • ");
//   const email = current.customerEmail?.trim();
//   if (customerLine) {
//     doc.text(customerLine, pageWidth / 2, cursorY, { align: "center" });
//     cursorY += 16;
//   }
//   if (email) {
//     doc.text(email, pageWidth / 2, cursorY, { align: "center" });
//     cursorY += 16;
//   }

//   // Divider
//   doc.setDrawColor(180);
//   doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
//   cursorY += 10;

//   // 3) Table – RTL, Hebrew headers, English values ok
//   const bodyRows = items.map((it, idx) => {
//     const w = pdfParseLooseNumber(it.widthCm);
//     const h = pdfParseLooseNumber(it.heightCm);
//     const dims = `${pdfFmtNumber.format(w)}×${pdfFmtNumber.format(h)}`;

//     const addonsText = it.addons
//       .filter((a) => a.checked)
//       .map(
//         (a) =>
//           `${a.name} (${pdfFmtCurrency.format(pdfParseLooseNumber(a.price))})`
//       )
//       .join(" • ");

//     const details = [it.details, addonsText].filter(Boolean).join(" — ");

//     const qty = Math.max(0, pdfParseLooseNumber(it.qty));
//     const area = (w * h) / 10000;
//     const addonsSum = it.addons.reduce(
//       (s, a) => s + (a.checked ? pdfParseLooseNumber(a.price) : 0),
//       0
//     );
//     const unitPriceNum = pdfParseLooseNumber(it.unitPrice);
//     const perItemPrice = area * unitPriceNum + addonsSum;
//     const lineTotal = perItemPrice * qty;

//     return [
//       String(idx + 1), // מס'
//       dims,            // מידות
//       it.location || "",
//       details || "",
//       pdfFmtCurrency.format(perItemPrice),
//       pdfFmtNumber.format(qty),
//       pdfFmtCurrency.format(lineTotal),
//     ];
//   });

//   autoTable(doc, {
//     startY: cursorY,
//     styles: {
//       font: NOTO_SANS_HEBREW_TTF_BASE64 ? "NotoHebrew" : undefined,
//       fontSize: 11,
//       halign: "right", // right-align for RTL
//       cellPadding: 4,
//     },
//     headStyles: {
//       fillColor: [236, 248, 255],
//       textColor: 20,
//       halign: "center",
//     },
//     bodyStyles: {
//       valign: "top",
//     },
//     // Column order: matches your spec
//     head: [
//       ["מס׳", "מידות (ס״מ)", "מיקום", "פרטים", "מחיר ליח׳", "כמות", "סה״כ"],
//     ],
//     body: bodyRows,
//     margin: { left: marginX, right: marginX },
//     tableLineColor: 230,
//     tableLineWidth: 0.5,
//     // Make sure table doesn't get weird width on phone
//     columnStyles: {
//       0: { cellWidth: 24 },   // מס'
//       1: { cellWidth: 80 },   // מידות
//       2: { cellWidth: 90 },   // מיקום
//       3: { cellWidth: 180 },  // פרטים
//       4: { cellWidth: 80 },   // מחיר ליח'
//       5: { cellWidth: 50 },   // כמות
//       6: { cellWidth: 90 },   // סה"כ
//     },
//   });

//   const tableY = (doc as any).lastAutoTable?.finalY ?? cursorY + 20;

//   // 4) Totals box (מחיר / מע״מ / סה״כ לתשלום)
//   const boxWidth = 240;
//   const boxX = pageWidth - marginX - boxWidth;
//   let boxY = tableY + 18;

//   const sub = items.reduce((a, it) => a + it.subtotal, 0);
//   const taxDecimal = pdfNormalizeTaxPercent(pdfParseLooseNumber(taxPercentText));
//   const vat = sub * taxDecimal;
//   const grand = sub + vat;

//   doc.setDrawColor(180);
//   doc.roundedRect(boxX, boxY, boxWidth, 92, 6, 6);
//   boxY += 22;
//   doc.text(`מחיר: ${pdfFmtCurrency.format(sub)}`, boxX + boxWidth - 12, boxY, {
//     align: "right",
//   });
//   boxY += 22;
//   doc.text(`מע״מ: ${pdfFmtCurrency.format(vat)}`, boxX + boxWidth - 12, boxY, {
//     align: "right",
//   });
//   boxY += 24;
//   doc.setFillColor(236, 248, 255);
//   doc.roundedRect(boxX + 8, boxY - 18, boxWidth - 16, 28, 5, 5, "F");
//   doc.setFont(undefined, "bold");
//   doc.text(
//     `סה״כ לתשלום: ${pdfFmtCurrency.format(grand)}`,
//     boxX + boxWidth - 16,
//     boxY,
//     { align: "right" }
//   );
//   doc.setFont(undefined, "normal");

//   let footerY = Math.max(boxY + 28, tableY + 120);
//   footerY += 12;

//   // 5) Date
//   doc.text(`תאריך: ${pdfFmtDate.format(new Date())}`, pageWidth - marginX, footerY, {
//     align: "right",
//   });
//   footerY += 18;

//   // 6) Notes (if any)
//   if (current.notes?.trim()) {
//     const lines = doc.splitTextToSize(
//       `הערות: ${current.notes.trim()}`,
//       pageWidth - marginX * 2
//     );
//     doc.text(lines, pageWidth - marginX, footerY, { align: "right" });
//     footerY += lines.length * 14 + 10;
//   }

//   // 7) Signature
//   doc.text("חתימה:", pageWidth - marginX, footerY, { align: "right" });
//   try {
//     const sigResp = await fetch("/signature.png");
//     if (sigResp.ok) {
//       const blob = await sigResp.blob();
//       const dataUrl = await blobToDataUrl(blob);
//       doc.addImage(
//         dataUrl,
//         "PNG",
//         pageWidth - marginX - 160,
//         footerY - 18,
//         140,
//         48
//       );
//     }
//   } catch {
//     // If no signature image – just ignore
//   }

//   const filename = `${current.title || "הצעת מחיר"}.pdf`;
//   await openPdfInNewTabOrDownload(doc, filename);
// }

// /** Converts Blob -> data URL for signature */
// function blobToDataUrl(blob: Blob): Promise<string> {
//   return new Promise((resolve, reject) => {
//     const fr = new FileReader();
//     fr.onload = () => resolve(String(fr.result));
//     fr.onerror = reject;
//     fr.readAsDataURL(blob);
//   });
// }

// /**
//  * Phone + PC friendly open:
//  * 1. Try to open PDF in new tab.
//  * 2. If blocked => create a download.
//  * 3. Last fallback => doc.save().
//  */
// async function openPdfInNewTabOrDownload(doc: any, filename: string) {
//   const blob = doc.output("blob");
//   const url = URL.createObjectURL(blob);

//   try {
//     const win = window.open(url, "_blank");
//     if (!win) {
//       const a = document.createElement("a");
//       a.href = url;
//       a.download = filename;
//       a.style.display = "none";
//       document.body.appendChild(a);
//       a.click();
//       document.body.removeChild(a);
//     }
//   } catch {
//     doc.save(filename);
//   } finally {
//     setTimeout(() => URL.revokeObjectURL(url), 60_000);
//   }
// }
