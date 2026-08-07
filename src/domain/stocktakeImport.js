import { normalizeHeader, numberValue } from "./numberUtils.js";
import {
  STOCKTAKE_PRODUCT_MATCH_TYPES,
  createStocktakeProductIndex,
  matchStocktakeProduct,
  stocktakeProductCode,
} from "./stocktakeProductMatching.js";

export const STOCKTAKE_IMPORT_MODES = Object.freeze({
  MARGINFLOW_TEMPLATE: "marginflow_template",
  EXTERNAL_LIST: "external_list",
});

export const STOCKTAKE_IMPORT_STATUSES = Object.freeze({
  EXACT: "exact",
  ALIAS: "alias",
  SUGGESTED: "suggested",
  AMBIGUOUS: "ambiguous",
  NO_MATCH: "no_match",
  IGNORED: "ignored",
  INVALID: "invalid",
});

export function parseImportedStockCount(value, { allowNegative = false } = {}) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return { hasCount: false, count: null, invalid: false };
  }
  const count = typeof value === "string" ? Number(value.trim().replace(/,/g, "")) : Number(value);
  if (!Number.isFinite(count) || (!allowNegative && count < 0)) {
    return { hasCount: false, count: null, invalid: true };
  }
  return { hasCount: true, count, invalid: false };
}

function headerIndex(headers = [], names = []) {
  const normalizedNames = names.map(normalizeHeader);
  return headers.map(normalizeHeader).findIndex((header) => normalizedNames.includes(header));
}

function rawCell(cells = [], index = -1) {
  return index >= 0 && index < cells.length ? cells[index] : "";
}

function textCell(cells = [], index = -1) {
  const value = rawCell(cells, index);
  return value === null || value === undefined ? "" : String(value).trim();
}

function productName(product = {}) {
  return String(product.name || product.productName || "").trim();
}

function importStatusForMatch(match = {}) {
  if ([STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_ID, STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_CODE, STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_NAME].includes(match.matchType)) {
    return STOCKTAKE_IMPORT_STATUSES.EXACT;
  }
  if (match.matchType === STOCKTAKE_PRODUCT_MATCH_TYPES.ALIAS) return STOCKTAKE_IMPORT_STATUSES.ALIAS;
  if (match.matchType === STOCKTAKE_PRODUCT_MATCH_TYPES.FUZZY) return STOCKTAKE_IMPORT_STATUSES.SUGGESTED;
  if (match.matchType === STOCKTAKE_PRODUCT_MATCH_TYPES.AMBIGUOUS) return STOCKTAKE_IMPORT_STATUSES.AMBIGUOUS;
  return STOCKTAKE_IMPORT_STATUSES.NO_MATCH;
}

export function stocktakeEntryFromProduct(product = {}, quantity = null, {
  department = "",
  rowNumber = 0,
  source = "live",
  sourceUnitCost = null,
} = {}) {
  const unitCost = sourceUnitCost === null || sourceUnitCost === undefined || String(sourceUnitCost).trim() === ""
    ? numberValue(product.unitCost, 0)
    : numberValue(sourceUnitCost, numberValue(product.unitCost, 0));
  return {
    id: `stock-${source}-${product.id}-${rowNumber || "entry"}`,
    productName: productName(product),
    matchedProductId: product.id,
    supplier: product.supplier || "",
    unit: product.unit || product.unitOfMeasure || product.baseUnit || "",
    packSize: product.packSize || "",
    department: product.department || department,
    quantity,
    unitCost,
    stockValue: numberValue(quantity, 0) * unitCost,
    hasCount: true,
    counted: true,
    stocktakeSource: source,
    matchStatus: source === "live" ? "Live count" : "Matched by stocktake import",
  };
}

export function matchStocktakeImportProduct(products = [], row = {}) {
  const match = matchStocktakeProduct(row, products);
  return match.confirmed ? match.product : null;
}

export function detectStocktakeImportMode(headers = []) {
  return headerIndex(headers, ["Product ID", "ProductId", "Stock Item ID", "StockItemId"]) >= 0
    ? STOCKTAKE_IMPORT_MODES.MARGINFLOW_TEMPLATE
    : STOCKTAKE_IMPORT_MODES.EXTERNAL_LIST;
}

