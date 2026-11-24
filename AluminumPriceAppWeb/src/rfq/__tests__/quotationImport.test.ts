import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { readXlsx } from "../import/xlsx";
import { applyManualQuotation, applyQuotationToRequest, parseSupplierQuotationFile } from "../import/quotationImport";
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

describe("manual supplier quotation prices", () => {
  it("stores a separate line price for each window and converts USD to shekels", () => {
    const req = createSupplierRequest({ company: { name: "", contactPerson: "", phone: "", email: "", address: "", website: "" }, defaultUnit: "mm" });
    req.items = ["W-01", "W-02"].map((reference) =>
      createRfqItem({ id: reference, openingType: "sliding_window", unit: "mm", reference })
    );
    req.items[1].quantity = 2;

    const result = applyManualQuotation(req, {
      currency: "USD",
      exchangeRateToIls: 3.7,
      quotationNumber: "Q-9",
      quotationDate: "2026-11-18",
      packaging: 10,
      transport: null,
      lines: [
        { itemId: "W-01", lineTotal: 100 },
        { itemId: "W-02", lineTotal: 50 },
      ],
      now: 1,
    });

    expect(result.priced).toBe(2);
    expect(result.request.quotationStatus).toBe("done");
    expect(result.request.items[0].supplierPrice).toMatchObject({
      currency: "USD",
      lineTotalOriginal: 100,
      lineTotalIls: 370,
      unitPriceOriginal: 100,
    });
    expect(result.request.items[1].supplierPrice).toMatchObject({
      lineTotalOriginal: 50,
      lineTotalIls: 185,
      unitPriceOriginal: 25,
    });
    expect(result.request.supplierQuotation).toMatchObject({
      quotationNumber: "Q-9",
      packagingOriginal: 10,
      packagingIls: 37,
      grandTotalOriginal: 160,
      grandTotalIls: 592,
      exchangeRateToIls: 3.7,
    });
  });

  it("clears a blank window and drops the quotation when nothing is priced", () => {
    const req = createSupplierRequest({ company: { name: "", contactPerson: "", phone: "", email: "", address: "", website: "" }, defaultUnit: "cm" });
    req.items = [createRfqItem({ id: "W-01", openingType: "fixed_window", unit: "cm", reference: "W-01" })];
    req.items[0].supplierPrice = {
      currency: "ILS",
      unitPriceOriginal: 80,
      screenPriceOriginal: 0,
      lineTotalOriginal: 80,
      unitPriceIls: 80,
      screenPriceIls: 0,
      lineTotalIls: 80,
    };
    req.quotationStatus = "done";

    const cleared = applyManualQuotation(req, {
      currency: "ILS",
      exchangeRateToIls: 1,
      quotationNumber: "",
      quotationDate: "",
      packaging: null,
      transport: null,
      lines: [{ itemId: "W-01", lineTotal: null }],
    });
    expect(cleared.priced).toBe(0);
    expect(cleared.request.quotationStatus).toBe("pending");
    expect(cleared.request.supplierQuotation).toBeUndefined();
    expect(cleared.request.items[0].supplierPrice).toBeUndefined();
  });
});
