// Recipe and menu costing.
//
// A recipe or dish stores references only: each line is a product, a recipe or a manual line with
// a quantity and a unit. Costs are never stored for calculation — they are worked out here from
// the product's current price (the latest invoice) every time, so a new invoice moves every
// recipe and dish that uses the product. Older records are upgraded on read; the original JSON is
// kept in `legacy` the first time an upgraded record is saved.

import { normalisedCostForPrice } from "./productPackaging.js";
import { normalizeProductName, rankProductCandidates } from "./productMatching.js";
import { articleAnswer, basisPrices, multipackReading } from "./packPriceBasis.js";

export const RECIPE_SCHEMA_VERSION = 2;
export const LINE_TYPES = Object.freeze({ PRODUCT: "Product", RECIPE: "Recipe", MANUAL: "Manual" });
export const LINE_STATUS = Object.freeze({
  OK: "ok",
  MANUAL: "manual",
  NEEDS_CONVERSION: "needs-conversion",
  UNIT_MISMATCH: "unit-mismatch",
  MISSING: "missing",
  CYCLE: "cycle",
  NO_PRICE: "no-price",
});

// Quantity units a line can use, with the base unit they convert to.
const UNIT_FACTORS = Object.freeze({
  g: { base: "kg", factor: 0.001 },
  kg: { base: "kg", factor: 1 },
  ml: { base: "l", factor: 0.001 },
  l: { base: "l", factor: 1 },
  each: { base: "each", factor: 1 },
});
export const MEASURE_UNITS = Object.freeze(["g", "kg", "ml", "l", "each"]);
// "pack" = one purchase unit at the current invoice price (no conversion needed).
export const PACK_UNIT = "pack";
// "portion" = one yield unit of a recipe.
export const PORTION_UNIT = "portion";

function numberOr(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function unitBase(unit = "") {
  const key = String(unit).trim().toLowerCase();
  if (["litre", "litres", "liter", "ltr"].includes(key)) return UNIT_FACTORS.l;
  if (["kilo", "kilos"].includes(key)) return UNIT_FACTORS.kg;
  if (["punnet", "unit", "units", "ea", "pc", "pcs", "piece", "pieces"].includes(key)) return UNIT_FACTORS.each;
  return UNIT_FACTORS[key] || null;
}

// Converts a quantity to the base unit (kg, l or each), or null when the dimensions differ.
export function convertQuantity(quantity, fromUnit, toBaseUnit) {
  const from = unitBase(fromUnit);
  const target = unitBase(toBaseUnit);
  if (!from || !target || from.base !== target.base) return null;
  return numberOr(quantity) * from.factor;
}

function wasteFactor(wastePercent) {
  const waste = Math.min(Math.max(numberOr(wastePercent), 0), 95);
  return 1 / (1 - waste / 100);
}

// ---------- Product price ----------

// Price per kg, litre or each of one purchase: its pack price, pack text and supplier.
// The answer confirmed for that supplier article (Check prices, or "1 pack = …" in a recipe line)
// comes first. A "N x size" pack read as the whole case with no answer is marked basisPending,
// with the price per item alongside, so the line can ask once.
export function packUnitPrice(product = {}, { packPrice = 0, packSize = "", supplier = "", code = "", normalizedCost = null, normalizedUnit = "", reviewRequired = false } = {}) {
  const price = numberOr(packPrice);
  const answer = articleAnswer(product, { supplier, code, pack: packSize });
  if (answer && unitBase(answer.baseUnit)) {
    const unit = unitBase(answer.baseUnit);
    return { confirmed: true, unit: unit.base, price: price / (numberOr(answer.baseQuantity) * unit.factor), source: answer.source === "recipe" ? "recipe-conversion" : "checked" };
  }
  let result = null;
  const recorded = String(normalizedUnit || "").toLowerCase();
  if (numberOr(normalizedCost) > 0 && unitBase(recorded) && !reviewRequired) {
    result = { confirmed: true, unit: unitBase(recorded).base, price: numberOr(normalizedCost), source: "invoice" };
  } else {
    const parsed = normalisedCostForPrice(price, packSize);
    if (!parsed.reviewRequired && parsed.normalizedCost > 0 && unitBase(parsed.baseUnit)) {
      result = { confirmed: true, unit: unitBase(parsed.baseUnit).base, price: parsed.normalizedCost, source: "pack" };
    }
  }
  if (!result) return { confirmed: false, unit: "", price: null, source: "" };
  const reading = multipackReading(packSize);
  const both = basisPrices(price, reading);
  if (both && reading.unit === result.unit && Math.abs(result.price - both.casePrice) <= Math.max(0.0001, both.casePrice * 0.001)) {
    return { ...result, basisPending: true, casePrice: both.casePrice, itemPrice: both.itemPrice, reading };
  }
  return result;
}

// The product's current price per kg, litre or each, from its latest invoice.
// A conversion confirmed in the recipe editor applies only while the pack format is unchanged.
export function productUnitPrice(product = {}) {
  const packPrice = numberOr(product.unitCost);
  const date = product.currentPriceDate || product.lastUpdated || "";
  const base = { packPrice, packSize: product.packSize || "", supplier: product.supplier || "", date };
  const price = packUnitPrice(product, {
    packPrice, packSize: product.packSize || "", supplier: product.supplier || "", code: product.supplierProductCode || "",
    normalizedCost: product.normalizedCost, normalizedUnit: product.normalizedUnit, reviewRequired: Boolean(product.conversionReviewRequired),
  });
  return { ...base, ...price };
}

// ---------- Price basis for recipe costs ----------

export const PRICE_BASIS = Object.freeze({ AVERAGE: "average4w", LATEST: "latest", CHEAPEST: "cheapest" });
export const PRICE_BASIS_LABELS = Object.freeze({
  [PRICE_BASIS.AVERAGE]: "Average of the last 4 weeks",
  [PRICE_BASIS.LATEST]: "Latest invoice",
  [PRICE_BASIS.CHEAPEST]: "Cheapest supplier",
});
const AVERAGE_DAYS = 28;
const CHEAPEST_DAYS = 84;

function isoDaysBefore(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ""));
  if (!match) return "";
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - days)).toISOString().slice(0, 10);
}

