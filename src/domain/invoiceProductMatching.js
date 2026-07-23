import { normalizeHeader, numberValue } from "./numberUtils.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";
import { invoiceLearningDebug } from "./invoiceLearningDiagnostics.js";

export const PRODUCT_MATCH_SOURCES = {
  SUPPLIER_CODE: "supplier_code",
  LEARNED_RULE: "learned_rule",
  SUPPLIER_MAPPING: "supplier_mapping",
  BARCODE: "barcode",
  EXACT_NAME: "exact_name",
  ALIAS: "alias",
  DETERMINISTIC_MATCH: "deterministic_match",
  FUZZY_MATCH: "fuzzy_match",
  MANUAL_SELECTION: "manual_selection",
  NEW_PRODUCT: "new_product",
  NONE: "no_product_match",
};

export const LEGACY_PRODUCT_MATCH_SOURCES = {
  SUPPLIER_CODE: "supplier_code_mapping",
  SUPPLIER_DESCRIPTION: "supplier_description_mapping",
  EXACT_PRODUCT: "exact_product_match",
  FUZZY_PRODUCT: "fuzzy_product_match",
  USER_SELECTED: "user_selected",
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
  const rowSupplierId = row.supplierId || row.supplier_id || "";
  if (supplierId && rowSupplierId) return rowSupplierId === supplierId;
  const rowSupplierName = normalizeHeader(row.supplierName || row.supplier || "");
  const rowDisplayName = row.supplierName || row.supplier || "";
  return Boolean(supplierName && rowSupplierName && (rowSupplierName === normalizeHeader(supplierName) || sameSupplierIdentity(rowDisplayName, supplierName)));
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
  const departmentId = mapping.departmentId || mapping.department_id || "";
  const allocationMode = mapping.allocationMode || mapping.allocation_mode || (splitLines.length > 1 ? "split" : "department");
  const splitMode = /^split$/i.test(allocationMode) || allocationMode === "Split";
  return {
    allocationMode,
    departmentId,
    department,
    departmentMode: splitMode ? "Split" : "Single",
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
  const allocation = allocationFromMapping(mapping);
  const allocationSource = mapping ? (allocation.departmentMode === "Split" ? "learned_split_rule" : "learned_mapping") : null;
  return {
    matchedProductId: product?.id || null,
    matchedProductName: product?.name || product?.productName || null,
    productMatchSource: source,
    productMatchConfidence: Number.isFinite(confidence) ? confidence : null,
    suggestedProducts,
    needsReview,
    reviewReasons,
    allocationSource,
    learnedMappingId: mapping?.id || null,
    ...allocation,
  };
}

function withMatchDebug(result, context = {}) {
  invoiceLearningDebug("match-attempt", {
    supplierId: context.supplierId,
    supplierName: context.supplierName,
    supplierProductCode: context.supplierProductCode,
    normalizedSupplierProductCode: normalizeSupplierProductCode(context.supplierProductCode),
    description: context.rawDescription || context.productName,
    matchedMappingId: result.learnedMappingId || "",
    matchSource: result.productMatchSource,
  });
  if (result.learnedMappingId && result.allocationSource) {
    invoiceLearningDebug("allocation-applied", {
      mappingId: result.learnedMappingId,
      departmentId: result.departmentId,
      department: result.department,
      allocationMode: result.allocationMode,
    });
  }
  return result;
}

function scoreProduct(product, rawDescription, productName) {
  return Math.max(
    ...productAliases(product).map((alias) => Math.max(productSimilarity(rawDescription, alias), productSimilarity(productName, alias))),
    0,
  );
}

function exactAliasMatch(product = {}, target = "") {
  const targetText = normalizeSupplierDescription(target);
  if (!targetText) return null;
  const primaryNames = new Set([product.name, product.productName].filter(Boolean).map(normalizeSupplierDescription));
  const matchedAlias = productAliases(product).find((alias) => normalizeSupplierDescription(alias) === targetText);
  if (!matchedAlias) return null;
  return {
    product,
    source: primaryNames.has(normalizeSupplierDescription(matchedAlias)) ? PRODUCT_MATCH_SOURCES.EXACT_NAME : PRODUCT_MATCH_SOURCES.ALIAS,
  };
}

function uniqueProductEntries(entries = []) {
  const byProductId = new Map();
  entries.forEach((entry) => {
    if (!entry?.product?.id || byProductId.has(entry.product.id)) return;
    byProductId.set(entry.product.id, entry);
  });
  return [...byProductId.values()];
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
  const context = { supplierId, supplierName, supplierProductCode, rawDescription, productName };
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
      return withMatchDebug(resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.SUPPLIER_CODE, confidence: 1, mapping }), context);
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
      return withMatchDebug(resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.LEARNED_RULE, confidence: 0.98, mapping }), context);
    }
  }

  const exactMatchEntries = uniqueProductEntries(products.map((product) => exactAliasMatch(product, productName || rawDescription)).filter(Boolean));
  const compatibleExactMatches = exactMatchEntries.filter((entry) => (
    unitsCompatible(unitOfMeasure, entry.product.unit || entry.product.unitOfMeasure)
    && packSizesCompatible(packSize, entry.product.packSize)
  ));
  if (compatibleExactMatches.length === 1) {
    return withMatchDebug(resultFromProduct({
      product: compatibleExactMatches[0].product,
      source: compatibleExactMatches[0].source,
      confidence: 1,
    }), context);
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
    return withMatchDebug(resultFromProduct({
      product: compatibleNormalized[0],
      source: PRODUCT_MATCH_SOURCES.EXACT_NAME,
      confidence: 0.94,
    }), context);
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
    return withMatchDebug(resultFromProduct({
      product: best.product,
      source: PRODUCT_MATCH_SOURCES.FUZZY_MATCH,
      confidence: Number(best.score.toFixed(2)),
    }), context);
  }

  if (best) {
    return withMatchDebug({
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
    }, context);
  }

  return withMatchDebug({
    matchedProductId: null,
    matchedProductName: null,
    productMatchSource: PRODUCT_MATCH_SOURCES.NONE,
    productMatchConfidence: null,
    suggestedProducts: [],
    needsReview: true,
    reviewReasons: ["no_confirmed_product_match"],
    allocationSource: null,
  }, context);
}
