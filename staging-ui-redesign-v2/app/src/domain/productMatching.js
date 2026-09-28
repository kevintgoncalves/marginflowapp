import { normalizeHeader } from "./numberUtils.js";

export const PRODUCT_NAME_MATCH_TYPES = Object.freeze({
  EXACT_NAME: "exact_name",
  ALIAS: "alias",
  FUZZY: "fuzzy",
  AMBIGUOUS: "ambiguous",
  NONE: "none",
});

export function normalizeProductName(value = "") {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function compactPlural(token) {
  if (token.endsWith("ies") && token.length > 4) return `${token.slice(0, -3)}y`;
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) return token.slice(0, -1);
  return token;
}

export function productTokens(value = "") {
  return normalizeProductName(value).split(/\s+/).filter(Boolean).map(compactPlural);
}

export function orderedProductKey(value = "") {
  return productTokens(value).join("");
}

export function unorderedProductKey(value = "") {
  return [...productTokens(value)].sort().join("");
}

export function productAliases(product = {}) {
  return [product.name, product.productName, ...(product.aliases || [])].filter(Boolean);
}

export function productSimilarity(left = "", right = "") {
  const leftTokens = new Set(productTokens(left));
  const rightTokens = new Set(productTokens(right));
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;
  const jaccard = intersection / union;
  const leftOrdered = orderedProductKey(left);
  const rightOrdered = orderedProductKey(right);
  const containsOrdered = leftOrdered && rightOrdered && (leftOrdered.includes(rightOrdered) || rightOrdered.includes(leftOrdered));
  return Math.max(jaccard, containsOrdered ? 0.72 : 0);
}

function canonicalUnit(value = "") {
  return normalizeHeader(value)
    .replace(/litres?|ltr/g, "l")
    .replace(/millilitres?|mls/g, "ml")
    .replace(/grams?/g, "g")
    .replace(/kilograms?|kilos?|kgs/g, "kg")
    .replace(/pieces?|units?/g, "each");
}

export function unitsCompatible(left = "", right = "") {
  const leftUnit = canonicalUnit(left);
  const rightUnit = canonicalUnit(right);
  return !leftUnit || !rightUnit || leftUnit === rightUnit;
}

function measureSignatures(value = "") {
  const signatures = [];
  const source = String(value || "").toLowerCase();
  const pattern = /(\d+(?:\.\d+)?)\s*(millilitres?|ml|centilitres?|cl|litres?|ltr|l|kilograms?|kgs?|kg|grams?|g)\b/g;
  let match = pattern.exec(source);
  while (match) {
    const amount = String(Number(match[1]));
    const unit = canonicalUnit(match[2]);
    signatures.push(`${amount}${unit}`);
    match = pattern.exec(source);
  }
  return [...new Set(signatures)];
}

export function packSizesCompatible(left = "", right = "") {
  const leftPack = normalizeHeader(left);
  const rightPack = normalizeHeader(right);
  if (!leftPack || !rightPack) return true;
  if (leftPack === rightPack) return true;
  const leftMeasures = measureSignatures(left);
  const rightMeasures = measureSignatures(right);
  if (leftMeasures.length && rightMeasures.length) {
    return leftMeasures.some((signature) => rightMeasures.includes(signature));
  }
  return leftPack.includes(rightPack) || rightPack.includes(leftPack);
}

function sameOrganisation(row = {}, organisationId = "") {
  if (!organisationId) return true;
  const rowOrganisationId = row.organisationId || row.organizationId || row.companyId || row.company_id || "";
  return !rowOrganisationId || rowOrganisationId === organisationId;
}

function productPackDescriptor(product = {}) {
  return product.packSize || product.pack_size || product.packageSize || product.name || product.productName || "";
}

function productUnit(product = {}) {
  return product.unit || product.unitOfMeasure || product.unit_of_measure || product.baseUnit || product.base_unit || "";
}

function indexedProduct(product = {}) {
  const primaryNames = [product.name, product.productName].filter(Boolean);
  const aliases = productAliases(product).map((alias) => ({
    value: alias,
    normalized: normalizeProductName(alias),
    ordered: orderedProductKey(alias),
    unordered: unorderedProductKey(alias),
    primary: primaryNames.some((name) => normalizeProductName(name) === normalizeProductName(alias)),
  }));
  return {
    product,
    aliases,
    packDescriptor: productPackDescriptor(product),
    unit: productUnit(product),
  };
}

export function createProductMatchIndex(products = [], { organisationId = "" } = {}) {
  return {
    entries: products
      .filter((product) => product.active !== false && sameOrganisation(product, organisationId))
      .map(indexedProduct),
    organisationId,
  };
}

function productIndex(productsOrIndex = [], options = {}) {
  return Array.isArray(productsOrIndex) ? createProductMatchIndex(productsOrIndex, options) : productsOrIndex;
}

