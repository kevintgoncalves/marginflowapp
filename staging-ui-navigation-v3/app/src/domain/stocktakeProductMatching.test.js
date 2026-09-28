import assert from "node:assert/strict";
import test from "node:test";
import {
  STOCKTAKE_PRODUCT_MATCH_TYPES,
  createStocktakeProductIndex,
  matchStocktakeProduct,
} from "./stocktakeProductMatching.js";

test("Stock Take matching honors ID, code, safe fuzzy review, and pack compatibility", () => {
  const products = [
    { id: "basil", name: "Basil", sku: "HERB-01", unit: "each" },
    { id: "one", name: "Product A 1L", packSize: "1L", unit: "case" },
    { id: "five", name: "Product A 5L", packSize: "5L", unit: "case" },
    { id: "milk", name: "Milk Whole 2L", packSize: "2L", unit: "each" },
  ];
  const index = createStocktakeProductIndex(products);
  const idMatch = matchStocktakeProduct({ productId: "basil", productName: "MY BASIL" }, index);
  const codeMatch = matchStocktakeProduct({ productCode: "herb 01", productName: "Changed" }, index);
  const sizedMatch = matchStocktakeProduct({ productName: "Product A 5L", packSize: "5L", unit: "case" }, index);
  const measuredUnitMatch = matchStocktakeProduct({ productName: "Milk Whole 2L", unit: "2L" }, index);

  assert.equal(idMatch.product.id, "basil");
  assert.equal(idMatch.matchType, STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_ID);
  assert.equal(codeMatch.product.id, "basil");
  assert.equal(codeMatch.matchType, STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_CODE);
  assert.equal(sizedMatch.product.id, "five");
  assert.notEqual(sizedMatch.product.id, "one");
  assert.equal(measuredUnitMatch.product.id, "milk");
});

test("a newly created product is available after the shared product index refreshes", () => {
  const before = [{ id: "basil", name: "Basil" }];
  const created = { id: "dragon", name: "Dragon Fruit Special", aliases: ["Dragon Fruit"] };
  assert.equal(matchStocktakeProduct({ productName: "Dragon Fruit Special" }, createStocktakeProductIndex(before)).product, null);
  const after = createStocktakeProductIndex([created, ...before]);
  assert.equal(matchStocktakeProduct({ productName: "Dragon Fruit Special" }, after).product?.id, "dragon");
});
