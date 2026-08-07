import {
  findProductDuplicateCandidates,
  normalizeProductName,
  packSizesCompatible,
  productAliases,
  unitsCompatible,
} from "./productMatching.js";

export const RELATIONAL_PRODUCT_REFERENCE_TABLES = Object.freeze([
  "product_supplier_prices",
  "product_price_history",
  "product_supplier_formats",
  "invoice_lines",
  "stocktake_lines",
  "recipe_ingredients",
  "menu_item_components",
  "waste_entries",
  "supplier_product_mappings",
  "invoice_line_corrections",
]);

export const SNAPSHOT_PRODUCT_REFERENCE_PATHS = Object.freeze([
  "products",
  "supplierProductMappings[].productId",
  "invoiceLineCorrections[].productId",
  "invoices[].items[].matchedProductId/productId",
  "stocktakes[].lines[].matchedProductId/productId",
  "stocktakes[].openingLines[].matchedProductId/productId",
  "recipes[].ingredients[].productId",
  "menus[].subcategories[].dishes[].ingredients[].sourceId (Product only)",
  "wasteItems[].productId/matchedProductId",
]);

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function productIdForReference(row = {}) {
  return row.matchedProductId || row.productId || row.product_id || row.matched_product_id || "";
}

function productUnit(product = {}) {
  return product.unit || product.unitOfMeasure || product.unit_of_measure || product.baseUnit || product.base_unit || "";
}

function productPack(product = {}) {
  return product.packSize || product.pack_size || "";
}

function productCompleteness(product = {}) {
  return [
    product.name,
    product.supplier,
    productPack(product),
    productUnit(product),
    product.category,
    product.department,
    product.unitCost,
    product.quantity,
    product.aliases?.length,
    product.supplierPrices?.length,
    product.priceHistory?.length,
  ].filter((value) => value !== undefined && value !== null && value !== "" && value !== 0).length;
}

function usageTemplate() {
  return {
    invoiceLines: 0,
    supplierMappings: 0,
    stocktakeLines: 0,
    recipeIngredients: 0,
    menuComponents: 0,
    wasteEntries: 0,
    invoiceCorrections: 0,
    priceHistory: 0,
    supplierPrices: 0,
  };
}

function incrementUsage(byProduct, totals, productId, field, amount = 1) {
  if (!byProduct[productId]) return;
  byProduct[productId][field] += amount;
  totals[field] += amount;
}

function activeStocktake(stocktake = {}) {
  return ["active", "draft", "in progress", "open"].includes(String(stocktake.status || "").trim().toLowerCase());
}

function selectedIdsInRows(rows = [], selectedIds = new Set()) {
  return unique(rows.map(productIdForReference).filter((id) => selectedIds.has(id)));
}

function selectedIdsInDish(dish = {}, selectedIds = new Set()) {
  return unique((dish.ingredients || [])
    .filter((ingredient) => String(ingredient.type || "Product").toLowerCase() === "product")
    .map((ingredient) => ingredient.sourceId || ingredient.productId || "")
    .filter((id) => selectedIds.has(id)));
}

function metadataWarnings(products = []) {
  const warnings = [];
  const fields = [
    ["unit", (product) => productUnit(product)],
    ["pack size", (product) => productPack(product)],
    ["category", (product) => product.category || ""],
    ["department", (product) => product.department || ""],
  ];
  fields.forEach(([label, valueFor]) => {
    const values = unique(products.map(valueFor).map((value) => String(value || "").trim()).filter(Boolean));
    if (values.length > 1) {
      warnings.push({ type: `metadata_${label.replace(/\s+/g, "_")}`, level: "warning", message: `Different ${label} values: ${values.join(", ")}.` });
    }
  });
  return warnings;
}

