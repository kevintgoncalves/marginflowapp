// Catalogue import: apply a reviewed product database (renamed products, merged duplicates,
// supplier articles with confirmed conversions) to a company's existing catalogue.
//
// Everything here is pure. The app shows the preview first; nothing is written until the
// user confirms. Merges reuse the existing atomic product merge so invoices, stocktakes,
// recipes and learned rules keep pointing at the surviving product.

import { analyzeProductMerge } from "./productMerge.js";
import { normalizeProductName } from "./productMatching.js";
import { normalizeSupplierDescription, normalizeSupplierProductCode } from "./invoiceProductMatching.js";
import { canonicalSupplierForName, sameSupplierIdentity, supplierScopeId } from "./supplierIdentity.js";

export const CATALOGUE_PLAN_FORMAT = "marginflow-catalogue-plan";
export const CATALOGUE_IMPORT_SOURCE = "catalogue_import";
const BASE_UNITS = new Set(["kg", "l", "each"]);

export function validateCataloguePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") return ["The file is not a catalogue plan."];
  if (plan.format !== CATALOGUE_PLAN_FORMAT) errors.push("The file is not a MarginFlow catalogue plan.");
  if (!Array.isArray(plan.products) || !plan.products.length) errors.push("The plan has no products.");
  const catalogueIds = new Set();
  const oldIds = new Map();
  (plan.products || []).forEach((product, index) => {
    const label = product?.catalogueId || `row ${index + 1}`;
    if (!product?.catalogueId) errors.push(`Product ${index + 1} has no catalogue ID.`);
    else if (catalogueIds.has(product.catalogueId)) errors.push(`Catalogue ID ${product.catalogueId} appears twice.`);
    catalogueIds.add(product?.catalogueId);
    if (!String(product?.name || "").trim()) errors.push(`${label} has no name.`);
    if (product?.baseUnit && !BASE_UNITS.has(product.baseUnit)) errors.push(`${label} has an unknown base unit (${product.baseUnit}).`);
    (product?.oldProductIds || []).forEach((id) => {
      if (oldIds.has(id)) errors.push(`Product ${id} is assigned to both ${oldIds.get(id)} and ${label}.`);
      oldIds.set(id, label);
    });
  });
  return errors;
}

function byId(products = []) {
  return new Map(products.map((product) => [product.id, product]));
}

// Follow merge links so a re-run after a partial import finds the surviving product.
function survivingId(id, productMap) {
  let current = productMap.get(id);
  const seen = new Set();
  while (current?.mergedIntoProductId && !seen.has(current.id)) {
    seen.add(current.id);
    current = productMap.get(current.mergedIntoProductId) || current;
    if (!current.mergedIntoProductId) break;
  }
  return current?.id || "";
}

function departmentFor(entry, departmentNames = []) {
  const names = new Set(departmentNames);
  const known = (name) => !departmentNames.length || names.has(name);
  const splits = Array.isArray(entry.departmentSplits) ? entry.departmentSplits : [];
  const validSplits = splits.length >= 2 && splits.every((split) => known(split.department))
    && Math.round(splits.reduce((sum, split) => sum + Number(split.percentage || 0), 0)) === 100;
  return {
    department: entry.department && known(entry.department) ? entry.department : "",
    departmentSplits: validSplits ? splits.map((split) => ({ department: split.department, percentage: Number(split.percentage) })) : [],
    departmentUnknown: Boolean(entry.department && !known(entry.department)),
  };
}