// Invoice purchases of a product, including those of products merged into it.
export function productPurchases(product = {}, products = []) {
  const sources = [product, ...products.filter((other) => other && other.id !== product.id && other.mergedIntoProductId === product.id)];
  return sources.flatMap((source) => (source.supplierFormats || [])
    .filter((format) => format.source === "Invoice" && format.date && numberOr(format.purchaseUnitCost) > 0 && numberOr(format.quantity) > 0)
    .map((format) => ({
      date: String(format.date).slice(0, 10), supplier: format.supplier || "", packSize: format.packSize || "",
      packPrice: numberOr(format.purchaseUnitCost), quantity: numberOr(format.quantity), owner: source,
    })));
}

function purchaseUnitPrice(purchase) {
  return packUnitPrice(purchase.owner, { packPrice: purchase.packPrice, packSize: purchase.packSize, supplier: purchase.supplier });
}

function supplierNames(purchases) {
  const names = [...new Set(purchases.map((purchase) => purchase.supplier).filter(Boolean))];
  return names.length === 1 ? names[0] : names.length ? `${names.length} suppliers` : "";
}

// Price per kg, litre or each used for recipe costs, with the basis it comes from:
//  - latest invoice (default);
//  - average of the last 4 weeks: what was paid, weighted by the quantity bought;
//  - cheapest supplier: the latest price of each supplier linked to the product (last 12 weeks).
// Without purchases for the chosen basis it falls back to the latest invoice and says so.
export function recipeProductPrice(product = {}, { basis = PRICE_BASIS.LATEST, asOf = "", products = [] } = {}) {
  const latest = productUnitPrice(product);
  const latestResult = (note = "") => ({ ...latest, basis: PRICE_BASIS.LATEST, basisLabel: note ? `latest invoice · ${note}` : "latest invoice" });
  if (basis === PRICE_BASIS.LATEST) return latestResult();
  const today = asOf || new Date().toISOString().slice(0, 10);
  const purchases = productPurchases(product, products).filter((purchase) => purchase.date <= today);
  const priced = purchases.map((purchase) => ({ ...purchase, unitPrice: purchaseUnitPrice(purchase) })).filter((purchase) => purchase.unitPrice.confirmed && purchase.unitPrice.price > 0);
  const counts = new Map();
  priced.forEach((purchase) => counts.set(purchase.unitPrice.unit, (counts.get(purchase.unitPrice.unit) || 0) + 1));
  const unit = latest.confirmed ? latest.unit : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  const sameUnit = priced.filter((purchase) => purchase.unitPrice.unit === unit);
  if (basis === PRICE_BASIS.CHEAPEST) {
    const from = isoDaysBefore(today, CHEAPEST_DAYS);
    const latestBySupplier = new Map();
    sameUnit.filter((purchase) => purchase.date >= from && purchase.supplier).forEach((purchase) => {
      const key = purchase.supplier.trim().toLowerCase();
      const current = latestBySupplier.get(key);
      if (!current || purchase.date > current.date) latestBySupplier.set(key, purchase);
    });
    const offers = [...latestBySupplier.values()];
    if (offers.length < 2) return latestResult("one supplier");
    const cheapest = offers.sort((a, b) => a.unitPrice.price - b.unitPrice.price)[0];
    return { ...latest, ...cheapest.unitPrice, confirmed: true, unit, price: cheapest.unitPrice.price, supplier: cheapest.supplier, date: cheapest.date,
      basis: PRICE_BASIS.CHEAPEST, basisLabel: `cheapest of ${offers.length} suppliers` };
  }
  const from = isoDaysBefore(today, AVERAGE_DAYS - 1);
  const recent = sameUnit.filter((purchase) => purchase.date >= from);
  if (!recent.length) return latestResult("no purchase in 4 weeks");
  const spend = recent.reduce((sum, purchase) => sum + purchase.quantity * purchase.packPrice, 0);
  const volume = recent.reduce((sum, purchase) => sum + (purchase.quantity * purchase.packPrice) / purchase.unitPrice.price, 0);
  const pending = recent.find((purchase) => purchase.unitPrice.basisPending);
  return {
    ...latest,
    confirmed: true,
    unit,
    price: spend / volume,
    supplier: supplierNames(recent),
    date: recent.map((purchase) => purchase.date).sort().at(-1),
    basis: PRICE_BASIS.AVERAGE,
    basisLabel: `4-week average${recent.length > 1 ? ` of ${recent.length} purchases` : ""}`,
    basisPending: Boolean(latest.basisPending || pending),
  };
}

