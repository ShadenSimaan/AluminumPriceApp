import { describe, expect, it } from "vitest";
import { createRfqItem } from "../presets";
import { createSupplierRequest, rfqUuid } from "../rfqState";
import { buildCustomerQuoteFromRfq, previewConvertToQuote, suggestedShippingIls } from "../toCustomerQuote";

function pricedRequest() {
  const req = createSupplierRequest({
    company: { name: "Company", contactPerson: "", phone: "050", email: "a@b.c", address: "", website: "" },
    defaultUnit: "mm",
  });
  req.projectName = "Thaber Assaf";
  req.supplier.name = "Ekleindoor / KLEIN (EKLIEN)";
  req.supplierProfileId = "sup-ekleindoor";
  const w1 = createRfqItem({ id: rfqUuid(), openingType: "sliding_window", unit: "mm", reference: "W-01" });
  w1.quantity = 2;
  w1.supplierPrice = {
    currency: "USD",
    unitPriceOriginal: 100,
    screenPriceOriginal: 10,
    lineTotalOriginal: 110,
    unitPriceIls: 370,
    screenPriceIls: 37,
    lineTotalIls: 407,
    profileSeries: "SWR110-3",
  };
  const w2 = createRfqItem({ id: rfqUuid(), openingType: "casement_window", unit: "mm", reference: "W-02" });
  // no supplier price
  req.items = [w1, w2];
  req.supplierQuotation = {
    quotationNumber: "K1",
    quotationDate: "2026-11-03",
    currency: "USD",
    exchangeRateToIls: 3.7,
    productSubtotalOriginal: 110,
    packagingOriginal: 10,
    inlandTransportOriginal: 20,
    grandTotalOriginal: 140,
    productSubtotalIls: 407,
    packagingIls: 37,
    inlandTransportIls: 74,
    grandTotalIls: 518,
    importedAt: Date.now(),
    sourceFileName: "q.xlsx",
  };
  return req;
}

describe("convert RFQ to customer quote", () => {
  it("applies markup to unit+screen cost and skips unpriced items", () => {
    const req = pricedRequest();
    const preview = previewConvertToQuote(req, { markupPercent: 30, shippingIls: 0, deliveryIls: 50, laborIls: 100 });
    expect(preview.pricedCount).toBe(1);
    expect(preview.skippedRefs).toEqual(["W-02"]);
    // cost per unit 370+37=407, qty 2 → 814; sell 407*1.3=529.1 × 2 = 1058.2
    expect(preview.supplierItemsCostIls).toBe(814);
    expect(preview.itemsSellSubtotalIls).toBe(1058.2);
    expect(preview.extrasIls).toBe(150);
    expect(preview.subtotalBeforeVatIls).toBe(1208.2);

    const built = buildCustomerQuoteFromRfq(req, {
      customerName: "Thaber Assaf",
      markupPercent: 30,
      shippingIls: 0,
      deliveryIls: 50,
      laborIls: 100,
    });
    expect(built.items).toHaveLength(1);
    expect(built.items[0].manualUnitPrice).toBe("529.1");
    expect(built.items[0].qty).toBe("2");
    expect(built.items[0].priceBasis).toBe("per_unit");
    expect(built.items[0].profileName).toMatch(/^EKLIEN ·/);
    expect(built.items[0].details).toBe("");
    expect(built.items[0].configuration?.supplierPrice).toBeUndefined();
    expect(built.freeFormAdditions.map((a) => a.name)).toEqual(["הובלה", "עלות עבודה"]);
  });

  it("does not copy RFQ notes or profile fluff into customer quote details", () => {
    const req = pricedRequest();
    req.items[0].notes = "Confirm handwritten bottom measurement";
    req.items[0].supplierPrice!.remarks = "internal supplier remark";
    const built = buildCustomerQuoteFromRfq(req, {
      customerName: "Thaber Assaf",
      markupPercent: 30,
      shippingIls: 0,
      deliveryIls: 0,
      laborIls: 0,
    });
    expect(built.items[0].details).toBe("");
    expect(built.items[0].profileName).toBe("EKLIEN · SWR110-3");
  });

  it("suggests shipping from packaging + transport with markup", () => {
    const req = pricedRequest();
    expect(suggestedShippingIls(req, 30)).toBe(144.3); // (37+74)*1.3
  });
});
