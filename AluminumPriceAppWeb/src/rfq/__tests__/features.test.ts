import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { strToU8 } from "fflate";
import { PDFPage } from "pdf-lib";
import type { RfqItem } from "../types";
import { item, sampleRequest } from "./fixtures";
import {
  divideGlass,
  formatLayoutNotation,
  hasDecorativeBars,
  isAdvancedLayout,
  layoutGeometry,
  newPanel,
  numberedGlass,
  panelLeaves,
  parseLayoutNotation,
  setDecorativeBars,
  setGlassOverride,
} from "../layout";
import { normalizeItemConfig, setPanelCount, validateItem } from "../presets";
import { effectiveGlass, emptyGlassSpec, setConstruction } from "../glass";
import { newShading } from "../accessories";
import { buildDiagram, DECO_DASH } from "../diagram";
import { ekleindoorProfile, contactFromProfile, safeExternalUrl } from "../suppliers";
import { addLinkedQuestions, pendingSuggestions, removeQuestion, syncQuestions } from "../questions";
import { normalizeRfqItem, normalizeSupplierRequest } from "../rfqState";
import { dict } from "../i18n";
import { buildItemsCsv } from "../import/itemExport";
import { analyzeSheet, buildImportRows, committableItems, firstNonEmptyRow, parseImportBytes, validateImportRows } from "../import/importer";
import { buildRfqPdfBytes } from "../pdf/rfqPdf";

const fontBytes = readFileSync(join(__dirname, "../../../public/fonts/NotoSansHebrew-Regular.ttf"));

const sixPanel = () => setPanelCount(item("casement_window", { widthCm: 360, heightCm: 150 }), 6);
const nested = () => {
  const it = item("casement_window", { widthCm: 150, heightCm: 200 });
  const layout = parseLayoutNotation("F:400/(OL[G/G]|F|OR)", "mm", (p) => newPanel(p.fixed ? "fixed" : "casement", p.side ? { hingeSide: p.side } : {}));
  return normalizeItemConfig({ ...it, layout });
};
const json = <T,>(v: T): unknown => JSON.parse(JSON.stringify(v));

function reimport(items: RfqItem[]) {
  const file = parseImportBytes("items.csv", strToU8(buildItemsCsv(items)));
  const rows = file.sheets[0].rows;
  const headerRow = firstNonEmptyRow(rows);
  const analysis = analyzeSheet(rows, headerRow);
  const importRows = buildImportRows(rows, headerRow, analysis.mapping);
  const results = validateImportRows(importRows, { unit: analysis.detectedUnit, existingReferences: [], mode: "append" });
  return { results, items: committableItems(importRows, results) };
}

describe("unlimited layouts", () => {
  it("six-panel and nested layouts survive save/load and file export/import", () => {
    for (const it of [sixPanel(), nested()]) {
      const reloaded = normalizeRfqItem(json(it), "mm", []);
      expect(reloaded.layout).toEqual(it.layout);
      expect(reloaded.panels).toEqual(it.panels);
      const { results, items } = reimport([it]);
      expect(results.flatMap((r) => r.errors)).toEqual([]);
      const back = items![0];
      expect(JSON.stringify(back.panels)).toBe(JSON.stringify(it.panels));
      expect(numberedGlass(back.layout).length).toBe(numberedGlass(it.layout).length);
      expect(formatLayoutNotation(back.layout, "mm")).toBe(formatLayoutNotation(it.layout, "mm"));
    }
    expect(sixPanel().panels).toHaveLength(6);
    const n = nested();
    expect(isAdvancedLayout(n.layout)).toBe(true);
    // Top light 400 mm; remaining height shared by the lower row
    const geo = layoutGeometry(n.layout, 150, 200);
    expect(geo.panels[0].rect).toMatchObject({ y: 0, h: 40 });
    expect(geo.panels[1].rect.h).toBeCloseTo(160);
  });

  it("keeps different glass inside one sash as part of that sash", () => {
    let it = item("casement_window", { widthCm: 60, heightCm: 140 });
    const [sash] = panelLeaves(it.layout);
    it = normalizeItemConfig({ ...it, layout: divideGlass(it.layout, sash.id, "rows", 2) });
    const [top, bottom] = numberedGlass(it.layout);
    expect(top.panel.id).toBe(sash.id);
    expect(bottom.panel.id).toBe(sash.id);
    const frosted = { ...setConstruction(emptyGlassSpec(), "double"), appearance: "frosted" as const };
    it = normalizeItemConfig({ ...it, glassSpec: { ...setConstruction(emptyGlassSpec(), "double"), appearance: "clear" }, layout: setGlassOverride(it.layout, bottom.glass.id, frosted) });
    const glass = numberedGlass(it.layout);
    expect(effectiveGlass(it, glass[0].glass).appearance).toBe("clear");
    expect(effectiveGlass(it, glass[1].glass).appearance).toBe("frosted");
    // Still one operable panel: the sash opens as a whole
    expect(it.panels).toEqual([expect.objectContaining({ operation: "casement" })]);
    expect(validateItem(it)).toEqual([]);
  });

  it("draws physical glazing bars and decorative bars differently", () => {
    const base = item("fixed_window", { widthCm: 100, heightCm: 100 });
    const [p] = panelLeaves(base.layout);
    const physical = normalizeItemConfig({ ...base, layout: divideGlass(base.layout, p.id, "columns", 2) });
    const g = numberedGlass(base.layout)[0].glass;
    const deco = normalizeItemConfig({ ...base, layout: setDecorativeBars(base.layout, g.id, { columns: 1, rows: 0 }) });
    const opts = { width: 300, height: 300, customPlaceholder: "" };
    const dashed = (it: RfqItem) => buildDiagram(it, opts).shapes.filter((s) => s.kind === "line" && s.dash === DECO_DASH);
    expect(numberedGlass(physical.layout)).toHaveLength(2);
    expect(numberedGlass(deco.layout)).toHaveLength(1);
    expect(hasDecorativeBars(deco.layout)).toBe(true);
    expect(dashed(deco)).toHaveLength(1);
    expect(dashed(physical)).toHaveLength(0);
    expect(buildDiagram(physical, opts).dividers?.some((d) => d.level === "glass")).toBe(true);
  });
});

