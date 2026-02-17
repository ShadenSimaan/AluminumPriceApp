// FILE: src/pdfExporter.ts
// Handles PDF export for the aluminum quote app

// Check if running in Tauri
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Get save path and create folder structure for PDFs
// If customFolder is provided, use it; otherwise use Desktop
async function getPdfSavePath(filename: string, year: number, customFolder?: string): Promise<string | null> {
  if (!isTauri()) {
    return null; // Browser - use download
  }
  
  try {
    console.log("Starting getPdfSavePath...");
    console.log("Parameters - filename:", filename, "year:", year);
    
    // Import path API - try different import methods
    let pathApi: any;
    try {
      pathApi = await import("@tauri-apps/api/path");
      console.log("Path API imported successfully");
      console.log("Path API keys:", Object.keys(pathApi));
    } catch (importError: any) {
      console.error("Failed to import @tauri-apps/api/path:", importError);
      throw new Error(`Failed to import path API: ${importError?.message || importError}`);
    }
    
    const fsApi = await import("@tauri-apps/plugin-fs");
    console.log("FS API imported successfully");
    console.log("FS API keys:", Object.keys(fsApi));
    
    // If using custom folder, request permission scope for it
    if (customFolder && customFolder.trim()) {
      try {
        // Request scope for the custom folder and all subdirectories
        const folderPath = customFolder.trim();
        console.log("Requesting scope for custom folder:", folderPath);
        
        // In Tauri 2.0, we need to scope the folder for access
        // The scope API allows us to add paths dynamically
        const fsApiAny = fsApi as any;
        if (typeof fsApiAny.scope === "function") {
          await fsApiAny.scope(folderPath, { recursive: true });
          console.log("Scope granted for folder:", folderPath);
        } else if (fsApiAny.allowScope) {
          // Alternative API name
          await fsApiAny.allowScope(folderPath, { recursive: true });
          console.log("Scope granted for folder (via allowScope):", folderPath);
        }
      } catch (scopeError: any) {
        console.warn("Could not set scope (may already be scoped):", scopeError);
        // Continue anyway - the folder might already be in scope from dialog selection
      }
    }
    
    // Determine base path: use custom folder if provided, otherwise Desktop
    let basePath: string;
    
    if (customFolder && customFolder.trim()) {
      // Use custom folder (path shown in UI)
      console.log("Using custom folder:", customFolder);
      basePath = customFolder.trim();
      // Skip exists check - user selected this folder; permission may block exists() even when folder is valid
    } else {
      // Get desktop directory - try multiple methods
      try {
        // Method 1: Try desktopDir() function
        if (typeof pathApi.desktopDir === "function") {
          console.log("Trying desktopDir()...");
          basePath = await pathApi.desktopDir();
          console.log("Desktop path (from desktopDir):", basePath);
        } 
        // Method 2: Try using path.join with known Windows paths
        else {
          console.log("desktopDir not found, trying alternative method...");
          // On Windows, Desktop is typically at %USERPROFILE%\Desktop
          // We'll use the home directory and append Desktop
          try {
            console.log("Trying homeDir()...");
            const homeDir = await pathApi.homeDir();
            console.log("Home directory:", homeDir);
            basePath = await pathApi.join(homeDir, "Desktop");
            console.log("Desktop path (from homeDir + Desktop):", basePath);
          } catch (homeError: any) {
            console.error("Failed to get home directory:", homeError);
            console.error("Home error details:", JSON.stringify(homeError, null, 2));
            throw new Error(`Could not get desktop path: ${homeError?.message || homeError}`);
          }
      }
    } catch (desktopError: any) {
      console.error("Failed to get desktop directory:", desktopError);
      console.error("Desktop error details:", JSON.stringify(desktopError, null, 2));
      throw new Error(`Failed to get desktop directory: ${desktopError?.message || desktopError}`);
    }
    }
    
    if (!basePath || basePath.trim() === "") {
      throw new Error("Base path is empty or undefined");
    }
    
    // Build folder structure using path.join for proper path handling
    // [BASE_PATH]/[YEAR]/filename.pdf
    // If using Desktop, add "הצעת מחיר" folder; otherwise use base directly
    let quotesFolder: string;
    if (customFolder && customFolder.trim()) {
      // Custom folder: organize directly by year
      quotesFolder = basePath;
    } else {
      // Desktop: use "הצעת מחיר" subfolder
      quotesFolder = await pathApi.join(basePath, "הצעת מחיר");
    }
    
    const yearFolder = await pathApi.join(quotesFolder, String(year));
    const fullPath = await pathApi.join(yearFolder, filename);
    
    console.log("Quotes folder:", quotesFolder);
    console.log("Year folder:", yearFolder);
    console.log("Full path:", fullPath);
    
    // Create folders if they don't exist
    // In Tauri 2.0 plugin-fs, we'll use a workaround: create a temp file in each directory
    // This forces the directory to be created, then we remove the temp file
    try {
      // Helper function to create a directory recursively
      const ensureDirectory = async (dirPath: string) => {
        console.log(`Checking if directory exists: ${dirPath}`);
        const exists = await fsApi.exists(dirPath);
        if (exists) {
          console.log(`Directory already exists: ${dirPath}`);
          return; // Directory already exists
        }
        
        console.log(`Directory does not exist, creating: ${dirPath}`);
        
        // Create parent directory first if it doesn't exist
        const parentDir = await pathApi.dirname(dirPath);
        console.log(`Parent directory: ${parentDir}`);
        if (parentDir !== dirPath && parentDir !== "." && !(await fsApi.exists(parentDir))) {
          console.log(`Parent directory doesn't exist, creating it first: ${parentDir}`);
          await ensureDirectory(parentDir);
        }
        
        // Try using fs.mkdir if available (Tauri 2.0 plugin-fs)
        try {
          if (fsApi.mkdir) {
            console.log(`Using fs.mkdir to create: ${dirPath}`);
            await fsApi.mkdir(dirPath, { recursive: true });
            if (await fsApi.exists(dirPath)) {
              console.log(`Directory created successfully via mkdir: ${dirPath}`);
              return;
            }
          }
        } catch (mkdirError: any) {
          console.warn(`fs.mkdir failed:`, mkdirError);
        }
        
        // Fallback: Use shell command (Windows)
        try {
          console.log(`Attempting to create directory using shell command: ${dirPath}`);
          const shellModule = await import("@tauri-apps/plugin-shell");
          const { Command } = shellModule;
          
          // On Windows, use 'mkdir' command - pass path as separate argument
          // The path should be passed directly, not quoted in the array
          let mkdirCommand;
          if (typeof Command.create === "function") {
            mkdirCommand = Command.create("cmd", ["/c", "mkdir", dirPath]);
          } else {
            mkdirCommand = new (Command as any)("cmd", ["/c", "mkdir", dirPath]);
          }
          
          const result = await mkdirCommand.execute();
          console.log(`Shell mkdir executed, result:`, result);
          
          // Wait a bit for the directory to be created
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Verify the directory was created
          if (await fsApi.exists(dirPath)) {
            console.log(`Directory created successfully via shell: ${dirPath}`);
            return;
          } else {
            // Try one more time after a longer wait
            await new Promise(resolve => setTimeout(resolve, 200));
            if (await fsApi.exists(dirPath)) {
              console.log(`Directory created successfully via shell (after retry): ${dirPath}`);
              return;
            }
            throw new Error("Directory was not created after shell command");
          }
        } catch (shellError: any) {
          console.error(`Shell method failed:`, shellError);
          throw new Error(`Failed to create directory ${dirPath}: ${shellError?.message || shellError}. Make sure you have write permissions.`);
        }
      };
      
      // Create quotes folder
      if (!(await fsApi.exists(quotesFolder))) {
        console.log("Creating quotes folder...");
        await ensureDirectory(quotesFolder);
      } else {
        console.log("Quotes folder already exists");
      }
      
      // Create year folder
      if (!(await fsApi.exists(yearFolder))) {
        console.log("Creating year folder...");
        await ensureDirectory(yearFolder);
      } else {
        console.log("Year folder already exists");
      }
    } catch (folderError: any) {
      console.error("Failed to create folders:", folderError);
      if (customFolder && customFolder.trim()) {
        console.warn("Returning path anyway so export can try scope and write");
        return fullPath;
      }
      throw new Error(`Failed to create folders: ${folderError?.message || folderError}`);
    }
    
    console.log("Returning full path:", fullPath);
    return fullPath;
  } catch (error: any) {
    console.error("Error getting Desktop path:", error);
    console.error("Error name:", error?.name);
    console.error("Error message:", error?.message);
    console.error("Error stack:", error?.stack);
    if (error?.cause) {
      console.error("Error cause:", error.cause);
    }
    // Show more details about the error
    if (error?.message) {
      console.error("Detailed error message:", error.message);
    }
    return null;
  }
}