function aliasPlan(allProducts = [], selectedProducts = [], canonicalProduct = {}) {
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const occupied = new Map();
  allProducts
    .filter((product) => product.active !== false && !selectedIds.has(product.id))
    .forEach((product) => productAliases(product).forEach((name) => {
      const normalized = normalizeProductName(name);
      if (normalized) occupied.set(normalized, product);
    }));

  const existing = new Set(productAliases(canonicalProduct).map(normalizeProductName).filter(Boolean));
  const aliasesToAdd = [];
  const skippedAliases = [];
  selectedProducts
    .filter((product) => product.id !== canonicalProduct.id)
    .flatMap((product) => [product.name, ...(product.aliases || [])])
    .filter(Boolean)
    .forEach((alias) => {
      const normalized = normalizeProductName(alias);
      if (!normalized || existing.has(normalized)) return;
      const conflict = occupied.get(normalized);
      if (conflict) {
        skippedAliases.push({ alias, conflictingProductId: conflict.id, conflictingProductName: conflict.name });
        return;
      }
      existing.add(normalized);
      aliasesToAdd.push(alias);
    });
  return { aliasesToAdd, skippedAliases };
}

function totalUsage(usage = {}) {
  return Object.values(usage).reduce((sum, value) => sum + Number(value || 0), 0);
}

export function suggestCanonicalProduct(products = [], usageByProduct = {}) {
  return [...products].sort((left, right) => {
    const usageDifference = totalUsage(usageByProduct[right.id]) - totalUsage(usageByProduct[left.id]);
    if (usageDifference) return usageDifference;
    const leftCreated = Date.parse(left.createdAt || left.created_at || "") || Number.MAX_SAFE_INTEGER;
    const rightCreated = Date.parse(right.createdAt || right.created_at || "") || Number.MAX_SAFE_INTEGER;
    if (leftCreated !== rightCreated) return leftCreated - rightCreated;
    return productCompleteness(right) - productCompleteness(left);
  })[0] || null;
}

