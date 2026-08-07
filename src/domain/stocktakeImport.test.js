import assert from "node:assert/strict";
import test from "node:test";
import {
  STOCKTAKE_IMPORT_MODES,
  STOCKTAKE_IMPORT_STATUSES,
  applyStocktakeEntries,
  confirmedStocktakeImportEntries,
  mergeStocktakeCountLines,
  parseImportedStockCount,
  parseStocktakeImportRows,
  resolveStocktakeImportReviewRow,
  stocktakeEntryFromProduct,
  stocktakeImportReviewSummary,
  stocktakeTemplateRows,
} from "./stocktakeImport.js";

const products = [
  { id: "p-basil", name: "Basil", sku: "HERB-1", unit: "each", unitCost: 1.5, department: "Kitchen Made" },
  { id: "p-chicken", name: "Chicken Breast", aliases: ["Chx Breast"], unit: "kg", unitCost: 6.25, department: "Kitchen Made" },
  { id: "p-broccoli", name: "Tender Stem Broccoli", unit: "each", unitCost: 2.5, department: "Kitchen Made" },
  { id: "p-limes", name: "Limes", unit: "case", unitCost: 8, department: "Bar" },
  { id: "p-milk", name: "Milk Bottle 1L", unit: "bottle", packSize: "1L", unitCost: 1.2, department: "Kitchen Made" },
  { id: "p-avocado", name: "Avocado", unit: "each", unitCost: 0.8, department: "Kitchen Made" },
  { id: "p-oil", name: "Olive Oil", unit: "bottle", unitCost: 9, department: "Kitchen Made" },
  { id: "p-milk-whole", name: "Milk Whole 2L", unit: "each", packSize: "2L", unitCost: 1.8, department: "Kitchen Made" },
  { id: "p-milk-semi", name: "Milk Semi Skimmed 2L", unit: "each", packSize: "2L", unitCost: 1.7, department: "Kitchen Made" },
];

test("stocktake count parser keeps blank distinct from explicit zero", () => {
  assert.deepEqual(parseImportedStockCount(""), { hasCount: false, count: null, invalid: false });
  assert.deepEqual(parseImportedStockCount("   "), { hasCount: false, count: null, invalid: false });
  assert.deepEqual(parseImportedStockCount(null), { hasCount: false, count: null, invalid: false });
  assert.deepEqual(parseImportedStockCount(0), { hasCount: true, count: 0, invalid: false });
  assert.deepEqual(parseImportedStockCount("0.00"), { hasCount: true, count: 0, invalid: false });
  assert.deepEqual(parseImportedStockCount("1.5"), { hasCount: true, count: 1.5, invalid: false });
  assert.deepEqual(parseImportedStockCount("abc"), { hasCount: false, count: null, invalid: true });
  assert.deepEqual(parseImportedStockCount(-1), { hasCount: false, count: null, invalid: true });
});

test("full product-list import updates only explicit counts and preserves zero", () => {
  const parsed = parseStocktakeImportRows([
    ["Product ID", "Product", "Count", "Cost"],
    ["p-basil", "Basil", "4", "1.50"],
    ["p-chicken", "Chicken Breast", "", "6.25"],
    ["p-limes", "Limes", "0", "8"],
    ["p-milk", "Milk", "8", "1.20"],
    ["p-avocado", "Avocado", "   ", "0.80"],
  ], products);

  assert.equal(parsed.validRows.length, 3);
  assert.equal(parsed.blankRows, 2);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.validRows.map((row) => [row.matchedProductId, row.quantity, row.counted]), [
    ["p-basil", 4, true],
    ["p-limes", 0, true],
    ["p-milk", 8, true],
  ]);
});

test("partial stocktake imports patch existing counts across repeated imports", () => {
  const existing = [
    { id: "line-basil", matchedProductId: "p-basil", productName: "Basil", quantity: 4, unitCost: 1.5 },
    { id: "line-limes", matchedProductId: "p-limes", productName: "Limes", quantity: 2, unitCost: 8 },
  ];
  const second = parseStocktakeImportRows([
    ["Product ID", "Product", "Count"],
    ["p-basil", "Basil", ""],
    ["p-milk", "Milk", "8"],
  ], products);
  const afterSecond = mergeStocktakeCountLines(existing, second.validRows);
  const third = parseStocktakeImportRows([
    ["Product ID", "Product", "Count"],
    ["p-limes", "Limes", "0"],
    ["p-oil", "Olive Oil", "1.5"],
  ], products);
  const afterThird = mergeStocktakeCountLines(afterSecond, third.validRows);

  assert.deepEqual(Object.fromEntries(afterThird.map((line) => [line.matchedProductId, line.quantity])), {
    "p-basil": 4,
    "p-limes": 0,
    "p-milk": 8,
    "p-oil": 1.5,
  });
});

