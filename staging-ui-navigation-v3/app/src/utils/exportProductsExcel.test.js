import assert from "node:assert/strict";
import test from "node:test";
import { productExportRows } from "./exportProductsExcel.js";

test("product Excel rows retain cost and difference fields as numbers", () => {
  const [row] = productExportRows([{
    name: "Croissant",
    supplier: "Baker A",
    unitCost: "0.95",
    normalizedCost: 0.95,
    cheapestSupplierName: "Baker B",
    priceDifference: 15.85,
    packSize: "each",
    packReview: "OK",
    department: "Kitchen Made",
  }]);

  assert.deepEqual(row, {
    product: "Croissant",
    currentSupplier: "Baker A",
    currentCost: 0.95,
    normalisedCost: 0.95,
    cheapestSupplier: "Baker B",
    priceDifference: 15.85,
    pack: "each",
    packReview: "OK",
    department: "Kitchen Made",
  });
  assert.equal(typeof row.currentCost, "number");
  assert.equal(typeof row.normalisedCost, "number");
  assert.equal(typeof row.priceDifference, "number");
});
