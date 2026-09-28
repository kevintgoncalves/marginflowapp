import assert from "node:assert/strict";
import test from "node:test";
import { normalisedCostForPrice, priceComparisonForProduct } from "./productPackaging.js";
import { productAliases, unorderedProductKey } from "./productMatching.js";
import { buildProductRows } from "./productComparisonRows.js";

const fixedToday = "2026-08-12";

function oldProductGroupMatches(left, right) {
  const leftKeys = new Set(productAliases(left).map(unorderedProductKey));
  return productAliases(right).some((alias) => leftKeys.has(unorderedProductKey(alias)));
}

function oldCollectSupplierPrices(product, products) {
  const prices = [];
  const addPrice = (supplier, price, date = fixedToday, packSize = "", extra = {}) => {
    const numeric = Number(price) || 0;
    if (!supplier || !numeric) return;
    const normalized = normalisedCostForPrice(numeric, packSize || product.packSize, extra);
    const priceKey = `${supplier}|${packSize || product.packSize || ""}|${normalized.baseQuantity}|${normalized.baseUnit}`;
    const existing = prices.find((entry) => entry.priceKey === priceKey);
    const nextEntry = {
      priceKey, supplier, price: numeric, date, packSize: packSize || product.packSize || "",
      normalizedCost: normalized.normalizedCost, normalizedUnit: normalized.baseUnit,
      conversionConfidence: normalized.confidence, conversionReviewRequired: normalized.reviewRequired,
      conversionReason: normalized.reason, ...extra,
    };
    if (!existing || existing.date <= date) {
      if (existing) Object.assign(existing, nextEntry);
      else prices.push(nextEntry);
    }
  };
  products.filter((candidate) => candidate.active !== false && oldProductGroupMatches(product, candidate)).forEach((candidate) => {
    addPrice(candidate.supplier, candidate.unitCost, candidate.priceHistory?.at(-1)?.date, candidate.packSize, candidate);
    (candidate.supplierPrices || []).forEach((entry) => addPrice(entry.supplier, entry.price, entry.date, entry.packSize || candidate.packSize, entry));
    (candidate.supplierFormats || []).forEach((entry) => addPrice(entry.supplier, entry.purchaseUnitCost ?? entry.price, entry.date, entry.packSize || candidate.packSize, entry));
  });
  return prices;
}

function oldBuildProductRows(products) {
  return products.filter((product) => product.active !== false).map((product) => {
    const prices = oldCollectSupplierPrices(product, products);
    const comparison = priceComparisonForProduct(product, prices);
    const currentNormalized = normalisedCostForPrice(product.unitCost, product.packSize, product);
    const difference = comparison.comparable ? comparison.differencePercent : 0;
    const cheapest = comparison.comparable
      ? comparison.cheapest
      : [...prices].sort((left, right) => left.price - right.price)[0] || { supplier: product.supplier, price: Number(product.unitCost) || 0 };
    return {
      id: product.id,
      cheapestSupplier: comparison.comparable ? `${cheapest.supplier} GBP${cheapest.normalizedCost} / ${comparison.normalizedUnit}` : "Needs pack conversion",
      cheapestSupplierName: comparison.comparable ? cheapest.supplier : "Needs pack conversion",
      cheapestNormalizedCost: comparison.comparable ? cheapest.normalizedCost : null,
      priceDifference: difference,
      normalizedCost: currentNormalized.normalizedCost || null,
      normalizedUnit: currentNormalized.baseUnit,
      packReview: currentNormalized.reviewRequired || comparison.reviewRequired ? (comparison.message || currentNormalized.reason) : "OK",
    };
  });
}

const products = [
  { id: "croissant-current", name: "Croissant", supplier: "Baker A", unitCost: 0.95, packSize: "each", supplierPrices: [{ supplier: "Baker B", price: 0.82, packSize: "each", date: "2026-08-01" }] },
  { id: "croissant-alias", name: "Butter Croissant", aliases: ["Croissant"], supplier: "Baker C", unitCost: 0.88, packSize: "each", supplierFormats: [{ supplier: "Baker C", purchaseUnitCost: 0.8, packSize: "each", date: "2026-08-02" }] },
  { id: "mushroom-current", name: "Chestnut Mushrooms", supplier: "Produce A", unitCost: 8.9, packSize: "X2.25KG BOX", supplierPrices: [{ supplier: "Produce B", price: 7.2, packSize: "2kg", date: "2026-08-03" }] },
  { id: "tomato-current", name: "Cherry Tomatoes", supplier: "Produce A", unitCost: 6.24, packSize: "250g", supplierFormats: [{ supplier: "Produce B", purchaseUnitCost: 22, packSize: "1kg", date: "2026-08-04" }] },
  { id: "juice-current", name: "Squish Orange Juice", supplier: "Drinks A", unitCost: 4.69, packSize: "1ltr", supplierPrices: [{ supplier: "Drinks B", price: 4.2, packSize: "1ltr", date: "2026-08-05" }] },
  { id: "unmatched-pack", name: "Eggs Box x180 Large", supplier: "Farm A", unitCost: 44, packSize: "BOX X180 LARGE", supplierPrices: [{ supplier: "Farm B", price: 38, packSize: "case", date: "2026-08-06" }] },
  { id: "inactive", name: "Inactive product", supplier: "Supplier", unitCost: 1, packSize: "each", active: false },
];

test("indexed product comparison keeps five representative product calculations unchanged", () => {
  const oldRows = oldBuildProductRows(products).filter((row) => row.id !== "croissant-alias");
  const indexedRows = buildProductRows(products, { formatMoney: (value) => `GBP${value}`, formatPercent: (value) => `${value.toFixed(1)}%` })
    .filter((row) => row.id !== "croissant-alias");

  assert.equal(indexedRows.length, 5);
  indexedRows.forEach((row) => {
    const oldRow = oldRows.find((candidate) => candidate.id === row.id);
    assert.ok(oldRow, `${row.id} is represented in the original calculation`);
    assert.deepEqual(
      {
        id: row.id,
        cheapestSupplier: row.cheapestSupplier,
        cheapestSupplierName: row.cheapestSupplierName,
        cheapestNormalizedCost: row.cheapestNormalizedCost,
        priceDifference: row.priceDifference,
        normalizedCost: row.normalizedCost,
        normalizedUnit: row.normalizedUnit,
        packReview: row.packReview,
      },
      oldRow,
    );
  });
});
