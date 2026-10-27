import assert from "node:assert/strict";
import test from "node:test";
import { createCostingContext, PRICE_BASIS } from "./recipeCosting.js";
import {
  FREE_IMPORT_FILTERS,
  FREE_IMPORT_STATUS,
  FREE_MATCH_SOURCE,
  TARGET_TYPES,
  acceptFreeImportRow,
  chooseFreeImportTarget,
  cleanCountName,
  confirmSuggestedAbove,
  freeImportResult,
  freeImportRowFilter,
  freeImportSummary,
  learnedAliases,
  mergeImportedCounts,
  mergePrepLines,
  packsForCount,
  parseCountUnit,
  parseFreeStocktakeImport,
  prepTotals,
  productPackContent,
  productsWithLearnedAliases,
  basisConversion,
  revalueProductRows,
  setFreeImportPackContent,
  setFreeImportPacks,
  typicalPurchaseValue,
} from "./stocktakeFreeImport.js";

// Invented catalogue: no customer data.
const products = [
  { id: "p-sugar", name: "Sugar, Caster", supplier: "Dry Goods Co", packSize: "2kg", unitCost: 3, department: "Kitchen" },
  { id: "p-agave", name: "Agave Syrup", supplier: "Dry Goods Co", packSize: "325g", unitCost: 4.5, department: "Kitchen" },
  { id: "p-honey-big", name: "Honey, Clear", supplier: "Dry Goods Co", packSize: "3.17kg", unitCost: 18, department: "Kitchen" },
  { id: "p-honey-small", name: "Honey, Clear Squeezy", supplier: "Dry Goods Co", packSize: "340g", unitCost: 3.2, department: "Kitchen" },
  { id: "p-tomato-tin", name: "Tomatoes, Chopped A10", supplier: "Dry Goods Co", packSize: "A10 tin", unitCost: 6, department: "Kitchen" },
  { id: "p-mustard", name: "Mustard Seeds Yellow", supplier: "Spice Co", packSize: "1kg", unitCost: 7, department: "Kitchen" },
  { id: "p-cumin", name: "Cumin Seeds", supplier: "Spice Co", packSize: "500g", unitCost: 5, department: "Kitchen" },
  { id: "p-pepper", name: "Black Peppercorns Whole", supplier: "Spice Co", packSize: "1kg", unitCost: 14, department: "Kitchen" },
  { id: "p-potato", name: "Potatoes, Maris Piper", supplier: "Veg Co", packSize: "25kg", unitCost: 15, department: "Kitchen" },
  { id: "p-hashbrown", name: "Potatoes, Hash Brown Triangles", supplier: "Frozen Co", packSize: "2.5kg", unitCost: 6.5, department: "Kitchen" },
  { id: "p-salmon", name: "Smoked Salmon Sliced", supplier: "Fish Co", packSize: "1kg", unitCost: 24, department: "Kitchen" },
  { id: "p-worcester", name: "Worcestershire Sauce", supplier: "Dry Goods Co", packSize: "568ml", unitCost: 3.8, department: "Kitchen" },
  { id: "p-sage", name: "Herbs, Sage", supplier: "Veg Co", packSize: "100g", unitCost: 2, department: "Kitchen" },
  { id: "p-sausage", name: "Sausage, Cumberland Premium", supplier: "Butcher Co", packSize: "1kg", unitCost: 9, department: "Kitchen" },
  { id: "p-brandy", name: "Brandy", supplier: "Drinks Co", packSize: "70cl", unitCost: 16, department: "Bar" },
  { id: "p-brandy-cooking", name: "Brandy Cooking", supplier: "Dry Goods Co", packSize: "75cl", unitCost: 11, department: "Kitchen" },
  { id: "p-limes", name: "Limes", supplier: "Albion Fine Foods", packSize: "box x 40", unitCost: 9, department: "Kitchen" },
  { id: "p-limes-other", name: "Limes", supplier: "Veg Co", packSize: "box x 42", unitCost: 8, department: "Kitchen" },
  { id: "p-feta-block", name: "Feta Block", supplier: "Cheese Co", packSize: "2kg", unitCost: 16, department: "Kitchen",
    supplierFormats: [{ source: "Invoice", date: "2026-10-10", quantity: 2, purchaseUnitCost: 16, packSize: "2kg" }] },
  { id: "p-feta-crumbled", name: "Feta Crumbled", supplier: "Cheese Co", packSize: "1kg", unitCost: 11, department: "Kitchen" },
  { id: "p-strawberry", name: "Strawberries", supplier: "Veg Co", packSize: "punnet", unitCost: 2.5, department: "Kitchen" },
  { id: "p-squid", name: "Squid Tubes", supplier: "Fish Co", packSize: "1kg", unitCost: 12, department: "Kitchen",
    supplierFormats: [{ source: "Invoice", date: "2026-10-01", quantity: 2, purchaseUnitCost: 12, packSize: "1kg" }] },
  { id: "p-butter", name: "Butter Unsalted", supplier: "Dairy Co", packSize: "box", unitCost: 40, department: "Kitchen" },
  { id: "p-buttermilk", name: "Buttermilk", supplier: "Dairy Co", packSize: "1l", unitCost: 2, department: "Kitchen" },
];

