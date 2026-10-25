// Customer import: reads CSV / XLSX / vCard locally and works out which columns hold
// name, phone, email and notes from the headers or, failing that, from the cell contents.

import type { Customer } from "../types";
import { decodeText, parseCsv } from "../rfq/import/csv";
import { readXlsx } from "../rfq/import/xlsx";
import { normKey } from "../rfq/import/schema";

export const MAX_CUSTOMER_FILE_MB = 10;
export const MAX_CUSTOMER_ROWS = 5000;

export type CustomerField = "name" | "firstName" | "lastName" | "phone" | "phone2" | "email" | "company" | "address" | "city" | "notes";

export const CUSTOMER_FIELDS: CustomerField[] = ["name", "firstName", "lastName", "company", "phone", "phone2", "email", "address", "city", "notes"];

export const CUSTOMER_FIELD_LABELS: Record<CustomerField, string> = {
  name: "שם מלא",
  firstName: "שם פרטי",
  lastName: "שם משפחה",
  company: "חברה",
  phone: "טלפון",
  phone2: "טלפון נוסף",
  email: "אימייל",
  address: "כתובת",
  city: "עיר",
  notes: "הערות",
};

const ALIASES: Record<CustomerField, string[]> = {
  name: ["name", "full name", "customer", "customer name", "client", "client name", "contact", "contact name", "display name", "שם", "שם מלא", "שם לקוח", "לקוח", "שם הלקוח", "איש קשר", "לכבוד"],
  firstName: ["first name", "first", "given name", "שם פרטי", "פרטי"],
  lastName: ["last name", "last", "surname", "family name", "שם משפחה", "משפחה"],
  company: ["company", "organization", "organisation", "business", "company name", "חברה", "שם חברה", "עסק", "שם עסק", "ארגון"],
  phone: ["phone", "phone number", "mobile", "mobile phone", "cell", "cellphone", "tel", "telephone", "phone 1 value", "טלפון", "נייד", "טלפון נייד", "פלאפון", "סלולרי", "מספר טלפון", "טל"],
  phone2: ["phone 2", "phone2", "home phone", "work phone", "office phone", "phone 2 value", "other phone", "טלפון נוסף", "טלפון 2", "טלפון בית", "טלפון עבודה", "טלפון משרד", "בית", "משרד"],
  email: ["email", "e mail", "mail", "email address", "e mail address", "e mail 1 value", "אימייל", "מייל", "דואל", "דואר אלקטרוני", "כתובת מייל", "אי מייל"],
  address: ["address", "street", "street address", "address 1 formatted", "כתובת", "רחוב", "כתובת מגורים"],
  city: ["city", "town", "עיר", "ישוב", "יישוב"],
  notes: ["notes", "note", "remarks", "comments", "comment", "description", "הערות", "הערה", "תיאור", "פרטים"],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CustomerImportError extends Error {}

export type CustomerSheet = { name: string; rows: string[][] };

/** Read file bytes into sheets of text cells. vCard files become a single sheet with fixed headers. */
export function readCustomerFile(fileName: string, bytes: Uint8Array): CustomerSheet[] {
  if (bytes.byteLength > MAX_CUSTOMER_FILE_MB * 1024 * 1024) {
    throw new CustomerImportError(`הקובץ גדול מדי (מעל ${MAX_CUSTOMER_FILE_MB}MB)`);
  }
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "csv" || ext === "txt" || ext === "tsv") {
    const rows = parseCsv(decodeText(bytes).text);
    if (rows.length > MAX_CUSTOMER_ROWS + 1) throw new CustomerImportError(`יותר מ-${MAX_CUSTOMER_ROWS} שורות בקובץ`);
    return [{ name: fileName, rows }];
  }
  if (ext === "vcf") {
    return [{ name: fileName, rows: parseVcf(decodeText(bytes).text) }];
  }
  if (ext === "xlsx") {
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) throw new CustomerImportError("הקובץ אינו קובץ Excel תקין (.xlsx)");
    try {
      return readXlsx(bytes, MAX_CUSTOMER_ROWS).map((s) => ({ name: s.name, rows: s.rows }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/more than \d+ rows/.test(msg)) throw new CustomerImportError(`יותר מ-${MAX_CUSTOMER_ROWS} שורות בגיליון`);
      throw new CustomerImportError(`לא ניתן לקרוא את קובץ ה-Excel: ${msg}`);
    }
  }
  if (ext === "xls") {
    throw new CustomerImportError("קבצי ‎.xls‎ ישנים אינם נתמכים — יש לשמור ב-Excel בתור ‎.xlsx‎ או CSV");
  }
  throw new CustomerImportError("סוג קובץ לא נתמך. ניתן לייבא CSV, ‏Excel ‏(.xlsx) או אנשי קשר (.vcf)");
}