export function findProduct(products = [], productId = "") {
  if (!productId) return null;
  const byId = (id) => products.find((product) => product.id === id) || null;
  let product = byId(productId);
  const seen = new Set();
  // Follow merges so a recipe keeps working after its product was merged into another one.
  while (product?.mergedIntoProductId && !seen.has(product.id)) {
    seen.add(product.id);
    product = byId(product.mergedIntoProductId) || product;
    if (seen.has(product.id)) break;
  }
  return product;
}

// ---------- Upgrade from the first recipe/menu format ----------

function stripLegacy(record = {}) {
  const { legacy, ...rest } = record;
  return rest;
}

function newLineId(seed, index) {
  return `${seed || "line"}-${index}`;
}

export function isUpgraded(record = {}) {
  return numberOr(record.schemaVersion) >= RECIPE_SCHEMA_VERSION;
}

export function upgradeRecipe(recipe = {}) {
  if (isUpgraded(recipe)) return recipe;
  const ingredients = (recipe.ingredients || []).map((ingredient, index) => {
    const id = ingredient.id || newLineId(recipe.id, index);
    const name = ingredient.productName || ingredient.name || "";
    if (ingredient.productId) {
      // The old cost was quantity × pack price: kept as packs, now at the current price.
      return { id, type: LINE_TYPES.PRODUCT, productId: ingredient.productId, sourceId: ingredient.productId, name, quantity: numberOr(ingredient.quantity, 1), unit: PACK_UNIT, wastePercent: 0 };
    }
    return { id, type: LINE_TYPES.MANUAL, productId: "", sourceId: "", name, quantity: numberOr(ingredient.quantity, 1), unit: ingredient.unit || "", manualUnitCost: numberOr(ingredient.unitCost), wastePercent: 0 };
  }).filter((line) => line.name || line.productId);
  return {
    ...recipe,
    schemaVersion: RECIPE_SCHEMA_VERSION,
    yieldQuantity: numberOr(recipe.yieldQuantity, 1) || 1,
    yieldUnit: recipe.yieldUnit || "portions",
    ingredients,
    upgradedFrom: stripLegacy(recipe),
  };
}

