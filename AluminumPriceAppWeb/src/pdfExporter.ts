// FILE: src/pdfExporter.ts
// Handles PDF export for the aluminum quote app

const PDF_FONT_NAME = "NotoHebrew";
const PDF_FONT_FILE = "NotoSansHebrew-Regular.ttf"; // expects /fonts/NotoSansHebrew-Regular.ttf
const HEBREW_REGEX = /[\u0590-\u05FF]/;

// --- Public types this module expects (structural typing, no need to import your own) ---

export interface PdfAddon {
  name: string;
  price: string;
  checked: boolean;
}

export interface PdfLineItem {
  id?: string;
  widthCm: string;
  heightCm: string;
  qty: string;
  location?: string;
  details?: string;
  unitPrice: string;
  subtotal?: number;
  addons: PdfAddon[];
}

export interface PdfQuotePayload {
  title: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  taxPercentText: string; // e.g. "17" or "0.17"
  items: PdfLineItem[];
}

// --- small helpers ---

function parseLooseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return isFinite(value) ? value : 0;
  if (value == null) return 0;
  const cleaned = String(value).replace(/[^0-9,\.\-]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

function normalizeTaxPercent(raw: number): number {
  if (!isFinite(raw) || raw <= 0) return 0;
  if (raw > 1) return raw / 100;
  return raw;
}

// Simple number formatter for money (no bidi marks)
const moneyNumberFmt = new Intl.NumberFormat("he-IL", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});
function formatMoneyPdf(value: number): string {
  // digits + ₪ at the end, LTR so it doesn't get reversed
  return `${moneyNumberFmt.format(value)} ₪`;
}

const dateFmt = new Intl.DateTimeFormat("he-IL");

// Detect if a string is mostly RTL (Hebrew) or LTR (Latin/English)
function isRTLText(text: string): boolean {
  return HEBREW_REGEX.test(text);
}

// Draw text with smart direction:
//   Hebrew → RTL/right, English → LTR/left/center
function drawTextSmart(
  doc: any,
  text: string,
  x: number,
  y: number,
  opts: { align?: "left" | "right" | "center"; forceRtl?: boolean } = {}
) {
  const rtl = opts.forceRtl ?? isRTLText(text);
  const align = opts.align ?? (rtl ? "right" : "left");

  const prevR2L = (doc as any).R2L;
  try {
    (doc as any).setR2L?.(rtl);
  } catch {}
  doc.text(text, x, y, { align });
  try {
    (doc as any).setR2L?.(prevR2L);
  } catch {}
}

// register Noto font as normal+bold
async function ensureHebrewFont(doc: any) {
  try {
    const fontResp = await fetch("/fonts/NotoSansHebrew-Regular.ttf");
    if (!fontResp.ok) throw new Error("font missing");
    const buf = await fontResp.arrayBuffer();
    const base64 = arrayBufferToBase64(buf);

    doc.addFileToVFS(PDF_FONT_FILE, base64);
    doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, "normal");
    doc.addFont(PDF_FONT_FILE, PDF_FONT_NAME, "bold");
    doc.setFont(PDF_FONT_NAME, "normal");
  } catch (e) {
    console.warn(
      "Hebrew font not found at /fonts/NotoSansHebrew-Regular.ttf. Proceeding with default font.",
      e
    );
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result));
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