function unfoldVcf(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").replace(/=\n/g, "").split("\n");
}

function decodeQuotedPrintable(value: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(value.charCodeAt(i));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

function vcfValue(params: string, raw: string): string {
  const v = /ENCODING=QUOTED-PRINTABLE/i.test(params) ? decodeQuotedPrintable(raw) : raw;
  return v.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();
}

/** Parse vCard 2.1/3.0/4.0 contacts into rows: name, first, last, company, phone, phone2, email, address, notes. */
export function parseVcf(text: string): string[][] {
  const rows: string[][] = [["שם מלא", "שם פרטי", "שם משפחה", "חברה", "טלפון", "טלפון נוסף", "אימייל", "כתובת", "הערות"]];
  let card: { fn: string; first: string; last: string; org: string; tels: string[]; email: string; adr: string; note: string } | null = null;
  for (const line of unfoldVcf(text)) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    const raw = line.slice(idx + 1);
    const [nameWithGroup, ...paramParts] = head.split(";");
    const key = nameWithGroup.replace(/^[^.]*\./, "").toUpperCase();
    const params = paramParts.join(";");
    if (key === "BEGIN" && /vcard/i.test(raw)) {
      card = { fn: "", first: "", last: "", org: "", tels: [], email: "", adr: "", note: "" };
      continue;
    }
    if (!card) continue;
    if (key === "END") {
      rows.push([card.fn, card.first, card.last, card.org, card.tels[0] ?? "", card.tels.slice(1).join(", "), card.email, card.adr, card.note]);
      card = null;
      continue;
    }
    const value = vcfValue(params, raw);
    if (key === "FN") card.fn = value;
    else if (key === "N") {
      const parts = (/ENCODING=QUOTED-PRINTABLE/i.test(params) ? decodeQuotedPrintable(raw) : raw).split(";");
      card.last = vcfValue("", parts[0] ?? "");
      card.first = vcfValue("", parts[1] ?? "");
    } else if (key === "ORG") card.org = value.replace(/;+/g, " ").trim();
    else if (key === "TEL") {
      const tel = value.replace(/^tel:/i, "");
      if (tel) card.tels.push(tel);
    } else if (key === "EMAIL" && !card.email) card.email = value;
    else if (key === "ADR" && !card.adr) card.adr = value.split(";").map((p) => p.trim()).filter(Boolean).join(", ");
    else if (key === "NOTE") card.note = value;
  }
  return rows;
}

export type CustomerMapping = Partial<Record<CustomerField, number>>;

function headerField(cell: string): CustomerField | null {
  const k = normKey(cell);
  if (!k) return null;
  for (const f of CUSTOMER_FIELDS) if (ALIASES[f].includes(k)) return f;
  if (/\b(type|label)\b|סוג/.test(k)) return null;
  for (const f of CUSTOMER_FIELDS) {
    if (ALIASES[f].some((a) => a.length > 2 && (k.startsWith(a + " ") || k.endsWith(" " + a)))) return f;
  }
  return null;
}

function mapHeaders(headers: string[]): CustomerMapping {
  const mapping: CustomerMapping = {};
  headers.forEach((h, i) => {
    const f = headerField(h);
    if (!f) return;
    if (mapping[f] === undefined) mapping[f] = i;
    else if (f === "phone" && mapping.phone2 === undefined) mapping.phone2 = i;
  });
  return mapping;
}

export function phoneDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("972")) d = "0" + d.slice(3);
  return d;
}

function looksLikePhone(raw: string): boolean {
  const t = raw.trim();
  if (!t || /[a-zA-Z\u0590-\u05FF@]/.test(t)) return false;
  const d = phoneDigits(t);
  return d.length >= 7 && d.length <= 13;
}

const looksLikeEmail = (raw: string) => EMAIL_RE.test(raw.trim());