const recipes = [
  { id: "r-dukkah", schemaVersion: 2, name: "Dukkah", yieldQuantity: 1, yieldUnit: "kg", ingredients: [
    { id: "l1", type: "Product", productId: "p-cumin", sourceId: "p-cumin", quantity: 500, unit: "g", wastePercent: 0 },
  ] },
  { id: "r-chilli-jam", schemaVersion: 2, name: "Chilli Jam", yieldQuantity: 2, yieldUnit: "kg", ingredients: [
    { id: "l1", type: "Product", productId: "p-sugar", sourceId: "p-sugar", quantity: 1, unit: "kg", wastePercent: 0 },
  ] },
];

const suppliers = [{ name: "Albion Fine Foods" }, { name: "Veg Co" }, { name: "Dry Goods Co" }];
const context = () => createCostingContext(products, recipes, { priceBasis: PRICE_BASIS.LATEST });
const parse = (rows, options = {}) => parseFreeStocktakeImport(rows, { products, recipes, suppliers, department: "Kitchen", date: "2026-10-27", costingContext: context(), ...options });
const sheet = (...rows) => [["Product", "Qty", "uni"], ...rows];
const rowFor = (result, text) => result.reviewRows.find((row) => row.productText === text);
const approx = (actual, expected, places = 3) => assert.equal(Number(actual.toFixed(places)), Number(expected.toFixed(places)));

test("units: kg, uni, tins and item sizes become purchase packs", () => {
  const result = parse(sheet(
    ["Caster sugar", 5.795, "kg"],
    ["Agave syrup", 3, "325g"],
    ["Honey 3.17kg", 0.8, "uni"],
    ["Chopped tomatoes", 2, "A10 tins"],
    ["Cumin seeds", 1250, "g"],
  ));
  approx(rowFor(result, "Caster sugar").packs, 2.8975);
  approx(rowFor(result, "Agave syrup").packs, 3);
  const honey = rowFor(result, "Honey 3.17kg");
  assert.equal(honey.target.id, "p-honey-big");
  approx(honey.packs, 0.8);
  approx(honey.value, 14.4, 2);
  approx(rowFor(result, "Chopped tomatoes").packs, 2);
  approx(rowFor(result, "Cumin seeds").packs, 2.5);
});

test("the 'uni' header and quantities with the unit inside are read", () => {
  assert.equal(parseCountUnit("lt").base, "l");
  assert.equal(parseCountUnit("bx").kind, "pack");
  assert.equal(parseCountUnit("punnets").pack, "punnet");
  assert.equal(parseCountUnit("bunchs").pack, "bunch");
  assert.equal(parseCountUnit("250g").kind, "sized");
  const result = parse(sheet(["Caster sugar", "4 kg", ""], ["Agave syrup", "3 x 325g", ""]));
  approx(rowFor(result, "Caster sugar").packs, 2);
  approx(rowFor(result, "Agave syrup").packs, 3);
});

