// Import of a hand-written stocktake list ("Product | Qty | uni"), with prep by zone.
//
// The count is written the way the kitchen counts: a weight, a volume, a number of tins or packs,
// with typos and the pack size in the name ("Honey 3.17kg"). Each row is matched to a product or a
// recipe and its quantity converted to purchase packs from the product's pack content, so the
// value is packs × the pack price. Nothing here changes a product or a stocktake: the screen
// applies the confirmed rows and learns the names the user confirmed as aliases.

import { articleAnswer, multipackReading } from "./packPriceBasis.js";
import { normalizeHeader, numberValue } from "./numberUtils.js";
import { parsePackSize } from "./productPackaging.js";
import { normalizeProductName, productAliases, productTokens } from "./productMatching.js";
import { costRecipe, upgradeRecipe } from "./recipeCosting.js";
import { stocktakeEntryFromProduct } from "./stocktakeImport.js";

export const FREE_IMPORT_STATUS = Object.freeze({
  CONFIRMED: "confirmed",
  SUGGESTED: "suggested",
  AMBIGUOUS: "ambiguous",
  NO_MATCH: "no_match",
  IGNORED: "ignored",
  INVALID: "invalid",
});

// How the row was matched: by the name or a learned alias, by tolerating a typo, by similarity,
// or by the user.
export const FREE_MATCH_SOURCE = Object.freeze({
  EXACT: "exact",
  ALIAS: "alias",
  TYPO: "typo",
  FUZZY: "fuzzy",
  MANUAL: "manual",
});

export const TARGET_TYPES = Object.freeze({ PRODUCT: "product", RECIPE: "recipe" });

const SUGGEST_SCORE = 0.55;
const AUTO_INPUT_COVERAGE = 0.88;
const AUTO_TARGET_COVERAGE = 0.5;
const AUTO_GAP = 0.1;
const AMBIGUOUS_GAP = 0.05;
const RECENT_DAYS = 60;
const MAX_BASE_QUANTITY = 100;
const MAX_LINE_VALUE = 2000;

// ---------- Units ----------

const MEASURES = [
  [["g", "gr", "grs", "grm", "grms", "gram", "grams", "gramme", "grammes"], "kg", 0.001],
  [["kg", "kgs", "kilo", "kilos", "kilogram", "kilograms"], "kg", 1],
  [["oz", "ozs", "ounce", "ounces"], "kg", 0.0283495],
  [["lb", "lbs", "pound", "pounds"], "kg", 0.453592],
  [["ml", "mls", "millilitre", "millilitres", "milliliter", "milliliters"], "l", 0.001],
  [["cl", "cls", "centilitre", "centilitres"], "l", 0.01],
  [["l", "lt", "lts", "ltr", "ltrs", "litre", "litres", "liter", "liters"], "l", 1],
];
const MEASURE_BY_WORD = new Map(MEASURES.flatMap(([words, base, factor]) => words.map((word) => [word, { base, factor }])));
const COUNT_WORDS = new Set(["uni", "unit", "units", "un", "und", "each", "ea", "pc", "pcs", "piece", "pieces", "item", "items", "x", "no", "nos", "portion", "portions"]);
const PACK_WORDS = new Map([
  ["box", "box"], ["boxes", "box"], ["bx", "box"], ["bxs", "box"],
  ["case", "case"], ["cases", "case"], ["cs", "case"],
  ["tin", "tin"], ["tins", "tin"], ["a10", "tin"], ["a10tin", "tin"], ["a10tins", "tin"], ["can", "tin"], ["cans", "tin"],
  ["tray", "tray"], ["trays", "tray"],
  ["pack", "pack"], ["packs", "pack"], ["pk", "pack"], ["pkt", "pack"], ["packet", "pack"], ["packets", "pack"],
  ["punnet", "punnet"], ["punnets", "punnet"], ["pnt", "punnet"],
  ["bunch", "bunch"], ["bunchs", "bunch"], ["bunches", "bunch"], ["bnch", "bunch"],
  ["loaf", "loaf"], ["loafs", "loaf"], ["loaves", "loaf"],
  ["bottle", "bottle"], ["bottles", "bottle"], ["btl", "bottle"], ["btls", "bottle"],
  ["bag", "bag"], ["bags", "bag"], ["sack", "bag"],
  ["tub", "tub"], ["tubs", "tub"], ["jar", "jar"], ["jars", "jar"],
  ["roll", "roll"], ["rolls", "roll"], ["block", "block"], ["blocks", "block"],
  ["head", "head"], ["heads", "head"], ["wheel", "wheel"], ["wheels", "wheel"], ["tube", "tube"], ["tubes", "tube"],
]);

const SIZE_PATTERN = /(\d+(?:[.,]\d+)?)\s*(kgs?|kilos?|grams?|grs?|g|ozs?|oz|lbs?|mls?|ml|cls?|cl|ltrs?|ltr|lts?|lt|litres?|liters?|l)(?![a-z])/i;

function measureForWord(word = "") {
  return MEASURE_BY_WORD.get(String(word).toLowerCase()) || null;
}

function sizeFrom(amount, word) {
  const measure = measureForWord(word);
  const quantity = Number(String(amount).replace(",", "."));
  if (!measure || !(quantity > 0)) return null;
  return { quantity: quantity * measure.factor, base: measure.base };
}

// The unit cell: a measure (g, kg, lt), a size ("325g": the count is of 325 g items), a count
// (uni, each), a pack word (tin, box, punnet), nothing, or something unknown.
export function parseCountUnit(value = "") {
  const text = String(value ?? "").trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
  if (!text) return { kind: "none", label: "" };
  const compact = text.replace(/\s+/g, "");
  const measure = measureForWord(compact);
  if (measure) return { kind: "measure", label: text, base: measure.base, factor: measure.factor };
  const sized = new RegExp(`^${SIZE_PATTERN.source}$`, "i").exec(compact);
  if (sized) {
    const size = sizeFrom(sized[1], sized[2]);
    if (size) return { kind: "sized", label: text, base: size.base, size: size.quantity };
  }
  if (COUNT_WORDS.has(compact)) return { kind: "count", label: text };
  if (PACK_WORDS.has(compact)) return { kind: "pack", label: text, pack: PACK_WORDS.get(compact) };
  const lastWord = text.split(" ").pop();
  if (PACK_WORDS.has(lastWord)) return { kind: "pack", label: text, pack: PACK_WORDS.get(lastWord) };
  return { kind: "unknown", label: text };
}

