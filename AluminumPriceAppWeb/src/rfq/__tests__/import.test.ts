import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import {
  analyzeSheet,
  buildImportRows,
  committableItems,
  firstNonEmptyRow,
  ImportFileError,
  importSummary,
  parseImportBytes,
  validateImportRows,
  type ImportRow,
} from "../import/importer";
import { buildTemplateCsv, buildTemplateXlsx } from "../import/template";
import { decodeText, parseCsv } from "../import/csv";

function prepare(name: string, bytes: Uint8Array) {
  const file = parseImportBytes(name, bytes);
  const rows = file.sheets[0].rows;
  const headerRow = firstNonEmptyRow(rows);
  const analysis = analyzeSheet(rows, headerRow);
  return { file, rows, headerRow, analysis, importRows: buildImportRows(rows, headerRow, analysis.mapping) };
}

const csv = (text: string) => strToU8(text);

describe("templates", () => {
  it("xlsx template round-trips into valid items with mm detected from headers", () => {
    const { analysis, importRows, file } = prepare("t.xlsx", buildTemplateXlsx());
    expect(file.sheets.map((s) => s.name)).toEqual(["Items", "Instructions"]);
    expect(analysis.detectedUnit).toBe("mm");
    for (const f of ["category", "openingType", "width", "height", "quantity", "reference"] as const) {
      expect(analysis.mapping[f]).toBeTypeOf("number");
    }
    const results = validateImportRows(importRows, { unit: analysis.detectedUnit, existingReferences: [], mode: "append" });
    const errors = results.flatMap((r, i) => r.errors.map((e) => `${importRows[i].rowNumber}:${e.key}`));
    expect(errors).toEqual([]);
    const items = committableItems(importRows, results)!;
    expect(items).toHaveLength(7);
    const w1 = items.find((i) => i.reference === "W-01")!;
    expect(w1.openingType).toBe("sliding_window");
    expect(w1.widthCm).toBe(180);
    expect(w1.unit).toBe("mm");
    expect(w1.insectScreen).toBe("required");
    const d1 = items.find((i) => i.reference === "D-01")!;
    expect(d1.panels.map((p) => p.operation)).toEqual(["fixed", "sliding", "sliding", "fixed"]);
    const d2 = items.find((i) => i.reference === "D-02")!;
    expect(d2).toMatchObject({ openingType: "hinged_door_double", swing: "outward", activeLeaf: "right" });
    // Missing reference on the custom row is generated, unique, and flagged as automatic
    const autoIdx = results.findIndex((r) => r.autoRef);
    expect(results[autoIdx].item!.reference).toBe("W-05");
  });

  it("csv template round-trips the same way", () => {
    const { analysis, importRows } = prepare("t.csv", csv(buildTemplateCsv()));
    const results = validateImportRows(importRows, { unit: analysis.detectedUnit, existingReferences: [], mode: "append" });
    expect(committableItems(importRows, results)).toHaveLength(7);
  });
});

