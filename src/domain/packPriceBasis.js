// Price per case or per item for "N x size" packs.
//
// Some suppliers (Elite Fine Foods) print the case format ("8x750g") on a line whose price is for
// one item inside it (one 750 g tin), others price the whole case (Arla "20x250g" at £22.78). The
// text cannot tell which, so the app asks once per supplier article and keeps the answer:
//  - a conversion confirmed in Check prices (a supplier format with source "price_check"), or
//  - the "1 pack = …" conversion confirmed in a recipe line (product.recipeConversion).
// Until there is an answer the case reading stays in use and is marked "case or item?".
import { packSignature } from "./purchaseUnits.js";
import { normalizeSupplierProductCode } from "./invoiceProductMatching.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";

export const PRICE_CHECK_SOURCE = "price_check";
const UNITS = ["kg", "l", "each"];

const close = (a, b) => Math.abs(Number(a) - Number(b)) <= Math.max(1e-6, Math.abs(Number(b)) * 0.001);

// "8x750g" and "8 x 750G" are the same pack.
export function samePack(left = "", right = "") {
  const key = (value) => packSignature(value).replace(/\s*x\s*/g, "x");
  return key(left) === key(right);
}

// { count, itemQuantity, caseQuantity, unit } for "N x size" with N > 1, otherwise null.
export function multipackReading(pack = "") {
  const text = String(pack || "").toLowerCase().replace(/×/g, "x").replace(/,/g, ".");
  const match = /^\s*\(?\s*(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*(kg|kilos?|g|grams?|l|ltr|litres?|liters?|ml|cl)\b/.exec(text);
  if (!match) return null;
  const count = Number(match[1]);
  const size = Number(match[2]);
  if (!(count > 1) || !(size > 0)) return null;
  const measure = match[3];
  const weight = /^(kg|kilos?|g|grams?)$/.test(measure);
  const factor = /^(g|grams?|ml)$/.test(measure) ? 0.001 : measure === "cl" ? 0.01 : 1;
  const itemQuantity = Number((size * factor).toFixed(6));
  return { count, itemQuantity, caseQuantity: Number((count * itemQuantity).toFixed(6)), unit: weight ? "kg" : "l" };
}

function recipeAnswer(product = {}, supplier = "", pack = "") {
  const conversion = product.recipeConversion;
  if (!conversion || !(Number(conversion.baseQuantity) > 0) || !UNITS.includes(conversion.baseUnit)) return null;
  if (!samePack(conversion.packSize, pack)) return null;
  // The conversion was confirmed for the product's current supplier.
  if (supplier && product.supplier && !sameSupplierIdentity(product.supplier, supplier)) return null;
  return { baseQuantity: Number(conversion.baseQuantity), baseUnit: conversion.baseUnit, source: "recipe" };
}

// The confirmed content of one supplier article's pack, or null when nobody has answered yet.
export function articleAnswer(product = {}, { supplier = "", code = "", pack = "" } = {}) {
  const wanted = normalizeSupplierProductCode(code);
  const checked = (product.supplierFormats || []).filter((format) => format.source === PRICE_CHECK_SOURCE
    && format.conversionReviewRequired !== true && Number(format.baseQuantity) > 0 && UNITS.includes(format.baseUnit)
    && (!supplier || !format.supplier || sameSupplierIdentity(format.supplier, supplier)))
    .filter((format) => {
      const formatCode = normalizeSupplierProductCode(format.supplierProductCode || format.code);
      return wanted && formatCode ? formatCode === wanted : samePack(format.packSize, pack);
    })
    .sort((a, b) => String(b.checkedAt || b.date || "").localeCompare(String(a.checkedAt || a.date || "")));
  if (checked.length) return { baseQuantity: Number(checked[0].baseQuantity), baseUnit: checked[0].baseUnit, source: "check" };
  return recipeAnswer(product, supplier, pack);
}

// "item", "case" or "other" for an answer on a multipack.
export function answerBasis(answer, reading) {
  if (!answer || !reading || answer.baseUnit !== reading.unit) return answer ? "other" : null;
  if (close(answer.baseQuantity, reading.itemQuantity)) return "item";
  if (close(answer.baseQuantity, reading.caseQuantity)) return "case";
  return "other";
}

// Both readings of a multipack price, per kg or litre.
export function basisPrices(packPrice, reading) {
  const price = Number(packPrice);
  if (!reading || !(price > 0)) return null;
  return { casePrice: price / reading.caseQuantity, itemPrice: price / reading.itemQuantity, unit: reading.unit };
}

// Answers already given per supplier: { [supplier]: { item, case } }, from every product.
// Used only to suggest an answer for the next article of the same supplier.
export function supplierBasisAnswers(products = []) {
  const tally = new Map();
  const add = (supplier, basis) => {
    if (!supplier || !["item", "case"].includes(basis)) return;
    const key = String(supplier).trim().toLowerCase();
    const entry = [...tally.entries()].find(([, value]) => sameSupplierIdentity(value.supplier, supplier))?.[1]
      || tally.set(key, { supplier, item: 0, case: 0 }).get(key);
    entry[basis] += 1;
  };
  for (const product of products) {
    for (const format of product.supplierFormats || []) {
      if (format.source !== PRICE_CHECK_SOURCE) continue;
      add(format.supplier, answerBasis({ baseQuantity: Number(format.baseQuantity), baseUnit: format.baseUnit }, multipackReading(format.packSize)));
    }
    const conversion = product.recipeConversion;
    if (conversion && product.supplier) add(product.supplier, answerBasis({ baseQuantity: Number(conversion.baseQuantity), baseUnit: conversion.baseUnit }, multipackReading(conversion.packSize)));
  }
  return [...tally.values()];
}

// The answer the supplier's earlier answers point to: at least two the same way and none the other.
export function supplierSuggestion(answers = [], supplier = "") {
  const entry = answers.find((value) => sameSupplierIdentity(value.supplier, supplier));
  if (!entry) return null;
  if (entry.item >= 2 && !entry.case) return { basis: "item", count: entry.item };
  if (entry.case >= 2 && !entry.item) return { basis: "case", count: entry.case };
  return null;
}
