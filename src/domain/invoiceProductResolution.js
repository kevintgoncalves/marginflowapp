import { normalizeHeader, numberValue } from "./numberUtils.js";
import {
  LEGACY_PRODUCT_MATCH_SOURCES,
  PRODUCT_MATCH_SOURCES,
  normalizeSupplierDescription,
  normalizeSupplierProductCode,
  productAliases,
} from "./invoiceProductMatching.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";

export const PRODUCT_RESOLUTION_MODES = Object.freeze({
  UNRESOLVED: "unresolved",
  AUTO_MATCHED: "auto_matched",
  MANUALLY_MATCHED: "manually_matched",
  EXISTING_PRODUCT: "existing_product",
  CREATE_NEW_PRODUCT: "create_new_product",
  AMBIGUOUS: "ambiguous",
});

const productMatchReviewReasons = new Set(["no_confirmed_product_match", "ambiguous_product_match"]);
const automaticMatchSources = new Set([
  PRODUCT_MATCH_SOURCES.SUPPLIER_CODE,
  PRODUCT_MATCH_SOURCES.LEARNED_RULE,
  PRODUCT_MATCH_SOURCES.SUPPLIER_MAPPING,
  PRODUCT_MATCH_SOURCES.BARCODE,
  PRODUCT_MATCH_SOURCES.EXACT_NAME,
  PRODUCT_MATCH_SOURCES.ALIAS,
  PRODUCT_MATCH_SOURCES.DETERMINISTIC_MATCH,
  PRODUCT_MATCH_SOURCES.FUZZY_MATCH,
  LEGACY_PRODUCT_MATCH_SOURCES.SUPPLIER_CODE,
  LEGACY_PRODUCT_MATCH_SOURCES.SUPPLIER_DESCRIPTION,
  LEGACY_PRODUCT_MATCH_SOURCES.EXACT_PRODUCT,
  LEGACY_PRODUCT_MATCH_SOURCES.FUZZY_PRODUCT,
]);

const manualMatchSources = new Set([
  PRODUCT_MATCH_SOURCES.MANUAL_SELECTION,
  LEGACY_PRODUCT_MATCH_SOURCES.USER_SELECTED,
]);

export function canonicalProductMatchSource(source = "") {
  const value = String(source || "").trim();
  const aliases = {
    [LEGACY_PRODUCT_MATCH_SOURCES.SUPPLIER_CODE]: PRODUCT_MATCH_SOURCES.SUPPLIER_CODE,
    [LEGACY_PRODUCT_MATCH_SOURCES.SUPPLIER_DESCRIPTION]: PRODUCT_MATCH_SOURCES.LEARNED_RULE,
    [LEGACY_PRODUCT_MATCH_SOURCES.EXACT_PRODUCT]: PRODUCT_MATCH_SOURCES.EXACT_NAME,
    [LEGACY_PRODUCT_MATCH_SOURCES.FUZZY_PRODUCT]: PRODUCT_MATCH_SOURCES.FUZZY_MATCH,
    [LEGACY_PRODUCT_MATCH_SOURCES.USER_SELECTED]: PRODUCT_MATCH_SOURCES.MANUAL_SELECTION,
    supplier_description: PRODUCT_MATCH_SOURCES.LEARNED_RULE,
    exact_product: PRODUCT_MATCH_SOURCES.EXACT_NAME,
    fuzzy_product: PRODUCT_MATCH_SOURCES.FUZZY_MATCH,
  };
  return aliases[value] || value || PRODUCT_MATCH_SOURCES.NONE;
}

export function isAutomaticProductMatchSource(source = "") {
  return automaticMatchSources.has(source) || automaticMatchSources.has(canonicalProductMatchSource(source));
}

export function isManualProductMatchSource(source = "") {
  return manualMatchSources.has(source) || manualMatchSources.has(canonicalProductMatchSource(source));
}

export function isAutoMatchedProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.AUTO_MATCHED
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.AUTO_MATCHED
    || (Boolean(line.matchedProductId || line.productId) && isAutomaticProductMatchSource(line.productMatchSource));
}

export function isManuallyMatchedProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.MANUALLY_MATCHED
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.MANUALLY_MATCHED
    || (Boolean(line.matchedProductId || line.productId) && isManualProductMatchSource(line.productMatchSource));
}

export function isAmbiguousProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.AMBIGUOUS
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.AMBIGUOUS;
}

export function isUnresolvedProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.UNRESOLVED
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.UNRESOLVED
    || isAmbiguousProductResolution(line);
}