// "3 x 325g" in the quantity cell: 3 items of 325 g.
export function parseCountQuantity(value) {
  if (value === null || value === undefined || (typeof value === "string" && !value.trim())) return { hasCount: false };
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? { hasCount: true, quantity: value } : { hasCount: false, invalid: true };
  const text = String(value).trim().toLowerCase().replace(/×/g, "x");
  const multiplied = /^(\d+(?:[.,]\d+)?)\s*x\s*(.+)$/.exec(text);
  if (multiplied) {
    const unit = parseCountUnit(multiplied[2]);
    const quantity = Number(multiplied[1].replace(",", "."));
    if (unit.kind === "sized" && quantity >= 0) return { hasCount: true, quantity, unitText: multiplied[2] };
  }
  const withUnit = /^(\d+(?:[.,]\d+)?)\s*([a-z][a-z0-9 ]*)$/.exec(text);
  if (withUnit) return { hasCount: true, quantity: Number(withUnit[1].replace(",", ".")), unitText: withUnit[2] };
  const plain = Number(text.replace(/,/g, ""));
  if (Number.isFinite(plain) && plain >= 0) return { hasCount: true, quantity: plain };
  return { hasCount: false, invalid: true };
}

// ---------- Names ----------

function supplierTails(suppliers = []) {
  const tails = new Set();
  suppliers.forEach((supplier) => {
    const name = normalizeProductName(typeof supplier === "string" ? supplier : supplier?.name || "");
    if (!name) return;
    tails.add(name);
    const first = name.split(" ")[0];
    if (first.length >= 4 && !["fine", "food", "foods", "fresh", "meat", "fish", "lady", "real", "brighton", "the"].includes(first)) tails.add(first);
  });
  return [...tails].sort((left, right) => right.length - left.length);
}

// "Honey 3.17kg" → "Honey" with a 3.17 kg size; "Limes albion" → "Limes" from Albion.
export function cleanCountName(name = "", { suppliers = [] } = {}) {
  let text = String(name || "").trim();
  let size = null;
  const multipack = /(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kgs?|g|ml|cl|ltr?|l)(?![a-z])/i.exec(text);
  if (multipack) {
    const item = sizeFrom(multipack[2], multipack[3]);
    if (item) size = { quantity: item.quantity * Number(multipack[1]), base: item.base, itemQuantity: item.quantity };
    text = text.replace(multipack[0], " ");
  } else {
    const single = SIZE_PATTERN.exec(text);
    if (single) {
      size = sizeFrom(single[1], single[2]);
      text = text.replace(single[0], " ");
    }
  }
  text = text.replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  let supplier = "";
  const normalized = normalizeProductName(text);
  const tail = supplierTails(suppliers).find((candidate) => normalized.endsWith(` ${candidate}`));
  if (tail) {
    supplier = tail;
    const words = text.split(" ");
    text = words.slice(0, words.length - tail.split(" ").length).join(" ");
  }
  return { name: text.trim() || String(name || "").trim(), size, supplier };
}

// ---------- Similarity ----------

function editDistance(left, right, limit = 3) {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > limit) return limit + 1;
    previous = current;
  }
  return previous[right.length];
}

// Letter-level tolerance: "seeeds" ≈ "seeds", "bnlack" ≈ "black", "worcerter" ≈ "worcester".
export function tokenSimilarity(left = "", right = "") {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const shortest = Math.min(left.length, right.length);
  if (/^\d+$/.test(left) || /^\d+$/.test(right)) return 0;
  const distance = editDistance(left, right, 2);
  if (shortest >= 4 && distance <= 1) return 0.9;
  if (shortest >= 7 && distance <= 2) return 0.85;
  if (shortest >= 5 && (left.startsWith(right) || right.startsWith(left))) return 0.75;
  // A misspelt start of a longer word: "worcerter" ≈ "worcestershire".
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  if (short.length >= 6 && long.length > short.length && editDistance(short, long.slice(0, short.length), 1) <= 1) return 0.75;
  return 0;
}

const tokenWeight = (token) => Math.min(Math.max(token.length, 2), 8);

// Best similarity of each token with the other side's tokens or two of them joined
// ("hasbrown" ≈ "hash" + "brown"). Returns the weighted coverage of both sides.
export function nameSimilarity(inputTokens = [], targetTokens = []) {
  if (!inputTokens.length || !targetTokens.length) return { score: 0, inputCoverage: 0, targetCoverage: 0 };
  const targetCovered = new Array(targetTokens.length).fill(0);
  let inputSum = 0;
  let inputWeight = 0;
  inputTokens.forEach((token) => {
    let best = 0;
    targetTokens.forEach((target, index) => {
      const similarity = tokenSimilarity(token, target);
      if (similarity > best) best = similarity;
      if (similarity > targetCovered[index]) targetCovered[index] = similarity;
      if (index < targetTokens.length - 1) {
        const joined = tokenSimilarity(token, target + targetTokens[index + 1]);
        if (joined > best) best = joined;
        if (joined > targetCovered[index]) targetCovered[index] = joined;
        if (joined > targetCovered[index + 1]) targetCovered[index + 1] = joined;
      }
    });
    inputSum += best * tokenWeight(token);
    inputWeight += tokenWeight(token);
  });
  inputTokens.slice(0, -1).forEach((token, index) => {
    const joined = token + inputTokens[index + 1];
    targetTokens.forEach((target, targetIndex) => {
      const similarity = tokenSimilarity(joined, target);
      if (similarity > targetCovered[targetIndex]) targetCovered[targetIndex] = similarity;
    });
  });
  const targetWeight = targetTokens.reduce((sum, token) => sum + tokenWeight(token), 0);
  const targetSum = targetTokens.reduce((sum, token, index) => sum + targetCovered[index] * tokenWeight(token), 0);
  const inputCoverage = inputWeight ? inputSum / inputWeight : 0;
  const targetCoverage = targetWeight ? targetSum / targetWeight : 0;
  return { score: 0.65 * inputCoverage + 0.35 * targetCoverage, inputCoverage, targetCoverage };
}

