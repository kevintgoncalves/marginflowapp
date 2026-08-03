import { numberValue, roundMoney } from "../domain/numberUtils.js";

const defaultCompanyName = "MarginFlow";
const preparationPattern = /^\s*prep(?:aration)?\s*[-:]/i;

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hasNumericValue(value) {
  if (!hasValue(value)) return false;
  return Number.isFinite(numberValue(value, Number.NaN));
}

function isoDate(value) {
  if (hasValue(value) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    return String(value).slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function companyScopedId(row = {}) {
  return row.companyId || row.company_id || "";
}

function locationScopedId(row = {}) {
  return row.locationId || row.location_id || "";
}

function assertStocktakeScope(stocktake, lines, companyScope = {}) {
  const companyId = companyScope.companyId || companyScope.company_id || "";
  const locationId = companyScope.locationId || companyScope.location_id || "";
  if (!companyId && !locationId) return;

  const stocktakeCompanyId = companyScopedId(stocktake);
  const stocktakeLocationId = locationScopedId(stocktake);
  if (companyId && stocktakeCompanyId && stocktakeCompanyId !== companyId) {
    throw new Error("The selected stocktake does not belong to the current company.");
  }
  if (locationId && stocktakeLocationId && stocktakeLocationId !== locationId) {
    throw new Error("The selected stocktake does not belong to the current location.");
  }

  const mismatchedLine = lines.find((line) => {
    const lineCompanyId = companyScopedId(line);
    const lineLocationId = locationScopedId(line);
    return (companyId && lineCompanyId && lineCompanyId !== companyId)
      || (locationId && lineLocationId && lineLocationId !== locationId);
  });
  if (mismatchedLine) throw new Error("The selected stocktake includes lines outside the current company scope.");
}

export function formatReportMoney(value, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(numberValue(value));
}

export function formatReportQuantity(value) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 4,
  }).format(numberValue(value));
}

export function formatReportDate(value) {
  const date = new Date(`${isoDate(value)}T00:00:00`);
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function formatReportDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(Number.isNaN(date.getTime()) ? new Date() : date);
}

export function slugifyCompanyName(value = "") {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "company";
}

export function stocktakeReportFileName(report, extension) {
  return `marginflow-stocktake-${slugifyCompanyName(report.companyName)}-${isoDate(report.stocktakeDate)}.${extension}`;
}

export function isPreparationStockLine(line = {}) {
  const productName = line.productName || line.product || line.name || "";
  const department = line.department || "";
  return preparationPattern.test(productName) || /^preparation stock$/i.test(department);
}

function lineProductId(line = {}) {
  return line.productId || line.product_id || line.matchedProductId || line.matched_product_id || "";
}

function normalizeReportLine(line = {}, stocktake = {}, index = 0) {
  const quantity = numberValue(line.quantity);
  const unitCost = numberValue(line.unitCost ?? line.unit_cost ?? line.cost);
  const productName = String(line.productName || line.product || line.name || line.description || "").trim();
  return {
    id: line.id || `stocktake-line-${index + 1}`,
    productName,
    quantity,
    packSize: line.packSize || line.pack_size || line.unit || "",
    unitCost,
    totalValue: roundMoney(quantity * unitCost),
    supplier: line.supplier || line.supplierName || line.supplier_name || "",
    department: line.department || stocktake.department || "Unassigned",
    productId: lineProductId(line),
    isPreparation: isPreparationStockLine({ ...line, productName }),
    sortIndex: index,
  };
}

function sortReportLines(left, right) {
  return (left.department || "").localeCompare(right.department || "", undefined, { sensitivity: "base" })
    || (left.productName || "").localeCompare(right.productName || "", undefined, { numeric: true, sensitivity: "base" })
    || left.sortIndex - right.sortIndex;
}

function departmentSummaries(lines = [], grandTotal = 0) {
  const byDepartment = new Map();
  lines.forEach((line) => {
    const department = line.department || "Unassigned";
    const current = byDepartment.get(department) || { department, productCount: 0, stockValue: 0, percentageOfTotal: 0 };
    current.productCount += 1;
    current.stockValue = roundMoney(current.stockValue + line.totalValue);
    byDepartment.set(department, current);
  });

  return [...byDepartment.values()]
    .sort((left, right) => left.department.localeCompare(right.department, undefined, { sensitivity: "base" }))
    .map((department) => ({
      ...department,
      percentageOfTotal: grandTotal ? (department.stockValue / grandTotal) * 100 : 0,
    }));
}

export function buildStocktakeReportData(stocktake, options = {}) {
  if (!stocktake) throw new Error("No stocktake is selected.");

  const sourceLines = Array.isArray(stocktake.lines) && stocktake.lines.length
    ? stocktake.lines
    : (stocktake.openingLines || []);
  assertStocktakeScope(stocktake, sourceLines, options.companyScope || options);

  const allLines = sourceLines
    .filter((line) => {
      const productName = line.productName || line.product || line.name || line.description || "";
      return String(productName).trim() && hasValue(line.quantity);
    })
    .map((line, index) => normalizeReportLine(line, stocktake, index))
    .sort(sortReportLines);

  if (!allLines.length) throw new Error("The selected stocktake has no counted lines to export.");

  const products = allLines.filter((line) => !line.isPreparation);
  const preparationItems = allLines.filter((line) => line.isPreparation);
  const calculatedGrandTotal = roundMoney(allLines.reduce((sum, line) => sum + line.totalValue, 0));
  const storedTotalSource = Array.isArray(stocktake.lines) && stocktake.lines.length
    ? stocktake.totalValue
    : stocktake.openingStockValue;
  const grandTotal = roundMoney(hasNumericValue(storedTotalSource) ? storedTotalSource : calculatedGrandTotal);
  const preparationTotal = roundMoney(preparationItems.reduce((sum, line) => sum + line.totalValue, 0));
  const productStockTotal = roundMoney(products.reduce((sum, line) => sum + line.totalValue, 0));

  return {
    companyName: options.companyName || options.businessName || defaultCompanyName,
    stocktakeDate: isoDate(stocktake.date || stocktake.stocktakeDate || stocktake.stocktake_date),
    generatedAt: options.generatedAt || new Date(),
    currency: options.currency || "GBP",
    productCount: allLines.length,
    zeroQuantityCount: allLines.filter((line) => line.quantity === 0).length,
    newProductCount: allLines.filter((line) => !line.productId).length,
    productStockTotal,
    preparationTotal,
    grandTotal,
    calculatedGrandTotal,
    departments: departmentSummaries(allLines, grandTotal),
    products,
    preparationItems,
    allLines,
  };
}
