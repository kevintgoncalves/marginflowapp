import { numberValue } from "./numberUtils.js";
import { normalisedCostForPrice, priceComparisonForProduct } from "./productPackaging.js";
import { productAliases, unorderedProductKey } from "./productMatching.js";

function productAliasKeys(product = {}) {
  return [...new Set(productAliases(product).map(unorderedProductKey).filter(Boolean))];
}

export function createSupplierPriceCandidateIndex(products = []) {
  const candidatesByAliasKey = new Map();

  products.forEach((product, index) => {
    if (product.active === false) return;
    productAliasKeys(product).forEach((aliasKey) => {
      const candidates = candidatesByAliasKey.get(aliasKey) || [];
      candidates.push(index);
      candidatesByAliasKey.set(aliasKey, candidates);
    });
  });

  return { candidatesByAliasKey, products };
}

export function collectSupplierPrices(product, candidateIndex) {
  const candidateIndexes = new Set();
  productAliasKeys(product).forEach((aliasKey) => {
    (candidateIndex.candidatesByAliasKey.get(aliasKey) || []).forEach((index) => candidateIndexes.add(index));
  });

  const prices = [];
  const addPrice = (supplier, price, date = new Date().toISOString().slice(0, 10), packSize = "", extra = {}) => {
    const numeric = numberValue(price);
    if (!supplier || !numeric) return;
    const normalized = normalisedCostForPrice(numeric, packSize || product.packSize, extra);
    const priceKey = `${supplier}|${packSize || product.packSize || ""}|${normalized.baseQuantity}|${normalized.baseUnit}`;
    const existing = prices.find((entry) => entry.priceKey === priceKey);
    const nextEntry = {
      priceKey,
      supplier,
      price: numeric,
      date,
      packSize: packSize || product.packSize || "",
      normalizedCost: normalized.normalizedCost,
      normalizedUnit: normalized.baseUnit,
      conversionConfidence: normalized.confidence,
      conversionReviewRequired: normalized.reviewRequired,
      conversionReason: normalized.reason,
      ...extra,
    };
    if (!existing || existing.date <= date) {
      if (existing) Object.assign(existing, nextEntry);
      else prices.push(nextEntry);
    }
  };

  [...candidateIndexes]
    .sort((left, right) => left - right)
    .map((index) => candidateIndex.products[index])
    .forEach((candidate) => {
      addPrice(candidate.supplier, candidate.unitCost, candidate.priceHistory?.at(-1)?.date, candidate.packSize, candidate);
      (candidate.supplierPrices || []).forEach((entry) => addPrice(entry.supplier, entry.price, entry.date, entry.packSize || candidate.packSize, entry));
      (candidate.supplierFormats || []).forEach((entry) => addPrice(entry.supplier, entry.purchaseUnitCost ?? entry.price, entry.date, entry.packSize || candidate.packSize, entry));
    });

  return prices;
}

function cheapestOfferFromPrices(product, prices, comparison) {
  return comparison.comparable
    ? { ...comparison.cheapest, price: comparison.cheapest?.price ?? comparison.cheapest?.originalCost ?? 0, comparison }
    : [...prices].sort((left, right) => left.price - right.price)[0] || {
      supplier: product.supplier,
      price: numberValue(product.unitCost),
      comparison,
    };
}

export function cheapestOffer(product, products = []) {
  const candidateIndex = createSupplierPriceCandidateIndex(products);
  const prices = collectSupplierPrices(product, candidateIndex);
  return cheapestOfferFromPrices(product, prices, priceComparisonForProduct(product, prices));
}

export function buildProductRows(products = [], { formatMoney = (value) => String(value), formatPercent = (value) => String(value) } = {}) {
  const candidateIndex = createSupplierPriceCandidateIndex(products);
  return products.filter((product) => product.active !== false).map((product) => {
    const prices = collectSupplierPrices(product, candidateIndex);
    const comparison = priceComparisonForProduct(product, prices);
    const cheapest = cheapestOfferFromPrices(product, prices, comparison);
    const currentNormalized = normalisedCostForPrice(product.unitCost, product.packSize, product);
    const difference = comparison.comparable ? comparison.differencePercent : 0;
    const isComparable = comparison.comparable;
    return {
      ...product,
      cheapestSupplier: isComparable
        ? `${cheapest.supplier} ${formatMoney(cheapest.normalizedCost)} / ${comparison.normalizedUnit}`
        : "Needs pack conversion",
      cheapestSupplierName: isComparable ? cheapest.supplier : "Needs pack conversion",
      cheapestNormalizedCost: isComparable ? cheapest.normalizedCost : null,
      priceDifference: difference,
      priceDifferenceLabel: isComparable ? (difference > 0 ? `+${formatPercent(difference)}` : formatPercent(difference)) : "Not comparable",
      normalizedCost: currentNormalized.normalizedCost || null,
      normalizedUnit: currentNormalized.baseUnit,
      normalizedCostLabel: currentNormalized.normalizedCost ? `${formatMoney(currentNormalized.normalizedCost)} / ${currentNormalized.baseUnit}` : "-",
      packReview: currentNormalized.reviewRequired || comparison.reviewRequired ? (comparison.message || currentNormalized.reason) : "OK",
      aliasesLabel: (product.aliases || []).join(", "),
    };
  });
}