// ---------- Pack content ----------

const BASES = ["kg", "l", "each"];

// What one purchase pack holds, in kg, litres or items, or null when unknown. items: the number of
// bottles, tins or bags in a case priced as a whole ("24 x 330ml"), so "30 uni" is 1.25 cases.
export function productPackContent(product = {}) {
  const content = packContentOnly(product);
  if (!content) return null;
  const reading = multipackReading(product.packSize || "");
  const items = reading && content.base === reading.unit && close(content.quantity, reading.caseQuantity, 0.001) ? reading.count : 1;
  return { ...content, items };
}

function packContentOnly(product = {}) {
  const answer = articleAnswer(product, { supplier: product.supplier || "", code: product.supplierProductCode || "", pack: product.packSize || "" });
  if (answer && BASES.includes(answer.baseUnit)) return { quantity: Number(answer.baseQuantity), base: answer.baseUnit, source: "confirmed" };
  if (product.packSize) {
    const parsed = parsePackSize(product.packSize);
    if (!parsed.reviewRequired && parsed.baseQuantity > 0 && BASES.includes(parsed.baseUnit)) return { quantity: parsed.baseQuantity, base: parsed.baseUnit, source: "pack" };
  }
  const unitCost = numberValue(product.unitCost);
  const normalizedCost = numberValue(product.normalizedCost);
  const normalizedUnit = String(product.normalizedUnit || "").toLowerCase();
  if (unitCost > 0 && normalizedCost > 0 && BASES.includes(normalizedUnit) && !product.conversionReviewRequired) {
    return { quantity: unitCost / normalizedCost, base: normalizedUnit, source: "invoice" };
  }
  // "6kg case", "2kg block", "5kg sack": the size in the pack text.
  const inPack = product.packSize ? cleanCountName(product.packSize).size : null;
  if (inPack) return { quantity: inPack.quantity, base: inPack.base, source: "pack" };
  const explicit = numberValue(product.baseQuantity);
  const explicitUnit = String(product.baseUnit || "").toLowerCase();
  if (explicit > 0 && ["kg", "l"].includes(explicitUnit)) return { quantity: explicit, base: explicitUnit, source: "product" };
  const fromName = cleanCountName(product.name || "").size;
  if (fromName) return { quantity: fromName.quantity, base: fromName.base, source: "name" };
  return null;
}

function close(left, right, tolerance = 0.03) {
  return Math.abs(left - right) <= Math.max(1e-6, Math.abs(right) * tolerance);
}

// Count → purchase packs. Returns { packs, baseQuantity, base, note } or { needsConversion }.
export function packsForCount(quantity, unit = { kind: "none" }, content = null) {
  const amount = numberValue(quantity);
  if (unit.kind === "measure") {
    const baseQuantity = amount * unit.factor;
    if (!content || content.base !== unit.base || !(content.quantity > 0)) return { needsConversion: true, baseQuantity, base: unit.base };
    return { packs: baseQuantity / content.quantity, baseQuantity, base: unit.base };
  }
  if (unit.kind === "sized") {
    const baseQuantity = amount * unit.size;
    if (content && content.base === unit.base && content.quantity > 0) return { packs: baseQuantity / content.quantity, baseQuantity, base: unit.base };
    return { packs: amount, baseQuantity, base: unit.base, note: "1 item = 1 pack" };
  }
  if (unit.kind === "count" && content?.base === "each" && content.quantity > 1) {
    return { packs: amount / content.quantity, baseQuantity: amount, base: "each" };
  }
  if (unit.kind === "count" && content?.items > 1) {
    return { packs: amount / content.items, note: `${content.items} per case` };
  }
  return { packs: amount, note: unit.kind === "unknown" ? `Unit "${unit.label}" read as packs` : "" };
}

// ---------- Candidates ----------

function purchaseDates(product = {}) {
  return (product.supplierFormats || [])
    .filter((format) => format.source === "Invoice" && format.date)
    .map((format) => String(format.date).slice(0, 10));
}