test("a weight without a known pack content asks for 1 pack = … and then converts", () => {
  const result = parse(sheet(["Butter unsalted", 2.5, "kg"]));
  const row = rowFor(result, "Butter unsalted");
  assert.equal(row.target.id, "p-butter");
  assert.equal(row.needsConversion, true);
  assert.equal(row.confirmed, false);
  const rows = setFreeImportPackContent(result.reviewRows, row.id, { quantity: 10, base: "kg" }, { products, recipes, costingContext: context() });
  const converted = rows.find((candidate) => candidate.id === row.id);
  approx(converted.packs, 0.25);
  assert.equal(converted.confirmed, true);
  approx(converted.value, 10, 2);
});

test("typos still match by letters", () => {
  const result = parse(sheet(
    ["Mustard seeeds", 300, "g"],
    ["Cumin seeeds", 200, "g"],
    ["Whole bnlack peppercorn", 400, "g"],
    ["Smoked salmond", 1, "kg"],
    ["worcerter sauce", 1, "bottle"],
  ));
  assert.equal(rowFor(result, "Mustard seeeds").target.id, "p-mustard");
  assert.equal(rowFor(result, "Mustard seeeds").confirmed, true);
  assert.equal(rowFor(result, "Mustard seeeds").source, FREE_MATCH_SOURCE.TYPO);
  assert.equal(rowFor(result, "Cumin seeeds").target.id, "p-cumin");
  assert.equal(rowFor(result, "Whole bnlack peppercorn").target.id, "p-pepper");
  assert.equal(rowFor(result, "Smoked salmond").target.id, "p-salmon");
  assert.equal(rowFor(result, "worcerter sauce").target.id, "p-worcester");
});

test("wrong word matches from the old import are not suggested", () => {
  const result = parse(sheet(
    ["Premium cumberland sausage", 2, "kg"],
    ["Horseradish cream", 1, "jar"],
    ["Ground ginger", 200, "g"],
  ));
  assert.equal(rowFor(result, "Premium cumberland sausage").target.id, "p-sausage");
  assert.notEqual(rowFor(result, "Horseradish cream").target?.id, "p-sage");
  assert.equal(rowFor(result, "Horseradish cream").target, null);
  assert.equal(rowFor(result, "Ground ginger").target, null);
});

test("size and supplier in the name pick the right pack", () => {
  const result = parse(sheet(["Brandy 75cl", 1, "bottle"], ["Limes albion", 1, "box"], ["Honey 340g", 2, "uni"]));
  assert.equal(rowFor(result, "Brandy 75cl").target.id, "p-brandy-cooking");
  assert.equal(rowFor(result, "Limes albion").target.id, "p-limes");
  assert.equal(rowFor(result, "Honey 340g").target.id, "p-honey-small");
  assert.deepEqual(cleanCountName("Limes albion", { suppliers }).name, "Limes");
  approx(cleanCountName("Colmans wholegrain mustard 2.25lt").size.quantity, 2.25);
});

test("ambiguous names are ranked by recent purchases and stay for review", () => {
  const result = parse(sheet(["Feta", 1.5, "kg"]));
  const row = rowFor(result, "Feta");
  assert.equal(row.target.id, "p-feta-block");
  assert.equal(row.confirmed, false);
  assert.ok(row.candidates.some((candidate) => candidate.id === "p-feta-crumbled"));
});