export function upgradeDish(dish = {}, defaultVatRate = 20) {
  if (isUpgraded(dish)) return dish;
  const lines = [];
  (dish.recipeIds || []).forEach((recipeId, index) => {
    lines.push({ id: newLineId(`${dish.id}-recipe`, index), type: LINE_TYPES.RECIPE, sourceId: recipeId, recipeId, productId: "", name: "", quantity: 1, unit: PORTION_UNIT, wastePercent: 0 });
  });
  (dish.ingredients || []).forEach((ingredient, index) => {
    const id = ingredient.id || newLineId(`${dish.id}-line`, index);
    const type = String(ingredient.type || "Product");
    const quantity = numberOr(ingredient.quantity, 1);
    if (type === "Recipe" && ingredient.sourceId) {
      lines.push({ id, type: LINE_TYPES.RECIPE, sourceId: ingredient.sourceId, recipeId: ingredient.sourceId, productId: "", name: ingredient.name || "", quantity, unit: PORTION_UNIT, wastePercent: 0 });
    } else if (type === "Product" && (ingredient.sourceId || ingredient.productId)) {
      const productId = ingredient.sourceId || ingredient.productId;
      lines.push({ id, type: LINE_TYPES.PRODUCT, sourceId: productId, productId, name: ingredient.name || "", quantity, unit: PACK_UNIT, wastePercent: 0 });
    } else if (ingredient.name) {
      lines.push({ id, type: LINE_TYPES.MANUAL, sourceId: "", productId: "", name: ingredient.name, quantity, unit: ingredient.unit || "", manualUnitCost: numberOr(ingredient.unitCost), wastePercent: 0 });
    }
  });
  if (numberOr(dish.manualCost) > 0) {
    lines.push({ id: newLineId(`${dish.id}-manual`, 0), type: LINE_TYPES.MANUAL, sourceId: "", productId: "", name: "Other cost", quantity: 1, unit: "each", manualUnitCost: numberOr(dish.manualCost), wastePercent: 0 });
  }
  return {
    ...dish,
    schemaVersion: RECIPE_SCHEMA_VERSION,
    // UK menu prices include VAT; the first format did not record a rate, so the default applies.
    sellingPrice: numberOr(dish.sellingPrice),
    vatRate: numberOr(dish.vatRate, defaultVatRate),
    ingredients: lines,
    upgradedFrom: stripLegacy(dish),
  };
}

// Record to store when an upgraded record is saved: the first-format JSON goes to `legacy`
// once and is never replaced afterwards.
export function recordForSave(previous = null, next = {}) {
  const { upgradedFrom, ...clean } = next;
  const legacy = previous?.legacy ?? (previous && !isUpgraded(previous) ? stripLegacy(previous) : upgradedFrom);
  return legacy ? { ...clean, schemaVersion: RECIPE_SCHEMA_VERSION, legacy } : { ...clean, schemaVersion: RECIPE_SCHEMA_VERSION };
}

// ---------- Costing ----------

export function createCostingContext(products = [], recipes = [], { priceBasis = PRICE_BASIS.LATEST, asOf = "" } = {}) {
  return {
    products,
    priceBasis,
    asOf,
    recipes: recipes.map((recipe) => upgradeRecipe(recipe)),
    cache: new Map(),
  };
}

function findRecipe(context, recipeId) {
  return context.recipes.find((recipe) => recipe.id === recipeId) || null;
}

// Base unit of one yield unit of a recipe: kg/l when the yield is a weight or volume.
export function recipeYieldBase(recipe = {}) {
  const yieldBase = unitBase(recipe.yieldUnit);
  if (yieldBase && yieldBase.base !== "each") return { base: yieldBase.base, quantity: numberOr(recipe.yieldQuantity, 1) * yieldBase.factor };
  return { base: PORTION_UNIT, quantity: numberOr(recipe.yieldQuantity, 1) };
}