function looksLikeName(raw: string): boolean {
  const t = raw.trim();
  return t.length >= 2 && /[a-zA-Z\u0590-\u05FF]/.test(t) && !looksLikeEmail(t) && !/\d{4,}/.test(t);
}

/** Guess columns from the cell contents when the file has no usable header row. */
function inferMapping(rows: string[][], skip: CustomerMapping = {}): CustomerMapping {
  const mapping: CustomerMapping = { ...skip };
  const width = Math.max(0, ...rows.map((r) => r.length));
  const used = new Set(Object.values(mapping));
  const sample = rows.slice(0, 200);
  const ratio = (col: number, test: (s: string) => boolean) => {
    const vals = sample.map((r) => (r[col] ?? "").trim()).filter(Boolean);
    return vals.length ? vals.filter(test).length / vals.length : 0;
  };
  const pick = (field: CustomerField, test: (s: string) => boolean, min: number) => {
    if (mapping[field] !== undefined) return;
    let best = -1;
    let bestScore = min;
    for (let c = 0; c < width; c++) {
      if (used.has(c)) continue;
      const score = ratio(c, test);
      if (score > bestScore) {
        best = c;
        bestScore = score;
      }
    }
    if (best >= 0) {
      mapping[field] = best;
      used.add(best);
    }
  };
  pick("email", looksLikeEmail, 0.5);
  pick("phone", looksLikePhone, 0.5);
  if (mapping.firstName === undefined && mapping.lastName === undefined) pick("name", looksLikeName, 0.5);
  pick("phone2", looksLikePhone, 0.5);
  return mapping;
}

export type CustomerSheetAnalysis = {
  /** Index of the header row, or -1 when the data has no header */
  headerRow: number;
  headers: string[];
  mapping: CustomerMapping;
  /** True when at least one column was recognised from its header */
  fromHeaders: boolean;
};

export function analyzeCustomerSheet(rows: string[][]): CustomerSheetAnalysis {
  const nonEmpty = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.some((c) => c.trim() !== ""));
  let bestRow = -1;
  let bestCount = 0;
  for (const { r, i } of nonEmpty.slice(0, 10)) {
    if (r.some((c) => looksLikeEmail(c) || looksLikePhone(c))) continue;
    const count = Object.keys(mapHeaders(r)).length;
    if (count > bestCount) {
      bestCount = count;
      bestRow = i;
    }
  }
  if (bestRow >= 0) {
    const headers = rows[bestRow];
    const data = rows.slice(bestRow + 1);
    const mapping = inferMapping(data, mapHeaders(headers));
    return { headerRow: bestRow, headers, mapping, fromHeaders: true };
  }
  const width = Math.max(0, ...rows.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => `עמודה ${i + 1}`);
  const firstData = nonEmpty[0]?.i ?? 0;
  return { headerRow: firstData - 1, headers, mapping: inferMapping(rows.slice(firstData)), fromHeaders: false };
}

/** Excel drops the leading zero of Israeli numbers stored as numbers (e.g. 501234567). */
export function cleanPhone(raw: string): string {
  let t = raw.trim().replace(/^tel:/i, "");
  if (!t) return "";
  if (/^\d+(\.0+)?$/.test(t)) {
    t = t.replace(/\.0+$/, "");
    if ((t.length === 9 && /^[5]/.test(t)) || (t.length === 8 && /^[234689]/.test(t))) t = "0" + t;
  }
  return t;
}

export type CustomerDraft = {
  name: string;
  phone: string;
  email: string;
  notes: string;
};

export type DraftStatus = "new" | "update" | "same" | "duplicate" | "invalid";

export type DraftRow = {
  /** 1-based row number in the file */
  line: number;
  draft: CustomerDraft;
  status: DraftStatus;
  /** Existing customer this row will update */
  matchId?: string;
  message?: string;
};

function cell(row: string[], col: number | undefined): string {
  return col === undefined ? "" : (row[col] ?? "").replace(/\s+/g, " ").trim();
}

