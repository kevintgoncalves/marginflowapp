// Recipes in the team recipe book format: title, yield, one ingredient per line in kitchen words
// ("30g lovage, finely chopped"), then "Method". No costs. Read-only.
import { LINE_TYPES, PACK_UNIT, PORTION_UNIT, findProduct, upgradeRecipe } from "./recipeCosting.js";

function numberOr(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatAmount(value) {
  const number = numberOr(value);
  return String(Number(number.toFixed(3)));
}

const SIZE = /\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?\s*)?(?:kg|kgs|kilo|kilos|g|gr|grams?|l|lt|ltr|litres?|liters?|ml|cl|oz|lb)\b\.?/gi;

// Supplier name → kitchen name: no text in brackets, no sizes or pack counts, "Oil, Olive" → "olive oil".
export function kitchenName(name = "") {
  let text = String(name || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(SIZE, " ")
    .replace(/\b(?:x\s*\d+|\d+\s*x)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\s,;\-–]+$/, "")
    .replace(/^[\s,;\-–]+/, "");
  const parts = text.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) text = `${parts[1]} ${parts[0]}`;
  else text = parts.join(", ");
  return text.toLowerCase();
}

const WEIGHT_UNITS = new Set(["g", "kg", "ml", "l"]);

export function quantityText(quantity, unit = "") {
  const amount = formatAmount(quantity);
  const key = String(unit || "").toLowerCase();
  if (WEIGHT_UNITS.has(key)) return `${amount}${key}`;
  if (!key || key === "each") return amount;
  if (key === PACK_UNIT) return `${amount} ${numberOr(quantity) === 1 ? "pack" : "packs"}`;
  if (key === PORTION_UNIT || key === "portions") return `${amount} ${numberOr(quantity) === 1 ? "portion" : "portions"}`;
  return `${amount} ${key}`;
}

// The name the team reads: the line's own "name in recipe", else the cleaned product name, else
// the sub-recipe's name.
export function ingredientRecipeName(line = {}, context = { products: [], recipes: [] }) {
  const own = String(line.recipeName || "").trim();
  if (own) return own;
  if (line.type === LINE_TYPES.RECIPE) {
    const recipe = (context.recipes || []).find((item) => item.id === (line.recipeId || line.sourceId));
    return (recipe?.name || line.name || "").trim().toLowerCase();
  }
  if (line.type === LINE_TYPES.PRODUCT || line.productId) {
    const product = findProduct(context.products || [], line.productId || line.sourceId);
    return kitchenName(product?.name || line.name);
  }
  return kitchenName(line.name);
}

export function ingredientText(line = {}, context) {
  const name = ingredientRecipeName(line, context);
  const note = String(line.note || "").trim();
  return `${quantityText(line.quantity, line.unit)} ${name}${note ? `, ${note}` : ""}`.trim();
}

export function yieldText(recipe = {}) {
  const quantity = formatAmount(recipe.yieldQuantity || 1);
  const unit = String(recipe.yieldUnit || "").trim().toLowerCase();
  if (!unit || unit === "portions" || unit === "portion") return `Serves ${quantity}`;
  if (WEIGHT_UNITS.has(unit)) return `Makes ${quantity}${unit}`;
  return `Makes ${quantity} ${unit}`;
}

export function recipeBookEntry(recipe = {}, context) {
  const upgraded = upgradeRecipe(recipe);
  return {
    title: String(upgraded.name || "").trim() || "Untitled recipe",
    yieldLine: yieldText(upgraded),
    ingredients: (upgraded.ingredients || []).filter((line) => String(line.name || line.productId || line.recipeId || "").trim()).map((line) => ingredientText(line, context)),
    method: String(upgraded.method || "").trim(),
  };
}

export function recipeBookPlainText(entry) {
  return [entry.title, entry.yieldLine, ...entry.ingredients, ...(entry.method ? ["", "Method", entry.method] : [])].join("\n");
}

const escapeHtml = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Pasted into Google Docs: the title becomes a heading, ingredients plain lines, "Method" a subheading.
export function recipeBookHtml(entry) {
  const paragraphs = (text) => text.split(/\n+/).map((part) => part.trim()).filter(Boolean).map((part) => `<p>${escapeHtml(part)}</p>`).join("");
  return [
    `<h2>${escapeHtml(entry.title)}</h2>`,
    `<p><em>${escapeHtml(entry.yieldLine)}</em></p>`,
    ...entry.ingredients.map((line) => `<p>${escapeHtml(line)}</p>`),
    ...(entry.method ? ["<h3>Method</h3>", paragraphs(entry.method)] : []),
  ].join("");
}

export function isActiveRecipe(recipe = {}) {
  return !/^(inactive|archived)$/i.test(String(recipe.status || "Active"));
}

export function recipeBookEntries(recipes = [], context) {
  return recipes.filter(isActiveRecipe).map((recipe) => recipeBookEntry(recipe, context))
    .sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
}