describe("supplier and questions", () => {
  it("selecting a supplier changes only the supplier, never the design", () => {
    const req = sampleRequest();
    const before = json(req.items);
    const profile = ekleindoorProfile();
    const next = syncQuestions({ ...req, supplierProfileId: profile.id, supplier: contactFromProfile(profile) }, profile);
    expect(json(next.items)).toEqual(before);
    expect(next.supplier.name).toMatch(/ekleindoor/i);
    expect(safeExternalUrl(next.supplier.website)).toMatch(/^https:\/\/ekleindoor\.com/);
  });

  it("creates questions for unverified options without duplicates, and marks removed links stale", () => {
    const profile = ekleindoorProfile();
    const req = sampleRequest();
    const blind = { ...newShading("sh-1", "integrated"), operation: "manual" as const };
    const w = { ...req.items[0], glassSpec: setConstruction(emptyGlassSpec(), "double"), shading: [blind], completeHardwareSet: true };
    let r = syncQuestions({ ...req, items: [w, ...req.items.slice(1)] }, profile);
    const keys = r.questions.map((q) => q.linkKey);
    expect(keys).toContain(`${w.id}:shading:sh-1`);
    expect(keys).toContain(`${w.id}:hwset`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(syncQuestions(r, profile)).toBe(r);
    // Asking again for an existing link does not duplicate it
    expect(addLinkedQuestions(r, profile, [`${w.id}:hwset`])).toBe(r);
    // Unverified catalog options are offered as suggestions, never inferred as unavailable
    const low = { ...w, glassSpec: { ...w.glassSpec, coatings: ["uv" as const] } };
    r = syncQuestions({ ...r, items: [low, ...r.items.slice(1)] }, profile);
    expect(pendingSuggestions(r, profile).some((c) => c.linkKey === `${w.id}:opt:glass.coating.uv`)).toBe(true);
    // A question with a reply is kept (stale) when its option is removed; an untouched one disappears
    r = { ...r, questions: r.questions.map((q) => (q.linkKey === `${w.id}:hwset` ? { ...q, reply: "Included" } : q)) };
    r = syncQuestions({ ...r, items: [{ ...low, completeHardwareSet: false, shading: [] }, ...r.items.slice(1)] }, profile);
    expect(r.questions.find((q) => q.linkKey === `${w.id}:hwset`)?.stale).toBe(true);
    expect(r.questions.some((q) => q.linkKey === `${w.id}:shading:sh-1`)).toBe(false);
    // Deleting an automatic question dismisses it so it is not re-created
    const auto = syncQuestions({ ...r, items: [{ ...low, completeHardwareSet: true }, ...r.items.slice(1)] }, profile);
    const hw = auto.questions.find((q) => q.linkKey === `${w.id}:hwset`)!;
    const removed = removeQuestion({ ...auto, questions: auto.questions.map((q) => (q.id === hw.id ? { ...q, origin: "auto" as const } : q)) }, hw.id);
    expect(syncQuestions(removed, profile).questions.some((q) => q.linkKey === `${w.id}:hwset`)).toBe(false);
  });

  it("rejects an integrated blind with single glazing", () => {
    const blind = newShading("sh-1", "integrated");
    const single = item("fixed_window", { widthCm: 100, heightCm: 100, glassSpec: setConstruction(emptyGlassSpec(), "single"), shading: [blind] });
    expect(validateItem(single).map((i) => i.code)).toContain("integrated_blind_single_glazing");
    const double = { ...single, glassSpec: setConstruction(emptyGlassSpec(), "double") };
    expect(validateItem(double).map((i) => i.code)).not.toContain("integrated_blind_single_glazing");
  });
});

describe("migration and translations", () => {
  it("loads legacy (version 1) items into the layout model", () => {
    const legacy = {
      id: "old-1",
      reference: "W-01",
      category: "window",
      openingType: "sliding_window",
      widthCm: 180,
      heightCm: 130,
      quantity: 2,
      unit: "mm",
      panels: [{ operation: "fixed" }, { operation: "sliding", slideDirection: "left" }, { operation: "fixed" }],
      glass: "6-12-6 Low-E",
      insectScreen: "required",
      shutter: "not_required",
    };
    const it = normalizeRfqItem(legacy, "mm", []);
    expect(it.panels.map((p) => p.operation)).toEqual(["fixed", "sliding", "fixed"]);
    expect(panelLeaves(it.layout)).toHaveLength(3);
    expect(isAdvancedLayout(it.layout)).toBe(false);
    expect(it.glass).toBe("6-12-6 Low-E");
    expect(it.accessories).toEqual([expect.objectContaining({ kind: "insect_screen", mode: "included" })]);
    expect(it.shutter).toBe("not_required");
    // Loading twice does not duplicate the migrated accessory
    expect(normalizeRfqItem(json(it), "mm", []).accessories).toHaveLength(1);
    const req = normalizeSupplierRequest({ documentType: "supplier_rfq", id: "r1", items: [legacy] })!;
    expect(req.questions).toEqual([]);
    expect(req.supplier.website).toBe("");
  });

  it("has the same translation keys in English and Hebrew", () => {
    const keys = (o: object, prefix = ""): string[] =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
    const en = keys(dict("en")).sort();
    const he = keys(dict("he")).sort();
    expect(he.filter((k) => !en.includes(k))).toEqual([]);
    expect(en.filter((k) => !he.includes(k))).toEqual([]);
  });
});

describe("PDF with the extended configuration", () => {
  afterEach(() => vi.restoreAllMocks());

  it("prints layout, glass, shading, hardware and questions in both languages without pricing", async () => {
    const profile = ekleindoorProfile();
    const req = sampleRequest();
    const n = nested();
    const g = numberedGlass(n.layout);
    const frosted = { ...setConstruction(emptyGlassSpec(), "double"), appearance: "frosted" as const };
    const special: RfqItem = {
      ...n,
      reference: "W-10",
      glassSpec: {
        ...setConstruction(emptyGlassSpec(), "double"),
        treatment: "tempered",
        appearance: "clear",
        coatings: ["low_e"],
        panes: [{ thicknessMm: 6, note: "" }, { thicknessMm: 6, note: "" }],
        cavities: [{ widthMm: 16, fill: "argon", fillNote: "" }],
      },
      layout: setGlassOverride(n.layout, g[1].glass.id, frosted),
      shading: [{ ...newShading("sh-1", "integrated"), operation: "manual" }],
      completeHardwareSet: true,
      alternatives: [{ id: "a1", description: "Triple glazing option" }],
    };
    const r = syncQuestions({ ...req, supplierProfileId: profile.id, supplier: contactFromProfile(profile), items: [special, sixPanel(), ...req.items] }, profile);
    expect(r.questions.length).toBeGreaterThan(0);
    for (const lang of ["en", "he"] as const) {
      const drawn: string[] = [];
      const orig = PDFPage.prototype.drawText;
      vi.spyOn(PDFPage.prototype, "drawText").mockImplementation(function (this: PDFPage, text, options) {
        drawn.push(text);
        return orig.call(this, text, options);
      });
      const bytes = await buildRfqPdfBytes(r, { lang, fontBytes });
      if (process.env.RFQ_PDF_OUT) {
        mkdirSync(process.env.RFQ_PDF_OUT, { recursive: true });
        writeFileSync(join(process.env.RFQ_PDF_OUT, `rfq-features-${lang}.pdf`), bytes);
      }
      const all = drawn.join("\n");
      expect(all).not.toMatch(/\bVAT\b|Subtotal|Discount|Margin|\bILS\b|\u20aa|Payment request|Grand total|Total price|price list|cost/i);
      for (const he of ["מע״מ", "סה״כ לתשלום", "חשבון עסקה", "הנחה", "מחיר עלות"]) {
        expect(all).not.toContain(he);
        expect(all).not.toContain(Array.from(he).reverse().join(""));
      }
      expect(all).toContain("ekleindoor.com");
      expect(all).toContain("Q1");
      expect(all).toContain("G1");
      if (lang === "en") {
        expect(all).toContain("Questions for supplier");
        expect(all).toContain("Make-up: 6 / 16 Argon / 6 mm");
        expect(all).not.toContain("? / ?");
        expect(all).toContain("Schematic quotation drawing");
      }
      vi.restoreAllMocks();
    }
  });
});