export function parseStocktakeImportRows(rawRows = [], products = [], {
  department = "",
  organisationId = "",
  productIndex = null,
} = {}) {
  const rows = Array.isArray(rawRows) ? rawRows : [];
  const headers = rows[0] || [];
  const normalizedHeaders = headers.map(normalizeHeader);
  const hasHeader = normalizedHeaders.some((header) => [
    "product", "productname", "name", "productid", "stockitemid", "count", "quantity", "qty", "stockquantity",
  ].includes(header));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const mode = hasHeader ? detectStocktakeImportMode(headers) : STOCKTAKE_IMPORT_MODES.EXTERNAL_LIST;
  const productNameIndex = hasHeader ? headerIndex(headers, ["Product", "Product Name", "Name"]) : 0;
  const countIndex = hasHeader ? headerIndex(headers, ["Count", "Quantity", "Qty", "Stock Quantity"]) : 1;
  const unitCostIndex = hasHeader ? headerIndex(headers, ["Cost", "Unit Cost", "UnitCost", "Price"]) : 2;
  const unitIndex = hasHeader ? headerIndex(headers, ["Unit", "UOM", "Unit of Measure"]) : -1;
  const productIdIndex = hasHeader ? headerIndex(headers, ["Product ID", "ProductId", "ID"]) : -1;
  const stockItemIdIndex = hasHeader ? headerIndex(headers, ["Stock Item ID", "StockItemId"]) : -1;
  const productCodeIndex = hasHeader ? headerIndex(headers, ["SKU", "SKU / Code", "Product Code", "Stock Code", "Code"]) : -1;
  const packSizeIndex = hasHeader ? headerIndex(headers, ["Pack Size", "Pack", "Size"]) : -1;
  const index = productIndex || createStocktakeProductIndex(products, { organisationId });
  const reviewRows = [];
  const invalidRows = [];
  const unmatchedRows = [];
  const ambiguousRows = [];
  let blankRows = 0;

  dataRows.forEach((cells, dataIndex) => {
    const sourceRow = Array.isArray(cells) ? cells : [];
    const rowNumber = dataIndex + (hasHeader ? 2 : 1);
    const row = {
      id: `stocktake-review-${rowNumber}`,
      rowNumber,
      productId: textCell(sourceRow, productIdIndex),
      stockItemId: textCell(sourceRow, stockItemIdIndex),
      productCode: textCell(sourceRow, productCodeIndex),
      productName: textCell(sourceRow, productNameIndex),
      unit: textCell(sourceRow, unitIndex),
      packSize: textCell(sourceRow, packSizeIndex),
      sourceUnitCost: rawCell(sourceRow, unitCostIndex),
      importMode: mode,
      source: mode === STOCKTAKE_IMPORT_MODES.MARGINFLOW_TEMPLATE ? "marginflow_import" : "external_import",
      ignored: false,
    };
    const parsedCount = parseImportedStockCount(rawCell(sourceRow, countIndex));
    if (!parsedCount.hasCount && !parsedCount.invalid) {
      blankRows += 1;
      return;
    }
    if (parsedCount.invalid) {
      const invalid = { ...row, quantity: null, status: STOCKTAKE_IMPORT_STATUSES.INVALID, confirmed: false, reason: "Count must be zero or a positive number." };
      invalidRows.push(invalid);
      reviewRows.push(invalid);
      return;
    }

    let match;
    if (mode === STOCKTAKE_IMPORT_MODES.MARGINFLOW_TEMPLATE && !row.productId && !row.stockItemId) {
      match = { product: null, confidence: 0, matchType: STOCKTAKE_PRODUCT_MATCH_TYPES.NONE, confirmed: false, requiresReview: true, candidates: [], reason: "The MarginFlow template row is missing its Product ID." };
    } else {
      match = matchStocktakeProduct(row, index, { organisationId });
    }
    const status = importStatusForMatch(match);
    const reviewRow = {
      ...row,
      quantity: parsedCount.count,
      matchedProductId: match.product?.id || "",
      matchedProductName: productName(match.product || {}),
      matchType: match.matchType,
      confidence: match.confidence,
      candidates: (match.candidates || []).map((candidate) => ({
        id: candidate.product?.id || "",
        name: productName(candidate.product || {}),
        unit: candidate.product?.unit || candidate.product?.unitOfMeasure || "",
        packSize: candidate.product?.packSize || "",
        score: candidate.score,
        unitConflict: Boolean(candidate.unitConflict),
        packSizeConflict: Boolean(candidate.packSizeConflict),
      })),
      confirmed: Boolean(match.confirmed),
      requiresReview: Boolean(match.requiresReview),
      status,
      reason: match.reason || "",
    };
    reviewRows.push(reviewRow);
    if (status === STOCKTAKE_IMPORT_STATUSES.AMBIGUOUS) ambiguousRows.push(reviewRow);
    if (status === STOCKTAKE_IMPORT_STATUSES.NO_MATCH) unmatchedRows.push(reviewRow);
  });

  const validRows = confirmedStocktakeImportEntries(reviewRows, products, { department });
  return {
    mode,
    reviewRows,
    validRows,
    blankRows,
    invalidRows,
    unmatchedRows,
    ambiguousRows,
    errors: [...invalidRows, ...unmatchedRows],
    totalRows: dataRows.length,
    missingCountColumn: hasHeader && countIndex < 0,
  };
}

