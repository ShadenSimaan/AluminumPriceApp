import type { RfqItem, RfqOpeningType, SupplierRequest } from "../types";
import { createRfqItem, normalizeItemConfig, withPanels } from "../presets";
import { createSupplierRequest } from "../rfqState";
import { accessoryFromLegacyScreen } from "../accessories";

let n = 0;
export function item(openingType: RfqOpeningType, patch: Partial<RfqItem> = {}): RfqItem {
  n += 1;
  const merged = { ...createRfqItem({ id: `it-${n}`, openingType, unit: "mm", reference: `X-${n}` }), ...patch };
  // Same migration a saved item gets on load: the legacy insect-screen field becomes an accessory.
  const screen = patch.insectScreen && !patch.accessories ? accessoryFromLegacyScreen("acc-insect-screen", patch.insectScreen) : null;
  if (screen) merged.accessories = [screen];
  return patch.panels && !patch.layout ? withPanels(merged, patch.panels) : normalizeItemConfig(merged);
}

export function sampleRequest(): SupplierRequest {
  const r = createSupplierRequest({
    company: { name: "אלום סמעאן סאמי", contactPerson: "Sami Samaan", phone: "0526475531", email: "info@example.com", address: "Fassuta, Israel", website: "" },
    defaultUnit: "mm",
    now: new Date(2026, 9, 25).getTime(),
  });
  r.number = 7;
  r.projectName = "Villa Haddad – וילה חדאד";
  r.projectReference = "PRJ-2026-014";
  r.supplier = { name: "Foshan Aluminium Co.", contactPerson: "Ms. Li", phone: "+86 757 0000 0000", email: "sales@example.cn", address: "Foshan, Guangdong, China", website: "" };
  r.deliveryDestination = "Haifa port, Israel (CIF)";
  r.generalSpecifications =
    "Thermal-break aluminium profiles. Double glazing throughout unless stated otherwise. כל החלונות עם רשת נגד יתושים אם צוין.\nPowder coated RAL 9016 matt.";
  r.notes =
    "Please quote each item separately. המידות יאומתו באתר לפני ייצור. " +
    "This is a long note to verify wrapping across lines and pages: ".repeat(6) +
    "\nSecond paragraph – פסקה שנייה עם מספרים 1200 mm ו-W-01 בתוך טקסט עברי.";
  r.items = [
    item("sliding_window", { reference: "W-01", widthCm: 180, heightCm: 130, quantity: 4, location: "Living room / סלון", glass: "6-12-6 Low-E", frameFinish: "RAL 9016", insectScreen: "required" }),
    item("casement_window", { reference: "W-02", widthCm: 60, heightCm: 120, quantity: 6, location: "חדר שינה 1", swing: "inward", panels: [{ operation: "casement", hingeSide: "right" }] }),
    item("tilt_turn_window", { reference: "W-03", widthCm: 120, heightCm: 140, quantity: 2, panels: [{ operation: "fixed" }, { operation: "tilt_turn", hingeSide: "right" }] }),
    item("top_hung_window", { reference: "W-04", widthCm: 80, heightCm: 50, quantity: 3, location: "Bathroom" }),
    item("fixed_window", { reference: "W-05", widthCm: 300, heightCm: 60, quantity: 1, panels: [{ operation: "fixed" }, { operation: "fixed" }, { operation: "fixed" }] }),
    item("sliding_door", { reference: "D-01", widthCm: 360, heightCm: 230, quantity: 1, panels: [{ operation: "fixed" }, { operation: "sliding", slideDirection: "left" }, { operation: "sliding", slideDirection: "right" }, { operation: "fixed" }], shutter: "required", hardware: "Multi-point lock, key both sides" }),
    item("hinged_door_single", { reference: "D-02", widthCm: 95, heightCm: 215, quantity: 2, swing: "outward", panels: [{ operation: "hinged", hingeSide: "right" }] }),
    item("hinged_door_double", { reference: "D-03", widthCm: 160, heightCm: 220, quantity: 1, activeLeaf: "left", notes: "Entrance door, הערה בעברית (חשוב)." }),
    item("custom", { reference: "W-06", category: "window", widthCm: 200, heightCm: 100, quantity: 1, customDescription: "Trapezoid fixed window with arched top – חלון טרפז" }),
  ];
  return r;
}
