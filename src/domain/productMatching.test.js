import assert from "node:assert/strict";
import test from "node:test";
import {
  PRODUCT_NAME_MATCH_TYPES,
  createProductMatchIndex,
  matchProductName,
  rankProductCandidates,
} from "./productMatching.js";

const products = [
  { id: "chicken", name: "Chicken Breast", aliases: ["Chx Breast"], unit: "kg", packSize: "5kg" },
  { id: "broccoli", name: "Tender Stem Broccoli", aliases: [], unit: "each" },
  { id: "basil", name: "Basil", aliases: [], unit: "each" },
  { id: "milk-whole", name: "Milk Whole 2L", aliases: [], unit: "each", packSize: "2L" },
  { id: "milk-semi", name: "Milk Semi Skimmed 2L", aliases: [], unit: "each", packSize: "2L" },
];

test("generic matcher handles exact names, aliases, strong fuzzy candidates, ambiguity and no match", () => {
  const index = createProductMatchIndex(products);
  const exact = matchProductName("Chicken Breast", index);
  const alias = matchProductName("Chx Breast", index);
  const fuzzy = matchProductName("Tenderstem Broc", index, { strongThreshold: 0.7 });
  const ambiguous = matchProductName("Milk 2L", index, { packSize: "2L", strongThreshold: 0.6 });
  const missing = matchProductName("Unknown xyz", index);

  assert.equal(exact.match?.id, "chicken");
  assert.equal(exact.matchType, PRODUCT_NAME_MATCH_TYPES.EXACT_NAME);
  assert.equal(alias.match?.id, "chicken");
  assert.equal(alias.matchType, PRODUCT_NAME_MATCH_TYPES.ALIAS);
  assert.equal(fuzzy.match?.id, "broccoli");
  assert.equal(fuzzy.matchType, PRODUCT_NAME_MATCH_TYPES.FUZZY);
  assert.equal(ambiguous.match, null);
  assert.equal(ambiguous.matchType, PRODUCT_NAME_MATCH_TYPES.AMBIGUOUS);
  assert.deepEqual(ambiguous.candidates.map((candidate) => candidate.product.id).sort(), ["milk-semi", "milk-whole"]);
  assert.equal(missing.match, null);
  assert.equal(missing.matchType, PRODUCT_NAME_MATCH_TYPES.NONE);
});

test("candidate ranking respects unit and pack conflicts", () => {
  const sizedProducts = [
    { id: "one", name: "Product A 1L", packSize: "1L", unit: "case" },
    { id: "five", name: "Product A 5L", packSize: "5L", unit: "case" },
  ];
  const candidates = rankProductCandidates("Product A 5L", sizedProducts, { unit: "case", packSize: "5L" });

  assert.equal(candidates[0].product.id, "five");
  assert.equal(candidates[0].packSizeConflict, false);
  assert.equal(candidates.find((candidate) => candidate.product.id === "one")?.packSizeConflict, true);
});
