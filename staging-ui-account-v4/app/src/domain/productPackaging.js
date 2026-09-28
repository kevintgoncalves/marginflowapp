import { numberValue, normalizeHeader, roundQuantity } from "./numberUtils.js";

const weightUnits = new Map([
  ["kg", { baseUnit: "kg", factor: 1 }],
  ["kilo", { baseUnit: "kg", factor: 1 }],
  ["kilos", { baseUnit: "kg", factor: 1 }],
  ["g", { baseUnit: "kg", factor: 0.001 }],
  ["gram", { baseUnit: "kg", factor: 0.001 }],
  ["grams", { baseUnit: "kg", factor: 0.001 }],
]);

const volumeUnits = new Map([
  ["l", { baseUnit: "l", factor: 1 }],
  ["ltr", { baseUnit: "l", factor: 1 }],
  ["litre", { baseUnit: "l", factor: 1 }],
  ["litres", { baseUnit: "l", factor: 1 }],
  ["ml", { baseUnit: "l", factor: 0.001 }],
  ["cl", { baseUnit: "l", factor: 0.01 }],
]);

const eachUnits = new Set(["each", "ea", "unit", "units", "punnet", "punnets", "pnt", "bunch", "bunches", "piece", "pieces"]);
const containerUnits = new Set(["box", "case", "tray", "pack", "bag", "tin", "can", "btl", "bottle", "crate"]);

function unitInfo(unit = "") {
  const key = String(unit).toLowerCase().replace(/\./g, "").trim();
  return weightUnits.get(key) || volumeUnits.get(key) || (eachUnits.has(key) ? { baseUnit: key === "punnet" || key === "punnets" || key === "pnt" ? "punnet" : "each", factor: 1 } : null);
}

function explicitConversion(overrides = {}) {
  const quantity = numberValue(overrides.baseQuantity ?? overrides.normalizedQuantity, 0);
  const unit = String(overrides.baseUnit ?? overrides.normalizedUnit ?? "").trim().toLowerCase();
  if (!quantity || !unit) return null;
  return {
    baseQuantity: roundQuantity(quantity),
    baseUnit: unit,
    confidence: "manual",
    reviewRequired: false,
    reason: "Manual conversion",
  };
}

export function parsePackSize(packSize = "", overrides = {}) {
  const manual = explicitConversion(overrides);
  if (manual) return manual;

  const raw = String(packSize || "").trim();
  const text = raw.toLowerCase().replace(/×/g, "x").replace(/\*/g, "x").replace(/\s+/g, " ");
  if (!text) {
    return { baseQuantity: 1, baseUnit: "each", confidence: "unknown", reviewRequired: true, reason: "No pack size supplied" };
  }

  const compact = text.replace(/\s+/g, "");
  let match = compact.match(/^x?(\d+(?:[.,]\d+)?)(kg|kilo|kilos|g|gram|grams|l|ltr|litre|litres|ml|cl)$/i);
  if (match) {
    const info = unitInfo(match[2]);
    return {
      baseQuantity: roundQuantity(numberValue(match[1].replace(",", "."), 1) * info.factor),
      baseUnit: info.baseUnit,
      confidence: "high",
      reviewRequired: false,
      reason: "Weight or volume pack",
    };
  }

  match = compact.match(/^(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)(kg|kilo|kilos|g|gram|grams|l|ltr|litre|litres|ml|cl)$/i);
  if (match) {
    const info = unitInfo(match[3]);
    return {
      baseQuantity: roundQuantity(numberValue(match[1].replace(",", "."), 1) * numberValue(match[2].replace(",", "."), 1) * info.factor),
      baseUnit: info.baseUnit,
      confidence: "high",
      reviewRequired: false,
      reason: "Case pack converted",
    };
  }

  match = text.match(/\bbox\s*x\s*(\d+(?:[.,]\d+)?)\b/i) || text.match(/\bcase\s*x\s*(\d+(?:[.,]\d+)?)\b/i) || text.match(/\bx\s*(\d+(?:[.,]\d+)?)\b/i);
  if (match) {
    return {
      baseQuantity: roundQuantity(numberValue(match[1].replace(",", "."), 1)),
      baseUnit: "each",
      confidence: "medium",
      reviewRequired: true,
      reason: "Count found but item size needs confirmation",
    };
  }

  const tokenKey = normalizeHeader(text);
  for (const unit of eachUnits) {
    if (tokenKey.includes(normalizeHeader(unit))) {
      return {
        baseQuantity: 1,
        baseUnit: unit === "punnet" || unit === "punnets" || unit === "pnt" ? "punnet" : "each",
        confidence: "medium",
        reviewRequired: unit === "punnet" || unit === "punnets" || unit === "pnt",
        reason: "Purchase unit identified",
      };
    }
  }

  for (const unit of containerUnits) {
    if (tokenKey.includes(normalizeHeader(unit))) {
      return {
        baseQuantity: 1,
        baseUnit: unit,
        confidence: "low",
        reviewRequired: true,
        reason: "Container needs conversion before fair comparison",
      };
    }
  }

  return {
    baseQuantity: 1,
    baseUnit: raw,
    confidence: "unknown",
    reviewRequired: true,
    reason: "Pack conversion not recognised",
  };
}