function daysBetween(left, right) {
  const a = Date.parse(`${left}T00:00:00Z`);
  const b = Date.parse(`${right}T00:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.abs(a - b) / 86400000 : Infinity;
}

function averagePurchasePacks(product = {}) {
  const quantities = (product.supplierFormats || [])
    .filter((format) => format.source === "Invoice" && numberValue(format.quantity) > 0)
    .map((format) => numberValue(format.quantity));
  return quantities.length ? quantities.reduce((sum, value) => sum + value, 0) / quantities.length : 0;
}

function sameText(left, right) {
  return normalizeProductName(left) === normalizeProductName(right);
}

// One entry per product and recipe the import can match to.
export function createFreeImportIndex(products = [], recipes = [], { costingContext = null } = {}) {
  const productEntries = products
    .filter((product) => product && product.active !== false && !product.mergedIntoProductId)
    .map((product) => ({
      type: TARGET_TYPES.PRODUCT,
      id: product.id,
      name: product.name || product.productName || "",
      product,
      names: productAliases(product).map((alias) => ({ text: alias, normalized: normalizeProductName(alias), tokens: productTokens(cleanCountName(alias).name), primary: sameText(alias, product.name || product.productName || "") })),
      content: productPackContent(product),
      packText: normalizeProductName(`${product.packSize || ""} ${product.unit || ""} ${product.name || ""}`),
    }));
  const recipeEntries = recipes
    .filter((recipe) => recipe && recipe.archived !== true && recipe.active !== false)
    .map((recipe) => upgradeRecipe(recipe))
    .map((recipe) => ({
      type: TARGET_TYPES.RECIPE,
      id: recipe.id,
      name: recipe.name || "",
      recipe,
      names: [{ text: recipe.name || "", normalized: normalizeProductName(recipe.name || ""), tokens: productTokens(recipe.name || ""), primary: true }],
      packText: "",
    }));
  return { entries: [...productEntries, ...recipeEntries], costingContext };
}

function bonuses(entry, context) {
  let bonus = 0;
  const { size, supplier, unit, department, date } = context;
  if (entry.type === TARGET_TYPES.PRODUCT) {
    const content = entry.content;
    if (size && content && content.base === size.base) {
      bonus += close(content.quantity, size.quantity) || (size.itemQuantity && close(content.quantity, size.itemQuantity)) ? 0.12 : -0.08;
    }
    if (supplier && normalizeProductName(entry.product.supplier || "").includes(supplier)) bonus += 0.1;
    if ((unit.kind === "measure" || unit.kind === "sized") && content) bonus += content.base === unit.base ? 0.04 : -0.04;
    if (unit.kind === "pack" && entry.packText.includes(unit.pack)) bonus += 0.05;
    if (department && entry.product.department === department) bonus += 0.03;
    if (date) {
      const recent = purchaseDates(entry.product).filter((day) => daysBetween(day, date) <= RECENT_DAYS).length;
      bonus += Math.min(0.06, recent * 0.02);
    }
  } else {
    const yieldUnit = String(entry.recipe.yieldUnit || "").toLowerCase();
    const yieldBase = measureForWord(yieldUnit)?.base || "";
    if ((unit.kind === "measure" || unit.kind === "sized") && yieldBase) bonus += yieldBase === unit.base ? 0.04 : -0.04;
  }
  return bonus;
}

// Ranked candidates for one count row. exact: a name or alias written the same way.
export function rankFreeImportCandidates(rawName = "", index = { entries: [] }, {
  suppliers = [],
  unit = { kind: "none" },
  department = "",
  date = "",
  limit = 8,
} = {}) {
  const raw = normalizeProductName(rawName);
  const cleaned = cleanCountName(rawName, { suppliers });
  const normalizedClean = normalizeProductName(cleaned.name);
  const inputTokens = productTokens(cleaned.name);
  if (!raw) return { cleaned, candidates: [] };
  const context = { size: cleaned.size, supplier: cleaned.supplier, unit, department, date };
  const candidates = index.entries.map((entry) => {
    let exact = null;
    let similarity = { score: 0, inputCoverage: 0, targetCoverage: 0 };
    entry.names.forEach((name) => {
      if (name.normalized && (name.normalized === raw || name.normalized === normalizedClean)) {
        if (!exact || (name.normalized === raw && !exact.raw)) exact = { primary: name.primary, raw: name.normalized === raw };
      }
      const next = nameSimilarity(inputTokens, name.tokens);
      if (next.score > similarity.score) similarity = next;
    });
    const nameScore = exact ? 1 : similarity.score;
    return {
      type: entry.type,
      id: entry.id,
      name: entry.name,
      entry,
      exact: Boolean(exact),
      exactSource: exact ? (exact.primary ? FREE_MATCH_SOURCE.EXACT : FREE_MATCH_SOURCE.ALIAS) : "",
      exactRaw: Boolean(exact?.raw),
      nameScore,
      inputCoverage: exact ? 1 : similarity.inputCoverage,
      targetCoverage: exact ? 1 : similarity.targetCoverage,
      score: nameScore + (nameScore > 0.3 ? bonuses(entry, context) : 0),
    };
  })
    .filter((candidate) => candidate.exact || candidate.nameScore >= 0.3)
    // A name written exactly as typed comes first; a name that matches only once the size is taken
    // out competes on score, so "Brandy 75cl" can still pick the 75 cl brandy.
    .sort((left, right) => Number(right.exactRaw) - Number(left.exactRaw) || right.score - left.score || Number(right.exact) - Number(left.exact) || left.name.localeCompare(right.name));
  return { cleaned, candidates: candidates.slice(0, limit) };
}

// Status of a row from its ranked candidates.
export function decideFreeImportMatch(candidates = []) {
  const [best, second] = candidates;
  if (!best) return { status: FREE_IMPORT_STATUS.NO_MATCH, candidate: null, source: "" };
  if (best.exact) {
    const tied = candidates.filter((candidate) => candidate.exact && candidate.exactRaw === best.exactRaw);
    if (tied.length === 1 || (second && best.score - second.score >= AUTO_GAP)) return { status: FREE_IMPORT_STATUS.CONFIRMED, candidate: best, source: best.exactSource };
    return { status: best.score - (tied[1]?.score ?? 0) >= AMBIGUOUS_GAP ? FREE_IMPORT_STATUS.SUGGESTED : FREE_IMPORT_STATUS.AMBIGUOUS, candidate: best, source: best.exactSource };
  }
  const gap = second ? best.score - second.score : 1;
  const source = best.inputCoverage >= 0.99 && best.targetCoverage >= 0.99 ? FREE_MATCH_SOURCE.FUZZY : best.inputCoverage >= AUTO_INPUT_COVERAGE ? FREE_MATCH_SOURCE.TYPO : FREE_MATCH_SOURCE.FUZZY;
  if (best.inputCoverage >= AUTO_INPUT_COVERAGE && best.targetCoverage >= AUTO_TARGET_COVERAGE && best.score >= 0.7 && gap >= AUTO_GAP) {
    return { status: FREE_IMPORT_STATUS.CONFIRMED, candidate: best, source };
  }
  if (best.score < SUGGEST_SCORE) return { status: FREE_IMPORT_STATUS.NO_MATCH, candidate: null, source: "" };
  return { status: gap >= AMBIGUOUS_GAP ? FREE_IMPORT_STATUS.SUGGESTED : FREE_IMPORT_STATUS.AMBIGUOUS, candidate: best, source };
}

// ---------- Valuing a row ----------

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Quantity in packs (product) or base units (recipe), value, and warnings, for a matched row.
export function valueFreeImportRow(row = {}, target = null, { costingContext = null } = {}) {
  if (!target) return { packs: null, value: null, conversion: null, warnings: [] };
  const unit = row.unitInfo || parseCountUnit(row.unitText);
  const warnings = [];
  if (target.type === TARGET_TYPES.RECIPE) {
    if (!costingContext) return { packs: null, value: null, conversion: { needsConversion: true }, warnings };
    const costed = costRecipe(target.id, costingContext);
    const base = costed.yieldBase?.base;
    let baseQuantity = null;
    if (unit.kind === "measure" && base === unit.base) baseQuantity = row.quantity * unit.factor;
    else if (unit.kind === "sized" && base === unit.base) baseQuantity = row.quantity * unit.size;
    else if (base === "portion" && ["none", "count"].includes(unit.kind)) baseQuantity = row.quantity * (costed.yieldBase.quantity / numberValue(target.recipe?.yieldQuantity, 1));
    if (baseQuantity === null || costed.baseCost === null || costed.baseCost === undefined) {
      return { packs: null, value: null, conversion: { needsConversion: true, recipeBase: base }, warnings };
    }
    const value = round(baseQuantity * costed.baseCost, 2);
    if (base !== "portion" && baseQuantity > MAX_BASE_QUANTITY / 2) warnings.push(`${round(baseQuantity, 2)} ${base} of a recipe is a lot — check the unit.`);
    if (!costed.complete) warnings.push("Recipe cost is incomplete.");
    return { packs: null, baseQuantity, base, unitCost: costed.baseCost, value, conversion: { base }, warnings };
  }
  const product = target.product;
  const content = row.packContent || productPackContent(product);
  const conversion = packsForCount(row.quantity, unit, content);
  if (conversion.needsConversion) return { packs: null, value: null, conversion: { ...conversion, content }, warnings };
  const unitCost = numberValue(product.unitCost);
  const packs = round(conversion.packs, 4);
  const value = round(packs * unitCost, 2);
  const average = averagePurchasePacks(product);
  if (conversion.base && conversion.base !== "each" && conversion.baseQuantity > MAX_BASE_QUANTITY) warnings.push(`${round(conversion.baseQuantity, 2)} ${conversion.base} is far above a usual count — was it g or ml?`);
  else if (average > 0 && packs > Math.max(5, average * 10)) warnings.push(`${round(packs, 2)} packs is more than 10× the usual purchase (${round(average, 1)}).`);
  if (value > MAX_LINE_VALUE) warnings.push(`£${value.toFixed(2)} on one line — check the quantity.`);
  if (!(unitCost > 0)) warnings.push("This product has no price yet.");
  return { packs, baseQuantity: conversion.baseQuantity, base: conversion.base, unitCost, value, conversion: { ...conversion, content }, warnings };
}

function targetFromCandidate(candidate) {
  if (!candidate) return null;
  return candidate.type === TARGET_TYPES.RECIPE
    ? { type: TARGET_TYPES.RECIPE, id: candidate.id, name: candidate.name, recipe: candidate.entry.recipe }
    : { type: TARGET_TYPES.PRODUCT, id: candidate.id, name: candidate.name, product: candidate.entry.product };
}

function withValuation(row, target, options) {
  const valuation = valueFreeImportRow(row, target, options);
  const needsReview = Boolean(valuation.conversion?.needsConversion) || valuation.warnings.some((warning) => !/incomplete|no price/i.test(warning));
  return {
    ...row,
    target: target ? { type: target.type, id: target.id, name: target.name, supplier: target.product?.supplier || "", packSize: target.product?.packSize || "", yieldUnit: target.recipe?.yieldUnit || "" } : null,
    ...valuation,
    strange: valuation.warnings.some((warning) => !/incomplete|no price/i.test(warning)),
    needsConversion: Boolean(valuation.conversion?.needsConversion),
    confirmed: row.status === FREE_IMPORT_STATUS.CONFIRMED && !needsReview && !row.reviewed ? true : Boolean(row.reviewed && target && !valuation.conversion?.needsConversion),
  };
}

// ---------- Sheet layout ----------

const PRODUCT_HEADERS = ["product", "products", "productname", "name", "item", "items", "description", "ingredient"];
const QUANTITY_HEADERS = ["qty", "quantity", "count", "stock", "stockquantity", "amount", "total"];
const UNIT_HEADERS = ["uni", "unit", "units", "uom", "unitofmeasure", "qtyunit", "quantityunit", "measure", "un", "und"];

function cellText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

export function detectFreeImportLayout(rows = []) {
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 10); rowIndex += 1) {
    const headers = (rows[rowIndex] || []).map((cell) => normalizeHeader(cellText(cell)));
    const product = headers.findIndex((header) => PRODUCT_HEADERS.includes(header));
    const quantity = headers.findIndex((header) => QUANTITY_HEADERS.includes(header));
    if (product >= 0 && quantity >= 0) {
      const unit = headers.findIndex((header, index) => index !== quantity && UNIT_HEADERS.includes(header));
      return { headerRow: rowIndex, product, quantity, unit };
    }
  }
  return { headerRow: -1, product: 0, quantity: 1, unit: 2 };
}

const MONEY_IN_TEXT = /£\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*£/;

function moneyValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = cellText(value);
  if (!text) return null;
  const money = MONEY_IN_TEXT.exec(text);
  if (money) return Number((money[1] || money[2]).replace(",", "."));
  return /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : null;
}

// Prep estimates beside the count ("Big freezer | £150" or "Pantry £130") from the columns after
// the count, or from rows under a "Prep estimates" title in the product column.
export function parsePrepEstimates(rows = [], layout = detectFreeImportLayout(rows)) {
  const estimates = [];
  const firstColumn = Math.max(layout.product, layout.quantity, layout.unit) + 1;
  let inBlock = false;
  rows.forEach((cells = [], rowIndex) => {
    if (rowIndex <= layout.headerRow) return;
    const productText = cellText(cells[layout.product]);
    if (/^prep(aration)?\s+estimates?\b/i.test(productText)) {
      inBlock = true;
      return;
    }
    if (inBlock) {
      if (!productText) {
        inBlock = false;
      } else {
        const value = moneyValue(cells[layout.quantity]) ?? moneyValue(productText);
        if (value !== null) {
          estimates.push({ id: `prep-${rowIndex + 1}`, rowNumber: rowIndex + 1, zone: productText.replace(MONEY_IN_TEXT, "").replace(/[-–:]\s*$/, "").trim() || "Prep", value });
          return;
        }
      }
    }
    for (let column = firstColumn; column < cells.length; column += 1) {
      const text = cellText(cells[column]);
      if (!text || typeof cells[column] === "number") continue;
      const inline = MONEY_IN_TEXT.exec(text);
      const zone = text.replace(MONEY_IN_TEXT, "").replace(/[-–:]\s*$/, "").trim();
      const value = inline ? Number((inline[1] || inline[2]).replace(",", ".")) : moneyValue(cells[column + 1]);
      if (value === null || !zone) continue;
      estimates.push({ id: `prep-${rowIndex + 1}-${column + 1}`, rowNumber: rowIndex + 1, zone, value });
      break;
    }
  });
  return estimates;
}

// ---------- Parse ----------

export function parseFreeStocktakeImport(rawRows = [], {
  products = [],
  recipes = [],
  suppliers = [],
  department = "",
  date = "",
  costingContext = null,
  index = null,
} = {}) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const layout = detectFreeImportLayout(rows);
  const matchIndex = index || createFreeImportIndex(products, recipes, { costingContext });
  const prepBlockRows = new Set();
  let inBlock = false;
  rows.forEach((cells = [], rowIndex) => {
    const text = cellText(cells[layout.product]);
    if (/^prep(aration)?\s+estimates?\b/i.test(text)) { inBlock = true; prepBlockRows.add(rowIndex); return; }
    if (inBlock && !text) inBlock = false;
    if (inBlock) prepBlockRows.add(rowIndex);
  });
  const reviewRows = [];
  let blankRows = 0;
  rows.forEach((cells = [], rowIndex) => {
    if (rowIndex <= layout.headerRow || prepBlockRows.has(rowIndex)) return;
    const rowNumber = rowIndex + 1;
    const productText = cellText(cells[layout.product]);
    const count = parseCountQuantity(cells[layout.quantity]);
    if (!productText) {
      if (count.hasCount) blankRows += 1;
      return;
    }
    const unitText = count.unitText || cellText(cells[layout.unit]);
    const base = { id: `free-row-${rowNumber}`, rowNumber, productText, quantityText: cellText(cells[layout.quantity]), unitText };
    if (!count.hasCount) {
      if (count.invalid) reviewRows.push({ ...base, quantity: null, status: FREE_IMPORT_STATUS.INVALID, confirmed: false, warnings: ["The quantity is not a number."] });
      else blankRows += 1;
      return;
    }
    const unitInfo = parseCountUnit(unitText);
    const { cleaned, candidates } = rankFreeImportCandidates(productText, matchIndex, { suppliers, unit: unitInfo, department, date });
    const decision = decideFreeImportMatch(candidates);
    const row = {
      ...base,
      quantity: count.quantity,
      unitInfo,
      cleanedName: cleaned.name,
      nameSize: cleaned.size,
      nameSupplier: cleaned.supplier,
      status: decision.status,
      source: decision.source,
      confidence: decision.candidate ? Math.max(0, Math.min(1, decision.candidate.score)) : 0,
      candidates: candidates.map((candidate) => ({ type: candidate.type, id: candidate.id, name: candidate.name, score: Math.max(0, Math.min(1, candidate.score)), supplier: candidate.entry.product?.supplier || "", packSize: candidate.entry.product?.packSize || "" })),
      ignored: false,
      reviewed: false,
    };
    reviewRows.push(withValuation(row, targetFromCandidate(decision.candidate), { costingContext }));
  });
  return {
    kind: "free",
    layout,
    reviewRows: markRepeatedRows(reviewRows),
    prepEstimates: parsePrepEstimates(rows, layout),
    blankRows,
    totalRows: Math.max(0, rows.length - layout.headerRow - 1),
  };
}

// Rows counting the same product or recipe in different zones are summed when applied.
export function markRepeatedRows(rows = []) {
  const counts = new Map();
  rows.forEach((row) => {
    if (!row.target || row.ignored) return;
    const key = `${row.target.type}:${row.target.id}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return rows.map((row) => ({ ...row, repeatCount: row.target && !row.ignored ? counts.get(`${row.target.type}:${row.target.id}`) || 1 : 1 }));
}

// ---------- Review actions ----------

function findTarget(type, id, { products = [], recipes = [] } = {}) {
  if (type === TARGET_TYPES.RECIPE) {
    const recipe = recipes.find((candidate) => candidate.id === id);
    return recipe ? { type, id, name: recipe.name || "", recipe: upgradeRecipe(recipe) } : null;
  }
  const product = products.find((candidate) => candidate.id === id);
  return product ? { type: TARGET_TYPES.PRODUCT, id, name: product.name || product.productName || "", product } : null;
}

// The user picked (or confirmed) a product or recipe for a row.
export function chooseFreeImportTarget(rows = [], rowId, { type = TARGET_TYPES.PRODUCT, id = "", product = null } = {}, { products = [], recipes = [], costingContext = null } = {}) {
  const next = rows.map((row) => {
    if (row.id !== rowId) return row;
    const target = product ? { type: TARGET_TYPES.PRODUCT, id: product.id, name: product.name || "", product } : findTarget(type, id, { products, recipes });
    if (!target) return row;
    const sameTarget = row.target && row.target.type === target.type && row.target.id === target.id;
    const updated = { ...row, ignored: false, reviewed: true, status: FREE_IMPORT_STATUS.CONFIRMED, source: sameTarget && row.source ? row.source : FREE_MATCH_SOURCE.MANUAL, packContent: sameTarget ? row.packContent : undefined };
    return withValuation(updated, target, { costingContext });
  });
  return markRepeatedRows(next);
}

// "1 pack = 2.5 kg" for a product whose pack content is unknown.
export function setFreeImportPackContent(rows = [], rowId, content = {}, { products = [], recipes = [], costingContext = null } = {}) {
  const quantity = numberValue(content.quantity);
  if (!(quantity > 0) || !BASES.includes(content.base)) return rows;
  return rows.map((row) => {
    if (row.id !== rowId || !row.target) return row;
    const target = findTarget(row.target.type, row.target.id, { products, recipes });
    return withValuation({ ...row, packContent: { quantity, base: content.base, source: "stocktake" }, reviewed: true, status: FREE_IMPORT_STATUS.CONFIRMED }, target, { costingContext });
  });
}

// Confirms a row as it stands, including a strange value the user has checked.
export function acceptFreeImportRow(rows = [], rowId) {
  return rows.map((row) => (row.id === rowId && row.target && !row.needsConversion
    ? { ...row, reviewed: true, confirmed: true, status: FREE_IMPORT_STATUS.CONFIRMED }
    : row));
}

export function ignoreFreeImportRow(rows = [], rowId, ignored = true) {
  return markRepeatedRows(rows.map((row) => (row.id === rowId ? { ...row, ignored } : row)));
}

// "Confirm all suggested ≥ X": rows with a match, no strange value and no conversion to answer.
export function confirmSuggestedAbove(rows = [], minimum = 0.8) {
  return rows.map((row) => (!row.ignored && !row.confirmed && row.target && !row.needsConversion && !row.strange
    && [FREE_IMPORT_STATUS.SUGGESTED, FREE_IMPORT_STATUS.AMBIGUOUS].includes(row.status) && row.confidence >= minimum
    ? { ...row, reviewed: true, confirmed: true, status: FREE_IMPORT_STATUS.CONFIRMED }
    : row));
}

export const FREE_IMPORT_FILTERS = Object.freeze({
  ALL: "all",
  CONFIRMED: "confirmed",
  REVIEW: "review",
  NO_MATCH: "no_match",
  STRANGE: "strange",
});

export function freeImportRowFilter(row = {}, filter = FREE_IMPORT_FILTERS.ALL) {
  if (filter === FREE_IMPORT_FILTERS.CONFIRMED) return Boolean(row.confirmed) && !row.ignored;
  if (filter === FREE_IMPORT_FILTERS.REVIEW) return !row.confirmed && !row.ignored && Boolean(row.target);
  if (filter === FREE_IMPORT_FILTERS.NO_MATCH) return !row.confirmed && !row.ignored && !row.target;
  if (filter === FREE_IMPORT_FILTERS.STRANGE) return Boolean(row.strange) && !row.ignored;
  return true;
}

export function freeImportSummary(rows = [], prepEstimates = []) {
  const active = rows.filter((row) => !row.ignored && row.status !== FREE_IMPORT_STATUS.INVALID);
  const confirmed = active.filter((row) => row.confirmed);
  const automatic = active.filter((row) => row.confirmed && !row.reviewed);
  return {
    rows: rows.length,
    confirmed: confirmed.length,
    automatic: automatic.length,
    automaticShare: active.length ? automatic.length / active.length : 0,
    review: active.filter((row) => !row.confirmed && row.target).length,
    noMatch: active.filter((row) => !row.confirmed && !row.target).length,
    strange: active.filter((row) => row.strange).length,
    ignored: rows.filter((row) => row.ignored).length,
    invalid: rows.filter((row) => row.status === FREE_IMPORT_STATUS.INVALID).length,
    productValue: round(confirmed.filter((row) => row.target?.type === TARGET_TYPES.PRODUCT).reduce((sum, row) => sum + numberValue(row.value), 0), 2),
    recipeValue: round(confirmed.filter((row) => row.target?.type === TARGET_TYPES.RECIPE).reduce((sum, row) => sum + numberValue(row.value), 0), 2),
    estimateValue: round(prepEstimates.reduce((sum, estimate) => sum + numberValue(estimate.value), 0), 2),
  };
}

// ---------- Apply ----------

// Product count lines (summed per product) and recipe prep lines from the confirmed rows.
export function freeImportResult(rows = [], { products = [], department = "", prepEstimates = [] } = {}) {
  const byProduct = new Map();
  const byRecipe = new Map();
  rows.forEach((row) => {
    if (!row.confirmed || row.ignored || !row.target) return;
    if (row.target.type === TARGET_TYPES.PRODUCT && row.packs !== null && row.packs !== undefined) {
      const current = byProduct.get(row.target.id) || { packs: 0, rows: [] };
      current.packs += numberValue(row.packs);
      current.rows.push(row);
      byProduct.set(row.target.id, current);
    }
    if (row.target.type === TARGET_TYPES.RECIPE && row.value !== null && row.value !== undefined) {
      const current = byRecipe.get(row.target.id) || { quantity: 0, value: 0, rows: [], base: row.base, unitCost: row.unitCost, name: row.target.name };
      current.quantity += numberValue(row.baseQuantity);
      current.value += numberValue(row.value);
      current.rows.push(row);
      byRecipe.set(row.target.id, current);
    }
  });
  const entries = [...byProduct.entries()].flatMap(([productId, group]) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return [];
    const entry = stocktakeEntryFromProduct(product, round(group.packs, 4), { department, rowNumber: group.rows[0].rowNumber, source: "external_import" });
    return [{
      ...entry,
      importedFrom: group.rows.map((row) => `${row.productText} ${row.quantityText}${row.unitText && !/[a-z]/i.test(row.quantityText) ? ` ${row.unitText}` : ""}`.trim()),
      matchStatus: group.rows.length > 1 ? `Imported from ${group.rows.length} lines` : "Matched by stocktake import",
    }];
  });
  const recipePrep = [...byRecipe.entries()].map(([recipeId, group]) => recipePrepLine({
    recipeId, recipeName: group.name, quantity: round(group.quantity, 4), unit: group.base, unitCost: group.unitCost, department,
    importedFrom: group.rows.map((row) => `${row.productText} ${row.quantityText} ${row.unitText}`.trim()),
  }));
  const estimates = prepEstimates.map((estimate) => estimatePrepLine({ zone: estimate.zone, value: estimate.value, department }));
  return { entries, prepLines: [...recipePrep, ...estimates] };
}