test("new explicit stocktake value overwrites an old count while invalid and missing rows do not", () => {
  const existing = [
    { id: "line-basil", matchedProductId: "p-basil", productName: "Basil", quantity: 4, unitCost: 1.5 },
    { id: "line-limes", matchedProductId: "p-limes", productName: "Limes", quantity: 2, unitCost: 8 },
  ];
  const parsed = parseStocktakeImportRows([
    ["Product ID", "Product", "Count"],
    ["p-basil", "Basil", "5"],
    ["p-limes", "Limes", "abc"],
    ["missing-id", "Not A Product", "3"],
  ], products);
  const merged = mergeStocktakeCountLines(existing, parsed.validRows);

  assert.equal(parsed.invalidRows.length, 1);
  assert.equal(parsed.unmatchedRows.length, 1);
  assert.equal(merged.find((line) => line.matchedProductId === "p-basil").quantity, 5);
  assert.equal(merged.find((line) => line.matchedProductId === "p-limes").quantity, 2);
  assert.equal(merged.some((line) => line.productName === "Not A Product"), false);
});

test("stocktake template leaves every Count cell blank and retains internal product IDs", () => {
  const rows = stocktakeTemplateRows(products);
  const countIndex = rows[0].indexOf("Count");
  const productIdIndex = rows[0].indexOf("Product ID");
  assert.ok(countIndex >= 0);
  assert.ok(productIdIndex >= 0);
  assert.ok(rows.slice(1).every((row) => row[countIndex] === ""));
  assert.deepEqual(rows.slice(1).map((row) => row[productIdIndex]).sort(), products.map((product) => product.id).sort());
});

test("MarginFlow template trusts a valid Product ID even when the visible name was edited", () => {
  const parsed = parseStocktakeImportRows([
    ["Product ID", "Product", "Count"],
    ["p-basil", "MY BASIL", "3"],
  ], products);

  assert.equal(parsed.mode, STOCKTAKE_IMPORT_MODES.MARGINFLOW_TEMPLATE);
  assert.equal(parsed.reviewRows[0].matchedProductId, "p-basil");
  assert.equal(parsed.reviewRows[0].matchType, "exact_id");
  assert.equal(parsed.validRows[0].productName, "Basil");
});

test("external simple lists auto-confirm exact and alias rows but require fuzzy review", () => {
  const parsed = parseStocktakeImportRows([
    ["Product", "Quantity", "Unit"],
    ["Basil", "4", "each"],
    ["Chx Breast", "10", "kg"],
    ["Tenderstem Broc", "3", "each"],
  ], products);

  assert.equal(parsed.mode, STOCKTAKE_IMPORT_MODES.EXTERNAL_LIST);
  assert.deepEqual(parsed.reviewRows.map((row) => [row.matchedProductId, row.status, row.confirmed]), [
    ["p-basil", STOCKTAKE_IMPORT_STATUSES.EXACT, true],
    ["p-chicken", STOCKTAKE_IMPORT_STATUSES.ALIAS, true],
    ["p-broccoli", STOCKTAKE_IMPORT_STATUSES.SUGGESTED, false],
  ]);
  assert.equal(stocktakeImportReviewSummary(parsed.reviewRows).requiresReview, 1);
  const confirmedFuzzy = parsed.reviewRows.map((row) => row.id === "stocktake-review-4"
    ? resolveStocktakeImportReviewRow(row, products.find((product) => product.id === "p-broccoli"))
    : row);
  assert.equal(confirmedStocktakeImportEntries(confirmedFuzzy, products).length, 3);
  assert.equal(products.length, 9);
});

test("external ambiguous and unknown rows stay unresolved until selected or ignored", () => {
  const parsed = parseStocktakeImportRows([
    ["Product", "Quantity", "Unit"],
    ["Milk 2L", "5", "2L"],
    ["Dragon Fruit Special", "3", "each"],
  ], products);

  assert.equal(parsed.reviewRows[0].status, STOCKTAKE_IMPORT_STATUSES.AMBIGUOUS);
  assert.equal(parsed.reviewRows[0].confirmed, false);
  assert.equal(parsed.reviewRows[0].candidates.length, 2);
  assert.equal(parsed.reviewRows[1].status, STOCKTAKE_IMPORT_STATUSES.NO_MATCH);
  assert.equal(parsed.reviewRows[1].matchedProductId, "");
  assert.equal(confirmedStocktakeImportEntries(parsed.reviewRows, products).length, 0);
  const ignored = parsed.reviewRows.map((row) => resolveStocktakeImportReviewRow(row, null, { ignored: true }));
  assert.deepEqual(stocktakeImportReviewSummary(ignored), { ready: 0, requiresReview: 0, ignored: 2, invalid: 0, blank: 0 });
});

test("live, MarginFlow import and external import entries share patch and overwrite semantics", () => {
  const basil = products.find((product) => product.id === "p-basil");
  const limes = products.find((product) => product.id === "p-limes");
  const milk = products.find((product) => product.id === "p-milk");
  const live = stocktakeEntryFromProduct(basil, 4, { source: "live" });
  const template = stocktakeEntryFromProduct(limes, 2, { source: "marginflow_import" });
  const external = stocktakeEntryFromProduct(milk, 8, { source: "external_import" });
  const first = applyStocktakeEntries([], [live]);
  const second = applyStocktakeEntries(first, [template]);
  const third = applyStocktakeEntries(second, [external]);
  const overwritten = applyStocktakeEntries(third, [stocktakeEntryFromProduct(basil, 5, { source: "external_import" })]);

  assert.deepEqual(Object.fromEntries(overwritten.map((line) => [line.matchedProductId, line.quantity])), {
    "p-basil": 5,
    "p-limes": 2,
    "p-milk": 8,
  });
  assert.equal(overwritten.find((line) => line.matchedProductId === "p-basil").stocktakeSource, "external_import");
});