export function isCreateNewProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT
    || line.productMatchSource === "new_product";
}

export function isExistingProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT
    || line.productResolution === PRODUCT_RESOLUTION_MODES.AUTO_MATCHED
    || line.productResolution === PRODUCT_RESOLUTION_MODES.MANUALLY_MATCHED
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.AUTO_MATCHED
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.MANUALLY_MATCHED
    || Boolean(line.matchedProductId || line.productId);
}

export function isResolvedExistingProductResolution(line = {}) {
  const productId = line.matchedProductId || line.productId || "";
  if (!productId) return false;
  if (isUnresolvedProductResolution(line) || isCreateNewProductResolution(line)) return false;
  if (isAutoMatchedProductResolution(line) || isManuallyMatchedProductResolution(line)) return true;
  if (line.productResolution === PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT) return true;
  return !line.productResolution && !line.product_resolution_mode;
}

export function clearProductMatchReviewReasons(reasons = []) {
  return [...new Set(reasons.filter((reason) => !productMatchReviewReasons.has(reason)))];
}

export function lineWithCreateNewProductResolution(line = {}) {
  const productName = String(line.productName || line.rawDescription || "").trim();
  return {
    ...line,
    productName: line.productName || productName,
    matchedProductId: "",
    matchedProductName: "",
    productId: "",
    suggestedProductId: "",
    suggestedProductName: "",
    suggestedProducts: [],
    rejectedSuggestedProducts: line.rejectedSuggestedProducts || line.suggestedProducts || [],
    duplicateProductCandidates: [],
    productResolution: PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT,
    productMatchSource: PRODUCT_MATCH_SOURCES.NEW_PRODUCT,
    productMatchConfidence: 1,
    matchConfidence: 1,
    matchStatus: productName ? `New product will be created: ${productName.toUpperCase()}` : "New product will be created",
    productMatchCorrectionMode: false,
    productMatchOverridden: true,
    needsReview: clearProductMatchReviewReasons(line.reviewReasons || []).length > 0,
    reviewReasons: clearProductMatchReviewReasons(line.reviewReasons || []),
  };
}

export function lineWithExistingProductResolution(line = {}, product = {}) {
  const productId = product.id || product.productId || line.matchedProductId || line.productId || "";
  const productName = product.name || product.productName || line.productName || line.matchedProductName || "";
  return {
    ...line,
    productName,
    matchedProductId: productId,
    matchedProductName: productName,
    productId,
    suggestedProductId: "",
    suggestedProductName: "",
    suggestedProducts: [],
    rejectedSuggestedProducts: [],
    duplicateProductCandidates: [],
    productResolution: PRODUCT_RESOLUTION_MODES.MANUALLY_MATCHED,
    productMatchSource: PRODUCT_MATCH_SOURCES.MANUAL_SELECTION,
    productMatchConfidence: 1,
    matchConfidence: 1,
    matchStatus: "Product selected from database",
    productMatchCorrectionMode: false,
    productMatchOverridden: true,
    needsReview: false,
    reviewReasons: [],
  };
}

function automaticMatchCandidate(line = {}, product = {}, { source = "", confidence = null } = {}) {
  const productId = product.id || product.productId || line.matchedProductId || line.productId || "";
  const productName = product.name || product.productName || line.matchedProductName || line.productName || "";
  return {
    productId,
    productName,
    matchedProductId: productId,
    matchedProductName: productName,
    productMatchSource: canonicalProductMatchSource(source || line.productMatchSource),
    productMatchConfidence: confidence ?? line.productMatchConfidence ?? line.matchConfidence ?? null,
  };
}

export function lineWithAutoMatchedProductResolution(line = {}, product = {}, { source = "", confidence = null, matchStatus = "Automatically matched" } = {}) {
  const productId = product.id || product.productId || line.matchedProductId || line.productId || "";
  const productName = product.name || product.productName || line.matchedProductName || line.productName || "";
  const productMatchSource = canonicalProductMatchSource(source || line.productMatchSource);
  return {
    ...line,
    productName,
    matchedProductId: productId,
    matchedProductName: productName,
    productId,
    suggestedProductId: "",
    suggestedProductName: "",
    suggestedProducts: [],
    rejectedSuggestedProducts: [],
    duplicateProductCandidates: [],
    productResolution: PRODUCT_RESOLUTION_MODES.AUTO_MATCHED,
    productMatchSource,
    productMatchConfidence: confidence ?? line.productMatchConfidence ?? 1,
    matchConfidence: confidence ?? line.matchConfidence ?? line.productMatchConfidence ?? 1,
    matchStatus,
    automaticProductMatch: automaticMatchCandidate(line, { id: productId, name: productName }, { source: productMatchSource, confidence: confidence ?? line.productMatchConfidence ?? 1 }),
    productMatchCorrectionMode: false,
    productMatchOverridden: false,
    needsReview: false,
    reviewReasons: [],
  };
}

