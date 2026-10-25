import { describe, expect, it } from "vitest";
import type { Customer } from "../../types";
import { parseCsv } from "../../rfq/import/csv";
import { writeXlsx } from "../../rfq/import/xlsx";
import {
  analyzeCustomerSheet,
  applyCustomerImport,
  buildDraftRows,
  cleanPhone,
  parseVcf,
  readCustomerFile,
} from "../customerImport";

const enc = (s: string) => new TextEncoder().encode(s);

function run(rows: string[][], existing: Customer[] = []) {
  const a = analyzeCustomerSheet(rows);
  return { a, drafts: buildDraftRows(rows, a.headerRow, a.mapping, existing) };
}

describe("customer import analysis", () => {
  it("maps Hebrew headers and builds notes from extra columns", () => {
    const rows = parseCsv("שם לקוח,נייד,דואל,עיר,כתובת,הערות\nדני כהן,050-1234567,dani@example.com,חיפה,הרצל 5,לקוח ותיק\n");
    const { a, drafts } = run(rows);
    expect(a.headerRow).toBe(0);
    expect(a.mapping).toMatchObject({ name: 0, phone: 1, email: 2, city: 3, address: 4, notes: 5 });
    expect(drafts[0].draft).toEqual({
      name: "דני כהן",
      phone: "050-1234567",
      email: "dani@example.com",
      notes: "כתובת: הרצל 5, חיפה | לקוח ותיק",
    });
    expect(drafts[0].status).toBe("new");
  });

  it("understands a Google Contacts export and ignores the phone type column", () => {
    const rows = parseCsv(
      "Given Name,Family Name,E-mail 1 - Value,Phone 1 - Type,Phone 1 - Value\nSara,Levi,sara@x.co,Mobile,+972 52-765-4321\n"
    );
    const { a, drafts } = run(rows);
    expect(a.mapping.phone).toBe(4);
    expect(drafts[0].draft.name).toBe("Sara Levi");
    expect(drafts[0].draft.phone).toBe("+972 52-765-4321");
    expect(drafts[0].draft.email).toBe("sara@x.co");
  });

  it("infers columns from content when the file has no header row", () => {
    const rows = parseCsv("משה לוי,0541112233,moshe@mail.com\nרונית אברהם,0523334455,ronit@mail.com\n");
    const { a, drafts } = run(rows);
    expect(a.fromHeaders).toBe(false);
    expect(a.mapping).toMatchObject({ name: 0, phone: 1, email: 2 });
    expect(drafts.map((d) => d.draft.name)).toEqual(["משה לוי", "רונית אברהם"]);
  });

  it("restores the leading zero Excel drops from phone numbers", () => {
    expect(cleanPhone("501234567")).toBe("0501234567");
    expect(cleanPhone("48123456")).toBe("048123456");
    expect(cleanPhone("+972501234567")).toBe("+972501234567");
  });

  it("reads xlsx files", () => {
    const bytes = writeXlsx([{ name: "לקוחות", rows: [["שם", "טלפון"], ["יוסי", 521234567]] }]);
    const sheets = readCustomerFile("c.xlsx", bytes);
    const { drafts } = run(sheets[0].rows);
    expect(drafts[0].draft).toMatchObject({ name: "יוסי", phone: "0521234567" });
  });

  it("parses vCard contacts including quoted-printable Hebrew", () => {
    const vcf = [
      "BEGIN:VCARD",
      "VERSION:2.1",
      "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=9B=D7=94=D7=9F;=D7=90=D7=91=D7=99;;;",
      "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=90=D7=91=D7=99 =D7=9B=D7=94=D7=9F",
      "TEL;CELL:050-9998877",
      "TEL;HOME:04-8889999",
      "EMAIL:avi@example.com",
      "END:VCARD",
    ].join("\r\n");
    const rows = parseVcf(vcf);
    const { drafts } = run(rows);
    expect(drafts[0].draft).toEqual({
      name: "אבי כהן",
      phone: "050-9998877",
      email: "avi@example.com",
      notes: "טלפון נוסף: 04-8889999",
    });
    expect(readCustomerFile("contacts.vcf", enc(vcf))[0].rows.length).toBe(2);
  });

  it("flags rows without a name and duplicates inside the file", () => {
    const rows = parseCsv("שם,טלפון\n,0501111111\nדנה,0502222222\nדנה,0503333333\n");
    const { drafts } = run(rows);
    expect(drafts.map((d) => d.status)).toEqual(["invalid", "new", "duplicate"]);
  });

  it("matches existing customers by name or phone and only fills missing fields", () => {
    const existing: Customer[] = [
      { id: "a", name: "דני כהן", phone: "050-1234567", createdAt: 1 },
      { id: "b", name: "Sara Levi", phone: "0527654321", email: "old@x.co", createdAt: 2 },
    ];
    const rows = parseCsv("שם,טלפון,אימייל\nדני כהן,0509999999,dani@x.co\nשרה לוי,+972-52-765-4321,new@x.co\n");
    const { drafts } = run(rows, existing);
    expect(drafts.map((d) => [d.status, d.matchId])).toEqual([
      ["update", "a"],
      ["same", "b"],
    ]);
    const { customers, added, updated } = applyCustomerImport(existing, drafts, () => "new");
    expect({ added, updated }).toEqual({ added: 0, updated: 1 });
    expect(customers.find((c) => c.id === "a")).toMatchObject({ phone: "050-1234567", email: "dani@x.co" });
    expect(customers.find((c) => c.id === "b")?.email).toBe("old@x.co");
  });

  it("rejects unsupported files with a clear message", () => {
    expect(() => readCustomerFile("old.xls", enc("x"))).toThrow(/xlsx/);
    expect(() => readCustomerFile("doc.pdf", enc("x"))).toThrow(/לא נתמך/);
  });
});
