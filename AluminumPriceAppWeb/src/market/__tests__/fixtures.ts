// FIXTURES — hand-written test evidence. Not live market data; sellers and URLs are fictitious test values.
import type { Addon, LineItem, Profile } from "../../types";
import type { MarketEvidence } from "../contract";
import { DEFAULT_MANUFACTURERS, ALUMIL_ID, KLIL_ID } from "../../quote/manufacturers";
import { withSubtotal } from "../../quote/windowLine";

export const manufacturers = DEFAULT_MANUFACTURERS.map((m) => ({ ...m }));

export const profiles: Profile[] = [
  { id: "p7300", name: "7300 זכוכית ורשת", unitPrice: 1800, manufacturerId: KLIL_ID },
  { id: "p7300s", name: "7300 זכוכית ורשת ותריס אור", unitPrice: 2600, manufacturerId: KLIL_ID },
  { id: "ps350", name: "ALUMIL S350 זכוכית בידודית", unitPrice: 2900, manufacturerId: ALUMIL_ID },
  { id: "pm9960", name: "ALUMIL M9960 חלון ציר נטוי", unitPrice: 3200, manufacturerId: ALUMIL_ID },
];

export const motorAddon = (checked: boolean): Addon => ({ id: "a-motor", name: "מנוע חשמלי סמפי/נייס", price: "800", checked });

export function line(partial: Partial<LineItem>): LineItem {
  return withSubtotal({
    id: partial.id ?? Math.random().toString(36).slice(2),
    widthCm: "",
    heightCm: "",
    qty: "1",
    unitPrice: "0",
    addons: [],
    subtotal: 0,
    ...partial,
  });
}

let seq = 0;
export function ev(partial: Partial<MarketEvidence>): MarketEvidence {
  seq += 1;
  return {
    id: `fx-${seq}`,
    seller: "מוכר בדיקה",
    sellerType: "installer",
    url: `https://fixture.invalid/${seq}`,
    observedPriceText: "FIXTURE",
    amount: 1000,
    currency: "ILS",
    unit: "m2",
    vat: "excl",
    scope: "installed",
    priceKind: "installer_price",
    matchLevel: "exact",
    specification: "fixture",
    checkedAt: "2026-11-24T10:00:00.000Z",
    verification: "fixture",
    ...partial,
  };
}