function scoreIndexedProduct(entry, input, { unit = "", packSize = "" } = {}) {
  const normalizedInput = normalizeProductName(input);
  const orderedInput = orderedProductKey(input);
  const inputPack = packSize || (measureSignatures(input).length ? input : "");
  const aliasScore = Math.max(...entry.aliases.map((alias) => {
    if (alias.normalized === normalizedInput) return 1;
    if (alias.normalized.startsWith(normalizedInput) || alias.normalized.includes(normalizedInput)) return 0.86;
    if (orderedInput && (alias.ordered.startsWith(orderedInput) || alias.ordered.includes(orderedInput))) return 0.82;
    return productSimilarity(input, alias.value);
  }), 0);
  const unitMatch = unitsCompatible(unit, entry.unit);
  const packMatch = packSizesCompatible(inputPack, entry.packDescriptor);
  const score = Math.max(0, Math.min(1, aliasScore + (unitMatch ? 0.02 : -0.2) + (packMatch ? 0.04 : -0.3)));
  return {
    product: entry.product,
    score,
    unitConflict: Boolean(unit && entry.unit && !unitMatch),
    packSizeConflict: Boolean(inputPack && entry.packDescriptor && !packMatch),
  };
}

function uniqueCandidates(candidates = []) {
  const byId = new Map();
  candidates.forEach((candidate) => {
    if (!candidate.product?.id) return;
    const existing = byId.get(candidate.product.id);
    if (!existing || candidate.score > existing.score) byId.set(candidate.product.id, candidate);
  });
  return [...byId.values()];
}

export function rankProductCandidates(input = "", productsOrIndex = [], {
  organisationId = "",
  unit = "",
  packSize = "",
  limit = 5,
  minimumScore = 0.2,
} = {}) {
  const index = productIndex(productsOrIndex, { organisationId });
  if (!normalizeProductName(input)) return [];
  return uniqueCandidates(index.entries.map((entry) => scoreIndexedProduct(entry, input, { unit, packSize })))
    .filter((candidate) => candidate.score >= minimumScore)
    .sort((left, right) => right.score - left.score || String(left.product.name || "").localeCompare(String(right.product.name || "")))
    .slice(0, limit);
}

export function matchProductName(input = "", productsOrIndex = [], {
  organisationId = "",
  unit = "",
  packSize = "",
  strongThreshold = 0.74,
  suggestThreshold = 0.45,
  ambiguityGap = 0.2,
  autoSelectFuzzy = true,
  candidateLimit = 5,
} = {}) {
  const index = productIndex(productsOrIndex, { organisationId });
  const normalizedInput = normalizeProductName(input);
  if (!normalizedInput) return { match: null, confidence: 0, matchType: PRODUCT_NAME_MATCH_TYPES.NONE, candidates: [] };
  const orderedInput = orderedProductKey(input);
  const unorderedInput = unorderedProductKey(input);
  const exact = [];
  const normalized = [];

  index.entries.forEach((entry) => {
    entry.aliases.forEach((alias) => {
      if (alias.normalized === normalizedInput) {
        exact.push({ product: entry.product, matchType: alias.primary ? PRODUCT_NAME_MATCH_TYPES.EXACT_NAME : PRODUCT_NAME_MATCH_TYPES.ALIAS, score: 1, entry });
      } else if ((alias.ordered && alias.ordered === orderedInput) || (alias.unordered && alias.unordered === unorderedInput)) {
        normalized.push({ product: entry.product, matchType: alias.primary ? PRODUCT_NAME_MATCH_TYPES.EXACT_NAME : PRODUCT_NAME_MATCH_TYPES.ALIAS, score: 0.94, entry });
      }
    });
  });

  const compatibleExact = uniqueCandidates([...exact, ...normalized].map((candidate) => {
    const scored = scoreIndexedProduct(candidate.entry, input, { unit, packSize });
    return { ...candidate, ...scored };
  })).filter((candidate) => !candidate.unitConflict && !candidate.packSizeConflict);
  if (compatibleExact.length === 1) {
    const winner = compatibleExact[0];
    return { match: winner.product, confidence: winner.score, matchType: winner.matchType, candidates: compatibleExact };
  }
  if (compatibleExact.length > 1) {
    return { match: null, confidence: compatibleExact[0].score, matchType: PRODUCT_NAME_MATCH_TYPES.AMBIGUOUS, candidates: compatibleExact.slice(0, candidateLimit) };
  }

  const candidates = rankProductCandidates(input, index, { unit, packSize, limit: candidateLimit, minimumScore: suggestThreshold });
  const best = candidates[0];
  const second = candidates[1];
  if (!best) return { match: null, confidence: 0, matchType: PRODUCT_NAME_MATCH_TYPES.NONE, candidates: [] };
  if (second && Math.abs(best.score - second.score) < ambiguityGap) {
    return { match: null, confidence: best.score, matchType: PRODUCT_NAME_MATCH_TYPES.AMBIGUOUS, candidates };
  }
  if (best.score >= strongThreshold && !best.unitConflict && !best.packSizeConflict) {
    return { match: autoSelectFuzzy ? best.product : null, confidence: best.score, matchType: PRODUCT_NAME_MATCH_TYPES.FUZZY, candidates };
  }
  return { match: null, confidence: best.score, matchType: PRODUCT_NAME_MATCH_TYPES.NONE, candidates };
}

export function findProductDuplicateCandidates(products = [], candidate = {}, { organisationId = "", threshold = 0.72 } = {}) {
  const name = candidate.name || candidate.productName || "";
  const packSize = candidate.packSize || candidate.pack_size || "";
  const unit = candidate.unit || candidate.unitOfMeasure || candidate.unit_of_measure || "";
  return rankProductCandidates(name, products, { organisationId, unit, packSize, limit: products.length || 5, minimumScore: 0 })
    .filter((entry) => entry.score >= threshold)
    .map((entry) => ({ ...entry, packMatch: !entry.packSizeConflict, unitMatch: !entry.unitConflict }));
}
