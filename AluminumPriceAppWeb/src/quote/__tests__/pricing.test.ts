import { describe, expect, it } from "vitest";
import { customerUnitFromSupplierCost, isOpenAreaRate, lineTotal, lineUnitPrice, quoteMoney } from "../pricing";
import {
  applyProfileToLineItem,
  collectQuoteProfileSources,
  lineAfterProfileSync,
  profileOfferLine,
  remapQuoteItems,
} from "../windowLine";
import { toCustomerPdfItem } from "../customerPayload";
import type { LineItem, Profile } from "../../types";

describe("customer prices", () => {
  it("applies markup on cost before VAT", () => {
    const priced = customerUnitFromSupplierCost({
      supplierUnitCost: 1000,
      extraPerUnit: 0,
      markupPercent: 30,
      exchangeRate: 1,
      taxTreatment: "exclusive",
      vatRate: 0.18,
    });
    expect(priced.customerUnit).toBe(1300);
  });

  it("removes inclusive VAT once before markup", () => {
    const priced = customerUnitFromSupplierCost({
      supplierUnitCost: 1180,
      extraPerUnit: null,
      markupPercent: 0,
      exchangeRate: 1,
      taxTreatment: "inclusive",
      vatRate: 0.18,
    });
    expect(priced.costBeforeVat).toBe(1000);
    expect(priced.customerUnit).toBe(1000);
  });

  it("does not invent a price when the supplier cost is missing", () => {
    const priced = customerUnitFromSupplierCost({
      supplierUnitCost: null,
      extraPerUnit: 0,
      markupPercent: 30,
      exchangeRate: 3.7,
      taxTreatment: "not_stated",
      vatRate: 0.18,
    });
    expect(priced.customerUnit).toBeNull();
  });

  it("charges a per-unit line once, then multiplies by quantity", () => {
    const line = { widthCm: "160", heightCm: "112.5", qty: "2", unitPrice: "0", manualUnitPrice: "1300", priceBasis: "per_unit" as const, addons: [] };
    expect(lineUnitPrice(line)).toBe(1300);
    expect(lineTotal(line)).toBe(2600);
  });

  it("takes the discount before VAT", () => {
    const money = quoteMoney({
      lines: [{ qty: "1", manualUnitPrice: "1000", priceBasis: "per_unit", addons: [] }],
      taxPercentText: "18",
      discountPercentText: "10",
    });
    expect(money.sub).toBe(1000);
    expect(money.discount).toBe(100);
    expect(money.tax).toBe(162);
    expect(money.grand).toBe(1062);
  });

  it("lists a whole profile at its square-metre rate without changing the total", () => {
    const line = profileOfferLine({ id: "p1", name: "7000", unitPrice: 1200 }, []);
    expect(isOpenAreaRate(line)).toBe(true);
    expect(line.profileName).toBe("7000");
    expect(lineTotal(line)).toBe(0);
  });

  it("remaps a quotation profile and recalculates the line total from the new m² rate", () => {
    const from: Profile = { id: "a", name: "1700", unitPrice: 1000 };
    const to: Profile = { id: "b", name: "4300", unitPrice: 1500 };
    const line: LineItem = {
      id: "1",
      widthCm: "100",
      heightCm: "100",
      qty: "2",
      profileId: from.id,
      profileName: from.name,
      unitPrice: String(from.unitPrice),
      manualUnitPrice: "9999",
      priceBasis: "per_unit",
      addons: [],
      subtotal: 0,
    };
    const remapped = remapQuoteItems([line], { [from.id]: to.id }, [from, to])[0];
    expect(remapped.profileId).toBe("b");
    expect(remapped.profileName).toBe("4300");
    expect(remapped.unitPrice).toBe("1500");
    expect(remapped.manualUnitPrice).toBeUndefined();
    expect(remapped.priceBasis).toBe("per_m2");
    // 1m × 1m × 1500 × qty 2
    expect(lineTotal(remapped)).toBe(3000);
    expect(collectQuoteProfileSources([remapped])).toEqual([
      expect.objectContaining({ key: "b", profileName: "4300", count: 1 }),
    ]);
  });

  it("fills a zero rate from the profile and prices the window by its dimensions", () => {
    const line: LineItem = {
      id: "1",
      widthCm: "403",
      heightCm: "295",
      qty: "1",
      unitPrice: "0",
      priceBasis: "per_unit",
      location: "כניסה מרתף",
      addons: [],
      subtotal: 0,
    };
    const profile: Profile = { id: "door", name: "דלת 5600 עם תריס אור", unitPrice: 2700 };
    const synced = lineAfterProfileSync(line, profile, true);
    expect(synced.profileName).toBe("דלת 5600 עם תריס אור");
    expect(synced.unitPrice).toBe("2700");
    expect(synced.priceBasis).toBe("per_m2");
    expect(lineTotal(synced)).toBeCloseTo((403 * 295) / 10000 * 2700, 2);
  });

  it("prices an imported profile rate by area instead of once per window", () => {
    const profile: Profile = { id: "p5600", name: "5600 כנף ורשת ותריס אור", unitPrice: 2700 };
    const line: LineItem = {
      id: "1",
      widthCm: "352",
      heightCm: "290",
      qty: "1",
      profileId: profile.id,
      profileName: profile.name,
      unitPrice: "2700",
      priceBasis: "per_unit",
      location: "חדר גג",
      addons: [],
      subtotal: 2700,
    };
    const synced = lineAfterProfileSync(line, profile, true);
    expect(synced.priceBasis).toBe("per_m2");
    expect(synced.unitPrice).toBe("2700");
    expect(lineTotal(synced)).toBeCloseTo((352 * 290) / 10000 * 2700, 2);
  });

  it("keeps a custom square-metre rate already stored on the line", () => {
    const profile: Profile = { id: "door", name: "דלת 5600 עם תריס אור", unitPrice: 2700 };
    const line: LineItem = {
      id: "1",
      widthCm: "100",
      heightCm: "100",
      qty: "1",
      profileId: profile.id,
      profileName: profile.name,
      unitPrice: "1500",
      priceBasis: "per_m2",
      addons: [],
      subtotal: 0,
    };
    const synced = lineAfterProfileSync(line, profile, true);
    expect(synced.unitPrice).toBe("1500");
    expect(lineTotal(synced)).toBe(1500);
  });

  it("leaves unmapped lines alone when remapping profiles", () => {
    const keep = applyProfileToLineItem(
      {
        id: "1",
        widthCm: "100",
        heightCm: "100",
        qty: "1",
        unitPrice: "1000",
        addons: [],
        subtotal: 0,
      },
      { id: "a", name: "1700", unitPrice: 1000 }
    );
    const other: LineItem = {
      id: "2",
      widthCm: "100",
      heightCm: "100",
      qty: "1",
      profileId: "x",
      profileName: "other",
      unitPrice: "800",
      addons: [],
      subtotal: 800,
    };
    const out = remapQuoteItems([keep, other], { a: "b" }, [
      { id: "a", name: "1700", unitPrice: 1000 },
      { id: "b", name: "4300", unitPrice: 1500 },
    ]);
    expect(out[0].profileId).toBe("b");
    expect(out[1].profileId).toBe("x");
    expect(out[1].unitPrice).toBe("800");
  });

  it("keeps supplier cost and markup out of the customer PDF item", () => {
    const item = {
      id: "1",
      widthCm: "160",
      heightCm: "100",
      qty: "1",
      unitPrice: "0",
      manualUnitPrice: "1300",
      priceBasis: "per_unit",
      location: "",
      details: "",
      addons: [],
      subtotal: 1300,
      supplierUnitCost: 1000,
      markupPercent: 30,
      exchangeRate: 3.7,
    } as LineItem & { supplierUnitCost: number; markupPercent: number; exchangeRate: number };
    const safe = toCustomerPdfItem(item);
    const encoded = JSON.stringify(safe);
    expect(encoded).not.toContain("supplierUnitCost");
    expect(encoded).not.toContain("markupPercent");
    expect(encoded).not.toContain("exchangeRate");
    expect(safe.manualUnitPrice).toBe("1300");
  });
});