const PDF_FONT_NAME = "NotoHebrew";
const PDF_FONT_FILE_REGULAR = "NotoSansHebrew-Regular.ttf";
const PDF_FONT_FILE_BOLD = "NotoSansHebrew-Bold.ttf";
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
  manualUnitPrice?: string;
  subtotal?: number;
  addons: PdfAddon[];
  profileName?: string; // make sure this exists on your items
}

export interface PdfFreeFormAddition {
  id?: string;
  name: string;
  price: string;
  qty: string;
}

export interface PdfQuotePayload {
  title: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  notes?: string;
  taxPercentText: string; // e.g. "18" or "0.18"
  items: PdfLineItem[];
  freeFormAdditions?: PdfFreeFormAddition[];
  pdfSaveFolder?: string; // Optional custom folder path for saving PDFs
  dimensionUnit?: "cm" | "mm"; // display dimensions in cm or mm (data is stored in cm)
}

export type PdfExportResult = { success: true; savedPath: string } | { success: false; error: string };

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

// Format number without currency symbol (for table columns)
function formatNumberPdf(value: number): string {
  // Just the number, no currency symbol
  return moneyNumberFmt.format(value);
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

/** Possible base paths for fonts (browser and Tauri). */
function getFontBasePaths(): string[] {
  const paths: string[] = [];
  if (typeof document !== "undefined" && document.baseURI) {
    try {
      const base = new URL(document.baseURI);
      paths.push(new URL("fonts/", base).href);
      paths.push(new URL("./fonts/", base).href);
    } catch {
      paths.push("/fonts/");
    }
  } else {
    paths.push("/fonts/");
  }
  return paths;
}

/** Fetch font bytes; tries multiple URLs so it works in dev, production, and Tauri. */
async function fetchFontBytes(filename: string): Promise<ArrayBuffer> {
  const paths = getFontBasePaths();
  let lastError: Error | null = null;
  for (const base of paths) {
    const url = base.endsWith("/") ? `${base}${filename}` : `${base}/${filename}`;
    try {
      const resp = await fetch(url);
      if (resp.ok) return await resp.arrayBuffer();
      lastError = new Error(`HTTP ${resp.status}`);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("font missing");
}

/** Register Noto Hebrew font (3-arg addFont so jsPDF uses default Unicode handling). Returns true if font was loaded. */
async function ensureHebrewFont(doc: any): Promise<boolean> {
  try {
    const buf = await fetchFontBytes(PDF_FONT_FILE_REGULAR);
    const base64Regular = arrayBufferToBase64(buf);

    doc.addFileToVFS(PDF_FONT_FILE_REGULAR, base64Regular);
    doc.addFont(PDF_FONT_FILE_REGULAR, PDF_FONT_NAME, "normal");

    try {
      const boldBuf = await fetchFontBytes(PDF_FONT_FILE_BOLD);
      const base64Bold = arrayBufferToBase64(boldBuf);
      doc.addFileToVFS(PDF_FONT_FILE_BOLD, base64Bold);
      doc.addFont(PDF_FONT_FILE_BOLD, PDF_FONT_NAME, "bold");
    } catch {
      doc.addFont(PDF_FONT_FILE_REGULAR, PDF_FONT_NAME, "bold");
    }
    doc.setFont(PDF_FONT_NAME, "bold");
    return true;
  } catch (e) {
    console.warn(
      "Hebrew font not found. Place NotoSansHebrew-Regular.ttf in public/fonts/. Proceeding with default font.",
      e
    );
    return false;
  }
}

/** Ensure PDF text is bold. Use built-in font if Hebrew font was not loaded (avoids 'widths' of undefined). */
function setPdfBold(doc: any, useHebrew: boolean) {
  if (useHebrew) {
    doc.setFont(PDF_FONT_NAME, "bold");
  } else {
    doc.setFont("Helvetica", "bold");
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

// --------- MAIN PUBLIC API ---------

/** Build filename for PDF (customer name + date). */
function getPdfFilename(customerName: string): string {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const datePart = `${yyyy}-${mm}-${dd}`;
  const nameForFile = (customerName || "לקוח ללא שם").trim().replace(/^לכבוד\s+/, "");
  const safeBase = nameForFile.replace(/[\\/:*?"<>|]/g, "_");
  return `${safeBase} ${datePart}.pdf`;
}

export async function exportQuotePdf(payload: PdfQuotePayload): Promise<PdfExportResult> {
  const { customerName, customerPhone, customerEmail, notes } = payload;

  if (!customerName.trim()) {
    return { success: false, error: "אנא הזן/י שם לקוח לפני יצוא PDF" };
  }
  if (!payload.items.length && (!payload.freeFormAdditions || payload.freeFormAdditions.length === 0)) {
    return { success: false, error: "ההצעה ריקה. הוסף/י פריטים לפני יצוא PDF." };
  }

  let jsPDFMod: any;
  try {
    jsPDFMod = await import("jspdf");
  } catch (e) {
    return { success: false, error: "חסרות חבילות PDF. התקן/י: npm i jspdf" };
  }
  const jsPDF = jsPDFMod.default || jsPDFMod;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "pt",
    format: "a4",
  });

  const hebrewOk = await ensureHebrewFont(doc);
  let pdfFontName = hebrewOk ? PDF_FONT_NAME : "Helvetica";
  setPdfBold(doc, hebrewOk);

  // If the custom font has no usable metrics (jsPDF 'widths' undefined), fall back to Helvetica so export doesn't throw
  if (pdfFontName === PDF_FONT_NAME) {
    try {
      doc.getTextWidth(" ");
    } catch {
      pdfFontName = "Helvetica";
      doc.setFont("Helvetica", "bold");
    }
  }

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

  doc.setFont(pdfFontName, "bold");
  doc.setFontSize(18);
  headerLines.forEach((line) => {
    drawTextSmart(doc, line, pageWidth / 2, cursorY, {
      align: "center",
      forceRtl: true,
    });
    cursorY += 22;
  });

  cursorY += 12;

  // ===== Customer block =====
  const customerNameWithPrefix = customerName.trim() 
    ? (customerName.trim().startsWith("לכבוד") ? customerName : `לכבוד ${customerName}`)
    : "";
  
  // Customer name - "לכבוד" and name on same line, underline only under name
  if (customerNameWithPrefix) {
    doc.setFont(pdfFontName, "bold");
    doc.setFontSize(16);
    const nameX = pageWidth - marginX; // Right side
    
    // Extract just the name part (without "לכבוד ")
    const customerNameOnly = customerNameWithPrefix.startsWith("לכבוד ")
      ? customerNameWithPrefix.replace(/^לכבוד\s+/, "")
      : customerNameWithPrefix;
    
    // Calculate widths BEFORE drawing
    const lekavodText = "לכבוד";
    const spaceText = " ";
    const lekavodWidth = doc.getTextWidth(lekavodText);
    const spaceWidth = doc.getTextWidth(spaceText);
    const nameWidth = doc.getTextWidth(customerNameOnly);
    
    // Draw full text together for proper alignment
    const fullText = `${lekavodText}${spaceText}${customerNameOnly}`;
    drawTextSmart(doc, fullText, nameX, cursorY, {
      align: "right",
      forceRtl: true,
    });
    
    // Draw underline ONLY under the customer name
    // For RTL right-aligned text at position nameX:
    // - Full text spans from (nameX - fullTextWidth) to nameX
    // - "לכבוד " spans from (nameX - lekavodWidth - spaceWidth) to nameX  
    // - Name spans from (nameX - fullTextWidth) to (nameX - lekavodWidth - spaceWidth)
    const fullTextWidth = lekavodWidth + spaceWidth + nameWidth;
    const nameStartX = nameX - fullTextWidth; // Left edge of name
    const nameEndX = nameX - lekavodWidth - spaceWidth; // Right edge of name
    
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.8); // Thinner underline
    doc.line(nameStartX, cursorY + 6, nameEndX, cursorY + 6);
    
    cursorY += 24;
  }
  
  // Phone and email - bold, right-aligned
  doc.setFont(pdfFontName, "bold");
  doc.setFontSize(13);
  if (customerPhone?.trim()) {
    drawTextSmart(doc, customerPhone, pageWidth - marginX, cursorY, {
      align: "right",
      forceRtl: false,
    });
    cursorY += 19;
  }
  if (customerEmail?.trim()) {
    drawTextSmart(doc, customerEmail, pageWidth - marginX, cursorY, {
      align: "right",
      forceRtl: false,
    });
    cursorY += 19;
  }

  // Divider
  doc.setDrawColor(200);
  doc.line(marginX, cursorY, pageWidth - marginX, cursorY);
  cursorY += 12;

  // ===== Items table =====
  cursorY = drawItemsTable(
    doc,
    payload.items,
    payload.freeFormAdditions || [],
    cursorY,
    marginX,
    pageWidth,
    pageHeight,
    marginTop,
    marginBottom,
    payload.dimensionUnit ?? "cm",
    pdfFontName
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
    const manual = (it.manualUnitPrice ?? "").trim();
    const perItem = manual
      ? parseLooseNumber(manual) + addonsSum
      : area * parseLooseNumber(it.unitPrice) + addonsSum;
    return sum + perItem * qty;
  }, 0);

  // Add free-form additions to subtotal
  const freeFormSub = (payload.freeFormAdditions || []).reduce((sum, add) => {
    const price = parseLooseNumber(add.price);
    const qty = Math.max(0, parseLooseNumber(add.qty));
    return sum + price * qty;
  }, 0);
  const totalSub = sub + freeFormSub;

  const taxDecimal = normalizeTaxPercent(
    parseLooseNumber(payload.taxPercentText)
  );
  const vat = totalSub * taxDecimal;
  const grand = totalSub + vat;

  const boxWidth = 260;
  const boxX = marginX; // left side of page
  let boxY = cursorY + 18;

  doc.setDrawColor(210);
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX, boxY, boxWidth, 96, 8, 8);
  boxY += 26;

    // Note: text is still right-aligned inside the box (RTL)
    doc.setFont(pdfFontName, "bold");
    doc.setFontSize(13);
    drawTextSmart(
      doc,
      `מחיר: ${formatMoneyPdf(totalSub)}`,
      boxX + boxWidth - 12,
      boxY,
      { align: "right" }
    );
  boxY += 26;
  drawTextSmart(
    doc,
    `מע״מ: ${formatMoneyPdf(vat)}`,
    boxX + boxWidth - 12,
    boxY,
    { align: "right" }
  );
  boxY += 28;

  // highlighted grand total
  doc.setFillColor(236, 248, 255); // Match the table header blue color
  doc.roundedRect(boxX + 10, boxY - 18, boxWidth - 20, 34, 6, 6, "F");
  doc.setDrawColor(210); // Match the border color
  doc.setLineWidth(0.3);
  doc.roundedRect(boxX + 10, boxY - 18, boxWidth - 20, 34, 6, 6);
  doc.setFont(pdfFontName, "bold");
  doc.setFontSize(16);
  drawTextSmart(
    doc,
    `סה״כ לתשלום: ${formatMoneyPdf(grand)}`,
    boxX + boxWidth - 18,
    boxY + 2,
    { align: "right" }
  );
  doc.setFont(pdfFontName, "bold");

  // ===== Footer: anchored to bottom of last page =====
  const footerHeight = 80;
  const footerTop = pageHeight - marginBottom - footerHeight;
  let footerY = footerTop;

  // Notes come BEFORE date
  doc.setFont(pdfFontName, "bold");
  doc.setFontSize(13);
  if (notes?.trim()) {
    const notesLabel = "הערות:";
    drawTextSmart(doc, notesLabel, pageWidth - marginX, footerY, {
      align: "right",
    });
    footerY += 20;

    doc.setFont(pdfFontName, "bold");
    doc.setFontSize(12);
    const notesWidth = pageWidth - marginX * 2;
    // Preserve user line breaks: split by \n then wrap each paragraph
    const paragraphs = notes.trim().split(/\r?\n/);
    const lineHeight = 15;
    for (const para of paragraphs) {
      const wrapped = doc.splitTextToSize(para.trim(), notesWidth);
      wrapped.forEach((line: string, idx: number) => {
        drawTextSmart(doc, line, pageWidth - marginX, footerY + idx * lineHeight, {
          align: "right",
        });
      });
      footerY += wrapped.length * lineHeight;
    }
    footerY += 8;
  }

  // Date comes after notes
  doc.setFont(pdfFontName, "bold");
  doc.setFontSize(13);
  drawTextSmart(
    doc,
    `תאריך: ${dateFmt.format(new Date())}`,
    pageWidth - marginX,
    footerY,
    { align: "right" }
  );
  footerY += 20;

  // Signature label
  footerY += 10;
  doc.setFont(pdfFontName, "bold");
  doc.setFontSize(13);
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

  // ===== Filename: "<CustomerName> YYYY-MM-DD.pdf" =====
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const datePart = `${yyyy}-${mm}-${dd}`;

  // Remove "לכבוד " prefix from customer name for filename
  const nameForFile = (customerName || "לקוח ללא שם").trim().replace(/^לכבוד\s+/, "");
  const safeBase = nameForFile.replace(/[\\/:*?"<>|]/g, "_");
  const filename = `${safeBase} ${datePart}.pdf`;

  // 🔹 IMPORTANT PART: Save PDF and open it
  // Check if we're in Tauri environment
  const isTauriEnv = isTauri();
  
  if (isTauriEnv) {
    try {
      console.log("=== PDF EXPORT START ===");
      console.log("Tauri environment detected, saving PDF...");
      
      // In Tauri: Save to Desktop/הצעת מחיר/[YEAR]/ and open with default viewer
      const fsModule = await import("@tauri-apps/plugin-fs");
      const openerModule = await import("@tauri-apps/plugin-opener");
      const shellModule = await import("@tauri-apps/plugin-shell");
      const pathModule = await import("@tauri-apps/api/path");
      const dialogModule = await import("@tauri-apps/plugin-dialog");
      
      console.log("All modules imported successfully");
      console.log("fsModule methods:", Object.keys(fsModule));
      
      // Get save path: [CUSTOM_FOLDER or Desktop]/[YEAR]/filename.pdf
      let savePath = await getPdfSavePath(filename, yyyy, payload.pdfSaveFolder);
      
      if (!savePath && payload.pdfSaveFolder && payload.pdfSaveFolder.trim()) {
        console.warn("getPdfSavePath returned null; using shown folder path");
        const base = payload.pdfSaveFolder.trim();
        const yearFolder = await pathModule.join(base, String(yyyy));
        savePath = await pathModule.join(yearFolder, filename);
        console.log("Built save path from shown folder:", savePath);
        // Scope and create year folder so the write can succeed
        try {
          const fsAny = fsModule as any;
          if (typeof fsAny.scope === "function") {
            await fsAny.scope(base, { recursive: true });
          } else if (typeof fsAny.allowScope === "function") {
            await fsAny.allowScope(base, { recursive: true });
          }
          if (fsModule.mkdir && !(await fsModule.exists(yearFolder))) {
            await fsModule.mkdir(yearFolder, { recursive: true });
          }
        } catch (fallbackErr: any) {
          console.warn("Fallback scope/mkdir:", fallbackErr?.message || fallbackErr);
        }
      }
      
      if (!savePath) {
        console.error("getPdfSavePath returned null");
        throw new Error("Failed to get save path - check console for details");
      }
      
      console.log("Got save path successfully:", savePath);
      
      // Generate PDF as array buffer for saving
      console.log("Generating PDF array buffer...");
      const pdfArrayBuffer = doc.output("arraybuffer");
      console.log("PDF array buffer generated, size:", pdfArrayBuffer.byteLength, "bytes");
      
      // Get the folder path (year folder) to open in Windows Explorer
      // Extract directory from the full file path
      const folderPath = await pathModule.dirname(savePath);
      console.log("Folder path (year folder):", folderPath);
      console.log("PDF array buffer generated, size:", pdfArrayBuffer.byteLength, "bytes");
      
      // Try alternative approach: Use save dialog to get explicit permission
      // This ensures Tauri grants permission for the specific file path
      let finalSavePath = savePath;
      
      // If using custom folder, try to use save dialog to get permission
      if (payload.pdfSaveFolder && payload.pdfSaveFolder.trim()) {
        try {
          console.log("Using custom folder, attempting to get permission via save dialog...");
          const saveResult = await dialogModule.save({
            defaultPath: savePath,
            title: "שמור PDF",
            filters: [{ name: "PDF", extensions: ["pdf"] }],
          });
          
          if (saveResult) {
            finalSavePath = typeof saveResult === "string" ? saveResult : savePath;
            console.log("Save dialog returned path:", finalSavePath);
            // Update the folder path if save dialog changed it
            const newFolderPath = await pathModule.dirname(finalSavePath);
            if (newFolderPath !== folderPath) {
              console.log("Folder path updated to:", newFolderPath);
            }
          } else {
            console.log("Save dialog was cancelled, using original path");
          }
        } catch (dialogError: any) {
          console.warn("Save dialog failed, using direct path:", dialogError);
          // Continue with original path
        }
      }
      
      // Ensure the directory path is in scope before writing
      // This is critical for custom folders in Tauri 2.0
      const finalFolderPath = await pathModule.dirname(finalSavePath);
      console.log("Final folder path:", finalFolderPath);
      console.log("Final save path:", finalSavePath);
      console.log("Available fsModule methods:", Object.keys(fsModule));
      
      // Try multiple methods to request scope
      let scopeGranted = false;
      try {
        const fsModuleAny = fsModule as any;
        // Method 1: Try scope function
        if (typeof fsModuleAny.scope === "function") {
          console.log("Attempting Method 1: fsModule.scope()");
          await fsModuleAny.scope(finalFolderPath, { recursive: true });
          console.log("✓ Method 1: Scope granted via scope()");
          scopeGranted = true;
        }
        // Method 2: Try allowScope
        else if (typeof fsModuleAny.allowScope === "function") {
          console.log("Attempting Method 2: fsModule.allowScope()");
          await fsModuleAny.allowScope(finalFolderPath, { recursive: true });
          console.log("✓ Method 2: Scope granted via allowScope()");
          scopeGranted = true;
        }
        // Method 3: Check if there's a requestPermission method
        else if (typeof fsModuleAny.requestPermission === "function") {
          console.log("Attempting Method 3: fsModule.requestPermission()");
          await fsModuleAny.requestPermission(finalFolderPath);
          console.log("✓ Method 3: Permission granted via requestPermission()");
          scopeGranted = true;
        } else {
          console.warn("⚠ No scope method found. Available methods:", Object.keys(fsModule));
        }
      } catch (scopeError: any) {
        console.error("❌ SCOPE ERROR DETAILS:");
        console.error("Error name:", scopeError?.name);
        console.error("Error message:", scopeError?.message);
        console.error("Error stack:", scopeError?.stack);
        console.error("Error cause:", scopeError?.cause);
        console.error("Full error:", JSON.stringify(scopeError, Object.getOwnPropertyNames(scopeError), 2));
        // Continue anyway - try to write
      }
      
      // Save PDF to the folder
      console.log("=== ATTEMPTING TO WRITE FILE ===");
      console.log("Save path:", finalSavePath);
      console.log("Folder path:", finalFolderPath);
      console.log("Scope granted:", scopeGranted);
      console.log("PDF size:", pdfArrayBuffer.byteLength, "bytes");
      
      try {
        console.log("Calling fsModule.writeFile()...");
        // Try to write the file - Tauri will handle permissions
        await fsModule.writeFile(finalSavePath, new Uint8Array(pdfArrayBuffer));
        console.log("✓✓✓ PDF SAVED SUCCESSFULLY! ✓✓✓");
      } catch (writeError: any) {
        console.error("❌❌❌ FULL WRITE ERROR DETAILS ❌❌❌");
        console.error("Error type:", typeof writeError);
        console.error("Error name:", writeError?.name);
        console.error("Error message:", writeError?.message);
        console.error("Error stack:", writeError?.stack);
        console.error("Error cause:", writeError?.cause);
        console.error("Error code:", writeError?.code);
        console.error("Error toString():", writeError?.toString());
        console.error("Error valueOf():", writeError?.valueOf?.());
        console.error("Error keys:", Object.keys(writeError));
        console.error("Full error JSON:", JSON.stringify(writeError, Object.getOwnPropertyNames(writeError), 2));
        
        // Log all enumerable properties
        for (const key in writeError) {
          try {
            console.error(`Error.${key}:`, writeError[key]);
          } catch (e) {
            console.error(`Error.${key}: [cannot access]`);
          }
        }
        
        // Get error message
        const errorMsg = writeError?.message || String(writeError) || "Unknown error";
        const errorName = writeError?.name || "Error";
        const errorCode = writeError?.code || "N/A";
        
        console.error("=== ERROR SUMMARY ===");
        console.error(`Name: ${errorName}`);
        console.error(`Message: ${errorMsg}`);
        console.error(`Code: ${errorCode}`);
        console.error(`Path: ${finalSavePath}`);
        
        // If it's a permission error, provide helpful message with full details
        if (errorMsg.includes("forbidden") || errorMsg.includes("permission") || errorMsg.includes("denied") || errorMsg.includes("not allowed")) {
          const fullErrorDetails = `
שגיאה מלאה ביצוא PDF:

שם שגיאה: ${errorName}
הודעה: ${errorMsg}
קוד שגיאה: ${errorCode}
נתיב קובץ: ${finalSavePath}
תיקיית בסיס: ${payload.pdfSaveFolder || "Desktop (default)"}
תיקיית שנה: ${finalFolderPath}
Scope הוענק: ${scopeGranted ? "כן" : "לא"}

פתרונות אפשריים:
1. ודא שהתיקייה קיימת וניתנת לכתיבה
2. נסה לבחור תיקייה אחרת בהגדרות
3. ודא שיש לך הרשאות כתיבה לתיקייה
          `.trim();
          throw new Error(fullErrorDetails);
        }
        throw writeError;
      }
      
      // Open folder in Explorer with the PDF file selected (so user sees where it was saved)
      try {
        const { Command } = shellModule;
        // Windows: explorer /select,"path" — comma after /select is required
        const selectArg = "/select,\"" + finalSavePath.replace(/"/g, "\\\"") + "\"";
        let explorerCommand;
        if (typeof Command.create === "function") {
          explorerCommand = Command.create("explorer", [selectArg]);
        } else if (typeof Command === "function") {
          explorerCommand = new (Command as any)("explorer", [selectArg]);
        } else {
          throw new Error("Command API not available");
        }
        await explorerCommand.execute();
        console.log("✓ Folder opened with PDF selected!");
      } catch (explorerError: any) {
        console.warn("⚠ Failed to open folder with selection, trying open folder only:", explorerError?.message || explorerError);
        try {
          const folderPathToOpen = await pathModule.dirname(finalSavePath);
          await openerModule.openPath(folderPathToOpen);
          console.log("✓ Folder opened (file not selected)");
        } catch (fallbackErr: any) {
          console.warn("⚠ Could not open folder:", fallbackErr?.message || fallbackErr);
        }
      }
      
      // Open PDF with system's default PDF viewer (silently fail if it doesn't work)
      try {
        console.log("Attempting to open PDF with system viewer...");
        // Try to scope the file path before opening (if method exists)
        try {
          const fsModuleAny = fsModule as any;
          if (typeof fsModuleAny.scope === "function") {
            await fsModuleAny.scope(finalSavePath, { recursive: false });
            console.log("✓ Scoped file path for opening");
          }
        } catch (scopeErr) {
          console.warn("⚠ Could not scope file path:", scopeErr);
        }
        
        await openerModule.openPath(finalSavePath);
        console.log("✓ PDF opened successfully!");
      } catch (openError: any) {
        // Silently fail - don't show error to user since PDF was saved successfully
        console.warn("⚠ Could not open PDF file (but it was saved successfully):", openError?.message || openError);
        // The PDF was saved, which is the important part
        // User can manually open it from the folder
      }
      
      console.log("=== PDF EXPORT COMPLETE ===");
      return { success: true, savedPath: finalSavePath };
      
    } catch (error: any) {
      console.error("❌ Error in Tauri PDF export:", error);
      console.error("Error details:", {
        name: error?.name,
        message: error?.message,
        stack: error?.stack
      });
      throw error;
    }
  } else {
    // In browser: open in new window and download
    console.log("Browser environment, using standard download...");
    doc.output("dataurlnewwindow");
    doc.save(filename);
    return { success: true, savedPath: "" };
  }
}

/** Returns the folder path where PDFs are (or will be) saved. Null if not in Tauri. */
export async function getPdfSaveFolderPath(customFolder?: string): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const pathApi = await import("@tauri-apps/api/path");
    const year = new Date().getFullYear();
    let basePath: string;
    if (customFolder && customFolder.trim()) {
      basePath = customFolder.trim();
    } else {
      if (typeof pathApi.desktopDir === "function") {
        basePath = await pathApi.desktopDir();
      } else {
        const homeDir = await pathApi.homeDir();
        basePath = await pathApi.join(homeDir, "Desktop");
      }
      basePath = await pathApi.join(basePath, "הצעת מחיר");
    }
    const yearFolder = await pathApi.join(basePath, String(year));
    return yearFolder;
  } catch {
    return null;
  }
}

/** Opens the folder where PDF files are saved (the one shown in the UI). */
export async function openPdfSaveFolder(customFolder?: string): Promise<{ success: boolean; error?: string }> {
  if (!isTauri()) {
    return { success: false, error: "זמין רק באפליקציה" };
  }
  const folderPath =
    customFolder && customFolder.trim()
      ? customFolder.trim()
      : await getPdfSaveFolderPath(undefined);
  if (!folderPath) return { success: false, error: "לא ניתן לקבוע את נתיב התיקייה" };

  try {
    const opener = await import("@tauri-apps/plugin-opener");
    await opener.openPath(folderPath);
    return { success: true };
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes("Not allowed") || msg.includes("not allowed")) {
      try {
        const shell = await import("@tauri-apps/plugin-shell");
        const { Command } = shell;
        const cmd = typeof Command.create === "function"
          ? Command.create("explorer", [folderPath])
          : new (Command as any)("explorer", [folderPath]);
        await cmd.execute();
        return { success: true };
      } catch (shellErr: any) {
        return { success: false, error: shellErr?.message || String(shellErr) };
      }
    }
    return { success: false, error: msg };
  }
}

// ---- internal: table drawing (columns are RTL, with profile + wrapped text) ----

function drawItemsTable(
  doc: any,
  items: PdfLineItem[],
  freeFormAdditions: PdfFreeFormAddition[],
  startY: number,
  marginX: number,
  pageWidth: number,
  pageHeight: number,
  marginTop: number,
  marginBottom: number,
  dimensionUnit: "cm" | "mm" = "cm",
  fontName: string = PDF_FONT_NAME
): number {
  const right = pageWidth - marginX;
  const left = marginX;

  // Columns from RIGHT to LEFT:
  // מס׳ | פרופיל | מידות | מיקום | פרטים | מחיר ליח׳ | כמות | סה״כ
  const colWidths = {
    num: 25,
    profile: 80,
    dims: 65,
    location: 60,
    details: 120,
    unitPrice: 65,
    qty: 30,
    total: 70,
  };

  const colX = {
    num: right,
    profile: right - colWidths.num,
    dims: right - colWidths.num - colWidths.profile,
    location:
      right - colWidths.num - colWidths.profile - colWidths.dims,
    details:
      right -
      colWidths.num -
      colWidths.profile -
      colWidths.dims -
      colWidths.location,
    unitPrice:
      right -
      colWidths.num -
      colWidths.profile -
      colWidths.dims -
      colWidths.location -
      colWidths.details,
    qty:
      right -
      colWidths.num -
      colWidths.profile -
      colWidths.dims -
      colWidths.location -
      colWidths.details -
      colWidths.unitPrice,
    total:
      right -
      colWidths.num -
      colWidths.profile -
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
    doc.setLineWidth(0.3);
    doc.roundedRect(left, y, right - left, headerHeight, 6, 6);

    const centerY = y + headerHeight / 2 + 4;

    doc.setFont(fontName, "bold");
    doc.setFontSize(13);
    drawTextSmart(doc, "מס׳", colX.num - 4, centerY, { align: "right" });
    drawTextSmart(doc, "פרופיל", colX.profile - 4, centerY, {
      align: "right",
    });
    drawTextSmart(
      doc,
      dimensionUnit === "mm" ? "מידות (מ״מ)" : "מידות (ס״מ)",
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
    doc.setFont(fontName, "bold");
    doc.setFontSize(12);

    y += headerHeight;
  };

  const drawRowBorders = (rowHeight: number, startYRow: number) => {
    doc.setDrawColor(230);
    doc.setLineWidth(0.3);
    doc.rect(left, startYRow, right - left, rowHeight);

    const xs = [
      colX.num - colWidths.num,
      colX.profile - colWidths.profile,
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

  const allItemsCount = items.length + freeFormAdditions.length;
  if (allItemsCount === 0) return y;

  drawHeader();

  items.forEach((it, idx) => {
    const w = parseLooseNumber(it.widthCm);
    const h = parseLooseNumber(it.heightCm);
    const dims =
      dimensionUnit === "mm"
        ? `${Math.round(w * 10)}×${Math.round(h * 10)}`
        : `${Math.round(w)}×${Math.round(h)}`;

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
    const manual = (it.manualUnitPrice ?? "").trim();
    const perItemPrice = manual
      ? parseLooseNumber(manual) + addonsSum
      : area * parseLooseNumber(it.unitPrice) + addonsSum;
    const lineTotal = perItemPrice * qty;

    const numStr = String(idx + 1);
    const locStr = it.location || "";
    const profileStr = it.profileName || "";
    const unitPriceStr = formatNumberPdf(perItemPrice); // No ₪ symbol
    const qtyStr = moneyNumberFmt.format(qty);
    const totalStr = formatNumberPdf(lineTotal); // No ₪ symbol

    // Wrap long profile text inside its column
    const profileMaxWidth = colWidths.profile - 8;
    const profileLines = profileStr
      ? doc.splitTextToSize(profileStr, profileMaxWidth)
      : [];

    const detailsMaxWidth = colWidths.details - 8;
    const detailsLines = detailsFull
      ? doc.splitTextToSize(detailsFull, detailsMaxWidth)
      : [];

    // Wrap unit price and total text to prevent overflow
    const unitPriceMaxWidth = colWidths.unitPrice - 8;
    const unitPriceLines = unitPriceStr
      ? doc.splitTextToSize(unitPriceStr, unitPriceMaxWidth)
      : [];

    const totalMaxWidth = colWidths.total - 8;
    const totalLines = totalStr
      ? doc.splitTextToSize(totalStr, totalMaxWidth)
      : [];

    const linesCount = Math.max(
      1,
      profileLines.length,
      detailsLines.length,
      unitPriceLines.length,
      totalLines.length
    );
    const rowHeight = linesCount * rowLineHeight + 6;

    if (y + rowHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
      drawHeader();
    }

    const rowTop = y;
    let baseline = y + rowLineHeight + 2;

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(left, rowTop, right - left, rowHeight, "F");
    }

    drawRowBorders(rowHeight, rowTop);

    doc.setFont(fontName, "bold");
    doc.setFontSize(12);

    // מס'
    drawTextSmart(doc, numStr, colX.num - 4, baseline, { align: "right" });

    // פרופיל (wrapped)
    if (profileLines.length > 0) {
      let py = baseline;
      profileLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.profile - 4, py, {
          align: "right",
        });
        py += rowLineHeight;
      });
    }

    // מידות
    drawTextSmart(doc, dims, colX.dims - 4, baseline, { align: "right" });

    // מיקום
    if (locStr) {
      drawTextSmart(doc, locStr, colX.location - 4, baseline, {
        align: "right",
      });
    }

    // פרטים (wrapped)
    if (detailsLines.length > 0) {
      let dy = baseline;
      detailsLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.details - 4, dy, {
          align: "right",
        });
        dy += rowLineHeight;
      });
    }

    // מחיר ליח׳ – wrapped text
    if (unitPriceLines.length > 0) {
      let upy = baseline;
      unitPriceLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.unitPrice - 4, upy, {
          align: "right",
          forceRtl: false,
        });
        upy += rowLineHeight;
      });
    }

    // כמות
    drawTextSmart(doc, qtyStr, colX.qty - 4, baseline, {
      align: "right",
      forceRtl: false,
    });

    // סה"כ – wrapped text
    if (totalLines.length > 0) {
      let ty = baseline;
      totalLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.total - 4, ty, {
          align: "right",
          forceRtl: false,
        });
        ty += rowLineHeight;
      });
    }

    y += rowHeight;
  });

  // Add free-form additions as rows
  freeFormAdditions.forEach((add, addIdx) => {
    const price = parseLooseNumber(add.price);
    const qty = Math.max(0, parseLooseNumber(add.qty));
    const total = price * qty;

    // Calculate wrapped lines for unit price and total
    const freeFormUnitPriceStr = formatNumberPdf(price);
    const unitPriceMaxWidth = colWidths.unitPrice - 8;
    const freeFormUnitPriceLines = freeFormUnitPriceStr
      ? doc.splitTextToSize(freeFormUnitPriceStr, unitPriceMaxWidth)
      : [];

    const freeFormTotalStr = formatNumberPdf(total);
    const totalMaxWidth = colWidths.total - 8;
    const freeFormTotalLines = freeFormTotalStr
      ? doc.splitTextToSize(freeFormTotalStr, totalMaxWidth)
      : [];

    // Calculate row height based on wrapped text
    const freeFormLinesCount = Math.max(
      1,
      freeFormUnitPriceLines.length,
      freeFormTotalLines.length
    );
    const rowHeight = freeFormLinesCount * rowLineHeight + 6;
    if (y + rowHeight > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
      drawHeader();
    }

    const rowTop = y;
    const baseline = y + rowLineHeight + 2;

    if ((items.length + addIdx) % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(left, rowTop, right - left, rowHeight, "F");
    }

    drawRowBorders(rowHeight, rowTop);
    doc.setFont(fontName, "bold");

    // מס'
    const numStr = String(items.length + addIdx + 1);
    drawTextSmart(doc, numStr, colX.num - 4, baseline, { align: "right" });

    // פרופיל - empty for free-form
    // מידות - empty for free-form
    // מיקום - empty for free-form

    // פרטים - show the name
    if (add.name) {
      const detailsMaxWidth = colWidths.details - 8;
      const detailsLines = doc.splitTextToSize(add.name, detailsMaxWidth);
      let dy = baseline;
      detailsLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.details - 4, dy, { align: "right" });
        dy += rowLineHeight;
      });
    }

    // מחיר ליח׳ – wrapped text, no ₪ symbol
    if (freeFormUnitPriceLines.length > 0) {
      let upy = baseline;
      freeFormUnitPriceLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.unitPrice - 4, upy, {
          align: "right",
          forceRtl: false,
        });
        upy += rowLineHeight;
      });
    }

    // כמות
    drawTextSmart(doc, moneyNumberFmt.format(qty), colX.qty - 4, baseline, {
      align: "right",
      forceRtl: false,
    });

    // סה"כ – wrapped text, no ₪ symbol
    if (freeFormTotalLines.length > 0) {
      let ty = baseline;
      freeFormTotalLines.forEach((line: string) => {
        drawTextSmart(doc, line, colX.total - 4, ty, {
          align: "right",
          forceRtl: false,
        });
        ty += rowLineHeight;
      });
    }

    y += rowHeight;
  });

  return y;
}
