import { normalizeHeader, numberValue } from "./numberUtils.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";
import { invoiceLearningDebug } from "./invoiceLearningDiagnostics.js";
import { normalizeDepartmentSplitRows, validDepartmentSplitRows } from "./departmentAssignment.js";
import {
  PRODUCT_NAME_MATCH_TYPES,
  matchProductName,
  normalizeProductName,
  packSizesCompatible,
  productAliases,
  unitsCompatible,
} from "./productMatching.js";

export { findProductDuplicateCandidates, packSizesCompatible, productAliases, unitsCompatible } from "./productMatching.js";

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

export const normalizeSupplierDescription = normalizeProductName;

function sameOrganisation(row = {}, organisationId = "") {
  if (!organisationId) return true;
  const rowOrganisationId = row.organisationId || row.organizationId || row.companyId || row.company_id || "";
  return !rowOrganisationId || rowOrganisationId === organisationId;
}

function sameLocation(row = {}, locationId = "") {
  if (!locationId) return true;
  const rowLocationId = row.locationId || row.location_id || "";
  return !rowLocationId || rowLocationId === locationId;
}

function locationMatchPriority(row = {}, locationId = "") {
  const rowLocationId = row.locationId || row.location_id || "";
  return locationId && rowLocationId === locationId ? 1 : 0;
}

function sameSupplier(row = {}, supplierId = "", supplierName = "") {
  if (!supplierId && !supplierName) return true;
  const rowSupplierId = row.supplierId || row.supplier_id || "";
  if (supplierId && rowSupplierId) return rowSupplierId === supplierId;
  const rowSupplierName = normalizeHeader(row.supplierName || row.supplier || "");
  const rowDisplayName = row.supplierName || row.supplier || "";
  return Boolean(supplierName && rowSupplierName && (rowSupplierName === normalizeHeader(supplierName) || sameSupplierIdentity(rowDisplayName, supplierName)));
}

function mappingProduct(mapping = {}, products = []) {
  const productId = mapping.productId || mapping.product_id || "";
  return products.find((product) => product.id === productId) || (productId ? { id: productId, name: mapping.productName || mapping.product_name || "" } : null);
}

function allocationFromMapping(mapping = {}) {
  if (!mapping) return {};
  const splitLines = Array.isArray(mapping.departmentSplits || mapping.splitRule || mapping.splitLines)
    ? normalizeDepartmentSplitRows(mapping.departmentSplits || mapping.splitRule || mapping.splitLines)
    : [];
  const department = mapping.department || mapping.departmentName || mapping.destination || "";
  const departmentId = mapping.departmentId || mapping.department_id || "";
  const rawAllocationMode = mapping.allocationMode || mapping.allocation_mode || (validDepartmentSplitRows(splitLines) ? "split" : "department");
  const splitMode = /^split$/i.test(rawAllocationMode) && validDepartmentSplitRows(splitLines);
  const allocationMode = splitMode ? "split" : "department";
  return {
    allocationMode,
    departmentId,
    department,
    departmentMode: splitMode ? "Split" : "Single",
    departmentSplits: splitMode ? splitLines : [],
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

export function matchInvoiceLineToExistingProduct({
  organisationId = "",
  locationId = "",
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
    && sameLocation(mapping, locationId)
    && sameSupplier(mapping, supplierId, supplierName)
  )).sort((left, right) => locationMatchPriority(right, locationId) - locationMatchPriority(left, locationId));
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
      const mappingSource = candidate.mappingSource || candidate.source || candidate.metadata?.mapping_source || "";
      return hasCode || confirmationCount >= 2 || candidate.descriptionAutoApply === true || mappingSource === PRODUCT_MATCH_SOURCES.MANUAL_SELECTION;
    });
    const product = mappingProduct(mapping, products);
    if (mapping && product && unitsCompatible(unitOfMeasure, mapping.unitOfMeasure || mapping.unit_of_measure) && packSizesCompatible(packSize, mapping.packSize || mapping.pack_size)) {
      return withMatchDebug(resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.LEARNED_RULE, confidence: 0.98, mapping }), context);
    }
  }

  const genericMatch = matchProductName(productName || rawDescription, products, {
    organisationId,
    unit: unitOfMeasure,
    packSize,
    strongThreshold: autoMatchThreshold,
    suggestThreshold,
    autoSelectFuzzy: false,
  });
  if (genericMatch.match && [PRODUCT_NAME_MATCH_TYPES.EXACT_NAME, PRODUCT_NAME_MATCH_TYPES.ALIAS].includes(genericMatch.matchType)) {
    return withMatchDebug(resultFromProduct({
      product: genericMatch.match,
      source: genericMatch.matchType === PRODUCT_NAME_MATCH_TYPES.ALIAS ? PRODUCT_MATCH_SOURCES.ALIAS : PRODUCT_MATCH_SOURCES.EXACT_NAME,
      confidence: genericMatch.confidence,
    }), context);
  }

  const scored = genericMatch.candidates || [];
  const best = scored[0];
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
      reviewReasons: [genericMatch.matchType === PRODUCT_NAME_MATCH_TYPES.AMBIGUOUS ? "ambiguous_product_match" : "no_confirmed_product_match"],
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
