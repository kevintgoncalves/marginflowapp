import { reusableConversion, packSignature } from './purchaseUnits.js';
import { numberValue } from "./numberUtils.js";
import { invoiceLearningDebug } from "./invoiceLearningDiagnostics.js";
import { normalizeDepartmentSplitRows, validDepartmentSplitRows } from "./departmentAssignment.js";
import {
  PRODUCT_NAME_MATCH_TYPES,
  matchProductName,
  normalizeProductName,
  packSizesCompatible,
  productTokens,
  productAliases,
  unitsCompatible,
} from "./productMatching.js";

export { findProductDuplicateCandidates, packSizesCompatible, productAliases, unitsCompatible } from "./productMatching.js";

export const PRODUCT_MATCH_SOURCES = {
  EXACT_CATALOGUE: "exact_supplier_catalogue",
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

const packagingUnitTokens = new Set([
  "g", "gram", "kg", "kilogram", "ml", "millilitre", "cl", "centilitre", "l", "litre",
  "each", "unit", "pack", "case", "box", "bag", "bottle", "tin", "jar", "tray", "carton",
]);

export function normalizeSupplierDescription(value = "") {
  const tokens = productTokens(value);
  return tokens.filter((token, index) => {
    if (packagingUnitTokens.has(token) || token === "x") return false;
    if (/^\d+(?:\.\d+)?(?:g|kg|ml|cl|l)$/.test(token)) return false;
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      const previous = tokens[index - 1] || "";
      const next = tokens[index + 1] || "";
      return previous !== "x" && next !== "x" && !packagingUnitTokens.has(next);
    }
    return true;
  }).join(" ") || normalizeProductName(value);
}

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

function sameRuleScope(row = {}, organisationId = "", supplierId = "") {
  const rowOrganisationId = row.company_id ?? row.restaurant_id ?? row.companyId ?? row.restaurantId ?? row.organisationId ?? row.organizationId;
  const rowSupplierId = row.supplier_id ?? row.supplierId;
  return Boolean(organisationId && supplierId
    && rowOrganisationId === organisationId && rowSupplierId === supplierId);
}

function mappingProduct(mapping = {}, products = []) {
  const productId = mapping.productId || mapping.product_id || "";
  return products.find((product) => product.id === productId) || null;
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
    conversionRule: mapping?.conversionRule,
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
  if (!organisationId || !supplierId) {
    return resultFromProduct({ source: PRODUCT_MATCH_SOURCES.NONE, needsReview: true,
      reviewReasons: ["no_confirmed_product_match"] });
  }
  const products = existingProducts.filter((product) => sameOrganisation(product, organisationId) && product.active !== false);
  const mappings = supplierMappings.filter((mapping) => (
    !mapping.catalogueEntry && sameRuleScope(mapping, organisationId, supplierId)
    && mapping.active !== false
    && sameLocation(mapping, locationId)
  )).map(mapping => ({ ...mapping, conversionRule: reusableConversion(mapping, packSize) })).sort((left, right) => locationMatchPriority(right, locationId) - locationMatchPriority(left, locationId));
  const normalizedCode = normalizeSupplierProductCode(supplierProductCode);
  const samePack = rule => packSignature(rule.packSize || rule.pack_size) === packSignature(packSize);
  const packReview = () => resultFromProduct({ source: PRODUCT_MATCH_SOURCES.NONE, needsReview: true, reviewReasons: ['pack_changed'] });
  const normalizedDescription = normalizeSupplierDescription(rawDescription || productName);

  if (normalizedCode) {
    const candidates = mappings.filter(candidate => candidate.autoApply !== false
      && normalizeSupplierProductCode(candidate.normalizedSupplierProductCode || candidate.supplierProductCode || candidate.supplier_product_code) === normalizedCode);
    if (candidates.length) {
      if (!candidates.some(samePack)) return packReview();
      const productIds = new Set(candidates.map(row => row.productId || row.product_id).filter(Boolean));
      const mapping = candidates.find(samePack);
      const product = mapping && mappingProduct(mapping, products);
      if (!product || productIds.size !== 1) {
        return resultFromProduct({ source: PRODUCT_MATCH_SOURCES.NONE, needsReview: true,
          reviewReasons: [productIds.size > 1 ? "ambiguous_product_match" : "no_confirmed_product_match"] });
      }
      return withMatchDebug(resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.SUPPLIER_CODE, confidence: 1, mapping }), context);
    }
  }

  if (normalizedDescription) {
    const allDescriptionMappings = mappings.filter((candidate) => {
      const mappingDescription = normalizeSupplierDescription(candidate.normalizedSupplierDescription || candidate.supplierDescription || candidate.supplier_description);
      if (!mappingDescription || mappingDescription !== normalizedDescription) return false;
      if (candidate.autoApply === false) return false;
      const confirmationCount = numberValue(candidate.confirmationCount ?? candidate.confirmation_count, 0);
      const hasCode = normalizeSupplierProductCode(candidate.normalizedSupplierProductCode || candidate.supplierProductCode || candidate.supplier_product_code);
      const mappingSource = candidate.mappingSource || candidate.source || candidate.metadata?.mapping_source || "";
      return hasCode || confirmationCount >= 2 || candidate.descriptionAutoApply === true || mappingSource === PRODUCT_MATCH_SOURCES.MANUAL_SELECTION;
    });
    const descriptionMappings = allDescriptionMappings.filter(samePack);
    if (allDescriptionMappings.length && !descriptionMappings.length) return packReview();
    const productIds = new Set(descriptionMappings.map(row => row.productId || row.product_id).filter(Boolean));
    if (productIds.size > 1) {
      return resultFromProduct({ source: PRODUCT_MATCH_SOURCES.NONE, needsReview: true,
        reviewReasons: ["ambiguous_product_match"] });
    }
    const mapping = descriptionMappings[0];
    const product = mappingProduct(mapping, products);
    if (mapping && product) {
      return withMatchDebug(resultFromProduct({ product, source: PRODUCT_MATCH_SOURCES.LEARNED_RULE, confidence: 0.98, mapping }), context);
    }
  }

  const catalogue = supplierMappings.filter(row => row.catalogueEntry && row.active !== false
    && sameRuleScope(row, organisationId, supplierId) && sameLocation(row, locationId)
    && normalizedDescription && normalizeSupplierDescription(row.supplierDescription) === normalizedDescription
    && packSignature(packSize) && samePack(row));
  if (catalogue.length) {
    const row = catalogue[0];
    const conversion = row.conversionRule;
    const product = mappingProduct(row, products);
    if (catalogue.length !== 1 || !product || !conversion?.confirmed || !(conversion.baseQuantity > 0)
      || !conversion.purchaseUnit || !conversion.baseUnit) {
      return resultFromProduct({source:PRODUCT_MATCH_SOURCES.NONE,needsReview:true,reviewReasons:['ambiguous_product_match']});
    }
    return {...resultFromProduct({product,source:PRODUCT_MATCH_SOURCES.EXACT_CATALOGUE,confidence:1}), conversionRule:conversion};
  }

  const genericMatch = matchProductName(productName || rawDescription, products, {
    organisationId,
    unit: unitOfMeasure,
    packSize,
    strongThreshold: autoMatchThreshold,
    suggestThreshold,
    autoSelectFuzzy: false,
  });

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
