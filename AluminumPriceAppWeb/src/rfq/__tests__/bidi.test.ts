import { describe, expect, it } from "vitest";
import { toVisual, visualRuns } from "../bidi";

const rev = (s: string) => Array.from(s).reverse().join("");

describe("bidi visual ordering", () => {
  it("leaves pure LTR text untouched", () => {
    expect(toVisual("Sliding window W-01 1200 mm", false)).toBe("Sliding window W-01 1200 mm");
  });

  it("reverses pure Hebrew text in RTL paragraphs", () => {
    expect(toVisual("חלון הזזה", true)).toBe(rev("חלון הזזה"));
  });

  it("keeps numbers and references LTR inside Hebrew", () => {
    // Logical: "חלון W-01 רוחב 1200" → reading right-to-left must give the same order
    expect(toVisual("פריט W-01", true)).toBe("W-01 טירפ");
    expect(toVisual("רוחב 1200.5", true)).toBe("1200.5 בחור");
  });

  it("keeps spaces between LTR text and a following Hebrew run", () => {
    expect(toVisual("Villa Haddad – וילה חדאד", false)).toBe(`Villa Haddad – ${rev("וילה חדאד")}`);
    expect(toVisual("top – חלון טרפז — continued", false)).toBe(`top – ${rev("חלון טרפז")} — continued`);
  });

  it("mirrors and pairs brackets around Hebrew inside English", () => {
    expect(toVisual("door, הערה (חשוב).", false)).toBe(`door, ${rev("הערה (חשוב)").replace("(", "#").replace(")", "(").replace("#", ")")}.`);
  });

  it("isolates LTR data so phone groups keep their order in Hebrew", () => {
    const v = toVisual("טלפון: \u2066+86 757 0000\u2069", true);
    expect(v).toBe(`+86 757 0000 :${rev("טלפון")}`);
  });

  it("produces runs flagged by direction", () => {
    const runs = visualRuns("abc אבג", false);
    expect(runs.map((r) => r.rtl)).toEqual([false, true]);
  });
});