// Names the user confirmed (typo, similar or chosen by hand) that become aliases of the product,
// so next month they match on their own. Only adds; existing names and aliases are untouched.
export function learnedAliases(rows = [], products = []) {
  const additions = new Map();
  rows.forEach((row) => {
    if (!row.confirmed || row.ignored || row.target?.type !== TARGET_TYPES.PRODUCT) return;
    if ([FREE_MATCH_SOURCE.EXACT, FREE_MATCH_SOURCE.ALIAS].includes(row.source)) return;
    const product = products.find((candidate) => candidate.id === row.target.id);
    const text = String(row.productText || "").trim();
    if (!product || !text) return;
    const known = new Set([...productAliases(product), ...(additions.get(product.id) || [])].map(normalizeProductName));
    if (known.has(normalizeProductName(text))) return;
    additions.set(product.id, [...(additions.get(product.id) || []), text]);
  });
  return additions;
}

export function productsWithLearnedAliases(products = [], additions = new Map()) {
  if (!additions.size) return products;
  return products.map((product) => (additions.has(product.id)
    ? { ...product, aliases: [...(product.aliases || []), ...additions.get(product.id)] }
    : product));
}

// ---------- Prep lines ----------

let prepCounter = 0;
const prepId = () => `prep-${Date.now().toString(36)}-${(prepCounter += 1).toString(36)}`;