async function androidSafeSave(doc: any, filename: string) {
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);

  try {
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch {
    doc.save(filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// --------- MAIN PUBLIC API ---------

export async function exportQuotePdf(payload: PdfQuotePayload) {
  let jsPDFMod: any;
  try {
    jsPDFMod = await import("jspdf");
  } catch (e) {
    alert("חסרות חבילות PDF. התקן/י: npm i jspdf");
    return;
  }
  const jsPDF = jsPDFMod.default || jsPDFMod;

  const { customerName, customerPhone, customerEmail, notes } = payload;

  if (!customerName.trim()) {
    alert("אנא הזן/י שם לקוח לפני יצוא PDF");
    return;
  }
  if (!payload.items.length) {
    alert("ההצעה ריקה. הוסף/י פריטים לפני יצוא PDF.");
    return;
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  await ensureHebrewFont(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  const marginTop = 40;
  const marginBottom = 40;

  let cursorY = marginTop;

  // ===== Header =====
  const headerLines = [
    "אלום סמעאן סאמי",
    "ביצוע עבודות אלומיניום ותריס",
    "פסוטה   ת.ד 528             טל/פקס : 9870933          נייד0526475531",
    "ע.מ. מס' 023107659",
  ];

  doc.setFont(PDF_FONT_NAME, "bold");
  doc.setFontSize(13);
  headerLines.forEach((line) => {
    drawTextSmart(doc, line, pageWidth / 2, cursorY, {
      align: "center",
      forceRtl: true,
    });
    cursorY += 18;
  });

  doc.setFont(PDF_FONT_NAME, "normal");
  doc.setFontSize(12);
  cursorY += 10;

  // ===== Customer block =====
  const customerLine = [customerName, customerPhone]
    .filter(Boolean)
    .join(" • ");
  const emailLine = customerEmail?.trim() || "";

  if (customerLine) {
    drawTextSmart(doc, customerLine, pageWidth / 2, cursorY, {
      align: "center",
    });
    cursorY += 16;
  }
  if (emailLine) {
    drawTextSmart(doc, emailLine, pageWidth / 2, cursorY, {
      align: "center",
      forceRtl: false,
    });
    cursorY += 16;
  }

  // Divider
  doc.setDrawColor(200);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 12;

  // ===== Items table =====
  cursorY = drawItemsTable(
    doc,
    payload.items,
    cursorY,
    marginX,
    pageWidth,
    pageHeight,
    marginTop,
    marginBottom
  );

  // ===== Totals box on LEFT, but text still RTL / right-aligned =====
  const sub = payload.items.reduce((sum, it) => {
    if (typeof it.subtotal === "number") return sum + it.subtotal;
    const w = parseLooseNumber(it.widthCm);
    const h = parseLooseNumber(it.heightCm);
    const qty = Math.max(0, parseLooseNumber(it.qty));
    const area = (w * h) / 10000;
    const addonsSum = it.addons.reduce(
      (s, a) => s + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const unitPrice = parseLooseNumber(it.unitPrice);
    const perItem = area * unitPrice + addonsSum;
    return sum + perItem * qty;
  }, 0);

  const taxDecimal = normalizeTaxPercent(
    parseLooseNumber(payload.taxPercentText)
  );
  const vat = sub * taxDecimal;
  const grand = sub + vat;

  const boxWidth = 260;
  const boxX = marginX; // left side of page
  let boxY = cursorY + 18;

  doc.setDrawColor(210);
  doc.roundedRect(boxX, boxY, boxWidth, 96, 8, 8);
  boxY += 26;

  // Note: text is still right-aligned inside the box (RTL)
  drawTextSmart(
    doc,
    `מחיר: ${formatMoneyPdf(sub)}`,
    boxX + boxWidth - 12,
    boxY,
    { align: "right" }
  );
  boxY += 22;
  drawTextSmart(
    doc,
    `מע״מ: ${formatMoneyPdf(vat)}`,
    boxX + boxWidth - 12,
    boxY,
    { align: "right" }
  );
  boxY += 24;

  // highlighted grand total
  doc.setFillColor(236, 248, 255);
  doc.roundedRect(boxX + 10, boxY - 18, boxWidth - 20, 30, 6, 6, "F");
  doc.setFont(PDF_FONT_NAME, "bold");
  drawTextSmart(
    doc,
    `סה״כ לתשלום: ${formatMoneyPdf(grand)}`,
    boxX + boxWidth - 18,
    boxY + 2,
    { align: "right" }
  );
  doc.setFont(PDF_FONT_NAME, "normal");

  // ===== Footer: anchored to bottom of last page =====
  const footerHeight = 80;
  const footerTop = pageHeight - marginBottom - footerHeight;
  let footerY = footerTop;

  drawTextSmart(
    doc,
    `תאריך: ${dateFmt.format(new Date())}`,
    pageWidth - marginX,
    footerY,
    { align: "right" }
  );
  footerY += 18;

  if (notes?.trim()) {
    const notesLabel = "הערות:";
    drawTextSmart(
      doc,
      notesLabel,
      pageWidth - marginX,
      footerY,
      { align: "right" }
    );
    footerY += 16;

    const notesWidth = pageWidth - marginX * 2;
    const wrapped = doc.splitTextToSize(notes.trim(), notesWidth);
    wrapped.forEach((line: string, idx: number) => {
      drawTextSmart(
        doc,
        line,
        pageWidth - marginX,
        footerY + idx * 14,
        { align: "right" }
      );
    });
    footerY += wrapped.length * 14 + 6;
  }

  // Signature label
  footerY += 6;
  drawTextSmart(doc, "חתימה:", pageWidth - marginX, footerY, {
    align: "right",
  });

  // Signature image – placed BELOW the text, with extra spacing
  try {
    const sigResp = await fetch("/fonts/signature.png");
    if (sigResp.ok) {
      const blob = await sigResp.blob();
      const dataUrl = await blobToDataUrl(blob);

      const sigWidth = 120;
      const sigHeight = 40;
      const sigX = pageWidth - marginX - sigWidth; // right aligned
      const sigY = footerY + 8; // a bit under the "חתימה:" text

      doc.addImage(dataUrl, "PNG", sigX, sigY, sigWidth, sigHeight);
    }
  } catch {
    // ignore if missing
  }


  const filename = `${payload.title || "הצעת מחיר"}.pdf`;
  await androidSafeSave(doc, filename);
}

// ---- internal: table drawing (columns are RTL, with wider מידות & מיקום) ----

function drawItemsTable(
  doc: any,
  items: PdfLineItem[],
  startY: number,
  marginX: number,
  pageWidth: number,
  pageHeight: number,
  marginTop: number,
  marginBottom: number
): number {
  const right = pageWidth - marginX;
  const left = marginX;

  // Columns from RIGHT to LEFT:
  // מס׳ | מידות | מיקום | פרטים | מחיר ליח׳ | כמות | סה״כ
  // Adjusted widths to avoid collisions:
  const colWidths = {
    num: 25,
    dims: 80,      // wider for מידות + values
    location: 80,  // a bit wider
    details: 140,  // slightly narrower
    unitPrice: 75,
    qty: 40,
    total: 90,
  }; // sum = 515

  const colX = {
    num: right,
    dims: right - colWidths.num,
    location: right - colWidths.num - colWidths.dims,
    details:
      right - colWidths.num - colWidths.dims - colWidths.location,
    unitPrice:
      right -
      colWidths.num -
      colWidths.dims -
      colWidths.location -
      colWidths.details,
    qty:
      right -
      colWidths.num -
      colWidths.dims -
      colWidths.location -
      colWidths.details -
      colWidths.unitPrice,
    total:
      right -
      colWidths.num -
      colWidths.dims -
      colWidths.location -
      colWidths.details -
      colWidths.unitPrice -
      colWidths.qty,
  };

  const headerHeight = 24;
  const rowLineHeight = 14;
  let y = startY;

  const drawHeader = () => {
    if (y + headerHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }

    doc.setFillColor(236, 248, 255);
    doc.roundedRect(left, y, right - left, headerHeight, 6, 6, "F");
    doc.setDrawColor(210);
    doc.roundedRect(left, y, right - left, headerHeight, 6, 6);

    const centerY = y + headerHeight / 2 + 4;

    doc.setFont(PDF_FONT_NAME, "bold");
    drawTextSmart(doc, "מס׳", colX.num - 4, centerY, { align: "right" });
    drawTextSmart(
      doc,
      "מדוית )ס״מ(",
      colX.dims - 4,
      centerY,
      { align: "right" }
    );
    drawTextSmart(doc, "מיקום", colX.location - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "פרטים", colX.details - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "מחיר ליח׳", colX.unitPrice - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "כמות", colX.qty - 4, centerY, {
      align: "right",
    });
    drawTextSmart(doc, "סה״כ", colX.total - 4, centerY, {
      align: "right",
    });
    doc.setFont(PDF_FONT_NAME, "normal");

    y += headerHeight;
  };

  const drawRowBorders = (rowHeight: number, startYRow: number) => {
    doc.setDrawColor(230);
    doc.rect(left, startYRow, right - left, rowHeight);

    const xs = [
      colX.num - colWidths.num,
      colX.dims - colWidths.dims,
      colX.location - colWidths.location,
      colX.details - colWidths.details,
      colX.unitPrice - colWidths.unitPrice,
      colX.qty - colWidths.qty,
    ];
    xs.forEach((x) => {
      doc.line(x, startYRow, x, startYRow + rowHeight);
    });
  };

  if (!items.length) return y;

  drawHeader();

  items.forEach((it, idx) => {
    const w = parseLooseNumber(it.widthCm);
    const h = parseLooseNumber(it.heightCm);
    // show clean integers for מידות to keep it short (no .00)
    const dims = `${Math.round(w)}×${Math.round(h)}`;

    const addonsText = it.addons
      .filter((a) => a.checked)
      .map((a) => `${a.name} (${formatMoneyPdf(parseLooseNumber(a.price))})`)
      .join(" • ");

    const detailsFull = [it.details, addonsText].filter(Boolean).join(" — ");

    const qty = Math.max(0, parseLooseNumber(it.qty));
    const area = (w * h) / 10000;
    const addonsSum = it.addons.reduce(
      (s, a) => s + (a.checked ? parseLooseNumber(a.price) : 0),
      0
    );
    const unitPriceNum = parseLooseNumber(it.unitPrice);
    const perItemPrice = area * unitPriceNum + addonsSum;
    const lineTotal = perItemPrice * qty;

    const numStr = String(idx + 1);
    const locStr = it.location || "";
    const unitPriceStr = formatMoneyPdf(perItemPrice);
    const qtyStr = moneyNumberFmt.format(qty);
    const totalStr = formatMoneyPdf(lineTotal);

    const detailsMaxWidth = colWidths.details - 8;
    const detailsLines = detailsFull
      ? doc.splitTextToSize(detailsFull, detailsMaxWidth)
      : [];

    const linesCount = Math.max(1, detailsLines.length);
    const rowHeight = linesCount * rowLineHeight + 6;

    if (y + rowHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
      drawHeader();
    }

    const rowTop = y;
    const baseline = y + rowLineHeight + 2;

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(left, rowTop, right - left, rowHeight, "F");
    }

    drawRowBorders(rowHeight, rowTop);

    doc.setFont(PDF_FONT_NAME, "normal");
    drawTextSmart(doc, numStr, colX.num - 4, baseline, { align: "right" });
    drawTextSmart(doc, dims, colX.dims - 4, baseline, { align: "right" });
    if (locStr) {
      drawTextSmart(doc, locStr, colX.location - 4, baseline, {
        align: "right",
      });
    }
    if (detailsLines.length > 0) {
      let dy = baseline;
      detailsLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.details - 4, dy, { align: "right" });
        dy += rowLineHeight;
      });
    }
    drawTextSmart(doc, unitPriceStr, colX.unitPrice - 4, baseline, {
      align: "right",
      forceRtl: false,
    });
    drawTextSmart(doc, qtyStr, colX.qty - 4, baseline, {
      align: "right",
      forceRtl: false,
    });
    drawTextSmart(doc, totalStr, colX.total - 4, baseline, {
      align: "right",
      forceRtl: false,
    });

    y += rowHeight;
  });

  return y;
}
