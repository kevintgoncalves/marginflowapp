// Menu costing rows and the downloadable menu report. Read-only: nothing here changes a menu,
// dish, recipe or product. The Menu Costing screen and the report use the same rows, so the
// numbers in the report are the numbers on the screen.
import { LINE_STATUS, LINE_TYPES, costChange, costDish, suggestedPrice, upgradeDish } from "./recipeCosting.js";

// Below the target by more than this many points is red; less is amber.
export const RED_GAP_POINTS = 5;

function numberOr(value, fallback = 0) {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function averageOf(values = []) {
  const usable = values.filter((value) => Number.isFinite(value));
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

// Target GP for a dish: dish, then category, then menu overrides (when allowed), then the default.
export function dishTargetGp(menu, subcategory, dish, menuSettings = {}, defaultTarget = 0) {
  const dishTarget = menuSettings.allowDishTargetOverride ? numberOr(dish?.targetGp) : 0;
  const subcategoryTarget = menuSettings.allowSubcategoryTargetOverride ? numberOr(subcategory?.targetGp) : 0;
  const menuTarget = menuSettings.allowMenuTargetOverride ? numberOr(menu?.targetGp) : 0;
  return dishTarget || subcategoryTarget || menuTarget || numberOr(defaultTarget);
}

export function menuTargetGp(menu, menuSettings = {}, defaultTarget = 0) {
  return (menuSettings.allowMenuTargetOverride ? numberOr(menu?.targetGp) : 0) || numberOr(defaultTarget);
}

export function menuDishRows(menu, context, { menuSettings = {}, defaultTarget = 0, defaultVat = 20 } = {}) {
  return (menu?.subcategories || []).flatMap((subcategory) =>
    (subcategory.dishes || []).map((dish) => {
      const upgraded = upgradeDish(dish, defaultVat);
      const costed = costDish(dish, context, defaultVat);
      const target = dishTargetGp(menu, subcategory, dish, menuSettings, defaultTarget);
      return {
        id: dish.id,
        name: dish.name,
        status: dish.status,
        subcategory: subcategory.name,
        subcategoryId: subcategory.id,
        cost: costed.cost,
        priceIncludingVat: costed.priceIncludingVat,
        vatRate: costed.vatRate,
        net: costed.net,
        gp: costed.gp,
        issues: costed.issues,
        manualLines: costed.manualLines,
        targetGp: target,
        belowTarget: costed.gp != null && costed.gp < target,
        costChange: costChange(costed.cost, upgraded.savedCost),
        ingredients: upgraded.ingredients || [],
        lines: costed.lines,
      };
    })
  );
}

// Simple averages (no sales mix), as on the screen.
export function menuSummary(rows = []) {
  return {
    dishes: rows.length,
    averageGp: averageOf(rows.filter((row) => row.gp != null).map((row) => row.gp)),
    belowTarget: rows.filter((row) => row.belowTarget).length,
    averageCost: rows.length ? rows.reduce((sum, row) => sum + row.cost, 0) / rows.length : 0,
  };
}

export function gapTone(row) {
  if (!row.belowTarget) return "";
  return row.targetGp - row.gp > RED_GAP_POINTS ? "red" : "amber";
}

const LINE_ESTIMATE_REASONS = {
  [LINE_STATUS.MANUAL]: "price typed by hand",
  [LINE_STATUS.NEEDS_CONVERSION]: "pack content not confirmed — not costed",
  [LINE_STATUS.UNIT_MISMATCH]: "unit does not match the price — not costed",
  [LINE_STATUS.NO_PRICE]: "no invoice price — not costed",
  [LINE_STATUS.MISSING]: "product or recipe missing — not costed",
  [LINE_STATUS.CYCLE]: "recipe loop — not costed",
};

function lineName(ingredient, costed) {
  return costed?.name || ingredient?.name || "Unnamed item";
}

function quantityLabel(ingredient = {}) {
  const quantity = numberOr(ingredient.quantity);
  const unit = String(ingredient.unit || "").trim();
  return { quantity, unit };
}

export function dishDetail(row) {
  return {
    name: row.name,
    subcategory: row.subcategory,
    lines: row.ingredients.map((ingredient, index) => {
      const costed = row.lines[index] || {};
      const { quantity, unit } = quantityLabel(ingredient);
      return {
        name: lineName(ingredient, costed),
        type: ingredient.type,
        quantity,
        unit,
        cost: costed.cost ?? null,
        supplier: ingredient.type === LINE_TYPES.RECIPE ? "Recipe" : ingredient.type === LINE_TYPES.MANUAL ? "Manual price" : costed.supplier || "",
        estimate: LINE_ESTIMATE_REASONS[costed.status] || (costed.recipeIncomplete ? "recipe has lines without a cost" : ""),
      };
    }),
    cost: row.cost,
  };
}

// Everything a reader should know is estimated or missing from the costs.
export function reportEstimates(rows = []) {
  return rows.flatMap((row) => dishDetail(row).lines
    .filter((line) => line.estimate)
    .map((line) => ({ dish: row.name, line: line.name, reason: line.estimate })));
}

export const PRICE_BASIS_LABELS = Object.freeze({
  latest: "Latest invoice price",
  average4w: "Average of the last 4 weeks",
  cheapest: "Cheapest supplier",
});

export function priceBasisLabel(basis) {
  return PRICE_BASIS_LABELS[basis] || PRICE_BASIS_LABELS.latest;
}

export function buildMenuReport({ menu, rows, companyName = "", generatedAt = new Date().toISOString(), menuTarget = 0, defaultVat = 20, priceBasis = "latest", includeDetail = false } = {}) {
  const categories = [];
  for (const row of rows) {
    let category = categories.find((entry) => entry.id === row.subcategoryId);
    if (!category) {
      category = { id: row.subcategoryId, name: row.subcategory || "Uncategorised", rows: [] };
      categories.push(category);
    }
    const suggested = suggestedPrice(row.cost, row.targetGp, row.vatRate);
    category.rows.push({
      ...row,
      gapPoints: row.gp == null ? null : row.gp - row.targetGp,
      suggestedPrice: row.belowTarget ? suggested : null,
      tone: gapTone(row),
    });
  }
  for (const category of categories) {
    category.averageGp = averageOf(category.rows.filter((row) => row.gp != null).map((row) => row.gp));
  }
  const vatRates = [...new Set(rows.map((row) => row.vatRate))];
  const vat = vatRates.length === 1 ? vatRates[0] : numberOr(defaultVat, 20);
  return {
    companyName: companyName || "MarginFlow",
    menuName: menu?.name || "Menu",
    season: menu?.season || "",
    startDate: menu?.startDate || "",
    endDate: menu?.endDate || "",
    status: menu?.status || "",
    generatedAt,
    menuTarget,
    vatNote: `Prices include VAT ${vatRates.length > 1 ? "(rates vary by dish)" : `${vat}%`}; GP is calculated on the price without VAT`,
    priceBasis: priceBasisLabel(priceBasis),
    summary: menuSummary(rows),
    categories,
    details: includeDetail ? rows.map(dishDetail) : [],
    estimates: reportEstimates(rows),
  };
}

export function menuReportFileName(report, extension) {
  const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `menu-report-${slug(report.menuName) || "menu"}-${String(report.generatedAt).slice(0, 10)}.${extension}`;
}