export function lineWithResetProductResolution(line = {}) {
  const previousAutomaticMatch = isAutoMatchedProductResolution(line) && (line.matchedProductId || line.productId)
    ? automaticMatchCandidate(line, {}, { source: line.productMatchSource, confidence: line.productMatchConfidence ?? line.matchConfidence ?? null })
    : line.automaticProductMatch;
  const reviewReasons = [...new Set([...(line.reviewReasons || []).filter((reason) => reason !== "ambiguous_product_match"), "no_confirmed_product_match"])];
  return {
    ...line,
    matchedProductId: "",
    matchedProductName: "",
    productId: "",
    suggestedProductId: "",
    suggestedProductName: "",
    suggestedProducts: line.suggestedProducts?.length ? line.suggestedProducts : (line.rejectedSuggestedProducts || []),
    rejectedSuggestedProducts: [],
    duplicateProductCandidates: [],
    productResolution: PRODUCT_RESOLUTION_MODES.UNRESOLVED,
    productMatchSource: PRODUCT_MATCH_SOURCES.NONE,
    productMatchConfidence: line.productMatchConfidence || null,
    matchConfidence: line.matchConfidence || 0,
    matchStatus: "No confirmed existing product match",
    automaticProductMatch: previousAutomaticMatch || null,
    productMatchCorrectionMode: true,
    productMatchOverridden: Boolean(line.productMatchOverridden),
    needsReview: true,
    reviewReasons,
  };
}

export function lineWithAmbiguousProductResolution(line = {}) {
  return {
    ...line,
    matchedProductId: "",
    matchedProductName: "",
    productId: "",
    productResolution: PRODUCT_RESOLUTION_MODES.AMBIGUOUS,
    productMatchSource: PRODUCT_MATCH_SOURCES.NONE,
    matchStatus: "Review product match",
    needsReview: true,
    reviewReasons: [...new Set([...(line.reviewReasons || []), "ambiguous_product_match"])],
  };
}

function sameOrganisation(row = {}, organisationId = "") {
  if (!organisationId) return true;
  const rowOrganisationId = row.organisationId || row.organizationId || row.companyId || row.company_id || "";
  return !rowOrganisationId || rowOrganisationId === organisationId;
}

export function findExactProductForInvoiceLine(products = [], line = {}, { organisationId = "" } = {}) {
  const target = normalizeSupplierDescription(line.productName || line.rawDescription || "");
  if (!target) return null;
  return products.find((product) => (
    product.active !== false
    && sameOrganisation(product, organisationId)
    && productAliases(product).some((alias) => normalizeSupplierDescription(alias) === target)
  )) || null;
}

function supplierMatches(mapping = {}, supplierId = "", supplierName = "") {
  const mappingSupplierId = mapping.supplierId || mapping.supplier_id || "";
  if (supplierId && mappingSupplierId) return mappingSupplierId === supplierId;
  const mappingSupplierName = mapping.supplierName || mapping.supplier || "";
  return !supplierName || !mappingSupplierName || sameSupplierIdentity(mappingSupplierName, supplierName);
}

export function findSupplierCodeMappedProduct(products = [], supplierMappings = [], line = {}, { organisationId = "", supplierId = "", supplierName = "" } = {}) {
  const code = normalizeSupplierProductCode(line.supplierProductCode || line.supplier_product_code || "");
  if (!code) return null;
  const mapping = supplierMappings.find((candidate) => (
    candidate.active !== false
    && sameOrganisation(candidate, organisationId)
    && supplierMatches(candidate, supplierId || line.supplierId || "", supplierName || line.supplier || "")
    && normalizeSupplierProductCode(candidate.normalizedSupplierProductCode || candidate.supplierProductCode || candidate.supplier_product_code) === code
  ));
  if (!mapping) return null;
  const productId = mapping.productId || mapping.product_id || "";
  return products.find((product) => product.id === productId) || (productId ? { id: productId, name: mapping.productName || mapping.product_name || "" } : null);
}

