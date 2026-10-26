// Stock-adjusted cost for a period: opening count + purchases − closing count.
//
// The opening count must sit at the start of the period (on the start date, or the day before as
// that day's closing count) and the closing count on the end date. A count further back would
// leave the purchases between it and the start out of the cost and inflate the GP, so the result
// is "not available" instead. Waste is already inside this cost — the wasted product was bought
// and is no longer in the closing count — so it is reported as a share of it, never added again.

function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function previousDay(isoDate = "") {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate));
  if (!match) return "";
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - 1));
  return date.toISOString().slice(0, 10);
}

export function isOpeningStocktake(stocktake = {}) {
  return stocktake.stocktakeType === "opening"
    || Boolean(stocktake.openingLines?.length)
    || (numberOr(stocktake.openingStockValue) > 0 && !numberOr(stocktake.totalValue));
}

// Counts still in progress are not stock positions yet.
export function isFinishedStocktake(stocktake = {}) {
  return !stocktake.status || stocktake.status === "Saved";
}

export function stocktakeCountValue(stocktake = {}) {
  return isOpeningStocktake(stocktake) ? numberOr(stocktake.openingStockValue) : numberOr(stocktake.totalValue);
}

// Opening and closing counts of one department (stocktakes already filtered to it).
export function departmentStockPosition(stocktakes = [], range = {}) {
  const counts = (Array.isArray(stocktakes) ? stocktakes : [])
    .filter((stocktake) => stocktake?.date && isFinishedStocktake(stocktake));
  const start = String(range.start || "");
  const end = String(range.end || "");
  const opening = counts.find((stocktake) => stocktake.date === start)
    || counts.find((stocktake) => stocktake.date === previousDay(start))
    || null;
  const closing = counts.find((stocktake) => stocktake.date === end && stocktake !== opening && stocktake.date > (opening?.date || "")) || null;
  const missing = [...(opening ? [] : ["opening"]), ...(closing ? [] : ["closing"])];
  return {
    available: !missing.length,
    missing,
    openingStock: opening ? stocktakeCountValue(opening) : null,
    closingStock: closing ? stocktakeCountValue(closing) : null,
    openingDate: opening?.date || "",
    closingDate: closing?.date || "",
  };
}

// departments: [{ department, position, required }]. A department is required when it has
// purchases in the period; one without purchases counts only when both of its counts exist.
export function periodStockResult({ departments = [], purchases = 0, waste = 0, netSales = 0 } = {}) {
  const missingDepartments = departments
    .filter((entry) => entry.required && !entry.position?.available)
    .map((entry) => ({ department: entry.department, missing: entry.position?.missing || ["opening", "closing"] }));
  const counted = departments.filter((entry) => entry.position?.available);
  const unavailable = {
    stockAvailable: false,
    missingDepartments,
    openingStock: null,
    closingStock: null,
    stocktakeCost: null,
    stocktakeGp: null,
    wasteShareOfCost: null,
  };
  if (missingDepartments.length || !counted.length) return unavailable;
  const openingStock = counted.reduce((sum, entry) => sum + entry.position.openingStock, 0);
  const closingStock = counted.reduce((sum, entry) => sum + entry.position.closingStock, 0);
  const stocktakeCost = openingStock + numberOr(purchases) - closingStock;
  const sales = numberOr(netSales);
  return {
    stockAvailable: true,
    missingDepartments: [],
    openingStock,
    closingStock,
    stocktakeCost,
    stocktakeGp: sales ? ((sales - stocktakeCost) / sales) * 100 : null,
    wasteShareOfCost: stocktakeCost > 0 ? (numberOr(waste) / stocktakeCost) * 100 : null,
  };
}

export function stockUnavailableReason(result = {}) {
  const missing = result.missingDepartments || [];
  if (!missing.length) return "No opening/closing stocktake";
  return `No opening/closing stocktake · missing ${missing.map((entry) => `${entry.department} ${entry.missing.join(" + ")}`).join(", ")}`;
}