export const PREP_LINE_TYPES = Object.freeze({ RECIPE: "recipe", ESTIMATE: "estimate" });

export function recipePrepLine({ recipeId = "", recipeName = "", quantity = 0, unit = "kg", unitCost = 0, department = "", importedFrom = undefined } = {}) {
  return {
    id: prepId(), type: PREP_LINE_TYPES.RECIPE, recipeId, recipeName, quantity: numberValue(quantity), unit,
    unitCost: numberValue(unitCost), value: round(numberValue(quantity) * numberValue(unitCost), 2), department,
    ...(importedFrom ? { importedFrom } : {}),
  };
}

export function estimatePrepLine({ zone = "", value = 0, department = "" } = {}) {
  return { id: prepId(), type: PREP_LINE_TYPES.ESTIMATE, zone: String(zone).trim() || "Prep", value: round(numberValue(value), 2), department, estimate: true };
}

// Re-values a recipe prep line in another unit or quantity from the recipe cost.
export function valueRecipePrep(line = {}, costingContext = null) {
  if (!costingContext) return line;
  const costed = costRecipe(line.recipeId, costingContext);
  if (costed.missing || costed.baseCost === null || costed.baseCost === undefined) return line;
  const base = costed.yieldBase.base;
  const unit = String(line.unit || base).toLowerCase();
  const measure = measureForWord(unit);
  let baseQuantity = null;
  if (base === "portion") baseQuantity = numberValue(line.quantity) * (costed.yieldBase.quantity / numberValue(costingContext.recipes.find((recipe) => recipe.id === line.recipeId)?.yieldQuantity, 1));
  else if (measure && measure.base === base) baseQuantity = numberValue(line.quantity) * measure.factor;
  if (baseQuantity === null) return { ...line, value: null, unitCost: costed.baseCost };
  return { ...line, unitCost: costed.baseCost, value: round(baseQuantity * costed.baseCost, 2) };
}

