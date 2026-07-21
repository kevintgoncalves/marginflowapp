import { normalizeHeader, numberValue } from "./numberUtils.js";

export const PRODUCT_MATCH_SOURCES = {
  SUPPLIER_CODE: "supplier_code_mapping",
  SUPPLIER_DESCRIPTION: "supplier_description_mapping",
  EXACT_PRODUCT: "exact_product_match",
  FUZZY_PRODUCT: "fuzzy_product_match",
  USER_SELECTED: "user_selected",
  NEW_PRODUCT: "new_product",
  NONE: "no_product_match",
};

export function normalizeSupplierProductCode(value = "") {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, "");
}

export function normalizeSupplierDescription(value = "") {
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
  return normalizeSupplierDescription(value)
    .split(/\s+/)
    .filter(Boolean)
    .map(compactPlural);
}

function orderedProductKey(value = "") {
  return productTokens(value).join("");
}

function unorderedProductKey(value = "") {
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
  const ordered = orderedProductKey(left);
  const otherOrdered = orderedProductKey(right);
  const containsOrdered = ordered && otherOrdered && (ordered.includes(otherOrdered) || otherOrdered.includes(ordered));
  return Math.max(jaccard, containsOrdered ? 0.72 : 0);
}

function sameOrganisation(row = {}, organisationId = "") {
  if (!organisationId) return true;
  const rowOrganisationId = row.organisationId || row.organizationId || row.companyId || row.company_id || "";
  return !rowOrganisationId || rowOrganisationId === organisationId;
}

function sameSupplier(row = {}, supplierId = "", supplierName = "") {
  if (!supplierId && !supplierName) return true;
  if (supplierId && (row.supplierId || row.supplier_id) === supplierId) return true;
  const rowSupplierName = normalizeHeader(row.supplierName || row.supplier || "");
  return Boolean(supplierName && rowSupplierName && rowSupplierName === normalizeHeader(supplierName));
}

function canonicalUnit(value = "") {
  return normalizeHeader(value).replace(/litre|litres|ltr/g, "l").replace(/grams/g, "g").replace(/kilos|kilo/g, "kg");
}

export function unitsCompatible(left = "", right = "") {
  const leftUnit = canonicalUnit(left);
  const rightUnit = canonicalUnit(right);
  return !leftUnit || !rightUnit || leftUnit === rightUnit;
}

export function packSizesCompatible(left = "", right = "") {
  const leftPack = normalizeHeader(left);
  const rightPack = normalizeHeader(right);
  return !leftPack || !rightPack || leftPack === rightPack || leftPack.includes(rightPack) || rightPack.includes(leftPack);
}

function mappingProduct(mapping = {}, products = []) {
  const productId = mapping.productId || mapping.product_id || "";
  return products.find((product) => product.id === productId) || (productId ? { id: productId, name: mapping.productName || mapping.product_name || "" } : null);
}

function allocationFromMapping(mapping = {}) {
  if (!mapping) return {};
  const splitLines = Array.isArray(mapping.departmentSplits || mapping.splitRule || mapping.splitLines)
    ? (mapping.departmentSplits || mapping.splitRule || mapping.splitLines)
    : [];
  const department = mapping.department || mapping.departmentName || mapping.destination || "";
  const allocationMode = mapping.allocationMode || mapping.allocation_mode || (splitLines.length > 1 ? "Split" : "Single");
  return {
    allocationMode,
    department,
    departmentMode: allocationMode === "Split" ? "Split" : "Single",
    departmentSplits: splitLines,
  };
}

function resultFromProduct({
  product,
  source,
  confidence,
  needsReview = false,
  reviewReasons = [],
  suggestedProducts = [],
  mapping = null,
} = {}) {
  return {
    matchedProductId: product?.id || null,
    matchedProductName: product?.name || product?.productName || null,
    productMatchSource: source,
    productMatchConfidence: Number.isFinite(confidence) ? confidence : null,
    suggestedProducts,
    needsReview,
    reviewReasons,
    allocationSource: mapping ? "learned_mapping" : null,
    learnedMappingId: mapping?.id || null,
    ...allocationFromMapping(mapping),
  };
}

function scoreProduct(product, rawDescription, productName) {
  return Math.max(
    ...productAliases(product).map((alias) => Math.max(productSimilarity(rawDescription, alias), productSimilarity(productName, alias))),
    0,
  );
}

export function findProductDuplicateCandidates(products = [], candidate = {}, { organisationId = "", threshold = 0.72 } = {}) {
  const name = candidate.name || candidate.productName || "";
  const packSize = candidate.packSize || "";
  const unit = candidate.unit || candidate.unitOfMeasure || "";
  return products
    .filter((product) => sameOrganisation(product, organisationId))
    .map((product) => {
      const nameScore = Math.max(...productAliases(product).map((alias) => productSimilarity(name, alias)), 0);
      const packMatch = packSizesCompatible(packSize, product.packSize);
      const unitMatch = unitsCompatible(unit, product.unit || product.unitOfMeasure);
      const score = nameScore + (packMatch ? 0.08 : -0.16) + (unitMatch ? 0.04 : -0.18);
      return { product, score: Math.max(0, Math.min(1, score)), packMatch, unitMatch };
    })
    .filter((entry) => entry.score >= threshold)
    .sort((a, b) => b.score - a.score || (a.product.name || "").localeCompare(b.product.name || ""));
}