// Preview: what will happen to each product in the plan, computed against the live snapshot.
// relationalProductIds: ids present in the database "products" table (null = unknown, e.g. demo).
// Invoice, stocktake and recipe lines reference that table, so the product kept by a merge must
// exist there; a product that only lives in the workspace snapshot cannot receive those links.
export function buildCatalogueImportPreview({ plan, snapshot = {}, companyId = "", suppliers = [], departmentNames = [], relationalProductIds = null } = {}) {
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const productMap = byId(products);
  const groups = [];
  const issues = [];

  (plan?.products || []).forEach((entry) => {
    // Products already carrying this catalogue ID (from an earlier run) belong to the entry too.
    const tagged = products.filter((product) => product.catalogueId && product.catalogueId === entry.catalogueId).map((product) => product.id);
    const requested = [...new Set([...(entry.oldProductIds || []), ...tagged])];
    const missingIds = requested.filter((id) => !productMap.has(id));
    const surviving = [...new Set(requested.filter((id) => productMap.has(id)).map((id) => survivingId(id, productMap)).filter(Boolean))];
    const activeIds = surviving.filter((id) => productMap.get(id)?.active !== false);
    const alreadyMerged = requested.filter((id) => productMap.has(id) && survivingId(id, productMap) !== id);
    const group = {
      catalogueId: entry.catalogueId,
      name: String(entry.name || "").trim(),
      baseUnit: entry.baseUnit || "",
      ...departmentFor(entry, departmentNames),
      requestedIds: requested,
      missingIds,
      alreadyMergedIds: alreadyMerged,
      keepProductId: "",
      mergeProductIds: [],
      currentNames: activeIds.map((id) => productMap.get(id)?.name || ""),
      articles: Array.isArray(entry.articles) ? entry.articles : [],
      action: "",
      blockingReasons: [],
      warnings: [],
    };
    if (!requested.length) {
      group.action = "create";
    } else if (!activeIds.length) {
      group.action = "skip";
      group.blockingReasons.push(missingIds.length === requested.length
        ? "None of its current products exist in this company any more."
        : "All of its current products are archived.");
    } else if (activeIds.length === 1) {
      group.action = "update";
      group.keepProductId = activeIds[0];
    } else {
      const first = analyzeProductMerge(snapshot, { companyId, keepProductId: activeIds[0], mergeProductIds: activeIds.slice(1) });
      group.keepProductId = first.recommendedKeepProductId || activeIds[0];
      if (relationalProductIds && !relationalProductIds.has(group.keepProductId)) {
        const stored = activeIds.find((id) => relationalProductIds.has(id));
        if (stored) group.keepProductId = stored;
      }
      group.mergeProductIds = activeIds.filter((id) => id !== group.keepProductId);
      const blocking = analyzeProductMerge(snapshot, { companyId, keepProductId: group.keepProductId, mergeProductIds: group.mergeProductIds }).blockingConflicts;
      if (blocking.length) {
        group.action = "update";
        group.blockingReasons.push(...blocking.map((conflict) => conflict.message));
        group.warnings.push("Duplicates are kept separate because they cannot be merged safely; only the main product is renamed.");
        group.mergeProductIds = [];
      } else {
        group.action = "merge";
      }
    }
    if (missingIds.length && group.action !== "skip") group.warnings.push(`${missingIds.length} old product(s) no longer exist and were ignored.`);
    if (group.departmentUnknown) group.warnings.push(`Department "${entry.department}" does not exist; the current department is kept.`);
    group.articles.forEach((article) => {
      if (!canonicalSupplierForName(suppliers, article.supplier)) {
        group.warnings.push(`Supplier "${article.supplier}" is not in the supplier list; its article is kept on the product but not used to match invoices.`);
      }
    });
    groups.push(group);
  });

  const nameCounts = new Map();
  groups.filter((group) => group.action !== "skip").forEach((group) => {
    const key = normalizeProductName(group.name);
    nameCounts.set(key, (nameCounts.get(key) || 0) + 1);
  });
  groups.forEach((group) => {
    if ((nameCounts.get(normalizeProductName(group.name)) || 0) > 1) {
      group.action = "skip";
      group.blockingReasons.push(`Another product in the plan has the same name (${group.name}).`);
    }
  });

  const planned = new Set(groups.flatMap((group) => group.requestedIds));
  const deactivate = (plan?.deactivateProducts || [])
    .map((entry) => productMap.get(entry.id))
    .filter((product) => product && product.active !== false && !planned.has(product.id));
  const untouched = products.filter((product) => product.active !== false && !planned.has(product.id) && !deactivate.includes(product));
  if (untouched.length) issues.push(`${untouched.length} active product(s) are not in the plan and stay as they are.`);

  const count = (action) => groups.filter((group) => group.action === action).length;
  return {
    groups,
    deactivate,
    untouched,
    issues,
    summary: {
      planProducts: groups.length,
      merges: count("merge"),
      mergedAway: groups.reduce((sum, group) => sum + group.mergeProductIds.length, 0),
      updates: count("update"),
      creates: count("create"),
      skipped: count("skip"),
      deactivate: deactivate.length,
      untouched: untouched.length,
      articles: groups.filter((group) => group.action !== "skip").reduce((sum, group) => sum + group.articles.length, 0),
      warnings: groups.reduce((sum, group) => sum + group.warnings.length, 0),
    },
  };
}

function articleFormat(article, now) {
  const comparable = Boolean(article.comparable && Number(article.baseQuantity) > 0 && article.baseUnit);
  const price = Number(article.price || 0);
  return {
    supplier: article.supplier || "",
    supplierProductCode: article.code || "",
    description: article.description || "",
    packSize: article.packSize || "",
    purchaseUnitCost: price,
    quantity: 1,
    date: article.priceDate || now.slice(0, 10),
    baseQuantity: comparable ? Number(article.baseQuantity) : null,
    baseUnit: comparable ? article.baseUnit : "",
    normalizedCost: comparable ? Number((price / Number(article.baseQuantity)).toFixed(4)) : 0,
    conversionConfidence: comparable ? "manual" : "unknown",
    conversionReviewRequired: !comparable,
    conversionReason: comparable ? "Confirmed in catalogue import" : "Base quantity not confirmed",
    source: CATALOGUE_IMPORT_SOURCE,
    priceSource: article.priceSource || "",
  };
}

