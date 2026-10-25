// Local CSV parsing (RFC 4180 quoting) with delimiter and text-encoding detection.

export type DecodedText = { text: string; encoding: string };

/** UTF-8 (with/without BOM), UTF-16 with BOM, else Windows-1255 (Hebrew Excel "CSV" default). */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder("utf-8").decode(bytes.subarray(3)), encoding: "UTF-8" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: new TextDecoder("utf-16le").decode(bytes.subarray(2)), encoding: "UTF-16LE" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: new TextDecoder("utf-16be").decode(bytes.subarray(2)), encoding: "UTF-16BE" };
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes), encoding: "UTF-8" };
  } catch {
    try {
      return { text: new TextDecoder("windows-1255").decode(bytes), encoding: "Windows-1255" };
    } catch {
      return { text: new TextDecoder("utf-8").decode(bytes), encoding: "UTF-8 (lossy)" };
    }
  }
}

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 10);
  let best = ",";
  let bestScore = -1;
  for (const delim of [",", ";", "\t"]) {
    const counts = sample.map((l) => splitLineSimple(l, delim));
    if (!counts.length) continue;
    const first = counts[0];
    const consistent = counts.filter((c) => c === first).length;
    const score = first > 0 ? consistent * 10 + first : -1;
    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }
  return best;
}

function splitLineSimple(line: string, delim: string): number {
  let n = 0;
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === delim && !q) n++;
  }
  return n;
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === "") inQuotes = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: string[][]): string {
  return "\ufeff" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