function newProductTransactionKey(line = {}, supplier = "") {
  const code = normalizeSupplierProductCode(line.supplierProductCode || "");
  if (code) return `code:${normalizeHeader(line.supplier || supplier)}:${code}`;
  return [
    "description",
    normalizeHeader(line.supplier || supplier),
    normalizeSupplierDescription(line.productName || line.rawDescription || ""),
    normalizeHeader(line.packSize || ""),
    normalizeHeader(line.unitOfMeasure || line.unit || ""),
  ].join(":");
}

function conflictCandidate(product = {}, type = "exact_product") {
  return {
    id: product.id,
    name: product.name || product.productName || "",
    score: 1,
    packSize: product.packSize || "",
    supplier: product.supplier || "",
    conflictType: type,
  };
}

export function resolveExplicitNewProductLines({
  products = [],
  items = [],
  supplierMappings = [],
  supplier = "",
  supplierId = "",
  organisationId = "",
  idFactory = () => crypto.randomUUID(),
  createProductFromLine,
} = {}) {
  const nextProducts = [...products];
  const createdProducts = [];
  const conflicts = [];
  const createdByKey = new Map();
  const resolvedItems = items.map((item) => {
    if (!isCreateNewProductResolution(item)) return item;
    const productName = String(item.productName || item.rawDescription || "").trim();
    if (!productName) return item;

    const transactionKey = newProductTransactionKey(item, supplier);
    const transactionProduct = createdByKey.get(transactionKey);
    if (transactionProduct) {
      return {
        ...item,
        matchedProductId: transactionProduct.id,
        matchedProductName: transactionProduct.name || productName,
        productId: transactionProduct.id,
        productResolution: PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT,
        productMatchSource: "new_product",
        productMatchConfidence: 1,
        matchConfidence: 1,
        matchStatus: `New product created: ${(transactionProduct.name || productName).toUpperCase()}`,
        duplicateProductCandidates: [],
        needsReview: clearProductMatchReviewReasons(item.reviewReasons || []).length > 0,
        reviewReasons: clearProductMatchReviewReasons(item.reviewReasons || []),
      };
    }

    const exactProduct = findExactProductForInvoiceLine(nextProducts, item, { organisationId });
    if (exactProduct) {
      conflicts.push({ lineId: item.id, type: "exact_product", product: exactProduct });
      return {
        ...item,
        duplicateProductCandidates: [conflictCandidate(exactProduct, "exact_product")],
        needsReview: true,
        reviewReasons: [...new Set([...(item.reviewReasons || []), "exact_product_duplicate"])],
        matchStatus: `Exact product already exists: ${exactProduct.name || exactProduct.productName}`,
      };
    }

    const codeProduct = findSupplierCodeMappedProduct(nextProducts, supplierMappings, item, { organisationId, supplierId, supplierName: supplier });
    if (codeProduct) {
      conflicts.push({ lineId: item.id, type: "supplier_code", product: codeProduct });
      return {
        ...item,
        duplicateProductCandidates: [conflictCandidate(codeProduct, "supplier_code")],
        needsReview: true,
        reviewReasons: [...new Set([...(item.reviewReasons || []), "supplier_code_product_conflict"])],
        matchStatus: `Supplier code is already mapped to ${codeProduct.name || codeProduct.productName}`,
      };
    }

    let product = createdByKey.get(transactionKey);
    if (!product) {
      const productId = idFactory(item);
      product = createProductFromLine
        ? createProductFromLine(item, productId)
        : {
          id: productId,
          name: productName,
          supplier: item.supplier || supplier,
          packSize: item.packSize || "",
          quantity: numberValue(item.quantity, 1),
          unitCost: numberValue(item.unitCost, 0),
          department: item.department || "",
          aliases: item.rawDescription && normalizeSupplierDescription(item.rawDescription) !== normalizeSupplierDescription(productName) ? [item.rawDescription] : [],
          explicitInvoiceCreation: true,
          createdFromInvoiceLineId: item.id,
        };
      nextProducts.push(product);
      createdProducts.push(product);
      createdByKey.set(transactionKey, product);
    }

    return {
      ...item,
      matchedProductId: product.id,
      matchedProductName: product.name || productName,
      productId: product.id,
      productResolution: PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT,
      productMatchSource: "new_product",
      productMatchConfidence: 1,
      matchConfidence: 1,
      matchStatus: `New product created: ${(product.name || productName).toUpperCase()}`,
      duplicateProductCandidates: [],
      needsReview: clearProductMatchReviewReasons(item.reviewReasons || []).length > 0,
      reviewReasons: clearProductMatchReviewReasons(item.reviewReasons || []),
    };
  });

  return {
    products: nextProducts,
    items: resolvedItems,
    createdProducts,
    conflicts,
  };
}