export function resolveStocktakeImportReviewRow(row = {}, product = null, { ignored = false } = {}) {
  if (ignored) {
    return { ...row, ignored: true, confirmed: false, status: STOCKTAKE_IMPORT_STATUSES.IGNORED, matchedProductId: "", matchedProductName: "" };
  }
  if (!product) return row;
  return {
    ...row,
    ignored: false,
    confirmed: true,
    requiresReview: false,
    matchedProductId: product.id,
    matchedProductName: productName(product),
    status: [STOCKTAKE_IMPORT_STATUSES.EXACT, STOCKTAKE_IMPORT_STATUSES.ALIAS].includes(row.status) ? row.status : STOCKTAKE_IMPORT_STATUSES.EXACT,
  };
}

export function confirmedStocktakeImportEntries(reviewRows = [], products = [], { department = "" } = {}) {
  return reviewRows.flatMap((row) => {
    if (row.ignored || row.status === STOCKTAKE_IMPORT_STATUSES.INVALID || !row.confirmed || !row.matchedProductId) return [];
    const product = products.find((candidate) => candidate.id === row.matchedProductId);
    if (!product) return [];
    return [stocktakeEntryFromProduct(product, row.quantity, {
      department,
      rowNumber: row.rowNumber,
      source: row.source || "external_import",
      sourceUnitCost: row.sourceUnitCost,
    })];
  });
}

export function stocktakeImportReviewSummary(reviewRows = [], blankRows = 0) {
  const ready = reviewRows.filter((row) => row.confirmed && !row.ignored && row.status !== STOCKTAKE_IMPORT_STATUSES.INVALID).length;
  const ignored = reviewRows.filter((row) => row.ignored).length;
  const invalid = reviewRows.filter((row) => row.status === STOCKTAKE_IMPORT_STATUSES.INVALID).length;
  const requiresReview = reviewRows.filter((row) => !row.ignored && row.status !== STOCKTAKE_IMPORT_STATUSES.INVALID && !row.confirmed).length;
  return { ready, requiresReview, ignored, invalid, blank: blankRows };
}

export function mergeStocktakeCountLines(existingLines = [], importedLines = []) {
  const next = existingLines.map((line) => ({ ...line }));
  const firstIndexByProduct = new Map();
  next.forEach((line, index) => {
    const productId = line.matchedProductId || line.productId || "";
    if (productId && !firstIndexByProduct.has(productId)) firstIndexByProduct.set(productId, index);
  });
  importedLines.forEach((line) => {
    if (line.hasCount === false || line.quantity === null || line.quantity === undefined) return;
    const productId = line.matchedProductId || line.productId || "";
    if (!productId) return;
    const existingIndex = firstIndexByProduct.get(productId);
    if (existingIndex === undefined) {
      firstIndexByProduct.set(productId, next.length);
      next.push({ ...line });
      return;
    }
    next[existingIndex] = { ...next[existingIndex], ...line, id: next[existingIndex].id || line.id };
  });
  return next;
}

export const applyStocktakeEntries = mergeStocktakeCountLines;

export function stocktakeTemplateRows(products = []) {
  const rows = [["Product ID", "Product", "SKU / Code", "Unit", "Pack Size", "Cost", "Count", "Supplier", "Department"]];
  [...products]
    .filter((product) => product.active !== false)
    .sort((left, right) => (left.department || "").localeCompare(right.department || "") || productName(left).localeCompare(productName(right)))
    .forEach((product) => rows.push([
      product.id || "",
      productName(product),
      stocktakeProductCode(product),
      product.unit || product.unitOfMeasure || "",
      product.packSize || "",
      numberValue(product.unitCost, 0) || "",
      "",
      product.supplier || "",
      product.department || "",
    ]));
  return rows;
}
