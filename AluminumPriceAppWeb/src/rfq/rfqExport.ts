import type { RfqLanguage, SupplierRequest } from "./types";
import { formatRfqNumber } from "./rfqState";
import { isTauri } from "../storage";
import { openPdfSaveFolder, printPdfBytes, savePdfBytes } from "../pdfExporter";

function safeFilePart(s: string): string {
  const printable = Array.from(s, (ch) => (ch.charCodeAt(0) < 32 ? "_" : ch)).join("");
  return printable.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function rfqPdfFilename(req: SupplierRequest, lang: RfqLanguage): string {
  const parts = [formatRfqNumber(req.number) || "RFQ", safeFilePart(req.projectName || req.projectReference || ""), req.requestDate, lang.toUpperCase()];
  return `${parts.filter(Boolean).join(" ")}.pdf`;
}

async function buildBytes(req: SupplierRequest, lang: RfqLanguage): Promise<ArrayBuffer> {
  const { buildRfqPdfBytes } = await import("./pdf/rfqPdf");
  const bytes = await buildRfqPdfBytes(req, { lang });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function exportRfqPdf(req: SupplierRequest, lang: RfqLanguage, pdfSaveFolder?: string) {
  const year = Number(req.requestDate.slice(0, 4)) || new Date().getFullYear();
  return savePdfBytes(await buildBytes(req, lang), {
    filename: rfqPdfFilename(req, lang),
    year,
    pdfSaveFolder,
    documentType: "supplier_rfq",
  });
}

export async function printRfqPdf(req: SupplierRequest, lang: RfqLanguage) {
  return printPdfBytes(await buildBytes(req, lang), rfqPdfFilename(req, lang));
}

export function openRfqPdfFolder(pdfSaveFolder?: string) {
  return openPdfSaveFolder(pdfSaveFolder, "supplier_rfq");
}

/** Save a generated file: Tauri → native "Save as" dialog; browser → download. Returns false if cancelled. */
export async function saveGeneratedFile(data: Uint8Array | string, filename: string, mime: string): Promise<boolean> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (isTauri()) {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const fs = await import("@tauri-apps/plugin-fs");
    const ext = filename.split(".").pop() ?? "";
    const path = await dialog.save({ defaultPath: filename, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
    if (!path) return false;
    await fs.writeFile(path, bytes);
    return true;
  }
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return true;
}
