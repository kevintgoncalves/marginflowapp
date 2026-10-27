import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIFFERENCE_KINDS,
  applyBrowserVersion,
  cloudFirstStorage,
  mergeDifferenceLists,
} from "./cloudFirstLoad.js";

// Invented workspace: no customer data.
const recipe = (id, name, extra = {}) => ({ id, name, yieldQuantity: 1, yieldUnit: "kg", ingredients: [], ...extra });
const cloudRecipes = Array.from({ length: 38 }, (_, index) => recipe(`r-${index + 1}`, `Cloud recipe ${index + 1}`));
const cloudStorage = {
  "marginflow.recipes": JSON.stringify(cloudRecipes),
  "marginflow.menus": JSON.stringify([
    { id: "m-day", name: "October – Daytime", dishes: [{ id: "d1" }, { id: "d2" }] },
    { id: "m-summer", name: "Summer", dishes: [{ id: "d3" }] },
  ]),
  "marginflow.stocktakes": JSON.stringify([{ id: "s1", date: "2026-10-01", department: "Kitchen", totalValue: 100 }]),
  "marginflow.financialSettings": JSON.stringify({ targetGp: 72, vatRate: 20, weekStartsOn: "monday" }),
  "marginflow.invoices": JSON.stringify([{ id: "inv-cloud" }]),
};

test("cloud with 38 recipes and a browser with 1: the 38 stay, the browser-only one is listed", () => {
  const browser = { "marginflow.recipes": JSON.stringify([recipe("r-local", "Browser only recipe")]) };
  const { nextStorage, differences } = cloudFirstStorage(browser, cloudStorage);
  assert.equal(JSON.parse(nextStorage["marginflow.recipes"]).length, 38);
  assert.equal(differences.length, 1);
  assert.equal(differences[0].kind, DIFFERENCE_KINDS.BROWSER_ONLY);
  assert.equal(differences[0].name, "Browser only recipe");
});

test("a record that differs keeps the cloud version and lists the browser's", () => {
  const browser = { "marginflow.menus": JSON.stringify([{ id: "m-summer", name: "Summer", dishes: [{ id: "old-1" }, { id: "old-2" }, { id: "old-3" }] }]) };
  const { nextStorage, differences } = cloudFirstStorage(browser, cloudStorage);
  const menus = JSON.parse(nextStorage["marginflow.menus"]);
  assert.deepEqual(menus.find((menu) => menu.id === "m-summer").dishes, [{ id: "d3" }]);
  assert.equal(menus.length, 2);
  assert.equal(differences[0].kind, DIFFERENCE_KINDS.DIFFERENT);
  assert.deepEqual(differences[0].fields, ["dishes"]);
});

test("equal records (whatever the key order) are not listed", () => {
  const browser = { "marginflow.stocktakes": JSON.stringify([{ totalValue: 100, department: "Kitchen", date: "2026-10-01", id: "s1" }]) };
  assert.equal(cloudFirstStorage(browser, cloudStorage).differences.length, 0);
});

test("settings: the cloud's are used and the browser's are listed field by field", () => {
  const browser = { "marginflow.financialSettings": JSON.stringify({ targetGp: 68, vatRate: 20, weekStartsOn: "monday" }) };
  const { nextStorage, differences } = cloudFirstStorage(browser, cloudStorage);
  assert.equal(JSON.parse(nextStorage["marginflow.financialSettings"]).targetGp, 72);
  assert.equal(differences[0].kind, DIFFERENCE_KINDS.SETTINGS);
  assert.deepEqual(differences[0].fields, [{ field: "targetGp", browser: 68, cloud: 72 }]);
});

test("a module the cloud does not have yet comes from the browser; kept keys are left to the caller", () => {
  const browser = { "marginflow.waste": JSON.stringify([{ id: "w1" }]), "marginflow.invoices": JSON.stringify([{ id: "inv-local" }]) };
  const { nextStorage, differences } = cloudFirstStorage(browser, cloudStorage, { keepBrowserKeys: ["marginflow.invoices"] });
  assert.deepEqual(JSON.parse(nextStorage["marginflow.waste"]), [{ id: "w1" }]);
  assert.deepEqual(JSON.parse(nextStorage["marginflow.invoices"]), [{ id: "inv-cloud" }]);
  assert.equal(differences.length, 0);
});

test("differences found at earlier openings are kept, without duplicates", () => {
  const first = cloudFirstStorage({ "marginflow.recipes": JSON.stringify([recipe("r-local", "Old")]) }, cloudStorage).differences;
  const second = cloudFirstStorage({ "marginflow.recipes": JSON.stringify([recipe("r-local", "Edited later")]) }, cloudStorage).differences;
  const merged = mergeDifferenceLists(first, second);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].browser.name, "Old");
});

test("using the browser's version adds or replaces only that record, or those settings", () => {
  const [onlyBrowser] = cloudFirstStorage({ "marginflow.recipes": JSON.stringify([recipe("r-local", "Browser only")]) }, cloudStorage).differences;
  const added = applyBrowserVersion(onlyBrowser, cloudRecipes);
  assert.equal(added.length, 39);
  const [different] = cloudFirstStorage({ "marginflow.recipes": JSON.stringify([recipe("r-2", "Renamed in browser")]) }, cloudStorage).differences;
  const replaced = applyBrowserVersion(different, cloudRecipes);
  assert.equal(replaced.length, 38);
  assert.equal(replaced[1].name, "Renamed in browser");
  assert.equal(cloudRecipes[1].name, "Cloud recipe 2");
  const [settings] = cloudFirstStorage({ "marginflow.financialSettings": JSON.stringify({ targetGp: 68 }) }, cloudStorage).differences;
  assert.deepEqual(applyBrowserVersion(settings, { targetGp: 72, vatRate: 20 }), { targetGp: 68, vatRate: 20 });
});

// The opening sequence lives in main.jsx; these checks keep the fixes in place.
const source = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");

test("opening never stops because invoice work arrived while loading; that work is kept", () => {
  assert.doesNotMatch(source, /throw new Error\("New invoice work arrived while loading/);
  assert.match(source, /applyCloudSnapshot\(nextSnapshot, \{ keepInvoiceWork: loadGeneration !== invoiceCommitGenerationRef\.current/);
  assert.match(source, /if \(keepInvoiceWork\) \{/);
});

test("an invoice update that changes nothing is not counted as new invoice work", () => {
  const setter = source.slice(source.indexOf("const setInvoices = (value) => {"), source.indexOf("const setInvoiceDayStatusOverrides"));
  assert.ok(setter.indexOf("if (nextValue === current) return current;") < setter.indexOf("invoiceCommitGenerationRef.current += 1;"));
});

test("opening uses the cloud first and keeps browser differences for the user", () => {
  assert.match(source, /cloudFirstStorage\(localStorageData, cloudStorage, \{ keepBrowserKeys: cloudLoadMergedKeys \}\)/);
  assert.doesNotMatch(source, /\? mergeMarginFlowStorage\(localStorageData, cloudStorage, false\)\.nextStorage\s*: cloudStorage/);
});

test("automatic saves still wait until the cloud is ready", () => {
  assert.match(source, /if \(!cloudEnabled \|\| readOnly \|\| !cloudReadyRef\.current\) return undefined;/);
  const load = source.slice(source.indexOf("loadCloudState(cloudScope)\n      .then"), source.indexOf("cloudReadyRef.current = true;"));
  assert.ok(load.includes("applyCloudSnapshot(nextSnapshot"));
});
