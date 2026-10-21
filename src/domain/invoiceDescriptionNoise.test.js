import test from "node:test";
import assert from "node:assert/strict";
import { matchInvoiceLineToExistingProduct, normalizeSupplierDescription } from "./invoiceProductMatching.js";

test("supplier noise around the product name does not change the description key", () => {
  const same = [
    ["05-OCT CHICORY SINGLE (20 IN BOX)", "CHICORY SINGLE (20 IN BOX)"],
    ["17-OCT SAVOY CABBAGE SINGLE", "SAVOY CABBAGE SINGLE"],
    ["243, Fresh Whole Guinea Fowl (PER KG)", "Fresh Whole Guinea Fowl (PER KG)"],
    ["1828 EXTONS CHEESE BURGER SLICES", "EXTONS CHEESE BURGER SLICES"],
    ["4666A LAMB WESTON HASH BROWNS TRIANGLES (LWS104 NL)", "LAMB WESTON HASH BROWNS TRIANGLES (LWS104 NL)"],
    ["MONKFISH: TAIL 1-2KG (KG) skinned Species: Lophius piscatorius Catch Area: Atlantic, North East (FAO27) Allergens: FISH", "MONKFISH: TAIL 1-2KG (KG) skinned"],
    ["1kg Gressingham Duck Liver (EACH) *** NOT AVAILABLE ***", "1kg Gressingham Duck Liver (EACH)"],
    ["CR004 Double Cream 2ltr", "Double Cream 2ltr"],
    ["GO003:Extra Virgin Olive Oil 5ltr (Bottle)", "Extra Virgin Olive Oil 5ltr (Bottle)"],
    ["PC0252 BLUE CENTREFEED ROLLS 2PLY 120M", "BLUE CENTREFEED ROLLS 2PLY 120M"],
  ];
  for (const [noisy, clean] of same) assert.equal(normalizeSupplierDescription(noisy), normalizeSupplierDescription(clean), noisy);
});

test("numbers that are part of the product are kept", () => {
  assert.notEqual(normalizeSupplierDescription("10 X WHITE SOUR 150 ROLL"), "");
  assert.match(normalizeSupplierDescription("900g Fresh English Whole Chicken"), /chicken/);
  assert.match(normalizeSupplierDescription("500 ML OLIVE OIL"), /olive oil/);
  assert.match(normalizeSupplierDescription("A10 CHOPPED TOMATOES"), /a10/);
  assert.notEqual(normalizeSupplierDescription("TROUT ROE 100GM JAR"), normalizeSupplierDescription("TROUT ROE"));
});

test("a learned rule matches the same TG line on a later delivery date", () => {
  const products = [{ id: "p-chicory", companyId: "c1", name: "Chicory", active: true }];
  const supplierMappings = [{ id: "m1", companyId: "c1", supplierId: "s1", productId: "p-chicory",
    supplierDescription: "05-OCT CHICORY SINGLE (20 IN BOX)", packSize: "(20 IN BOX)", mappingSource: "manual_selection", active: true }];
  const match = matchInvoiceLineToExistingProduct({ organisationId: "c1", supplierId: "s1",
    rawDescription: "15-OCT CHICORY SINGLE (20 IN BOX)", packSize: "(20 IN BOX)", existingProducts: products, supplierMappings });
  assert.equal(match.matchedProductId, "p-chicory");
});

test("a rule learned without the pack words matches the line that prints them", () => {
  const products = [{ id: "p-mint", companyId: "c1", name: "Herbs, Mint", active: true }];
  const supplierMappings = [{ id: "m1", companyId: "c1", supplierId: "s1", productId: "p-mint",
    supplierDescription: "MINT", packSize: "X100G BAG", mappingSource: "manual_selection", active: true }];
  const match = matchInvoiceLineToExistingProduct({ organisationId: "c1", supplierId: "s1",
    rawDescription: "17-OCT MINT X100G BAG", packSize: "X100G BAG", existingProducts: products, supplierMappings });
  assert.equal(match.matchedProductId, "p-mint");
  const other = matchInvoiceLineToExistingProduct({ organisationId: "c1", supplierId: "s1",
    rawDescription: "MINT SAUCE", packSize: "X100G BAG", existingProducts: products, supplierMappings });
  assert.notEqual(other.matchedProductId, "p-mint");
});

test("pack wording the app cannot read links the product but keeps the conversion as a warning", () => {
  const products = [{ id: "p-monk", companyId: "c1", name: "Fish, Monkfish Tail", active: true }];
  const rule = { id: "m1", companyId: "c1", supplierId: "s1", productId: "p-monk", supplierProductCode: "01MON1K16",
    supplierDescription: "MONKFISH: TAIL 1-2KG (KG) skinned", packSize: "1-2KG", mappingSource: "manual_selection", active: true,
    conversionRule: { confirmed: true, purchaseUnit: "kg", baseQuantity: 1, baseUnit: "kg" } };
  const match = matchInvoiceLineToExistingProduct({ organisationId: "c1", supplierId: "s1", supplierProductCode: "01MON1K16",
    rawDescription: "MONKFISH: TAIL 1-2KG (KG) skinned Species: Lophius", packSize: "KG", existingProducts: products, supplierMappings: [rule] });
  assert.equal(match.matchedProductId, "p-monk");
  assert.ok(match.reviewReasons.includes("pack_changed"));
  assert.equal(match.conversionRule, undefined);
  const real = matchInvoiceLineToExistingProduct({ organisationId: "c1", supplierId: "s1", supplierProductCode: "01MON1K16",
    rawDescription: "MONKFISH", packSize: "5kg", existingProducts: products, supplierMappings: [{ ...rule, packSize: "2kg" }] });
  assert.equal(real.matchedProductId, null);
});
