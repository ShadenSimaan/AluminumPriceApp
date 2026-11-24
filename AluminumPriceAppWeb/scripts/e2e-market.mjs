// End-to-end check of בדיקת מחירי שוק through the normal quotation screen, against the market-proxy in
// FIXTURE MODE (no provider key, clearly labelled test data). Prerequisites:
//   MARKET_FIXTURES=1 MARKET_APP_TOKEN=e2e-token-0123456789abc PORT=8799 node --experimental-strip-types market-proxy/src/node.ts
//   npx vite --port 5173 --host 127.0.0.1
// Run: node scripts/e2e-market.mjs [screenshotDir]
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// The machine-wide Playwright install is resolved through require (NODE_PATH), not an app dependency.
const { chromium } = createRequire(import.meta.url)("playwright");
const APP = process.env.APP_URL ?? "http://127.0.0.1:5173/";
const PROXY = "http://127.0.0.1:8799";
const TOKEN = "e2e-token-0123456789abc";
const LS_KEY = "aluminum-quote-app:new-mobile-style-v1";
const shots = process.argv[2];
if (shots) mkdirSync(shots, { recursive: true });

const KLIL = "mfr-klil";
const ALUMIL = "mfr-alumil";
const profiles = [
  { id: "p7300", name: "7300 זכוכית ורשת", unitPrice: 1800, manufacturerId: KLIL },
  { id: "p7300s", name: "7300 זכוכית ורשת ותריס אור", unitPrice: 2600, manufacturerId: KLIL },
  { id: "ps350", name: "ALUMIL S350 זכוכית בידודית", unitPrice: 2900, manufacturerId: ALUMIL },
  { id: "pm9960", name: "ALUMIL M9960 חלון ציר נטוי", unitPrice: 3200, manufacturerId: ALUMIL },
];
const addons = [{ id: "a1", name: "מנוע חשמלי סמפי/נייס", price: "800", checked: false }];
const L = (id, p) => ({ id, widthCm: "", heightCm: "", qty: "1", unitPrice: "0", addons: addons.map((a) => ({ ...a })), subtotal: 0, ...p });
const items = [
  L("l1", { profileId: "p7300s", profileName: "7300 זכוכית ורשת ותריס אור", unitPrice: "2600", priceBasis: "per_m2", widthCm: "200", heightCm: "150", addons: [{ ...addons[0], checked: true }], location: "סלון משפחת לוי" }),
  L("l2", { profileId: "ps350", profileName: "ALUMIL S350 זכוכית בידודית", unitPrice: "2900", priceBasis: "per_m2", widthCm: "240", heightCm: "220" }),
  L("l3", { profileId: "pm9960", profileName: "ALUMIL M9960 חלון ציר נטוי", unitPrice: "3200", priceBasis: "per_m2", widthCm: "100", heightCm: "120" }),
  L("l4", { profileName: "ארגז תריס", manualUnitPrice: "900", priceBasis: "per_unit", widthCm: "250", qty: "2" }),
  L("l5", { profileName: "צילינדר", manualUnitPrice: "150", priceBasis: "per_unit", qty: "4" }),
  L("l6", { profileId: "p7300", profileName: "7300 זכוכית ורשת", unitPrice: "1800", priceBasis: "per_m2", widthCm: "100", heightCm: "100", qty: "3" }),
  L("l7", { profileId: "p7300", profileName: "7300 זכוכית ורשת", unitPrice: "1800", priceBasis: "per_m2", widthCm: "100", heightCm: "100", qty: "3" }),
];
const seed = {
  profiles,
  addons,
  current: {
    customerName: "לקוח בדיקה E2E",
    customerPhone: "050-0000000",
    customerEmail: "",
    customerNotes: "",
    items,
    freeFormAdditions: [{ id: "f1", name: "פירוק והובלה", price: "1400", qty: "1" }],
    taxPercentText: "18",
    discountPercentText: "10",
    installationTerms: "כולל התקנה",
    notes: "",
  },
  marketSettings: { endpointUrl: "", accessToken: "" },
};

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}
const shot = async (page, name) => shots && page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "he-IL", acceptDownloads: true });
const page = await ctx.newPage();
const requests = [];
page.on("request", (r) => {
  if (r.url().startsWith(PROXY) && r.method() === "POST") requests.push(r.postData() ?? "");
});
await page.goto(APP);
await page.evaluate(([k, v]) => localStorage.setItem(k, v), [LS_KEY, JSON.stringify(seed)]);
await page.reload();
// On start the app files the open document under its customer and opens a blank one: open it like a user would.
await page.getByRole("button", { name: "לקוחות" }).click();
await page.getByRole("button", { name: /פתח/ }).first().click();
await page.locator('tr[data-item-id]').first().waitFor();