export function unitsForLine(line = {}, context = null) {
  if (line.type === LINE_TYPES.RECIPE) {
    const recipe = context ? findRecipe(context, line.recipeId || line.sourceId) : null;
    const yieldBase = recipe ? recipeYieldBase(recipe) : { base: PORTION_UNIT };
    if (yieldBase.base === "kg") return [PORTION_UNIT, "g", "kg"];
    if (yieldBase.base === "l") return [PORTION_UNIT, "ml", "l"];
    return [PORTION_UNIT];
  }
  if (line.type === LINE_TYPES.MANUAL) return [...MEASURE_UNITS, PACK_UNIT];
  return [...MEASURE_UNITS, PACK_UNIT];
}

export function costRecipe(recipeOrId, context, trail = []) {
  const recipe = typeof recipeOrId === "string" ? findRecipe(context, recipeOrId) : upgradeRecipe(recipeOrId);
  if (!recipe) return { batchCost: null, unitCost: null, complete: false, lines: [], missing: true };
  if (trail.includes(recipe.id)) return { batchCost: null, unitCost: null, complete: false, lines: [], cycle: true };
  const cacheKey = `${recipe.id}|${trail.join(">")}`;
  const cached = typeof recipeOrId === "string" ? context.cache.get(cacheKey) : null;
  if (cached) return cached;
  const lines = (recipe.ingredients || []).map((line) => costLine(line, context, [...trail, recipe.id]));
  const batchCost = lines.reduce((sum, line) => sum + (line.cost ?? 0), 0);
  const yieldBase = recipeYieldBase(recipe);
  const result = {
    batchCost: round(batchCost),
    unitCost: yieldBase.quantity ? round(batchCost / numberOr(recipe.yieldQuantity, 1)) : null,
    // Cost of one base unit of the yield (per kg, per litre or per portion).
    baseCost: yieldBase.quantity ? batchCost / yieldBase.quantity : null,
    yieldBase,
    ...lineCounts(lines),
    lines,
  };
  if (typeof recipeOrId === "string") context.cache.set(cacheKey, result);
  return result;
}

export function costLine(line = {}, context, trail = []) {
  const quantity = numberOr(line.quantity);
  const factor = wasteFactor(line.wastePercent);
  const unit = String(line.unit || "").toLowerCase();
  if (line.type === LINE_TYPES.MANUAL) {
    const cost = quantity * numberOr(line.manualUnitCost) * factor;
    return { id: line.id, status: LINE_STATUS.MANUAL, cost: round(cost), unitPrice: numberOr(line.manualUnitCost), priceUnit: line.unit || "each" };
  }
  if (line.type === LINE_TYPES.RECIPE) {
    const recipeId = line.recipeId || line.sourceId;
    if (trail.includes(recipeId)) return { id: line.id, status: LINE_STATUS.CYCLE, cost: null };
    const recipe = findRecipe(context, recipeId);
    if (!recipe) return { id: line.id, status: LINE_STATUS.MISSING, cost: null };
    const costed = costRecipe(recipeId, context, trail);
    if (costed.cycle) return { id: line.id, status: LINE_STATUS.CYCLE, cost: null };
    let baseQuantity = null;
    if (unit === PORTION_UNIT || unit === "portions" || !unit) baseQuantity = quantity * (costed.yieldBase.quantity / numberOr(recipe.yieldQuantity, 1));
    else if (costed.yieldBase.base !== PORTION_UNIT) baseQuantity = convertQuantity(quantity, unit, costed.yieldBase.base);
    if (baseQuantity === null) return { id: line.id, status: LINE_STATUS.UNIT_MISMATCH, cost: null, name: recipe.name };
    const cost = baseQuantity * costed.baseCost * factor;
    return {
      id: line.id,
      name: recipe.name,
      status: costed.complete ? LINE_STATUS.OK : LINE_STATUS.NEEDS_CONVERSION,
      cost: round(cost),
      unitPrice: costed.baseCost,
      priceUnit: costed.yieldBase.base === PORTION_UNIT ? String(recipe.yieldUnit || PORTION_UNIT).replace(/s$/, "") : costed.yieldBase.base,
      recipeIncomplete: !costed.complete,
    };
  }
  const product = findProduct(context.products, line.productId || line.sourceId);
  if (!product) return { id: line.id, status: LINE_STATUS.MISSING, cost: null };
  const price = recipeProductPrice(product, { basis: context.priceBasis, asOf: context.asOf, products: context.products });
  const details = { id: line.id, name: product.name, supplier: price.supplier, packSize: price.packSize, packPrice: price.packPrice, priceDate: price.date, productId: product.id,
    basisLabel: price.basisLabel, basisPending: Boolean(price.basisPending), casePrice: price.casePrice, itemPrice: price.itemPrice, reading: price.reading };
  if (unit === PACK_UNIT) {
    if (!(price.packPrice > 0)) return { ...details, status: LINE_STATUS.NO_PRICE, cost: null };
    return { ...details, status: LINE_STATUS.OK, cost: round(quantity * price.packPrice * factor), unitPrice: price.packPrice, priceUnit: PACK_UNIT };
  }
  if (!price.confirmed) return { ...details, status: LINE_STATUS.NEEDS_CONVERSION, cost: null };
  const baseQuantity = convertQuantity(quantity, unit, price.unit);
  if (baseQuantity === null) return { ...details, status: LINE_STATUS.UNIT_MISMATCH, cost: null, unitPrice: price.price, priceUnit: price.unit };
  return { ...details, status: LINE_STATUS.OK, cost: round(baseQuantity * price.price * factor), unitPrice: price.price, priceUnit: price.unit };
}

