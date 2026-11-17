// Minimal local .xlsx reader/writer (Office Open XML) built on fflate.
// Reads cached cell values only: formulas are never evaluated and macros are never executed
// (.xlsx cannot contain VBA; .xlsm/.xls are rejected before reaching this module).

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

export type Sheet = { name: string; rows: string[][]; formulaCells: number };

const MAX_UNCOMPRESSED = 40 * 1024 * 1024;

function decodeXml(s: string): string {
  return s
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag);
  return m ? decodeXml(m[1]) : undefined;
}

/** Concatenate every <t> text node inside a fragment (handles rich text runs, ignores phonetic runs). */
function textContent(fragment: string): string {
  const cleaned = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) out += decodeXml(m[1] ?? "");
  return out;
}

function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolvePath(target: string): string {
  const t = target.replace(/^\//, "");
  return t.startsWith("xl/") ? t : `xl/${t.replace(/^\.\//, "")}`;
}

/** Drop element namespace prefixes (`<x:row>` → `<row>`) so both default and prefixed OOXML parse. */
function deNamespace(xml: string): string {
  return xml.replace(/<\/?([A-Za-z_][\w.-]*):/g, (tag) => tag.replace(/([A-Za-z_][\w.-]*):/, ""));
}

export function readXlsx(bytes: Uint8Array, maxRows: number): Sheet[] {
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      if (!/^(xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/[^/]+\.xml)$/.test(f.name)) return false;
      total += f.originalSize;
      if (total > MAX_UNCOMPRESSED) throw new Error("file expands to more than 40 MB");
      return true;
    },
  });
  const wb = files["xl/workbook.xml"];
  if (!wb) throw new Error("not an Excel workbook (xl/workbook.xml missing)");
  const workbookXml = deNamespace(strFromU8(wb));
  const relsXml = files["xl/_rels/workbook.xml.rels"] ? deNamespace(strFromU8(files["xl/_rels/workbook.xml.rels"])) : "";
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = attr(m[0], "Id");
    const target = attr(m[0], "Target");
    if (id && target) rels.set(id, resolvePath(target));
  }

  const shared: string[] = [];
  if (files["xl/sharedStrings.xml"]) {
    const ss = deNamespace(strFromU8(files["xl/sharedStrings.xml"]));
    for (const m of ss.matchAll(/<si>([\s\S]*?)<\/si>|<si\/>/g)) shared.push(textContent(m[1] ?? ""));
  }

  const sheets: Sheet[] = [];
  const sheetTags = [...workbookXml.matchAll(/<sheet\b[^>]*>/g)];
  sheetTags.forEach((m, i) => {
    const name = attr(m[0], "name") ?? `Sheet${i + 1}`;
    const rid = attr(m[0], "r:id") ?? "";
    const path = rels.get(rid) ?? `xl/worksheets/sheet${i + 1}.xml`;
    const data = files[path];
    if (!data) return;
    sheets.push(parseSheet(name, deNamespace(strFromU8(data)), shared, maxRows));
  });
  return sheets;
}

function parseSheet(name: string, xml: string, shared: string[], maxRows: number): Sheet {
  const rows: string[][] = [];
  let formulaCells = 0;
  const rowRe = /<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g;
  let rm: RegExpExecArray | null;
  let implicitRow = 0;
  while ((rm = rowRe.exec(xml))) {
    const rAttr = rm[1] ? attr(`<row ${rm[1]}>`, "r") : undefined;
    const rowIdx = rAttr ? Number(rAttr) - 1 : implicitRow;
    implicitRow = rowIdx + 1;
    if (rowIdx >= maxRows + 50) throw new Error(`more than ${maxRows} rows`);
    const cells: string[] = [];
    const body = rm[2] ?? "";
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cm: RegExpExecArray | null;
    let implicitCol = 0;
    while ((cm = cellRe.exec(body))) {
      const head = `<c ${cm[1] ?? cm[2] ?? ""}>`;
      const ref = attr(head, "r");
      const col = ref ? colIndex(ref) : implicitCol;
      implicitCol = col + 1;
      if (col > 200) continue;
      const inner = cm[3] ?? "";
      const type = attr(head, "t");
      if (/<f\b/.test(inner)) formulaCells++;
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = "";
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textContent(/<is>([\s\S]*?)<\/is>/.exec(inner)?.[1] ?? "");
      else if (type === "b") value = v === "1" ? "TRUE" : v === "0" ? "FALSE" : "";
      else if (type === "e") value = "";
      else value = v != null ? decodeXml(v) : "";
      while (cells.length < col) cells.push("");
      cells[col] = value;
    }
    while (rows.length < rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }
  return { name, rows, formulaCells };
}

// ---------- writer (templates) ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function colName(i: number): string {
  let s = "";
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type WriteSheet = { name: string; rows: (string | number)[][]; colWidths?: number[]; rtl?: boolean };

/** Build a small .xlsx file. Numbers are written as numeric cells, everything else as inline strings. */
export function writeXlsx(sheets: WriteSheet[]): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  files["[Content_Types].xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
        )
        .join("") +
      `</Types>`
  );
  files["_rels/.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`
  );
  files["xl/workbook.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
      sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      `</sheets></workbook>`
  );
  files["xl/_rels/workbook.xml.rels"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`
  );
  files["xl/styles.xml"] = strToU8(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
      `<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>` +
      `<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
      `<fill><patternFill patternType="solid"><fgColor rgb="FFDBEAFE"/><bgColor indexed="64"/></patternFill></fill></fills>` +
      `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
      `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
      `<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
      `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>` +
      `</styleSheet>`
  );
  sheets.forEach((s, i) => {
    const cols = s.colWidths?.length
      ? `<cols>${s.colWidths.map((w, c) => `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
      : "";
    const rowsXml = s.rows
      .map((r, ri) => {
        const style = ri === 0 ? ` s="1"` : "";
        const cells = r
          .map((v, ci) => {
            const ref = `${colName(ci)}${ri + 1}`;
            if (typeof v === "number" && isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
            return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(String(v))}</t></is></c>`;
          })
          .join("");
        return `<row r="${ri + 1}">${cells}</row>`;
      })
      .join("");
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
        `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
        `<sheetViews><sheetView workbookViewId="0"${s.rtl ? ` rightToLeft="1"` : ""}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
        cols +
        `<sheetData>${rowsXml}</sheetData></worksheet>`
    );
  });
  return zipSync(files, { level: 6 });
}