test("a name the user confirms is learned as an alias and matches next month", () => {
  const first = parse(sheet(["Hasbrown", 5, "kg"]));
  const row = rowFor(first, "Hasbrown");
  assert.equal(row.confirmed, false);
  const rows = chooseFreeImportTarget(first.reviewRows, row.id, { type: TARGET_TYPES.PRODUCT, id: "p-hashbrown" }, { products, recipes, costingContext: context() });
  const chosen = rows.find((candidate) => candidate.id === row.id);
  approx(chosen.packs, 2);
  const additions = learnedAliases(rows, products);
  assert.deepEqual(additions.get("p-hashbrown"), ["Hasbrown"]);
  const learned = productsWithLearnedAliases(products, additions);
  assert.deepEqual(learned.find((product) => product.id === "p-hashbrown").aliases, ["Hasbrown"]);
  assert.equal(learned.find((product) => product.id === "p-sugar"), products.find((product) => product.id === "p-sugar"));
  const next = parseFreeStocktakeImport(sheet(["Hasbrown", 2.5, "kg"]), { products: learned, recipes, suppliers, costingContext: context() });
  assert.equal(next.reviewRows[0].confirmed, true);
  assert.equal(next.reviewRows[0].source, FREE_MATCH_SOURCE.ALIAS);
  assert.equal(learnedAliases(next.reviewRows, learned).size, 0);
});

test("impossible values are flagged and not applied until checked", () => {
  const result = parse(sheet(["Squid tubes", 1576, "kg"]));
  const row = rowFor(result, "Squid tubes");
  assert.equal(row.strange, true);
  assert.equal(row.confirmed, false);
  assert.ok(freeImportRowFilter(row, FREE_IMPORT_FILTERS.STRANGE));
  const accepted = acceptFreeImportRow(result.reviewRows, row.id);
  assert.equal(accepted[0].confirmed, true);
});

test("the same product on two lines is summed when applied", () => {
  const result = parse(sheet(["Buttermilk", 1, "lt"], ["Buttermilk", 500, "ml"]));
  assert.deepEqual(result.reviewRows.map((row) => row.repeatCount), [2, 2]);
  const { entries } = freeImportResult(result.reviewRows, { products, department: "Kitchen" });
  assert.equal(entries.length, 1);
  approx(entries[0].quantity, 1.5);
  approx(entries[0].stockValue, 3, 2);
  assert.equal(entries[0].importedFrom.length, 2);
});

test("rows with no product are listed as no match, never dropped", () => {
  const result = parse(sheet(["Xanthan gum", 100, "g"], ["Caster sugar", 2, "kg"]));
  const summary = freeImportSummary(result.reviewRows);
  assert.equal(summary.noMatch, 1);
  assert.equal(summary.confirmed, 1);
  assert.ok(freeImportRowFilter(rowFor(result, "Xanthan gum"), FREE_IMPORT_FILTERS.NO_MATCH));
});

test("recipes are counted as prep at the current recipe cost", () => {
  const result = parse(sheet(["Dukkah", 633, "g"], ["Chilli jam", 2, "kg"]));
  const dukkah = rowFor(result, "Dukkah");
  assert.equal(dukkah.target.type, TARGET_TYPES.RECIPE);
  // 500 g cumin at £5 / 500 g = £5 per kg of dukkah.
  approx(dukkah.value, 3.17, 2);
  approx(rowFor(result, "Chilli jam").value, 1.5, 2);
  const { entries, prepLines } = freeImportResult(result.reviewRows, { products, department: "Kitchen" });
  assert.equal(entries.length, 0);
  assert.equal(prepLines.length, 2);
  assert.equal(prepTotals(prepLines).recipe, 4.67);
});

test("prep estimates by zone are read from columns G/H", () => {
  const rows = [
    ["Product", "Qty", "uni", "", "", "", "Prep", ""],
    ["Caster sugar", 2, "kg", "", "", "", "Pantry", 130],
    ["Cumin seeds", 500, "g", "", "", "", "Big freezer", "£150"],
    ["", "", "", "", "", "", "Desserts £20", ""],
  ];
  const result = parse(rows);
  assert.deepEqual(result.prepEstimates.map((estimate) => [estimate.zone, estimate.value]), [["Pantry", 130], ["Big freezer", 150], ["Desserts", 20]]);
  const { prepLines } = freeImportResult(result.reviewRows, { products, department: "Kitchen", prepEstimates: result.prepEstimates });
  assert.equal(prepTotals(prepLines).estimate, 300);
  assert.ok(prepLines.every((line) => line.department === "Kitchen"));
  assert.equal(freeImportSummary(result.reviewRows, result.prepEstimates).estimateValue, 300);
});