export function analyzeProductMerge(snapshot = {}, {
  companyId = "",
  keepProductId = "",
  mergeProductIds = [],
} = {}) {
  const products = Array.isArray(snapshot.products) ? snapshot.products : [];
  const requestedIds = unique([keepProductId, ...mergeProductIds]);
  const selectedProducts = requestedIds.map((id) => products.find((product) => product.id === id)).filter(Boolean);
  const selectedIds = new Set(selectedProducts.map((product) => product.id));
  const byProduct = Object.fromEntries(selectedProducts.map((product) => [product.id, usageTemplate()]));
  const totals = usageTemplate();
  const conflicts = [];

  if (requestedIds.length < 2) conflicts.push({ type: "selection", level: "blocking", message: "Select at least two products to merge." });
  if (selectedProducts.length !== requestedIds.length) conflicts.push({ type: "missing_product", level: "blocking", message: "One or more selected products no longer exist." });
  if (!selectedIds.has(keepProductId)) conflicts.push({ type: "canonical_product", level: "blocking", message: "Choose a valid canonical product." });
  selectedProducts.forEach((product) => {
    const productCompanyId = product.companyId || product.company_id || "";
    if (companyId && productCompanyId && productCompanyId !== companyId) {
      conflicts.push({ type: "cross_company", level: "blocking", message: `${product.name || "Selected product"} belongs to another company.` });
    }
    if (product.active === false) conflicts.push({ type: "archived_product", level: "blocking", message: `${product.name || "Selected product"} is already archived.` });
  });

  (snapshot.invoices || []).forEach((invoice) => (invoice.items || invoice.lines || []).forEach((line) => {
    const id = productIdForReference(line);
    if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "invoiceLines");
  }));
  (snapshot.supplierProductMappings || []).forEach((mapping) => {
    const id = productIdForReference(mapping);
    if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "supplierMappings");
  });
  (snapshot.invoiceLineCorrections || []).forEach((correction) => {
    const id = productIdForReference(correction);
    if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "invoiceCorrections");
  });
  (snapshot.stocktakes || []).forEach((stocktake) => {
    const lines = [...(stocktake.lines || []), ...(stocktake.openingLines || [])];
    lines.forEach((line) => {
      const id = productIdForReference(line);
      if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "stocktakeLines");
    });
    const referenced = selectedIdsInRows(lines, selectedIds);
    if (activeStocktake(stocktake) && referenced.length > 1) {
      conflicts.push({
        type: "active_stocktake",
        level: "blocking",
        recordId: stocktake.id,
        message: `Active Stock Take ${stocktake.date || stocktake.stocktake_date || stocktake.id || "record"} contains counts for multiple selected products. Resolve those counts before merging.`,
      });
    }
  });
  (snapshot.recipes || []).forEach((recipe) => {
    const referenced = selectedIdsInRows(recipe.ingredients || [], selectedIds);
    (recipe.ingredients || []).forEach((ingredient) => {
      const id = productIdForReference(ingredient);
      if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "recipeIngredients");
    });
    if (referenced.length > 1) conflicts.push({
      type: "recipe_duplicate",
      level: "blocking",
      recordId: recipe.id,
      message: `${recipe.name || "A recipe"} contains more than one selected product. Resolve ingredient quantities before merging.`,
    });
  });
  (snapshot.menus || []).forEach((menu) => (menu.subcategories || []).forEach((subcategory) => (subcategory.dishes || []).forEach((dish) => {
    const referenced = selectedIdsInDish(dish, selectedIds);
    (dish.ingredients || []).forEach((ingredient) => {
      const id = String(ingredient.type || "Product").toLowerCase() === "product" ? (ingredient.sourceId || ingredient.productId || "") : "";
      if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "menuComponents");
    });
    if (referenced.length > 1) conflicts.push({
      type: "menu_duplicate",
      level: "blocking",
      recordId: dish.id,
      message: `${dish.name || "A menu item"} contains more than one selected product. Resolve its components before merging.`,
    });
  })));
  (snapshot.wasteItems || []).forEach((entry) => {
    const id = productIdForReference(entry);
    if (selectedIds.has(id)) incrementUsage(byProduct, totals, id, "wasteEntries");
  });
  selectedProducts.forEach((product) => {
    incrementUsage(byProduct, totals, product.id, "priceHistory", (product.priceHistory || []).length);
    incrementUsage(byProduct, totals, product.id, "supplierPrices", (product.supplierPrices || []).length);
  });

  conflicts.push(...metadataWarnings(selectedProducts));
  const canonicalProduct = selectedProducts.find((product) => product.id === keepProductId) || suggestCanonicalProduct(selectedProducts, byProduct);
  const aliases = aliasPlan(products, selectedProducts, canonicalProduct || {});
  aliases.skippedAliases.forEach((entry) => conflicts.push({
    type: "alias_conflict",
    level: "warning",
    message: `${entry.alias} will not become an alias because it already identifies ${entry.conflictingProductName}.`,
  }));

  return {
    selectedProducts,
    canonicalProduct,
    recommendedKeepProductId: suggestCanonicalProduct(selectedProducts, byProduct)?.id || "",
    mergeProductIds: selectedProducts.filter((product) => product.id !== canonicalProduct?.id).map((product) => product.id),
    usageByProduct: byProduct,
    totals,
    aliasesToAdd: aliases.aliasesToAdd,
    skippedAliases: aliases.skippedAliases,
    conflicts,
    blockingConflicts: conflicts.filter((conflict) => conflict.level === "blocking"),
    canMerge: selectedProducts.length >= 2 && conflicts.every((conflict) => conflict.level !== "blocking"),
  };
}

function remapReference(row = {}, sourceIds, keepProductId) {
  const id = productIdForReference(row);
  if (!sourceIds.has(id)) return row;
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(row, "matchedProductId")) patch.matchedProductId = keepProductId;
  if (Object.prototype.hasOwnProperty.call(row, "productId")) patch.productId = keepProductId;
  if (Object.prototype.hasOwnProperty.call(row, "product_id")) patch.product_id = keepProductId;
  if (Object.prototype.hasOwnProperty.call(row, "matched_product_id")) patch.matched_product_id = keepProductId;
  return { ...row, ...patch };
}

function mergeUniqueRows(rows = [], keyFor = (row) => JSON.stringify(row)) {
  const result = [];
  const keys = new Set();
  rows.forEach((row) => {
    const key = keyFor(row);
    if (keys.has(key)) return;
    keys.add(key);
    result.push(row);
  });
  return result;
}

function supplierFormatKey(row = {}) {
  return [row.supplierId || row.supplier || "", normalizeProductName(row.packSize || ""), row.baseUnit || row.unit || ""].join(":");
}