export function matchInvoiceLineToExistingProduct({
  organisationId = "",
  supplierId = "",
  supplierName = "",
  supplierProductCode = "",
  rawDescription = "",
  productName = "",
  unitOfMeasure = "",
  packSize = "",
  existingProducts = [],
  supplierMappings = [],
  autoMatchThreshold = 0.92,
  suggestThreshold = 0.75,
} = {}) {
  const products = existingProducts.filter((product) => sameOrganisation(product, organisationId) && product.active !== false);
  const mappings = supplierMappings.filter((mapping) => (
    mapping.active !== false
    && sameOrganisation(mapping, organisationId)
    && sameSupplier(mapping, supplierId, supplierName)
  ));
  const normalizedCode = normalizeSupplierProductCode(supplierProductCode);
  const normalizedDescription = normalizeSupplierDescription(rawDescription || productName);

  if (normalizedCode) {
    const mapping = mappings.find((candidate) => (
      candidate.autoApply !== false
      && normalizeSupplierProductCode(candidate.normalizedSupplierProductCode || candidate.supplierProductCode || candidate.supplier_product_code) === normalizedCode
    ));
    const product = mappingProduct(mapping, products);
    if (mapping && product) {
      return resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.SUPPLIER_CODE, confidence: 1, mapping });
    }
  }

  if (normalizedDescription) {
    const mapping = mappings.find((candidate) => {
      const mappingDescription = normalizeSupplierDescription(candidate.normalizedSupplierDescription || candidate.supplierDescription || candidate.supplier_description);
      if (!mappingDescription || mappingDescription !== normalizedDescription) return false;
      if (candidate.autoApply === false) return false;
      const confirmationCount = numberValue(candidate.confirmationCount ?? candidate.confirmation_count, 0);
      const hasCode = normalizeSupplierProductCode(candidate.normalizedSupplierProductCode || candidate.supplierProductCode || candidate.supplier_product_code);
      return hasCode || confirmationCount >= 2 || candidate.descriptionAutoApply === true;
    });
    const product = mappingProduct(mapping, products);
    if (mapping && product && unitsCompatible(unitOfMeasure, mapping.unitOfMeasure || mapping.unit_of_measure) && packSizesCompatible(packSize, mapping.packSize || mapping.pack_size)) {
      return resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.SUPPLIER_DESCRIPTION, confidence: 0.98, mapping });
    }
  }

  const exactMatches = products.filter((product) => productAliases(product).some((alias) => {
    const aliasText = normalizeSupplierDescription(alias);
    return aliasText && aliasText === normalizeSupplierDescription(productName || rawDescription);
  }));
  const compatibleExactMatches = exactMatches.filter((product) => (
    unitsCompatible(unitOfMeasure, product.unit || product.unitOfMeasure)
    && packSizesCompatible(packSize, product.packSize)
  ));
  if (compatibleExactMatches.length === 1) {
    return resultFromProduct({
      product: compatibleExactMatches[0],
      source: PRODUCT_MATCH_SOURCES.EXACT_PRODUCT,
      confidence: 1,
    });
  }

  const normalizedMatches = products.filter((product) => productAliases(product).some((alias) => {
    const aliasOrdered = orderedProductKey(alias);
    const targetOrdered = orderedProductKey(productName || rawDescription);
    const aliasUnordered = unorderedProductKey(alias);
    const targetUnordered = unorderedProductKey(productName || rawDescription);
    return (aliasOrdered && aliasOrdered === targetOrdered) || (aliasUnordered && aliasUnordered === targetUnordered);
  }));
  const compatibleNormalized = normalizedMatches.filter((product) => (
    unitsCompatible(unitOfMeasure, product.unit || product.unitOfMeasure)
    && packSizesCompatible(packSize, product.packSize)
  ));
  if (compatibleNormalized.length === 1) {
    return resultFromProduct({
      product: compatibleNormalized[0],
      source: PRODUCT_MATCH_SOURCES.EXACT_PRODUCT,
      confidence: 0.94,
    });
  }

  const scored = products
    .map((product) => {
      const baseScore = scoreProduct(product, rawDescription, productName);
      const unitMatch = unitsCompatible(unitOfMeasure, product.unit || product.unitOfMeasure);
      const packMatch = packSizesCompatible(packSize, product.packSize);
      const score = Math.max(0, Math.min(1, baseScore + (packMatch ? 0.04 : -0.12) + (unitMatch ? 0.02 : -0.14)));
      return { product, score, unitConflict: !unitMatch, packSizeConflict: !packMatch };
    })
    .filter((entry) => entry.score >= suggestThreshold)
    .sort((a, b) => b.score - a.score || (a.product.name || "").localeCompare(b.product.name || ""));

  const best = scored[0];
  const second = scored[1];
  if (best && best.score >= autoMatchThreshold && (!second || best.score - second.score >= 0.04) && !best.unitConflict && !best.packSizeConflict) {
    return resultFromProduct({
      product: best.product,
      source: PRODUCT_MATCH_SOURCES.FUZZY_PRODUCT,
      confidence: Number(best.score.toFixed(2)),
    });
  }

  if (best) {
    return {
      matchedProductId: null,
      matchedProductName: null,
      productMatchSource: PRODUCT_MATCH_SOURCES.NONE,
      productMatchConfidence: Number(best.score.toFixed(2)),
      suggestedProducts: scored.slice(0, 5).map((entry) => ({
        id: entry.product.id,
        name: entry.product.name || entry.product.productName,
        score: Number(entry.score.toFixed(2)),
        packSize: entry.product.packSize || "",
        supplier: entry.product.supplier || "",
      })),
      needsReview: true,
      reviewReasons: [second && Math.abs(best.score - second.score) < 0.08 ? "ambiguous_product_match" : "no_confirmed_product_match"],
      allocationSource: null,
    };
  }

  return {
    matchedProductId: null,
    matchedProductName: null,
    productMatchSource: PRODUCT_MATCH_SOURCES.NONE,
    productMatchConfidence: null,
    suggestedProducts: [],
    needsReview: true,
    reviewReasons: ["no_confirmed_product_match"],
    allocationSource: null,
  };
}