function websitePriceEntry(article, format) {
  if (article.priceSource !== "supplier_website" || !(format.purchaseUnitCost > 0)) return null;
  return {
    date: format.date,
    supplier: format.supplier,
    price: format.purchaseUnitCost,
    packSize: format.packSize,
    normalizedCost: format.normalizedCost,
    normalizedUnit: format.baseUnit,
    conversionReviewRequired: format.conversionReviewRequired,
    source: "Supplier website",
    importSource: CATALOGUE_IMPORT_SOURCE,
  };
}

const formatKey = (format) => [normalizeSupplierProductCode(format.supplierProductCode), normalizeProductName(format.supplier), normalizeProductName(format.packSize), normalizeProductName(format.description)].join("|");

// Rename, recategorise, add articles and create/deactivate products. Merges must already have
// been applied (or be skipped) so that keepProductId is the surviving product.
export function applyCatalogueAttributes(products = [], preview, { idFactory, now = new Date().toISOString(), companyId = "" } = {}) {
  const groupsByKeep = new Map(preview.groups.filter((group) => group.keepProductId && group.action !== "skip").map((group) => [group.keepProductId, group]));
  const deactivateIds = new Set(preview.deactivate.map((product) => product.id));
  const created = [];
  const next = products.map((product) => {
    if (deactivateIds.has(product.id)) {
      return { ...product, active: false, archivedAt: product.archivedAt || now, archivedReason: "Archived in catalogue import" };
    }
    const group = groupsByKeep.get(product.id);
    if (!group) return product;
    const previousNames = [product.name, product.productName, ...group.currentNames].filter(Boolean);
    const aliases = [...new Set([...(product.aliases || []), ...previousNames]
      .filter((alias) => normalizeProductName(alias) && normalizeProductName(alias) !== normalizeProductName(group.name)))];
    const formats = group.articles.map((article) => articleFormat(article, now));
    const existingFormats = (product.supplierFormats || []).filter((format) => format.source !== CATALOGUE_IMPORT_SOURCE);
    const websitePrices = group.articles.map((article, index) => websitePriceEntry(article, formats[index])).filter(Boolean);
    const priceHistory = [
      ...(product.priceHistory || []).filter((entry) => entry.importSource !== CATALOGUE_IMPORT_SOURCE),
      ...websitePrices,
    ];
    return {
      ...product,
      name: group.name,
      productName: group.name,
      catalogueId: group.catalogueId,
      ...(group.baseUnit ? { baseUnit: group.baseUnit } : {}),
      ...(group.department ? { department: group.department, departmentSplits: group.departmentSplits } : {}),
      aliases,
      supplierFormats: [...new Map([...existingFormats, ...formats].map((format) => [formatKey(format), format])).values()],
      priceHistory,
      catalogueImportedAt: now,
    };
  });
  preview.groups.filter((group) => group.action === "create").forEach((group) => {
    const formats = group.articles.map((article) => articleFormat(article, now));
    const main = formats[0] || {};
    const product = {
      id: idFactory(),
      companyId,
      name: group.name,
      productName: group.name,
      catalogueId: group.catalogueId,
      baseUnit: group.baseUnit || "",
      department: group.department || "",
      departmentSplits: group.departmentSplits,
      supplier: main.supplier || "",
      packSize: main.packSize || "",
      unitCost: main.purchaseUnitCost || 0,
      quantity: 1,
      aliases: [],
      supplierFormats: formats,
      supplierPrices: [],
      priceHistory: group.articles.map((article, index) => websitePriceEntry(article, formats[index])).filter(Boolean),
      active: true,
      createdAt: now,
      catalogueImportedAt: now,
    };
    created.push({ catalogueId: group.catalogueId, id: product.id });
    next.push(product);
  });
  return { products: next, created };
}

