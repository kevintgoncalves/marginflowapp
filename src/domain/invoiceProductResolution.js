import { normalizeHeader, numberValue } from "./numberUtils.js";
import { normalizeSupplierDescription, normalizeSupplierProductCode, productAliases } from "./invoiceProductMatching.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";

export const PRODUCT_RESOLUTION_MODES = Object.freeze({
  UNRESOLVED: "unresolved",
  EXISTING_PRODUCT: "existing_product",
  CREATE_NEW_PRODUCT: "create_new_product",
});

const productMatchReviewReasons = new Set(["no_confirmed_product_match", "ambiguous_product_match"]);

export function isCreateNewProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.CREATE_NEW_PRODUCT
    || line.productMatchSource === "new_product";
}

export function isExistingProductResolution(line = {}) {
  return line.productResolution === PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT
    || line.product_resolution_mode === PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT
    || Boolean(line.matchedProductId || line.productId);
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
    productMatchSource: "new_product",
    productMatchConfidence: 1,
    matchConfidence: 1,
    matchStatus: productName ? `New product will be created: ${productName.toUpperCase()}` : "New product will be created",
    needsReview: clearProductMatchReviewReasons(line.reviewReasons || []).length > 0,
    reviewReasons: clearProductMatchReviewReasons(line.reviewReasons || []),
  };
}

export function lineWithExistingProductResolution(line = {}, product = {}) {
  return {
    ...line,
    productName: product.name || product.productName || line.productName,
    matchedProductId: product.id || "",
    matchedProductName: product.name || product.productName || line.productName,
    productId: product.id || "",
    suggestedProductId: "",
    suggestedProductName: "",
    suggestedProducts: [],
    rejectedSuggestedProducts: [],
    duplicateProductCandidates: [],
    productResolution: PRODUCT_RESOLUTION_MODES.EXISTING_PRODUCT,
    productMatchSource: "user_selected",
    productMatchConfidence: 1,
    matchConfidence: 1,
    matchStatus: "Product selected from database",
    needsReview: false,
    reviewReasons: [],
  };
}

export function lineWithResetProductResolution(line = {}) {
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
    productMatchSource: "no_product_match",
    productMatchConfidence: line.productMatchConfidence || null,
    matchConfidence: line.matchConfidence || 0,
    matchStatus: "No confirmed existing product match",
    needsReview: true,
    reviewReasons: line.reviewReasons?.length ? line.reviewReasons : ["no_confirmed_product_match"],
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
