import assert from "node:assert/strict";
import test from "node:test";
import { applyPastedDay, buildPastedDay, categoryMapUpdates, defaultDepartmentFor, findDates, OTHER_DEPARTMENT, parseAmount, parseSalesPaste } from "./salesPasteImport.js";
import { buildSalesWeekGrid, salesRowFromGrid } from "./salesWeekInput.js";

// Same layout as text copied from Square's screens; the figures are invented.
const SUMMARY_SCREEN = `Previous 1 daysTue, 3 March 2026
Next {number} days

Metrics
Product sales and 37 others
Filter by
Net sales
£550.00
Net sales
Taxes
Tips and service charges
Summary
All day (00:00-23:59 United Kingdom Time)

Product sales
30 orders
£562.50
Other service charges
20 orders
£0.00
Returns
£0.00

Discounts and comps
(£12.50)
Net sales
30 orders
£550.00

Deferred sales
£20.00
Gift card sales
1 order
£20.00
Taxes
30 orders
£110.00
Gross sales
30 orders
£660.00

Tips and service charges
£77.25
Total sales
31 orders
£757.25
Card
£700.00
Cash
£57.25
Net total`;

const CATEGORY_SCREEN = `3 Mar 2026
Top 4 Category Rollups: Gross Sales

Food - Make in£360.00Drinks£240.00Food - Bought in£60.00Other Categories£0.00
00:00 GMT
02
12:00
£0
£100
Drinks
50
£240.00
£200.00
Food - Bought in
10
£60.00
£50.00
Food - Make in
30
£360.00
£300.00
Other Categories
5
£0.00
£0.00
Category
Items Sold
Gross Sales
Net Sales
Total
95
£660.00
£550.00`;

const departments = ["Kitchen Made", "Bought In", "Bar"];
const choices = { Drinks: "Bar", "Food - Bought in": "Bought In", "Food - Make in": "Kitchen Made", "Other Categories": OTHER_DEPARTMENT };

test("amounts with £, commas, brackets and minus signs", () => {
  assert.equal(parseAmount("£1,073.11"), 1073.11);
  assert.equal(parseAmount("(£27.10)"), -27.1);
  assert.equal(parseAmount("-£92.15"), -92.15);
  assert.equal(parseAmount("£0"), 0);
  assert.equal(parseAmount("109"), null);
  assert.equal(parseAmount("56 orders"), null);
});

test("dates in Square, UK and ISO formats", () => {
  assert.deepEqual(findDates("Previous 1 daysTue, 3 March 2026"), ["2026-03-03"]);
  assert.deepEqual(findDates("3 Mar 2026 and 03/03/2026 and 2026-03-03"), ["2026-03-03"]);
  assert.deepEqual(findDates("12 Oct 2026 – 18 Oct 2026"), ["2026-10-12", "2026-10-18"]);
});

test("Square summary screen: totals after the Summary line, tips and service charges, gift cards ignored", () => {
  const { summary, categories } = parseSalesPaste(SUMMARY_SCREEN);
  assert.deepEqual(summary, { netSales: 550, grossSales: 660, taxes: 110, discounts: 12.5, refunds: 0, serviceCharge: 77.25 });
  assert.deepEqual(categories, []);
});

test("Square category screen: rows read once, chart legend ignored, Total kept apart", () => {
  const parsed = parseSalesPaste(CATEGORY_SCREEN);
  assert.deepEqual(parsed.categories.map((row) => [row.name, row.grossSales, row.netSales]), [
    ["Drinks", 240, 200],
    ["Food - Bought in", 60, 50],
    ["Food - Make in", 360, 300],
    ["Other Categories", 0, 0],
  ]);
  assert.equal(parsed.categoryTotal.netSales, 550);
  assert.deepEqual(parsed.dates, ["2026-03-03"]);
});

test("both screens pasted together fill one day with every check passing", () => {
  const parsed = parseSalesPaste(`${SUMMARY_SCREEN}\n\n${CATEGORY_SCREEN}`);
  const day = buildPastedDay(parsed, { departmentNames: departments, choices });
  assert.equal(day.date, "2026-03-03");
  assert.equal(day.ready, true);
  assert.deepEqual(day.problems, []);
  assert.ok(day.checks.every((check) => check.ok));
  assert.deepEqual(day.values.cells, {
    "Kitchen Made": { gross: "360", net: "300" },
    "Bought In": { gross: "60", net: "50" },
    Bar: { gross: "240", net: "200" },
  });
  assert.deepEqual(day.values.other, { gross: "", net: "" });
  assert.equal(day.values.serviceCharge, "77.25");
  assert.deepEqual(day.values.details, { discounts: 12.5, refunds: 0 });
  assert.equal(day.net, 550);
});

