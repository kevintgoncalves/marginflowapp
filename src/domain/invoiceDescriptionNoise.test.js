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
  ];
  for (const [noisy, clean] of same) assert.equal(normalizeSupplierDescription(noisy), normalizeSupplierDescription(clean), noisy);
});

test("numbers that are part of the product are kept", () => {
  assert.notEqual(normalizeSupplierDescription("10 X WHITE SOUR 150 ROLL"), "");
  assert.match(normalizeSupplierDescription("900g Fresh English Whole Chicken"), /chicken/);
  assert.match(normalizeSupplierDescription("500 ML OLIVE OIL"), /olive oil/);
  assert.equal(normalizeSupplierDescription("100% Mozzarella Grated 2K"), normalizeSupplierDescription("100% Mozzarella Grated 2K"));
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
