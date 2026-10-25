import { describe, expect, it } from "vitest";
import { normalizeState } from "../../appState";
import {
  deleteRequest,
  duplicateRequest,
  isDraftDirty,
  normalizeRfqSlice,
  openRequest,
  saveDraft,
  type RfqSlice,
} from "../rfqState";
import { sampleRequest } from "./fixtures";

const legacyState = {
  customers: [{ id: "c1", name: "לקוח", createdAt: 1 }],
  quotes: [
    { id: "q1", customerId: "c1", title: "", date: 1, items: [], taxPercent: 18, totals: { sub: 100, tax: 18, grand: 118 } },
    { id: "q2", customerId: "c1", title: "", documentType: "payment_request", documentNumber: 12, date: 2, items: [], taxPercent: 18, totals: { sub: 1, tax: 0, grand: 1 } },
  ],
  profiles: [{ id: "p1", name: "4300", unitPrice: 1100 }],
  addons: [{ id: "a1", name: "x", price: "1", checked: false }],
  current: { customerName: "x", items: [], freeFormAdditions: [], taxPercentText: "18" },
  ui: { tab: "customers" },
  dimensionUnit: "mm",
  nextPaymentRequestNumber: 13,
};

function slice(): RfqSlice {
  const s = normalizeState({});
  return { supplierRequests: s.supplierRequests, rfqDraft: { ...sampleRequest(), number: undefined }, nextSupplierRequestNumber: 1, rfqSettings: s.rfqSettings };
}

describe("persistence and backward compatibility", () => {
  it("loads pre-RFQ saved data unchanged and adds RFQ defaults", () => {
    const s = normalizeState(JSON.parse(JSON.stringify(legacyState)));
    expect(s.quotes.map((q) => q.documentType)).toEqual(["quote", "payment_request"]);
    expect(s.quotes[1].documentNumber).toBe(12);
    expect(s.quotes[0].totals).toEqual({ sub: 100, tax: 18, grand: 118 });
    expect(s.profiles).toEqual(legacyState.profiles);
    expect(s.dimensionUnit).toBe("mm");
    expect(s.nextPaymentRequestNumber).toBe(13);
    expect(s.ui.tab).toBe("customers");
    expect(s.supplierRequests).toEqual([]);
    expect(s.rfqDraft).toBeNull();
    expect(s.nextSupplierRequestNumber).toBe(1);
  });

  it("RFQs survive a save → JSON → reload round trip and stay RFQs", () => {
    const saved = saveDraft(slice());
    const full = { ...legacyState, ...saved, ui: { tab: "rfq" } };
    const reloaded = normalizeState(JSON.parse(JSON.stringify(full)));
    expect(reloaded.ui.tab).toBe("rfq");
    expect(reloaded.supplierRequests).toHaveLength(1);
    const r = reloaded.supplierRequests[0];
    expect(r.documentType).toBe("supplier_rfq");
    expect(r).toEqual(saved.supplierRequests[0]);
    // RFQs never appear among priced quotations
    expect(reloaded.quotes.map((q) => q.id)).toEqual(["q1", "q2"]);
    expect(isDraftDirty(reloaded)).toBe(false);
  });

  it("RFQ numbering is independent from payment-request numbering", () => {
    let s = saveDraft(slice());
    expect(s.supplierRequests[0].number).toBe(1);
    s = saveDraft(s); // re-saving keeps the number
    expect(s.supplierRequests[0].number).toBe(1);
    s = duplicateRequest(s, s.supplierRequests[0].id, "(copy)");
    expect(s.supplierRequests.map((r) => r.number)).toEqual([1, 2]);
    expect(s.nextSupplierRequestNumber).toBe(3);
    const merged = normalizeState({ ...legacyState, ...s });
    expect(merged.nextPaymentRequestNumber).toBe(13);
    expect(merged.nextSupplierRequestNumber).toBe(3);
  });

  it("never reuses RFQ numbers when the stored counter is stale", () => {
    const s = saveDraft(slice());
    const reloaded = normalizeState({ ...s, nextSupplierRequestNumber: 1 });
    expect(reloaded.nextSupplierRequestNumber).toBe(2);
  });

  it("tracks unsaved edits, reopens, duplicates and deletes", () => {
    let s = saveDraft(slice());
    const id = s.supplierRequests[0].id;
    s = { ...s, rfqDraft: { ...s.rfqDraft!, projectName: "Changed" } };
    expect(isDraftDirty(s)).toBe(true);
    s = openRequest(s, id);
    expect(s.rfqDraft!.projectName).not.toBe("Changed");
    expect(isDraftDirty(s)).toBe(false);
    s = duplicateRequest(s, id, "(copy)");
    const copy = s.supplierRequests[1];
    expect(copy.id).not.toBe(id);
    expect(copy.projectName.endsWith("(copy)")).toBe(true);
    expect(copy.items.map((i) => i.id)).not.toEqual(s.supplierRequests[0].items.map((i) => i.id));
    s = deleteRequest(s, copy.id);
    expect(s.supplierRequests).toHaveLength(1);
    expect(s.rfqDraft).toBeNull();
  });

  it("repairs malformed stored RFQ data without inventing specs", () => {
    const n = normalizeRfqSlice({
      supplierRequests: [
        {
          id: "r1",
          items: [
            { reference: "", openingType: "sliding_window", widthCm: -3, heightCm: "x", quantity: 2.5, panels: [{ operation: "bogus" }] },
            { reference: "Z-1", openingType: "future_type", category: "door" },
          ],
        },
        null,
        { id: "r1" },
      ],
    });
    expect(n.supplierRequests).toHaveLength(1);
    const [a, b] = n.supplierRequests[0].items;
    expect(a.reference).toBe("W-01");
    expect(a.widthCm).toBeNull();
    expect(a.heightCm).toBeNull();
    expect(a.quantity).toBe(1);
    expect(a.glass).toBe("");
    expect(a.insectScreen).toBe("unspecified");
    expect(b.openingType).toBe("custom");
    expect(b.category).toBe("door");
    expect(b.customDescription).toBe("future_type");
  });
});