test("Square category CSV (tab separated, more columns) and summary CSV", () => {
  const csv = [
    "Category roll-up\tItems Sold\tProduct Sales\tItems Refunded\tRefunds\tDiscounts & Comps\tNet Sales\tTaxes\tGross Sales",
    "Drinks\t50.0000\t£205.00\t0\t£0.00\t-£5.00\t£200.00\t£40.00\t£240.00",
    "Food - Make in\t30\t£307.50\t0\t£0.00\t-£7.50\t£300.00\t£60.00\t£360.00",
    "Other Categories\t5.000\t£50.00\t0\t£0.00\t£0.00\t£50.00\t£10.00\t£60.00",
  ].join("\n");
  const summaryCsv = "\"Sales summary - Summary\nAll day (00:00-23:59 United Kingdom Time)\",\nNet sales,\"£1,550.00\"\nTaxes,£110.00\nTips and service charges,\"£1,077.25\"\nDiscounts and comps,(£12.50)";
  const parsed = parseSalesPaste(`${csv}\n${summaryCsv}`);
  assert.deepEqual(parsed.categories.map((row) => [row.name, row.grossSales, row.netSales]), [
    ["Drinks", 240, 200],
    ["Food - Make in", 360, 300],
    ["Other Categories", 60, 50],
  ]);
  assert.equal(parsed.summary.netSales, 1550);
  assert.equal(parsed.summary.serviceCharge, 1077.25);
  const day = buildPastedDay(parsed, { departmentNames: departments, choices });
  assert.deepEqual(day.values.other, { gross: "60", net: "50" });
  // 550 in categories against 1,550 in the summary: shown, not hidden.
  assert.equal(day.checks.find((check) => /net sales/.test(check.label)).ok, false);
});

test("several dates, nothing recognised and unmapped categories are reported", () => {
  assert.match(buildPastedDay(parseSalesPaste("12 Oct 2026 – 18 Oct 2026\nNet sales\n£10.00"), { departmentNames: departments }).problems[0], /more than one date/);
  assert.match(buildPastedDay(parseSalesPaste("hello"), { departmentNames: departments }).problems[0], /No sales figures/);
  const day = buildPastedDay(parseSalesPaste(CATEGORY_SCREEN), { departmentNames: departments, choices: { Drinks: "Bar" } });
  assert.deepEqual(day.unassigned, ["Food - Bought in", "Food - Make in"]);
  assert.equal(day.ready, false);
});

test("summary only: the day total goes to Other and the service charge is filled", () => {
  const day = buildPastedDay(parseSalesPaste(SUMMARY_SCREEN), { departmentNames: departments });
  assert.deepEqual(day.values.other, { gross: "660", net: "550" });
  assert.equal(day.values.serviceCharge, "77.25");
  assert.equal(day.ready, true);
});

test("category defaults: saved choice, same name as a department, Square's Other Categories", () => {
  const saved = categoryMapUpdates({ Drinks: "Bar", "": "Bar", Food: "" });
  assert.deepEqual(saved, { drinks: "Bar" });
  assert.equal(defaultDepartmentFor("DRINKS", departments, saved), "Bar");
  assert.equal(defaultDepartmentFor("Bar", departments, {}), "Bar");
  assert.equal(defaultDepartmentFor("Other Categories", departments, {}), OTHER_DEPARTMENT);
  assert.equal(defaultDepartmentFor("Food - Make in", departments, {}), "");
  assert.equal(defaultDepartmentFor("Drinks", departments, { drinks: "Deleted department" }), "");
});

test("applying fills only that day; the saved row keeps discounts and the source", () => {
  const stored = [{ id: "keep", date: "2026-03-04", netSales: 10, grossSales: 12, serviceCharge: 1, departments: { Bar: { netSales: 10, grossSales: 12 } } }];
  const grid = buildSalesWeekGrid("2026-03-02", stored, departments);
  const day = buildPastedDay(parseSalesPaste(`${SUMMARY_SCREEN}\n${CATEGORY_SCREEN}`), { departmentNames: departments, choices });
  const next = applyPastedDay(grid, day.date, day.values);
  assert.equal(next[2].cells, grid[2].cells);
  const saved = salesRowFromGrid(next[1], departments, { vatRate: 20 });
  assert.equal(saved.netSales, 550);
  assert.equal(saved.grossSales, 660);
  assert.equal(saved.serviceCharge, 77.25);
  assert.equal(saved.discounts, 12.5);
  assert.equal(saved.source, "pos-paste");
});

test("a paste without a service charge keeps the one already in the grid", () => {
  const grid = buildSalesWeekGrid("2026-03-02", [{ id: "a", date: "2026-03-03", netSales: 5, grossSales: 6, serviceCharge: 9.5, departments: {} }], departments);
  const day = buildPastedDay(parseSalesPaste(CATEGORY_SCREEN), { departmentNames: departments, choices });
  const next = applyPastedDay(grid, "2026-03-03", day.values);
  assert.equal(next[1].serviceCharge, "9.5");
  assert.deepEqual(next[1].other, { gross: "", net: "" });
});

test("stored discounts survive a manual save from the grid", () => {
  const grid = buildSalesWeekGrid("2026-03-02", [{ id: "a", date: "2026-03-03", netSales: 5, grossSales: 6, serviceCharge: 0, discounts: 2, source: "pos-paste", departments: {} }], departments);
  const saved = salesRowFromGrid(grid[1], departments);
  assert.equal(saved.discounts, 2);
  assert.equal(saved.source, "pos-paste");
});

test("a report pasted twice is stopped instead of doubling the sales", () => {
  const day = buildPastedDay(parseSalesPaste(`${CATEGORY_SCREEN}\n${CATEGORY_SCREEN}`), { departmentNames: departments, choices });
  assert.match(day.problems.join(" "), /more than once/);
  assert.equal(day.ready, false);
});

test("chart axis labels are not read as categories", () => {
  const parsed = parseSalesPaste("00:00 BST\n02\n£0\n£100\nDrinks\n5\n£12.00\n£10.00");
  assert.deepEqual(parsed.categories.map((row) => row.name), ["Drinks"]);
});