function supplierMappingIdentity(mapping = {}) {
  const company = mapping.companyId || mapping.company_id || "local";
  const location = mapping.locationId || mapping.location_id || "company";
  const supplier = mapping.supplierId || mapping.supplier_id || normalizeProductName(mapping.supplierName || mapping.supplier || "");
  if (!supplier) return "";
  const code = String(mapping.normalizedSupplierProductCode || mapping.normalized_supplier_product_code || mapping.supplierProductCode || mapping.supplier_product_code || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  if (code) return [company, location, supplier, "code", code].join(":");
  const description = normalizeProductName(mapping.normalizedSupplierDescription || mapping.normalized_supplier_description || mapping.supplierDescription || mapping.supplier_description || "");
  if (!description) return "";
  const unit = normalizeProductName(mapping.normalizedUnitOfMeasure || mapping.normalized_unit_of_measure || mapping.unitOfMeasure || mapping.unit_of_measure || "");
  const pack = normalizeProductName(mapping.normalizedPackSize || mapping.normalized_pack_size || mapping.packSize || mapping.pack_size || "");
  return [company, location, supplier, "description", description, unit, pack].join(":");
}

function supplierMappingPriority(mapping = {}) {
  const source = mapping.mappingSource || mapping.source || mapping.metadata?.mapping_source || "";
  const confirmedAt = Date.parse(mapping.lastConfirmedAt || mapping.last_confirmed_at || mapping.updatedAt || mapping.updated_at || "") || 0;
  return [
    mapping.active === false ? 0 : 1,
    source === "manual_selection" ? 1 : 0,
    confirmedAt,
    Number(mapping.confirmationCount || mapping.confirmation_count || 0),
  ];
}

function compareSupplierMappings(left = {}, right = {}) {
  const leftPriority = supplierMappingPriority(left);
  const rightPriority = supplierMappingPriority(right);
  for (let index = 0; index < leftPriority.length; index += 1) {
    if (leftPriority[index] !== rightPriority[index]) return rightPriority[index] - leftPriority[index];
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function reconcileSupplierMappings(mappings = [], now = "") {
  const indexesByIdentity = new Map();
  mappings.forEach((mapping, index) => {
    if (mapping.active === false) return;
    const identity = supplierMappingIdentity(mapping);
    if (!identity) return;
    indexesByIdentity.set(identity, [...(indexesByIdentity.get(identity) || []), index]);
  });

  const next = mappings.map((mapping) => ({ ...mapping }));
  indexesByIdentity.forEach((indexes, identity) => {
    if (indexes.length < 2) return;
    const winnerIndex = [...indexes].sort((left, right) => compareSupplierMappings(next[left], next[right]))[0];
    const winner = next[winnerIndex];
    const loserIds = indexes.filter((index) => index !== winnerIndex).map((index) => next[index].id).filter(Boolean);
    next[winnerIndex] = {
      ...winner,
      mergeMetadata: { ...(winner.mergeMetadata || {}), resolvedMappingIds: loserIds, supplierItemIdentity: identity, resolvedAt: now },
    };
    indexes.filter((index) => index !== winnerIndex).forEach((index) => {
      const loser = next[index];
      next[index] = {
        ...loser,
        active: false,
        autoApply: false,
        supersededByMappingId: winner.id || "",
        mergeMetadata: { ...(loser.mergeMetadata || {}), resolution: "superseded_on_product_merge", supplierItemIdentity: identity, resolvedAt: now },
        updatedAt: now || loser.updatedAt,
      };
    });
  });
  return next;
}

export function applyProductMergeToSnapshot(snapshot = {}, options = {}) {
  const analysis = analyzeProductMerge(snapshot, options);
  if (!analysis.canMerge) {
    const error = new Error(analysis.blockingConflicts[0]?.message || "Product merge cannot continue.");
    error.conflicts = analysis.conflicts;
    throw error;
  }
  const keepProductId = analysis.canonicalProduct.id;
  const sourceIds = new Set(analysis.mergeProductIds);
  const now = options.now || new Date().toISOString();
  const selectedProducts = analysis.selectedProducts;
  const allSupplierPrices = selectedProducts.flatMap((product) => product.supplierPrices || []);
  const allPriceHistory = selectedProducts.flatMap((product) => product.priceHistory || []);
  const allSupplierFormats = selectedProducts.flatMap((product) => product.supplierFormats || []);

  const products = (snapshot.products || []).map((product) => {
    if (product.id === keepProductId) return {
      ...product,
      aliases: mergeUniqueRows([...(product.aliases || []), ...analysis.aliasesToAdd], normalizeProductName),
      supplierPrices: mergeUniqueRows(allSupplierPrices),
      priceHistory: mergeUniqueRows(allPriceHistory),
      supplierFormats: mergeUniqueRows(allSupplierFormats, supplierFormatKey),
      active: true,
      mergeMetadata: {
        ...(product.mergeMetadata || {}),
        mergedProductIds: unique([...(product.mergeMetadata?.mergedProductIds || []), ...analysis.mergeProductIds]),
        lastMergedAt: now,
      },
    };
    if (!sourceIds.has(product.id)) return product;
    return {
      ...product,
      active: false,
      archivedAt: product.archivedAt || now,
      mergedAt: now,
      mergedIntoProductId: keepProductId,
      mergeMetadata: { ...(product.mergeMetadata || {}), canonicalProductId: keepProductId, mergedAt: now },
    };
  });

  const invoices = (snapshot.invoices || []).map((invoice) => ({
    ...invoice,
    items: invoice.items ? invoice.items.map((line) => remapReference(line, sourceIds, keepProductId)) : invoice.items,
    lines: invoice.lines ? invoice.lines.map((line) => remapReference(line, sourceIds, keepProductId)) : invoice.lines,
  }));
  const supplierProductMappings = reconcileSupplierMappings(
    (snapshot.supplierProductMappings || []).map((mapping) => remapReference(mapping, sourceIds, keepProductId)),
    now,
  );
  const invoiceLineCorrections = (snapshot.invoiceLineCorrections || []).map((correction) => remapReference(correction, sourceIds, keepProductId));
  const stocktakes = (snapshot.stocktakes || []).map((stocktake) => ({
    ...stocktake,
    lines: (stocktake.lines || []).map((line) => remapReference(line, sourceIds, keepProductId)),
    openingLines: (stocktake.openingLines || []).map((line) => remapReference(line, sourceIds, keepProductId)),
  }));
  const recipes = (snapshot.recipes || []).map((recipe) => ({
    ...recipe,
    ingredients: (recipe.ingredients || []).map((ingredient) => remapReference(ingredient, sourceIds, keepProductId)),
  }));
  const menus = (snapshot.menus || []).map((menu) => ({
    ...menu,
    subcategories: (menu.subcategories || []).map((subcategory) => ({
      ...subcategory,
      dishes: (subcategory.dishes || []).map((dish) => ({
        ...dish,
        ingredients: (dish.ingredients || []).map((ingredient) => (
          String(ingredient.type || "Product").toLowerCase() === "product" && sourceIds.has(ingredient.sourceId || ingredient.productId)
            ? { ...ingredient, sourceId: keepProductId, ...(ingredient.productId ? { productId: keepProductId } : {}) }
            : ingredient
        )),
      })),
    })),
  }));
  const wasteItems = (snapshot.wasteItems || []).map((entry) => remapReference(entry, sourceIds, keepProductId));

  return {
    analysis,
    snapshot: {
      ...snapshot,
      products,
      invoices,
      supplierProductMappings,
      invoiceLineCorrections,
      stocktakes,
      recipes,
      menus,
      wasteItems,
    },
  };
}

export function suggestProductDuplicateGroups(products = [], { organisationId = "", threshold = 0.72 } = {}) {
  const activeProducts = products.filter((product) => product.active !== false);
  const seen = new Set();
  const suggestions = [];
  activeProducts.forEach((product) => {
    findProductDuplicateCandidates(activeProducts.filter((candidate) => candidate.id !== product.id), product, { organisationId, threshold })
      .filter((candidate) => candidate.unitMatch && candidate.packMatch)
      .forEach((candidate) => {
        const ids = [product.id, candidate.product.id].sort();
        const key = ids.join(":");
        if (seen.has(key)) return;
        seen.add(key);
        suggestions.push({
          id: key,
          productIds: ids,
          products: ids.map((id) => activeProducts.find((entry) => entry.id === id)),
          confidence: candidate.score,
        });
      });
  });
  return suggestions.sort((left, right) => right.confidence - left.confidence).slice(0, 20);
}