export function normalisedCostForPrice(price, packSize = "", overrides = {}) {
  const conversion = parsePackSize(packSize, overrides);
  const cost = numberValue(price, 0);
  const quantity = numberValue(conversion.baseQuantity, 0);
  return {
    ...conversion,
    normalizedCost: quantity ? Number((cost / quantity).toFixed(4)) : 0,
    originalCost: cost,
    originalPackSize: packSize,
  };
}

export function supplierFormatFromLine(line = {}, date = "") {
  const conversion = normalisedCostForPrice(line.unitCost, line.packSize, line);
  return {
    supplier: line.supplier || "",
    packSize: line.packSize || "",
    purchaseUnitCost: numberValue(line.unitCost, 0),
    quantity: numberValue(line.quantity, 1),
    date,
    baseQuantity: conversion.baseQuantity,
    baseUnit: conversion.baseUnit,
    normalizedCost: conversion.normalizedCost,
    conversionConfidence: conversion.confidence,
    conversionReviewRequired: conversion.reviewRequired,
    conversionReason: conversion.reason,
  };
}

export function comparableSupplierPrices(entries = []) {
  const groups = new Map();
  entries.forEach((entry) => {
    const conversion = normalisedCostForPrice(entry.price ?? entry.unitCost ?? entry.purchaseUnitCost, entry.packSize, entry);
    if (conversion.reviewRequired && conversion.confidence !== "manual" && conversion.confidence !== "high") return;
    const key = conversion.baseUnit;
    const current = groups.get(key) || [];
    current.push({ ...entry, ...conversion, price: numberValue(entry.price ?? entry.unitCost ?? entry.purchaseUnitCost, 0) });
    groups.set(key, current);
  });
  return groups;
}

export function priceComparisonForProduct(product = {}, supplierEntries = []) {
  const current = normalisedCostForPrice(product.unitCost, product.packSize, product);
  const comparable = comparableSupplierPrices(supplierEntries).get(current.baseUnit) || [];
  if (!current.normalizedCost || current.reviewRequired || !comparable.length) {
    return {
      comparable: false,
      normalizedCost: current.normalizedCost,
      normalizedUnit: current.baseUnit,
      reviewRequired: true,
      message: current.reason || "Add pack conversion before comparing suppliers",
    };
  }
  const cheapest = comparable.sort((a, b) => a.normalizedCost - b.normalizedCost)[0];
  return {
    comparable: true,
    normalizedCost: current.normalizedCost,
    normalizedUnit: current.baseUnit,
    cheapest,
    differencePercent: cheapest.normalizedCost ? ((current.normalizedCost - cheapest.normalizedCost) / cheapest.normalizedCost) * 100 : 0,
    reviewRequired: comparable.some((entry) => entry.reviewRequired),
    message: `Compared per ${current.baseUnit}`,
  };
}