const totalsText = async () => (await page.getByText("סה״כ לתשלום", { exact: true }).locator("xpath=../..").innerText()).replace(/\s+/g, " ");
const totalsBefore = await totalsText();

// 1. Missing configuration
await page.getByRole("button", { name: /בדיקת מחירי שוק/ }).click();
await page.getByText("לא הוגדר שירות בדיקת מחירים").first().waitFor();
check("missing endpoint/key shows a clear message and leaves the quote usable", true);

// 2. Configure in הגדרות
await page.getByRole("button", { name: "הגדרות" }).first().click();
await page.getByPlaceholder("https://alum-market-proxy.example.workers.dev").fill(PROXY);
await page.locator('input[type="password"]').fill(TOKEN);
await page.getByRole("button", { name: "בדיקת חיבור" }).click();
await page.getByText("מחובר — השרת במצב נתוני בדיקה").waitFor();
check("settings: connection test reports fixture mode", true);
await page.getByRole("button", { name: "שמירה ויציאה" }).click();

// 3. Run the comparison
await page.getByRole("button", { name: /בדיקת מחירי שוק/ }).click();
await page.getByText("הבדיקה הסתיימה").waitFor({ timeout: 30000 });
await page.waitForTimeout(300);
await shot(page, "01-after-check");
const panel = (i) => page.locator(`[aria-label="השוואת שוק לשורה ${i}"]`);
const p1 = await panel(1).innerText();
check("7300 + electric תריס אור: component estimate with labelled screen assumption", /הערכת רכיבים/.test(p1) && /הנחה: רשת על כנף הזזה אחת/.test(p1), p1.split("\n").slice(0, 14).join(" | "));
await panel(1).getByRole("button", { name: /הצג מקורות/ }).click();
const src1 = await panel(1).innerText();
check("7300 + תריס אור: 6 m² minimum source excluded and 'from' price kept as lower bound", /מינימום הזמנה 6 מ״ר להזמנה — העבודה \(3\) לא עומדת בתנאי/.test(src1) && /גבול תחתון/.test(src1));
check("7300 + תריס אור: separate motor price not added on top of a complete light shutter", /חלון וזיגוג .* \+ תריס .*ליחידה/.test(src1) && !/מנוע ‏?[\d,]+/.test(src1.split("מקורות")[0]));
await panel(1).getByRole("button", { name: /הסתר מקורות/ }).click();
const p2 = await panel(2).innerText();
check("ALUMIL S350: only a proxy → אין מספיק נתונים להשוואה, proxy shown separately", /אין מספיק נתונים להשוואה/.test(p2) && /קירוב ממערכת אחרת/.test(p2));
const p3 = await panel(3).innerText();
check("M9960 preserved and flagged נדרש אימות דגם with M9660 offered", /נדרש אימות דגם/.test(p3) && /M9960/.test(p3) && /השווה כ-M9660/.test(p3));
const p4 = await panel(4).innerText();
check("shutter box compared per linear metre", /למטר אורך/.test(p4) && /מעל מחיר השוק|מתחת למחיר השוק/.test(p4), p4.split("\n").slice(0, 12).join(" | "));
const p5 = await panel(5).innerText();
check("cylinder compared per unit", /ליח׳/.test(p5) && /מעל מחיר השוק|מתחת למחיר השוק|זהה/.test(p5), p5.split("\n").slice(0, 12).join(" | "));
const summary = await page.locator('[aria-label="סיכום השוואת שוק"]').innerText();
check("quotation summary shows index, direction and coverage", /מדד הצעה מול שוק/.test(summary) && /מערך ההצעה/.test(summary) && /מתוך 8 שורות/.test(summary), summary.replace(/\n/g, " | "));
check("fixture data is labelled as test data", /נתוני בדיקה \(fixture\)/.test(summary));
check("repeated identical lines share one search", requests.length === 6, `${requests.length} POSTs for 7 lines`);
const sent = requests.join("\n");
check("no customer name/phone/location/our prices in requests", !/לקוח בדיקה|050-0000000|משפחת לוי|2600|1800|"900"|"150"|unitPrice|subtotal/.test(sent));
const totalsAfter = await totalsText();
check("quotation totals unchanged by the comparison", totalsAfter === totalsBefore, totalsAfter.replace(/\n/g, " "));