test("a 'Prep estimates' block in the product column is read as zones, not products", () => {
  const result = parse(sheet(["Caster sugar", 2, "kg"], ["Prep estimates", "", ""], ["Big fridge", 50, ""], ["Back kitchen £10", "", ""], ["", "", ""], ["Cumin seeds", 500, "g"]));
  assert.deepEqual(result.prepEstimates.map((estimate) => [estimate.zone, estimate.value]), [["Big fridge", 50], ["Back kitchen", 10]]);
  assert.deepEqual(result.reviewRows.map((row) => row.productText), ["Caster sugar", "Cumin seeds"]);
});

test("confirm all suggested above a confidence leaves strange and unconverted rows", () => {
  const result = parse(sheet(["Feta", 1.5, "kg"], ["Squid tubes", 1576, "kg"]));
  const rows = confirmSuggestedAbove(result.reviewRows, 0.5);
  assert.equal(rowFor({ reviewRows: rows }, "Feta").confirmed, true);
  assert.equal(rowFor({ reviewRows: rows }, "Squid tubes").confirmed, false);
});

test("importing prep merges by recipe and zone without touching other lines", () => {
  const existing = [{ id: "a", type: "estimate", zone: "Pantry", value: 100 }, { id: "b", type: "recipe", recipeId: "r-dukkah", quantity: 1, value: 5 }];
  const merged = mergePrepLines(existing, [{ id: "c", type: "estimate", zone: "pantry", value: 130 }, { id: "d", type: "estimate", zone: "Desserts", value: 20 }]);
  assert.deepEqual(merged.map((line) => [line.id, line.value]), [["a", 130], ["b", 5], ["d", 20]]);
  assert.equal(existing[0].value, 100);
});

test("pack content comes from the pack text, then the invoice conversion", () => {
  assert.deepEqual(productPackContent({ packSize: "6 x 1kg" }).quantity, 6);
  approx(productPackContent({ name: "Oil", packSize: "drum", unitCost: 30, normalizedCost: 1.5, normalizedUnit: "l" }).quantity, 20);
  assert.equal(productPackContent({ name: "Mystery", packSize: "box" }), null);
  assert.deepEqual(packsForCount(12, parseCountUnit("uni"), { quantity: 40, base: "each" }).packs, 0.3);
});

test("invalid quantities are reported and blank rows skipped", () => {
  const result = parse(sheet(["Caster sugar", "lots", "kg"], ["Cumin seeds", "", "g"]));
  assert.equal(result.reviewRows.length, 1);
  assert.equal(result.reviewRows[0].status, FREE_IMPORT_STATUS.INVALID);
  assert.equal(result.blankRows, 1);
});

test("rows confirmed in a second go add to the count from the same import", () => {
  const live = [{ id: "x", matchedProductId: "p-sugar", quantity: 9, unitCost: 3 }];
  const first = mergeImportedCounts(live, [{ id: "a", matchedProductId: "p-sugar", quantity: 1, unitCost: 3, importedFrom: ["Sugar 2 kg"] }], "batch-1");
  assert.equal(first[0].quantity, 1);
  const second = mergeImportedCounts(first, [{ id: "b", matchedProductId: "p-sugar", quantity: 0.5, unitCost: 3, importedFrom: ["Sugar 1 kg"] }], "batch-1");
  assert.equal(second[0].quantity, 1.5);
  assert.equal(second[0].stockValue, 4.5);
  assert.equal(live[0].quantity, 9);
});