describe("import validation", () => {
  const header = "Ref,Category,Type,Width,Height,Qty\n";

  function run(body: string, unit: "mm" | "cm" | null = "mm", existing: string[] = [], mode: "append" | "replace" = "append") {
    const { analysis, importRows } = prepare("x.csv", csv(header + body));
    return { analysis, importRows, results: validateImportRows(importRows, { unit, existingReferences: existing, mode }) };
  }

  it("requires an explicit unit when headers do not state one", () => {
    const { analysis, results } = run("W-1,window,fixed,1200,1000,1\n", null);
    expect(analysis.detectedUnit).toBeNull();
    expect(results[0].errors.map((e) => e.key)).toContain("unitRequired");
  });

  it("converts imported mm and cm to the same stored size", () => {
    const mm = run("W-1,window,fixed,1200,1000,1\n", "mm").results[0].item!;
    const cm = run("W-1,window,fixed,120,100,1\n", "cm").results[0].item!;
    expect(mm.widthCm).toBe(120);
    expect(cm.widthCm).toBe(120);
    expect(mm.unit).toBe("mm");
    expect(cm.unit).toBe("cm");
  });

  it("reports row-specific errors and never guesses unknown values", () => {
    const { results } = run(
      [
        "W-1,window,awning-ish,1200,1000,1", // unknown type
        "W-2,window,fixed,12O0,1000,1", // malformed number
        "W-3,window,fixed,-5,1000,1", // negative
        "W-4,window,fixed,1200,1000,2.5", // non-integer qty
        "W-5,door,sliding window,1200,1000,1", // type/category mismatch
        "W-6,window,fixed,1,200,1000,1", // shifted columns
        "W-7,window,fixed,120cm,1000,1", // unit conflict
      ].join("\n") + "\n"
    );
    const keys = results.map((r) => r.errors.map((e) => e.key));
    expect(keys[0]).toContain("unknownValue");
    expect(keys[1]).toContain("invalidNumber");
    expect(keys[2]).toContain("width_invalid");
    expect(keys[3]).toContain("notInteger");
    expect(keys[4]).toContain("category_mismatch");
    expect(keys[5].length).toBeGreaterThan(0);
    expect(keys[6]).toContain("unitConflict");
    expect(results.every((r) => r.item === null)).toBe(true);
  });

  it("flags duplicates within the file and against existing items (append only)", () => {
    const body = "W-1,window,fixed,1200,1000,1\nw-1,window,fixed,1200,1000,1\nD-9,door,sliding door,2400,2200,1\n";
    const a = run(body, "mm", ["D-9"], "append").results;
    expect(a[0].errors.map((e) => e.key)).toContain("duplicateInFile");
    expect(a[1].errors.map((e) => e.key)).toContain("duplicateInFile");
    expect(a[2].errors.map((e) => e.key)).toContain("duplicateExisting");
    const r = run(body, "mm", ["D-9"], "replace").results;
    expect(r[2].errors).toEqual([]);
  });

  it("excluding an invalid row allows committing the rest; blank rows are counted", () => {
    const { importRows, results: first } = run("W-1,window,fixed,1200,1000,1\n,,,,,\nW-2,window,???,1,1,1\n");
    expect(committableItems(importRows, first)).toBeNull();
    const edited: ImportRow[] = importRows.map((r) => (r.values.reference === "W-2" ? { ...r, include: false } : r));
    const results = validateImportRows(edited, { unit: "mm", existingReferences: [], mode: "append" });
    expect(committableItems(edited, results)).toHaveLength(1);
    expect(importSummary(edited, results)).toEqual({ valid: 1, invalid: 0, excluded: 1, blank: 1 });
  });

  it("an edited row is revalidated", () => {
    const { importRows } = run("W-1,window,awning-ish,1200,1000,1\n");
    const fixed = importRows.map((r) => ({ ...r, values: { ...r.values, openingType: "top_hung_window" } }));
    const results = validateImportRows(fixed, { unit: "mm", existingReferences: [], mode: "append" });
    expect(results[0].errors).toEqual([]);
    expect(results[0].item!.openingType).toBe("top_hung_window");
  });

  it("recognizes Hebrew headers and values", () => {
    const text = "מזהה,קטגוריה,סוג פתיחה,רוחב (ס״מ),גובה (ס״מ),כמות,צד צירים,כיוון פתיחה\nW-1,חלון,חלון פתיחה,60,120,3,שמאל,החוצה\n";
    const { analysis, importRows } = prepare("he.csv", csv(text));
    expect(analysis.detectedUnit).toBe("cm");
    const results = validateImportRows(importRows, { unit: "cm", existingReferences: [], mode: "append" });
    expect(results[0].errors).toEqual([]);
    expect(results[0].item).toMatchObject({ openingType: "casement_window", swing: "outward", widthCm: 60 });
    expect(results[0].item!.panels[0].hingeSide).toBe("left");
  });
});

describe("file handling", () => {
  it("rejects unsupported and oversized files", () => {
    expect(() => parseImportBytes("x.pdf", new Uint8Array([1]))).toThrow(ImportFileError);
    expect(() => parseImportBytes("x.xls", new Uint8Array([1]))).toThrow(ImportFileError);
    expect(() => parseImportBytes("x.csv", new Uint8Array(6 * 1024 * 1024))).toThrow(/tooLarge/);
    expect(() => parseImportBytes("x.xlsx", strToU8("not a zip"))).toThrow(/readFailed/);
  });

  it("uses cached formula values without evaluating formulas", () => {
    const sheet =
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>` +
      `<row r="1"><c r="A1" t="inlineStr"><is><t>Width (mm)</t></is></c><c r="B1" t="inlineStr"><is><t>Height (mm)</t></is></c></row>` +
      `<row r="2"><c r="A2"><f>600*2</f><v>1200</v></c><c r="B2"><f>HYPERLINK("http://x")</f></c></row>` +
      `</sheetData></worksheet>`;
    const bytes = zipSync({
      "xl/workbook.xml": strToU8(`<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    });
    const file = parseImportBytes("f.xlsx", bytes);
    expect(file.sheets[0].formulaCells).toBe(2);
    expect(file.sheets[0].rows[1]).toEqual(["1200", ""]);
  });

  it("decodes Windows-1255 Hebrew CSV and semicolon delimiters", () => {
    // "חלון" in Windows-1255
    const bytes = new Uint8Array([0xe7, 0xec, 0xe5, 0xef, 0x3b, 0x31]);
    const { text, encoding } = decodeText(bytes);
    expect(encoding).toBe("Windows-1255");
    expect(parseCsv(text)).toEqual([["חלון", "1"]]);
  });
});
