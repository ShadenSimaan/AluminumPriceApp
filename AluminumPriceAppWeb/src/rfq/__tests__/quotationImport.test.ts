import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { readXlsx } from "../import/xlsx";
import { applyQuotationToRequest, parseSupplierQuotationFile } from "../import/quotationImport";
import { createRfqItem } from "../presets";
import { createSupplierRequest, rfqUuid } from "../rfqState";

const here = dirname(fileURLToPath(import.meta.url));
const samplePath = join(here, "fixtures", "Thaber_Assaf_quotation.xlsx");

describe("namespaced supplier quotation xlsx", () => {
  it("reads Items rows with prefixed OOXML tags", () => {
    const bytes = new Uint8Array(readFileSync(samplePath));
    const sheets = readXlsx(bytes, 500);
    expect(sheets.map((s) => s.name)).toEqual(["Items", "Quotation"]);
    expect(sheets[0].rows[0][1]).toBe("item_reference");
    expect(sheets[0].rows[1][1]).toBe("W-01");
    expect(sheets[0].rows[1][14]).toBe("318");
    expect(sheets[0].rows.length).toBe(35);
  });

  it("parses lines and summary, matches by reference, converts USD→ILS", () => {
    const bytes = new Uint8Array(readFileSync(samplePath));
    const parsed = parseSupplierQuotationFile("Thaber_Assaf_quotation.xlsx", bytes);
    expect(parsed.currency).toBe("USD");
    expect(parsed.lines).toHaveLength(34);
    expect(parsed.lines[0]).toMatchObject({
      reference: "W-01",
      unitPriceOriginal: 318,
      screenPriceOriginal: 0,
      lineTotalOriginal: 318,
    });
    expect(parsed.lines.find((l) => l.reference === "W-04")).toMatchObject({
      unitPriceOriginal: 186.5,
      screenPriceOriginal: 30,
      lineTotalOriginal: 216.5,
    });
    expect(parsed.summary).toMatchObject({
      quotationNumber: "K072026103001",
      project: "Thaber Assaf",
      grandTotalOriginal: 26773.02,
      packagingOriginal: 1255.86,
      inlandTransportOriginal: 400,
    });

    const req = createSupplierRequest({ company: { name: "", contactPerson: "", phone: "", email: "", address: "", website: "" }, defaultUnit: "mm" });
    req.projectName = "Thaber Assaf";
    req.items = ["W-01", "W-04", "W-99"].map((reference) =>
      createRfqItem({ id: rfqUuid(), openingType: reference === "W-04" ? "casement_window" : "sliding_window", unit: "mm", reference })
    );

    const result = applyQuotationToRequest(req, parsed, {
      exchangeRateToIls: 3.7,
      sourceFileName: "Thaber_Assaf_quotation.xlsx",
    });
    expect(result.matched).toEqual(["W-01", "W-04"]);
    expect(result.unmatchedRequest).toEqual(["W-99"]);
    expect(result.request.quotationStatus).toBe("done");
    expect(result.request.supplierQuotation?.exchangeRateToIls).toBe(3.7);
    expect(result.request.supplierQuotation?.grandTotalIls).toBe(Math.round(26773.02 * 3.7 * 100) / 100);
    const w01 = result.request.items.find((i) => i.reference === "W-01")!.supplierPrice!;
    expect(w01.lineTotalIls).toBe(Math.round(318 * 3.7 * 100) / 100);
    const w04 = result.request.items.find((i) => i.reference === "W-04")!.supplierPrice!;
    expect(w04.unitPriceIls).toBe(Math.round(186.5 * 3.7 * 100) / 100);
    expect(w04.screenPriceIls).toBe(Math.round(30 * 3.7 * 100) / 100);
    expect(result.request.items.find((i) => i.reference === "W-99")!.supplierPrice).toBeUndefined();
  });
});