// One reusable invoice rule per supplier article, so the next invoice line with that code or
// description is matched to the product automatically with its confirmed conversion.
export function catalogueArticleMappings({ preview, products = [], suppliers = [], created = [], companyId = "", locationId = "", idFactory, now = new Date().toISOString() } = {}) {
  const createdIds = new Map(created.map((entry) => [entry.catalogueId, entry.id]));
  const productMap = byId(products);
  const mappings = [];
  const seen = new Set();
  preview.groups.filter((group) => group.action !== "skip").forEach((group) => {
    const productId = group.keepProductId || createdIds.get(group.catalogueId) || "";
    const product = productMap.get(productId);
    if (!product) return;
    group.articles.forEach((article) => {
      const supplier = canonicalSupplierForName(suppliers, article.supplier);
      if (!supplier) return;
      const code = normalizeSupplierProductCode(article.code);
      const description = normalizeSupplierDescription(article.description);
      if (!code && !description) return;
      const key = [supplierScopeId(supplier), code || `d:${description}`, code ? "" : normalizeProductName(article.packSize)].join("|");
      if (seen.has(key)) return;
      seen.add(key);
      const comparable = Boolean(article.comparable && Number(article.baseQuantity) > 0 && article.baseUnit);
      mappings.push({
        id: idFactory(),
        companyId,
        locationId,
        supplierId: supplierScopeId(supplier),
        supplierName: supplier.name,
        supplierProductCode: article.code || "",
        normalizedSupplierProductCode: code,
        supplierDescription: article.description || "",
        normalizedSupplierDescription: description,
        packSize: article.packSize || "",
        unitOfMeasure: "",
        productId,
        productName: product.name,
        department: group.department || product.department || "",
        departmentMode: "Single",
        allocationMode: "department",
        mappingSource: "manual_selection",
        descriptionAutoApply: true,
        autoApply: true,
        confirmationCount: 1,
        active: true,
        conversionRule: comparable ? {
          purchaseUnit: "pack",
          baseQuantity: Number(article.baseQuantity),
          baseUnit: article.baseUnit,
          confirmed: true,
          source: CATALOGUE_IMPORT_SOURCE,
        } : undefined,
        importSource: CATALOGUE_IMPORT_SOURCE,
        catalogueId: group.catalogueId,
        lastConfirmedAt: now,
        updatedAt: now,
      });
    });
  });
  return mappings;
}

// Mappings already present (same supplier + code, or same supplier + description + pack)
// are not created again, so a re-run does not duplicate rules. A present rule that does not
// apply automatically, or points at another product, is replaced by the reviewed article:
// the server upgrades the same rule (manual_selection sets auto_apply) instead of adding one.
export function catalogueMappingKey(mapping = {}) {
  const code = normalizeSupplierProductCode(mapping.normalizedSupplierProductCode || mapping.supplierProductCode);
  const description = normalizeSupplierDescription(mapping.normalizedSupplierDescription || mapping.supplierDescription);
  return [mapping.supplierId || "", code || `d:${description}`, code ? "" : normalizeProductName(mapping.packSize)].join("|");
}

export function newCatalogueMappings(existing = [], candidates = []) {
  const present = new Map(existing.filter((mapping) => mapping.active !== false).map((mapping) => [catalogueMappingKey(mapping), mapping]));
  return candidates.filter((mapping) => {
    const current = present.get(catalogueMappingKey(mapping));
    return !current || current.autoApply === false || (current.productId || current.product_id) !== mapping.productId;
  });
}

// Existing rules with the same identity as a fresh catalogue rule are replaced locally too.
export function mappingsAfterCatalogueImport(existing = [], fresh = []) {
  const freshKeys = new Set(fresh.map(catalogueMappingKey));
  const replaced = existing.filter((mapping) => mapping.active !== false && freshKeys.has(catalogueMappingKey(mapping)));
  const fromRow = new Map(replaced.map((mapping) => [catalogueMappingKey(mapping), mapping]));
  return [
    ...existing.filter((mapping) => !(mapping.active !== false && freshKeys.has(catalogueMappingKey(mapping)))),
    ...fresh.map((mapping) => {
      const previous = fromRow.get(catalogueMappingKey(mapping));
      return previous ? { ...mapping, id: previous.id, relationalId: undefined } : mapping;
    }),
  ];
}

export function supplierActionsStatus(plan, suppliers = []) {
  return (plan?.suppliers || []).map((action) => {
    if (action.action === "merge") {
      // The source counts as still present only when a supplier carries exactly that name and is
      // not the merge target itself ("Cheese Man" vs "The Cheese Man" share an identity key).
      const exact = (value) => String(value || "").trim().toLowerCase();
      const from = suppliers.find((supplier) => exact(supplier.name) === exact(action.from)
        && exact(supplier.name) !== exact(action.into)
        && !supplier.mergedIntoSupplierId && supplier.active !== false && !supplier.deletedAt);
      return { ...action, done: !from };
    }
    if (action.action === "delete") {
      const present = suppliers.find((supplier) => supplier.name === action.name && supplier.active !== false && !supplier.deletedAt);
      return { ...action, done: !present };
    }
    if (action.action === "add") return { ...action, done: Boolean(canonicalSupplierForName(suppliers, action.name)) };
    return { ...action, done: false };
  });
}