// ---------- Total weight of a recipe ----------

// Sum of the ingredient lines in kg (1 ml counted as 1 g, so the total is approximate when there
// are liquids). Lines in "each", or packs and portions whose weight is unknown, are left out and
// counted, so the screen can say how many.
export function ingredientWeight(lines = [], context) {
  let weightKg = 0;
  let volumeL = 0;
  let excluded = 0;
  const addBase = (quantity, base) => {
    if (base === "kg") weightKg += quantity;
    else if (base === "l") volumeL += quantity;
    else excluded += 1;
  };
  for (const line of lines) {
    const quantity = numberOr(line.quantity);
    const unit = String(line.unit || "").toLowerCase();
    const measured = unitBase(unit);
    if (!(quantity > 0)) continue;
    if (measured && measured.base !== "each") { addBase(quantity * measured.factor, measured.base); continue; }
    if (line.type === LINE_TYPES.RECIPE && (unit === PORTION_UNIT || unit === "portions" || !unit)) {
      const recipe = findRecipe(context, line.recipeId || line.sourceId);
      const yieldBase = recipe ? recipeYieldBase(recipe) : null;
      if (yieldBase && yieldBase.base !== PORTION_UNIT) addBase(quantity * (yieldBase.quantity / numberOr(recipe.yieldQuantity, 1)), yieldBase.base);
      else excluded += 1;
      continue;
    }
    if (line.type === LINE_TYPES.PRODUCT && unit === PACK_UNIT) {
      const product = findProduct(context.products, line.productId || line.sourceId);
      const price = product ? productUnitPrice(product) : null;
      if (price?.confirmed && ["kg", "l"].includes(price.unit) && price.price > 0 && price.packPrice > 0) addBase(quantity * (price.packPrice / price.price), price.unit);
      else excluded += 1;
      continue;
    }
    excluded += 1;
  }
  return { totalKg: round(weightKg + volumeL, 4), weightKg: round(weightKg, 4), volumeL: round(volumeL, 4), approximate: volumeL > 0, excluded };
}

// Yield after cooking loss (reducing, roasting): total × (1 − loss).
export function yieldAfterLoss(totalKg, lossPercent = 0) {
  const loss = Math.min(Math.max(numberOr(lossPercent), 0), 95);
  return round(numberOr(totalKg) * (1 - loss / 100), 3);
}

export function costDish(dish = {}, context, defaultVatRate = 20) {
  const upgraded = upgradeDish(dish, defaultVatRate);
  const lines = (upgraded.ingredients || []).map((line) => costLine(line, context, []));
  const cost = round(lines.reduce((sum, line) => sum + (line.cost ?? 0), 0));
  const pricing = dishPricing(upgraded.sellingPrice, upgraded.vatRate, cost);
  return {
    ...pricing,
    cost,
    lines,
    ...lineCounts(lines),
  };
}