function rowToDraft(row: string[], m: CustomerMapping): CustomerDraft {
  const first = cell(row, m.firstName);
  const last = cell(row, m.lastName);
  const company = cell(row, m.company);
  let name = cell(row, m.name) || [first, last].filter(Boolean).join(" ") || company;
  name = name.replace(/^לכבוד\s+/, "").trim();
  const phones = [cleanPhone(cell(row, m.phone)), cleanPhone(cell(row, m.phone2))].filter(Boolean);
  let email = cell(row, m.email);
  if (email && !looksLikeEmail(email)) {
    const found = /[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+/.exec(email);
    email = found ? found[0] : email;
  }
  const extras: string[] = [];
  if (company && company !== name) extras.push(`חברה: ${company}`);
  if (phones.length > 1) extras.push(`טלפון נוסף: ${phones.slice(1).join(", ")}`);
  const address = [cell(row, m.address), cell(row, m.city)].filter(Boolean).join(", ");
  if (address) extras.push(`כתובת: ${address}`);
  const notes = cell(row, m.notes);
  if (notes) extras.push(notes);
  return { name, phone: phones[0] ?? "", email, notes: extras.join(" | ") };
}

function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Fields an import would fill on an existing customer; existing values are never overwritten. */
export function mergeIntoExisting(existing: Customer, d: CustomerDraft): Customer {
  const notes =
    d.notes && !(existing.notes ?? "").includes(d.notes)
      ? [existing.notes, d.notes].filter((x) => x && x.trim()).join("\n")
      : existing.notes;
  return {
    ...existing,
    phone: existing.phone?.trim() ? existing.phone : d.phone || existing.phone,
    email: existing.email?.trim() ? existing.email : d.email || existing.email,
    notes,
  };
}

export function buildDraftRows(
  rows: string[][],
  headerRow: number,
  mapping: CustomerMapping,
  existing: Customer[]
): DraftRow[] {
  const byName = new Map(existing.map((c) => [nameKey(c.name), c]));
  const byPhone = new Map<string, Customer>();
  for (const c of existing) {
    const d = phoneDigits(c.phone ?? "");
    if (d.length >= 7) byPhone.set(d, c);
  }
  const seen = new Map<string, number>();
  const out: DraftRow[] = [];
  for (let i = Math.max(0, headerRow + 1); i < rows.length; i++) {
    const row = rows[i];
    if (!row.some((c) => c.trim() !== "")) continue;
    const draft = rowToDraft(row, mapping);
    const line = i + 1;
    if (!draft.name) {
      out.push({ line, draft, status: "invalid", message: "חסר שם לקוח" });
      continue;
    }
    if (draft.email && !looksLikeEmail(draft.email)) {
      draft.notes = [draft.notes, `אימייל לא תקין: ${draft.email}`].filter(Boolean).join(" | ");
      draft.email = "";
    }
    const key = nameKey(draft.name);
    const prior = seen.get(key);
    if (prior !== undefined) {
      out.push({ line, draft, status: "duplicate", message: `כפילות של שורה ${prior}` });
      continue;
    }
    seen.set(key, line);
    const pd = phoneDigits(draft.phone);
    const match = byName.get(key) ?? (pd.length >= 7 ? byPhone.get(pd) : undefined);
    if (match) {
      const merged = mergeIntoExisting(match, draft);
      const changed = JSON.stringify(merged) !== JSON.stringify(match);
      out.push({
        line,
        draft,
        status: changed ? "update" : "same",
        matchId: match.id,
        message: changed ? `ישלים פרטים חסרים ללקוח הקיים "${match.name}"` : `כבר קיים: "${match.name}"`,
      });
      continue;
    }
    out.push({ line, draft, status: "new" });
  }
  return out;
}

/** Apply selected rows: new customers are created, matches only get their empty fields filled. */
export function applyCustomerImport(
  customers: Customer[],
  rows: DraftRow[],
  makeId: () => string,
  now = Date.now()
): { customers: Customer[]; added: number; updated: number } {
  let added = 0;
  let updated = 0;
  const byId = new Map(customers.map((c) => [c.id, c]));
  const created: Customer[] = [];
  rows.forEach((r, idx) => {
    if (r.status === "update" && r.matchId && byId.has(r.matchId)) {
      byId.set(r.matchId, mergeIntoExisting(byId.get(r.matchId)!, r.draft));
      updated++;
    } else if (r.status === "new") {
      created.push({
        id: makeId(),
        name: r.draft.name,
        phone: r.draft.phone || undefined,
        email: r.draft.email || undefined,
        notes: r.draft.notes || undefined,
        // Keep file order when the list is sorted newest-first.
        createdAt: now + (rows.length - idx),
      });
      added++;
    }
  });
  return { customers: [...customers.map((c) => byId.get(c.id) ?? c), ...created], added, updated };
}
