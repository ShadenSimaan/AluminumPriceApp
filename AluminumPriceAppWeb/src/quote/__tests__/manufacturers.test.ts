import { describe, expect, it } from "vitest";
import type { LineItem, Profile } from "../../types";
import {
  ALUMIL_ID,
  DEFAULT_MANUFACTURERS,
  EKLEIN_ID,
  KLIL_ID,
  groupProfilesByManufacturer,
  lineManufacturer,
  normalizeManufacturers,
  quoteManufacturers,
} from "../manufacturers";
import { normalizeState } from "../../appState";

const line = (over: Partial<LineItem>): LineItem => ({
  id: "l",
  widthCm: "100",
  heightCm: "100",
  qty: "1",
  unitPrice: "0",
  addons: [],
  subtotal: 0,
  ...over,
});

const profiles: Profile[] = [
  { id: "p1", name: "4300", unitPrice: 1000, manufacturerId: KLIL_ID },
  { id: "p2", name: "M9660", unitPrice: 2000, manufacturerId: ALUMIL_ID },
  { id: "p3", name: "ללא", unitPrice: 500 },
];

describe("profile companies", () => {
  it("seeds Alumil, Klil and EKLEIN and keeps custom companies", () => {
    const list = normalizeManufacturers([{ id: "mfr-x", name: "Extal", logoUrl: "data:image/png;base64,AA" }]);
    expect(list.map((m) => m.id)).toEqual([ALUMIL_ID, KLIL_ID, EKLEIN_ID, "mfr-x"]);
    expect(normalizeState({}).manufacturers.map((m) => m.id)).toEqual(DEFAULT_MANUFACTURERS.map((m) => m.id));
  });

  it("resolves a line's company from its profile, and none when the profile has no company", () => {
    const all = normalizeManufacturers([]);
    expect(lineManufacturer(line({ profileId: "p2" }), profiles, all)?.id).toBe(ALUMIL_ID);
    expect(lineManufacturer(line({ profileName: "4300" }), profiles, all)?.id).toBe(KLIL_ID);
    expect(lineManufacturer(line({ profileId: "p3" }), profiles, all)).toBeUndefined();
    expect(lineManufacturer(line({ profileName: "EKLIEN · SWR110" }), profiles, all)?.id).toBe(EKLEIN_ID);
  });

  it("lists distinct companies of a quote and groups profiles by company", () => {
    const all = normalizeManufacturers([]);
    const used = quoteManufacturers(
      [line({ profileId: "p1" }), line({ profileId: "p2" }), line({ profileId: "p1" }), line({ profileId: "p3" })],
      profiles,
      all
    );
    expect(used.map((m) => m.id)).toEqual([KLIL_ID, ALUMIL_ID]);
    const groups = groupProfilesByManufacturer(profiles, all);
    expect(groups.map((g) => g.manufacturer?.id)).toEqual([ALUMIL_ID, KLIL_ID, undefined]);
  });
});