test("sizes in pack words and single items of a case are converted", () => {
  approx(productPackContent({ packSize: "6kg case" }).quantity, 6);
  approx(productPackContent({ packSize: "2kg block" }).quantity, 2);
  const caseOfBottles = { id: "p-ale", name: "Pale Ale", packSize: "24 x 330ml", unitCost: 36 };
  approx(packsForCount(30, parseCountUnit("uni"), productPackContent(caseOfBottles)).packs, 1.25);
  // Priced per item once confirmed: one "uni" is one pack.
  const perItem = { ...caseOfBottles, recipeConversion: { packSize: "24 x 330ml", baseQuantity: 0.33, baseUnit: "l" } };
  approx(packsForCount(3, parseCountUnit("uni"), productPackContent(perItem)).packs, 3);
  approx(packsForCount(0.8, parseCountUnit("uni"), productPackContent({ packSize: "3.17kg" })).packs, 0.8);
});

// ---------- Part A fixes (invented cases shaped like the real ones) ----------

const invoice = (date, quantity, price, packSize) => ({ source: "Invoice", date, quantity, purchaseUnitCost: price, packSize });
const fixProducts = [
  { id: "f-carrots", name: "Carrots, Baby Rainbow", supplier: "Veg Co", packSize: "BOX", unitCost: 24.99, supplierFormats: [invoice("2026-10-02", 1, 24.99, "BOX")] },
  { id: "f-focaccia", name: "Focaccia", supplier: "Bakery Co", packSize: "case", unitCost: 54, supplierFormats: [invoice("2026-10-05", 1, 54, "case")] },
  { id: "f-chicken", name: "Chicken, Whole", supplier: "Butcher Co", packSize: "900g", unitCost: 4.2 },
  { id: "f-barley", name: "Pearl Barley", supplier: "Dry Goods Co", packSize: "2kg", unitCost: 3.4 },
  { id: "f-pine", name: "Pine Nuts", supplier: "Fine Foods Co", packSize: "6x1kg", unitCost: 26.6 },
  { id: "f-cheese", name: "Smoked Applewood", supplier: "Fine Foods Co", packSize: "6x750g", unitCost: 8.74 },
  { id: "f-other-a", name: "Capers", supplier: "Elite Co", packSize: "6x700g", unitCost: 5, recipeConversion: { packSize: "6x700g", baseQuantity: 0.7, baseUnit: "kg" } },
  { id: "f-other-b", name: "Olives", supplier: "Elite Co", packSize: "4x2kg", unitCost: 9, recipeConversion: { packSize: "4x2kg", baseQuantity: 2, baseUnit: "kg" } },
  { id: "f-vine", name: "Stuffed Vine Leaves", supplier: "Elite Co", packSize: "6x2kg", unitCost: 14.9 },
  { id: "f-sugar", name: "Sugar Caster", supplier: "Dry Goods Co", packSize: "2kg", unitCost: 3, supplierFormats: [invoice("2026-10-01", 2, 3, "2kg")] },
];
const fixRecipes = [{ id: "r-barley", schemaVersion: 2, name: "Pearl Barley", yieldQuantity: 1, yieldUnit: "kg", ingredients: [
  { id: "l1", type: "Product", productId: "f-barley", sourceId: "f-barley", quantity: 400, unit: "g", wastePercent: 0 },
] }];
const fixContext = () => createCostingContext(fixProducts, fixRecipes, { priceBasis: PRICE_BASIS.LATEST });
const fixParse = (rows, list = fixProducts) => parseFreeStocktakeImport(sheet(...rows), { products: list, recipes: fixRecipes, costingContext: createCostingContext(list, fixRecipes, { priceBasis: PRICE_BASIS.LATEST }) });