export function prepTotals(prepLines = []) {
  const lines = Array.isArray(prepLines) ? prepLines : [];
  return {
    recipe: round(lines.filter((line) => line.type === PREP_LINE_TYPES.RECIPE).reduce((sum, line) => sum + numberValue(line.value), 0), 2),
    estimate: round(lines.filter((line) => line.type === PREP_LINE_TYPES.ESTIMATE).reduce((sum, line) => sum + numberValue(line.value), 0), 2),
  };
}

// Recipe prep lines merged by recipe (an imported count replaces the same recipe's line), and
// estimates by zone.
export function mergePrepLines(existing = [], imported = []) {
  const next = existing.map((line) => ({ ...line }));
  imported.forEach((line) => {
    const index = next.findIndex((current) => current.type === line.type && (line.type === PREP_LINE_TYPES.RECIPE
      ? current.recipeId === line.recipeId
      : normalizeProductName(current.zone) === normalizeProductName(line.zone)));
    if (index >= 0) next[index] = { ...next[index], ...line, id: next[index].id };
    else next.push({ ...line });
  });
  return next;
}

// Applies imported product counts to the stocktake. A count applied earlier from the same import
// (rows confirmed in two goes) is added to; any other existing count of the product is replaced,
// as the template import does.
export function mergeImportedCounts(existingLines = [], entries = [], importBatch = "") {
  const next = existingLines.map((line) => ({ ...line }));
  entries.forEach((entry) => {
    const index = next.findIndex((line) => (line.matchedProductId || line.productId) === entry.matchedProductId);
    const stamped = { ...entry, importBatch };
    if (index < 0) {
      next.push(stamped);
      return;
    }
    const current = next[index];
    if (importBatch && current.importBatch === importBatch) {
      const quantity = Math.round((numberValue(current.quantity) + numberValue(entry.quantity)) * 10000) / 10000;
      next[index] = {
        ...current,
        quantity,
        stockValue: quantity * numberValue(current.unitCost),
        importedFrom: [...(current.importedFrom || []), ...(entry.importedFrom || [])],
        matchStatus: `Imported from ${(current.importedFrom || []).length + (entry.importedFrom || []).length} lines`,
      };
      return;
    }
    next[index] = { ...current, ...stamped, id: current.id || entry.id };
  });
  return next;
}
