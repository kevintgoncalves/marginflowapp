import test from "node:test";
import assert from "node:assert/strict";
import { buildStocktakeReportData } from "../utils/stocktakeReportData.js";

test("builds stocktake report data from saved stocktake lines only", () => {
  const report = buildStocktakeReportData({
    id: "stocktake-1",
    companyId: "company-1",
    date: "2026-08-03",
    department: "Kitchen Made",
    totalValue: 588.5,
    lines: [
      { id: "line-1", productName: "Apples", quantity: 2, unitCost: 5, supplier: "TG Fruits", packSize: "kg", department: "Kitchen Made", matchedProductId: "product-1" },
      { id: "line-2", productName: "PREP - Back Fridge", quantity: 1, unitCost: 575, supplier: "", packSize: "batch", department: "Kitchen Made", matchedProductId: "" },
      { id: "line-3", productName: "New Sauce", quantity: 1, unitCost: 3.5, supplier: "Stocktake", packSize: "jar", department: "Kitchen Made", matchedProductId: "" },
      { id: "line-4", productName: "Apples", quantity: 0, unitCost: 5, supplier: "TG Fruits", packSize: "kg", department: "Kitchen Made", matchedProductId: "product-1" },
      { id: "line-5", productName: "Uncounted Product", quantity: "", unitCost: 99, supplier: "Database", packSize: "case", department: "Kitchen Made", matchedProductId: "product-9" },
    ],
  }, {
    companyName: "Reading Room",
    companyScope: { companyId: "company-1" },
    generatedAt: new Date("2026-08-03T12:00:00.000Z"),
  });

  assert.equal(report.companyName, "Reading Room");
  assert.equal(report.stocktakeDate, "2026-08-03");
  assert.equal(report.grandTotal, 588.5);
  assert.equal(report.productStockTotal, 13.5);
  assert.equal(report.preparationTotal, 575);
  assert.equal(report.productCount, 4);
  assert.equal(report.zeroQuantityCount, 1);
  assert.equal(report.newProductCount, 2);
  assert.equal(report.products.length, 3);
  assert.equal(report.preparationItems.length, 1);
  assert.equal(report.allLines.filter((line) => line.productName === "Apples").length, 2);
  assert.equal(report.allLines.some((line) => line.productName === "Uncounted Product"), false);
  assert.equal(report.departments[0].stockValue, 588.5);
});

test("rejects stocktakes outside the active company scope", () => {
  assert.throws(
    () => buildStocktakeReportData({
      id: "stocktake-2",
      companyId: "other-company",
      date: "2026-08-03",
      department: "Kitchen Made",
      totalValue: 10,
      lines: [{ productName: "Apples", quantity: 1, unitCost: 10 }],
    }, {
      companyScope: { companyId: "company-1" },
    }),
    /current company/,
  );
});

test("rejects selected stocktakes with no counted lines", () => {
  assert.throws(
    () => buildStocktakeReportData({
      id: "stocktake-3",
      date: "2026-08-03",
      department: "Kitchen Made",
      totalValue: 0,
      lines: [{ productName: "Blank Count", quantity: "", unitCost: 10 }],
    }),
    /no counted lines/,
  );
});