test("A1: a count in punnets, loaves or boxes of a product bought another way is never confirmed alone", () => {
  const result = fixParse([["baby carrots", 6, "punnets"], ["Focaccia", 3, "loaf"], ["Whole chicken", 1, "bx"]]);
  for (const text of ["baby carrots", "Focaccia", "Whole chicken"]) {
    const row = rowFor(result, text);
    assert.equal(row.unitMismatch, true, text);
    assert.equal(row.confirmed, false, text);
  }
  const carrots = rowFor(result, "baby carrots");
  const typed = setFreeImportPacks(result.reviewRows, carrots.id, "0.5", { products: fixProducts, recipes: fixRecipes, costingContext: fixContext() });
  const fixed = typed.find((row) => row.id === carrots.id);
  assert.equal(fixed.confirmed, true);
  approx(fixed.value, 12.5, 2);
  const perBox = setFreeImportPackContent(result.reviewRows, carrots.id, { quantity: 12, base: "each" }, { products: fixProducts, recipes: fixRecipes, costingContext: fixContext() });
  approx(perBox.find((row) => row.id === carrots.id).packs, 0.5);
  assert.equal(perBox.find((row) => row.id === carrots.id).unitMismatch, false);
});

test("A2: a product and a recipe with the same name: the product, shown with the recipe, for review", () => {
  const row = rowFor(fixParse([["Pearl barley", 5458, "g"]]), "Pearl barley");
  assert.equal(row.target.type, TARGET_TYPES.PRODUCT);
  assert.equal(row.target.id, "f-barley");
  assert.equal(row.confirmed, false);
  assert.equal(row.productAndRecipe, true);
  assert.ok(row.candidates.some((candidate) => candidate.type === TARGET_TYPES.RECIPE));
  assert.equal(confirmSuggestedAbove([row], 0)[0].confirmed, false);
});

test("A3: N x size packs use the supplier's item answers, or ask case or item", () => {
  const list = fixProducts.map((product) => (["f-pine", "f-cheese"].includes(product.id) ? { ...product, supplier: "Elite Co" } : product));
  const result = fixParse([["Pine nuts", 1.375, "kg"], ["Smoked applewood 750g", 2, "uni"], ["Stuffed vine leaves", 2, "kg"]], list);
  // Two Elite articles answered "per item" and none "per case": items.
  approx(rowFor(result, "Pine nuts").packs, 1.375);
  approx(rowFor(result, "Pine nuts").value, 36.58, 2);
  approx(rowFor(result, "Smoked applewood 750g").value, 17.48, 2);
  approx(rowFor(result, "Stuffed vine leaves").packs, 1);
  // Another supplier with no answers: the row asks, and the answer is kept on the product.
  const asking = fixParse([["Pine nuts", 1.375, "kg"]]);
  const row = rowFor(asking, "Pine nuts");
  assert.equal(row.basisPending, true);
  assert.equal(row.confirmed, false);
  approx(row.basisOptions.case.value, 6.1, 1);
  approx(row.basisOptions.item.value, 36.58, 2);
  const pine = fixProducts.find((product) => product.id === "f-pine");
  const conversion = basisConversion(pine, "item");
  assert.deepEqual(conversion, { packSize: "6x1kg", baseQuantity: 1, baseUnit: "kg" });
  const answered = { ...pine, recipeConversion: conversion };
  const after = revalueProductRows(asking.reviewRows, answered, { products: fixProducts, recipes: fixRecipes, costingContext: fixContext() })[0];
  assert.equal(after.basisPending, false);
  assert.equal(after.confirmed, true);
  approx(after.value, 36.58, 2);
});

test("A4: a line worth more than 3x a usual purchase is flagged", () => {
  assert.equal(typicalPurchaseValue(fixProducts[0]), 24.99);
  const result = fixParse([["Carrots baby rainbow", 6, "box"], ["Sugar caster", 4, "kg"]]);
  const carrots = rowFor(result, "Carrots baby rainbow");
  assert.equal(carrots.strange, true);
  assert.equal(carrots.confirmed, false);
  assert.ok(freeImportRowFilter(carrots, FREE_IMPORT_FILTERS.STRANGE));
  assert.equal(rowFor(result, "Sugar caster").strange, false);
  assert.equal(rowFor(result, "Sugar caster").confirmed, true);
});
