import test from "node:test";
import assert from "node:assert/strict";
import { purchaseDetailsForProduct } from "./purchaseUnits.js";

const fmt = (normalizedCost, baseUnit = "kg") => ({ normalizedCost, baseUnit });

test("one item priced like a single unit is read as one item, not the case", () => {
  const seeds = { supplierFormats: [fmt(6.57), fmt(9.8), fmt(8.2)] };
  assert.deepEqual(
    { ...purchaseDetailsForProduct({ packSize: "6 x 1KG", unitCost: 6.57 }, seeds) },
    { purchaseUnit: "pack", baseQuantity: 1, baseUnit: "kg", confirmed: true, inferred: true, singleItemFromCase: true });
  const prosciutto = { supplierFormats: [fmt(24), fmt(21.5)] };
  assert.equal(purchaseDetailsForProduct({ packSize: "4 x 500G", unitCost: 11.38 }, prosciutto).baseQuantity, 0.5);
  const milk = { supplierFormats: [fmt(0.75, "l"), fmt(0.85, "l")] };
  assert.equal(purchaseDetailsForProduct({ packSize: "6 x 2LTR", unitCost: 1.52 }, milk).baseQuantity, 2);
  assert.equal(purchaseDetailsForProduct({ packSize: "6 x 2LTR", unitCost: 14.32 }, milk).baseQuantity, 12);
});

test("a case price stays a case, and without reference prices nothing changes", () => {
  const barista = { supplierFormats: [fmt(1.2), fmt(1.25)] };
  assert.equal(purchaseDetailsForProduct({ packSize: "6 x 2KG", unitCost: 14.32 }, barista).baseQuantity, 12);
  assert.equal(purchaseDetailsForProduct({ packSize: "6 x 1KG", unitCost: 6.57 }, {}).baseQuantity, 6);
  assert.equal(purchaseDetailsForProduct({ packSize: "6 x 1KG", unitCost: 6.57, conversionRule: { baseQuantity: 6 } }, { supplierFormats: [fmt(6.5)] }).baseQuantity, 6);
});