// 4. Sources
await panel(6).getByRole("button", { name: /הצג מקורות/ }).click();
const src6 = await panel(6).innerText();
check("sources table: seller, VAT, scope, date, inclusion reason", /ספק בדיקה/.test(src6) && /כולל מע״מ/.test(src6) && /לא ידוע אם המחיר כולל מע״מ/.test(src6) && /נקודת אמצע/.test(src6));
await shot(page, "02-sources");

// 5. Confirm M9660 for comparison → outdated → refresh line
await panel(3).getByRole("button", { name: "השווה כ-M9660" }).click();
await panel(3).getByText("לא עדכני").waitFor();
await panel(3).getByRole("button", { name: /רענון שורה/ }).click();
await page.waitForFunction(() => /מקור יחיד|חציון מוכרים/.test(document.querySelector('[aria-label="השוואת שוק לשורה 3"]')?.textContent ?? ""), null, { timeout: 20000 });
const p3b = await panel(3).innerText();
check("after confirming M9660 the line compares as M9660 while M9960 stays on the quote", /מושווה כ-M9660/.test(p3b) && !/לא עדכני/.test(p3b));

// 6. Changed specification marks the line outdated
const row6 = panel(6).locator("xpath=ancestor::tr[1]/preceding-sibling::tr[1]");
await row6.locator("td").nth(2).getByRole("button").click();
await row6.locator("input").fill("140×100");
await row6.locator("input").press("Enter");
await panel(6).getByText("לא עדכני").waitFor();
check("editing dimensions marks the comparison outdated (kept visible, out of index)", /לא נכלל במדד|המפרט השתנה/.test(await panel(6).innerText()));

// 7. Provider failure keeps previous result
execSync(`pkill -f "market-proxy/src/[n]ode.ts" || true`);
await page.waitForTimeout(500);
await panel(5).getByRole("button", { name: /רענון שורה/ }).click();
await panel(5).getByText(/נכשלה/).waitFor({ timeout: 20000 });
const p5b = await panel(5).innerText();
check("failed search: quote usable, previous result shown with its date", /מוצגת התוצאה הקודמת/.test(p5b) && /ליח׳/.test(p5b));
await shot(page, "03-failure");
const proxy = spawn("node", ["--experimental-strip-types", "market-proxy/src/node.ts"], {
  env: { ...process.env, MARKET_FIXTURES: "1", MARKET_APP_TOKEN: TOKEN, PORT: "8799" },
  detached: true,
  stdio: "ignore",
});
proxy.unref();

// 8. Save, reload, reopen from לקוחות → same comparison
await page.getByRole("button", { name: "שמירה" }).first().click();
await page.waitForTimeout(400);
const beforeReopen = await panel(2).innerText();
const summaryBefore = (await page.locator('[aria-label="סיכום השוואת שוק"]').innerText()).split("\n").filter((l) => /מדד|₪|%/.test(l)).join("|");
await page.getByRole("button", { name: "הצעה חדשה" }).first().click();
await page.reload();
await page.getByRole("button", { name: "לקוחות" }).click();
await page.getByRole("button", { name: /פתח/ }).first().click();
await panel(2).waitFor();
const afterReopen = await panel(2).innerText();
const summaryAfter = (await page.locator('[aria-label="סיכום השוואת שוק"]').innerText()).split("\n").filter((l) => /מדד|₪|%/.test(l)).join("|");
check("reopening the saved quotation reproduces the stored comparison", beforeReopen === afterReopen && summaryBefore === summaryAfter, summaryAfter);
await shot(page, "04-reopened");

// 9. Customer PDF
const [download] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.getByRole("button", { name: "ייצוא ל-PDF" }).click()]);
const pdfPath = path.join(shots ?? "/tmp", "customer.pdf");
await download.saveAs(pdfPath);
check("customer PDF exports", true, pdfPath);

await browser.close();
writeFileSync(path.join(shots ?? "/tmp", "e2e-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
