import { describe, expect, it } from "vitest";
import { strToU8 } from "fflate";
import { defaultProfiles } from "../../appState";
import { buildTemplateCsv } from "../../rfq/import/template";
import { importWindowsFromFile, WINDOW_IMPORT_OPENING_TYPES, windowImportChatPrompt, windowImportSampleCsv } from "../windowImport";
import { parseOpeningType } from "../../rfq/import/schema";

const csv = (text: string) => strToU8(text);
const base = {
  profiles: defaultProfiles,
  addons: [],
  existingReferences: [] as string[],
  dimensionUnit: "cm" as const,
};

describe("quote window import", () => {
  it("builds quotation lines from the CSV template, including the opening layout", () => {
    const result = importWindowsFromFile({ ...base, fileName: "windows.csv", bytes: csv(buildTemplateCsv()) });
    expect(result.needsReview).toBe(false);
    expect(result.lines).toHaveLength(9);
    const sliding = result.lines.find((line) => line.configuration?.reference === "W-01")!;
    expect(sliding.configuration).toMatchObject({ openingType: "sliding_window", widthCm: 180, heightCm: 130, quantity: 4 });
    expect(sliding.widthCm).toBe("180");
    expect(sliding.heightCm).toBe("130");
    expect(sliding.qty).toBe("4");
    expect(sliding.location).toBe("Living room");
    expect(sliding.configuration?.panels.map((panel) => panel.operation)).toEqual(["sliding", "sliding"]);
    expect(result.lines.find((line) => line.configuration?.reference === "D-01")?.configuration?.panels.map((panel) => panel.operation)).toEqual([
      "fixed",
      "sliding",
      "sliding",
      "fixed",
    ]);
  });

  it("infers category, quantity, centimetres and a catalog profile from a short Hebrew schedule", () => {
    const text = "מיקום,סוג פתיחה,רוחב,גובה,פרופיל\nסלון,חלון הזזה,180,140,1700 זכוכית ורשת\n";
    const result = importWindowsFromFile({ ...base, fileName: "he.csv", bytes: csv(text) });
    expect(result.lines).toHaveLength(1);
    const line = result.lines[0];
    expect(line.location).toBe("סלון");
    expect(line.qty).toBe("1");
    expect(line.profileName).toBe("1700 זכוכית ורשת");
    expect(line.profileId).toBeTruthy();
    expect(line.priceBasis).toBe("per_m2");
    expect(line.unitPrice).toBe("1100");
    expect(line.subtotal).toBeCloseTo(2772, 2);
    expect(line.configuration?.openingType).toBe("sliding_window");
    expect(line.configuration?.category).toBe("window");
    expect(line.details).toContain("חלון הזזה");
  });

  it("reads large bare numbers as millimetres and still adds the valid rows", () => {
    const text = "סוג פתיחה,רוחב,גובה\nחלון קבוע,1200,1000\nלא סוג,80,80\nחלון ציר עליון,800,500\n";
    const result = importWindowsFromFile({ ...base, fileName: "sizes.csv", bytes: csv(text) });
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].configuration).toMatchObject({ openingType: "fixed_window", widthCm: 120, heightCm: 100 });
    expect(result.lines[1].configuration?.openingType).toBe("top_hung_window");
    expect(result.message).toContain("דולגו");
    expect(result.needsReview).toBe(false);
  });

  it("turns a glass make-up into the window glazing", () => {
    const text = "סוג פתיחה,רוחב,גובה,זכוכית\nחלון קבוע,100,120,6-16-6\n";
    const result = importWindowsFromFile({ ...base, fileName: "glass.csv", bytes: csv(text) });
    expect(result.lines[0].configuration?.glassSpec).toMatchObject({ construction: "double" });
    expect(result.lines[0].configuration?.glassSpec.panes.map((pane) => pane.thicknessMm)).toEqual([6, 6]);
    expect(result.lines[0].configuration?.glassSpec.cavities[0].widthMm).toBe(16);
  });

  it("shows a CSV sample and a copyable prompt whose opening types the importer accepts", () => {
    const names = defaultProfiles.map((profile) => profile.name);
    const sample = windowImportSampleCsv(names);
    const prompt = windowImportChatPrompt(names);
    expect(sample.split("\n")[0]).toContain("סוג פתיחה");
    expect(sample).toContain(names[0]);
    expect(prompt).toContain(sample);
    expect(prompt.endsWith("הרשימה שלי:")).toBe(true);
    for (const opening of WINDOW_IMPORT_OPENING_TYPES) expect(parseOpeningType(opening).ok).toBe(true);
    const imported = importWindowsFromFile({ ...base, fileName: "sample.csv", bytes: csv(sample) });
    expect(imported.lines).toHaveLength(3);
    expect(imported.needsReview).toBe(false);
  });

  it("asks for column mapping when the opening type column is missing", () => {
    const result = importWindowsFromFile({ ...base, fileName: "bad.csv", bytes: csv("רוחב,גובה\n100,100\n") });
    expect(result.lines).toEqual([]);
    expect(result.needsReview).toBe(true);
    expect(result.message).toContain("סוג פתיחה");
  });
});
