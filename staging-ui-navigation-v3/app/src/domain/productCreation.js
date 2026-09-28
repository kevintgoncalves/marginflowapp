import { numberValue } from "./numberUtils.js";
import { normalisedCostForPrice } from "./productPackaging.js";

export function productAliasesFromInput(value = []) {
  const aliases = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(aliases.map((alias) => String(alias || "").trim()).filter(Boolean))];
}

export function productRecordFromInput(row = {}, {
  id = row.id,
  defaultSupplier = "",
  defaultDepartment = "Kitchen Made",
  date = new Date().toISOString().slice(0, 10),
} = {}) {
  const supplier = row.supplier || defaultSupplier;
  const department = row.department || defaultDepartment;
  const packSize = row.packSize || row.pack_size || "";
  const unitCost = numberValue(row.unitCost ?? row.unit_cost, 0);
  const quantity = numberValue(row.quantity, 1);
  const conversion = normalisedCostForPrice(unitCost, packSize, row);
  const supplierFormat = {
    supplier,
    packSize,
    purchaseUnitCost: unitCost,
    quantity,
    date,
    baseQuantity: conversion.baseQuantity,
    baseUnit: conversion.baseUnit,
    normalizedCost: conversion.normalizedCost,
    conversionConfidence: conversion.confidence,
    conversionReviewRequired: conversion.reviewRequired,
    conversionReason: conversion.reason,
  };
  return {
    ...row,
    ...(id ? { id } : {}),
    name: String(row.name || row.productName || "").trim(),
    supplier,
    department,
    packSize,
    unit: row.unit || row.unitOfMeasure || row.baseUnit || conversion.baseUnit || "",
    aliases: productAliasesFromInput(row.aliases),
    unitCost,
    quantity,
    baseQuantity: row.baseQuantity || conversion.baseQuantity,
    baseUnit: row.baseUnit || conversion.baseUnit,
    normalizedCost: conversion.normalizedCost,
    normalizedUnit: conversion.baseUnit,
    conversionReviewRequired: conversion.reviewRequired,
    conversionReason: conversion.reason,
    supplierFormats: [supplierFormat],
    supplierPrices: [{ supplier, price: unitCost, packSize, date, normalizedCost: conversion.normalizedCost, normalizedUnit: conversion.baseUnit }],
    priceHistory: [{ date, supplier, price: unitCost, packSize, normalizedCost: conversion.normalizedCost, normalizedUnit: conversion.baseUnit }],
  };
}