// Manual lines have a cost (the price typed by hand) and are counted apart: they are not errors,
// only lines that invoices do not update.
function lineCounts(lines) {
  const usable = (line) => line.status === LINE_STATUS.OK || line.status === LINE_STATUS.MANUAL;
  return {
    complete: lines.every(usable),
    issues: lines.filter((line) => !usable(line)).length,
    manualLines: lines.filter((line) => line.status === LINE_STATUS.MANUAL).length,
  };
}

// ---------- Prices and GP ----------

export function netPrice(priceIncludingVat, vatRate = 20) {
  return numberOr(priceIncludingVat) / (1 + numberOr(vatRate, 20) / 100);
}

// GP on the price without VAT — the same basis as the Dashboard.
export function dishPricing(priceIncludingVat, vatRate = 20, cost = 0) {
  const net = netPrice(priceIncludingVat, vatRate);
  return {
    priceIncludingVat: numberOr(priceIncludingVat),
    vatRate: numberOr(vatRate, 20),
    net: round(net, 4),
    gp: net > 0 ? ((net - numberOr(cost)) / net) * 100 : null,
  };
}

// Price including VAT that reaches the target GP for this cost.
export function suggestedPrice(cost, targetGp, vatRate = 20) {
  const target = numberOr(targetGp);
  if (!(numberOr(cost) > 0) || target >= 100 || target < 0) return null;
  const net = numberOr(cost) / (1 - target / 100);
  // Rounded up to the penny so the price never lands just under the target.
  return Math.ceil(Number((net * (1 + numberOr(vatRate, 20) / 100) * 100).toFixed(6))) / 100;
}

// "Cost up X% since date": compares with the cost recorded when the record was last saved.
// The saved cost is only a reference for this message, never used as the cost.
export function costChange(currentCost, savedCost) {
  const before = numberOr(savedCost, NaN);
  const now = numberOr(currentCost, NaN);
  if (!(before > 0) || !Number.isFinite(now)) return null;
  const change = ((now - before) / before) * 100;
  return Math.abs(change) >= 1 ? round(change, 1) : null;
}

// ---------- Search ----------

function recipeMatches(recipe, query) {
  const tokens = normalizeProductName(query).split(" ").filter(Boolean);
  const name = normalizeProductName(recipe.name);
  return tokens.length > 0 && tokens.every((token) => name.includes(token));
}

// Products (by words and aliases) and recipes for one search box. Inactive products and the
// recipe being edited are left out.
export function searchIngredients(query = "", { products = [], recipes = [], excludeRecipeId = "", productIndex = null, limit = 8 } = {}) {
  if (!normalizeProductName(query)) return [];
  const activeProducts = productIndex || products.filter((product) => product.active !== false && !product.mergedIntoProductId);
  const productHits = rankProductCandidates(query, activeProducts, { limit, minimumScore: 0.3 })
    .map((candidate) => ({ type: LINE_TYPES.PRODUCT, id: candidate.product.id, name: candidate.product.name, score: candidate.score, product: candidate.product }));
  const recipeHits = recipes
    .filter((recipe) => recipe.id !== excludeRecipeId && recipe.status !== "Archived" && recipeMatches(recipe, query))
    .map((recipe) => ({ type: LINE_TYPES.RECIPE, id: recipe.id, name: recipe.name, score: 0.9, recipe }));
  return [...recipeHits, ...productHits].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function lineFromSearchHit(hit, id) {
  if (hit.type === LINE_TYPES.RECIPE) {
    return { id, type: LINE_TYPES.RECIPE, sourceId: hit.id, recipeId: hit.id, productId: "", name: hit.name, quantity: 1, unit: PORTION_UNIT, wastePercent: 0 };
  }
  const price = productUnitPrice(hit.product);
  const unit = !price.confirmed ? PACK_UNIT : price.unit === "kg" ? "g" : price.unit === "l" ? "ml" : "each";
  return { id, type: LINE_TYPES.PRODUCT, sourceId: hit.id, productId: hit.id, name: hit.name, quantity: unit === "g" || unit === "ml" ? 100 : 1, unit, wastePercent: 0 };
}
