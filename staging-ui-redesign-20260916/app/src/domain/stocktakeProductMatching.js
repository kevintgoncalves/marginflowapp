import { normalizeHeader } from "./numberUtils.js";
import {
  PRODUCT_NAME_MATCH_TYPES,
  createProductMatchIndex,
  matchProductName,
} from "./productMatching.js";

export const STOCKTAKE_PRODUCT_MATCH_TYPES = Object.freeze({
  EXACT_ID: "exact_id",
  EXACT_CODE: "exact_code",
  EXACT_NAME: PRODUCT_NAME_MATCH_TYPES.EXACT_NAME,
  ALIAS: PRODUCT_NAME_MATCH_TYPES.ALIAS,
  FUZZY: PRODUCT_NAME_MATCH_TYPES.FUZZY,
  AMBIGUOUS: PRODUCT_NAME_MATCH_TYPES.AMBIGUOUS,
  NONE: PRODUCT_NAME_MATCH_TYPES.NONE,
});

export function stocktakeProductCode(product = {}) {
  return String(product.sku || product.code || product.productCode || product.product_code || product.stockCode || product.stock_code || "").trim();
}

export function createStocktakeProductIndex(products = [], options = {}) {
  const generic = createProductMatchIndex(products, options);
  return {
    ...generic,
    byId: new Map(generic.entries.map((entry) => [String(entry.product.id), entry.product])),
    byCode: generic.entries.reduce((map, entry) => {
      const code = normalizeHeader(stocktakeProductCode(entry.product));
      if (!code) return map;
      const matches = map.get(code) || [];
      matches.push(entry.product);
      map.set(code, matches);
      return map;
    }, new Map()),
  };
}

function stocktakeIndex(productsOrIndex = [], options = {}) {
  return Array.isArray(productsOrIndex) ? createStocktakeProductIndex(productsOrIndex, options) : productsOrIndex;
}

function matchedResult(product, matchType, confidence = 1, { confirmed = true, requiresReview = false, candidates = [] } = {}) {
  return { product, confidence, matchType, confirmed, requiresReview, candidates };
}

export function matchStocktakeProduct(row = {}, productsOrIndex = [], {
  organisationId = "",
  strongThreshold = 0.7,
  suggestThreshold = 0.32,
} = {}) {
  const index = stocktakeIndex(productsOrIndex, { organisationId });
  const productId = String(row.productId || row.stockItemId || "").trim();
  if (productId) {
    const product = index.byId.get(productId) || null;
    return product
      ? matchedResult(product, STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_ID)
      : { product: null, confidence: 0, matchType: STOCKTAKE_PRODUCT_MATCH_TYPES.NONE, confirmed: false, requiresReview: true, candidates: [], reason: "The Product ID does not exist in the current product list." };
  }

  const code = normalizeHeader(row.productCode || "");
  if (code) {
    const codeMatches = index.byCode.get(code) || [];
    if (codeMatches.length === 1) return matchedResult(codeMatches[0], STOCKTAKE_PRODUCT_MATCH_TYPES.EXACT_CODE);
    if (codeMatches.length > 1) {
      return { product: null, confidence: 1, matchType: STOCKTAKE_PRODUCT_MATCH_TYPES.AMBIGUOUS, confirmed: false, requiresReview: true, candidates: codeMatches.map((product) => ({ product, score: 1 })) };
    }
  }

  const suppliedUnit = String(row.unit || row.unitOfMeasure || "").trim();
  const unitContainsPackMeasure = /\d/.test(suppliedUnit) && /(ml|cl|l|g|kg|oz)\b/i.test(suppliedUnit);
  const generic = matchProductName(row.productName || "", index, {
    organisationId,
    unit: unitContainsPackMeasure ? "" : suppliedUnit,
    packSize: row.packSize || (unitContainsPackMeasure ? suppliedUnit : ""),
    strongThreshold,
    suggestThreshold,
    autoSelectFuzzy: true,
  });
  if ([PRODUCT_NAME_MATCH_TYPES.EXACT_NAME, PRODUCT_NAME_MATCH_TYPES.ALIAS].includes(generic.matchType) && generic.match) {
    return matchedResult(generic.match, generic.matchType, generic.confidence, { candidates: generic.candidates });
  }
  if (generic.matchType === PRODUCT_NAME_MATCH_TYPES.FUZZY && generic.match) {
    return matchedResult(generic.match, STOCKTAKE_PRODUCT_MATCH_TYPES.FUZZY, generic.confidence, {
      confirmed: false,
      requiresReview: true,
      candidates: generic.candidates,
    });
  }
  return {
    product: null,
    confidence: generic.confidence,
    matchType: generic.matchType,
    confirmed: false,
    requiresReview: true,
    candidates: generic.candidates,
  };
}
