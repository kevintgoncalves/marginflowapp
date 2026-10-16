// "Check prices": supplier articles whose price per kg / L / unit cannot be trusted yet, with the
// likely conversion suggested. Pure functions; the page saves through setProducts.
//
// Kinds:
//  - conversion: the article has a price but no conversion to the product's unit.
//  - implausible: an invoice price far from the reviewed price for the same article (kept aside).
//  - outlier: a converted price 3x above or below the other suppliers (usually case vs item).
//  - choose: several articles from the current supplier and none chosen as the current one.
import { interpretPurchasePack } from './purchaseUnits.js';
import { itemsInPack } from './packCount.js';
import { normalizeSupplierProductCode, normalizeSupplierDescription } from './invoiceProductMatching.js';
import { packKey } from './reusablePurchasing.js';
import { sameSupplierIdentity } from './supplierIdentity.js';

export const PRICE_CHECK_SOURCE = 'price_check';
export const OUTLIER_RATIO = 3;
const UNITS = ['kg', 'l', 'each'];

const median = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const packPriceOf = (article) => {
  const value = Number(article.netPackPrice ?? article.packPrice);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export function priceCheckKey(productId, article) {
  return `${productId}|${article.key || ''}`;
}

// Possible conversions read from the pack text: the whole pack, one item of a multipack, or the
// number of items. Each is priced so the closest to the other suppliers can be recommended.
export function conversionOptions(pack = '', packPrice = null, unit = '') {
  const options = [];
  const add = (label, baseQuantity, baseUnit) => {
    if (!(baseQuantity > 0) || !UNITS.includes(baseUnit)) return;
    if (unit && baseUnit !== unit) return;
    if (options.some((option) => option.baseUnit === baseUnit && Math.abs(option.baseQuantity - baseQuantity) < 1e-9)) return;
    options.push({ label, baseQuantity: round(baseQuantity, 6), baseUnit, unitPrice: packPrice ? round(packPrice / baseQuantity) : null });
  };
  const text = String(pack || '').toLowerCase().replace(/,/g, '.');
  const multi = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ltr|lt|l|ml|cl)\b/);
  const single = text.match(/(\d+(?:\.\d+)?)\s*(kg|g|ltr|lt|l|ml|cl)\b/);
  const toBase = (amount, measure) => {
    const value = Number(amount);
    if (measure === 'kg') return [value, 'kg'];
    if (measure === 'g') return [value / 1000, 'kg'];
    if (['l', 'ltr', 'lt'].includes(measure)) return [value, 'l'];
    if (measure === 'ml') return [value / 1000, 'l'];
    if (measure === 'cl') return [value / 100, 'l'];
    return [null, ''];
  };
  if (multi) {
    const [itemQuantity, baseUnit] = toBase(multi[2], multi[3]);
    add(`Whole pack (${multi[1]} × ${multi[2]}${multi[3]})`, Number(multi[1]) * itemQuantity, baseUnit);
    add(`One item (${multi[2]}${multi[3]})`, itemQuantity, baseUnit);
  } else if (single) {
    const [quantity, baseUnit] = toBase(single[1], single[2]);
    add(`Pack (${single[1]}${single[2]})`, quantity, baseUnit);
  } else {
    const inferred = interpretPurchasePack(pack);
    if (inferred?.confirmed) add('Pack', Number(inferred.baseQuantity), inferred.baseUnit);
  }
  const count = itemsInPack(pack) || (/^\s*\d+\s*$/.test(text) ? Number(text) : null);
  if (count > 1) add(`${count} units`, count, 'each');
  add('1 unit', 1, 'each');
  return options;
}

// Suggest the option closest to the reference price (other suppliers / reviewed price).
export function recommendedOption(options = [], reference = null) {
  if (!options.length) return null;
  if (!(reference > 0)) return null;
  const priced = options.filter((option) => option.unitPrice > 0);
  if (!priced.length) return null;
  const distance = (option) => Math.abs(Math.log(option.unitPrice / reference));
  const best = [...priced].sort((a, b) => distance(a) - distance(b))[0];
  return distance(best) <= Math.log(OUTLIER_RATIO) ? best : null;
}

function checked(product, key, article) {
  const entry = (product.priceChecks || []).find((check) => check.key === key);
  if (!entry) return false;
  return Number(entry.packPrice) === Number(packPriceOf(article)) && String(entry.date || '') === String(article.date || '');
}

// rows: output of latestProductComparisons (each product with .comparison).
export function priceCheckItems(rows = []) {
  const items = [];
  for (const row of rows) {
    if (row.active === false) continue;
    const articles = (row.comparison?.articles || []).filter((article) => article.date);
    const unit = UNITS.includes(row.comparisonUnit) ? row.comparisonUnit : UNITS.includes(row.baseUnit) ? row.baseUnit
      : row.comparison?.unit || '';
    const othersPrice = (article) => median(articles.filter((other) => other !== article && other.valid && other.unit === unit && !other.estimated
      && !sameSupplierIdentity(other.supplier || '', article.supplier || '')).map((other) => other.price));
    for (const article of [...(row.comparison?.setAside || []), ...articles]) {
      const key = priceCheckKey(row.id, article);
      if (checked(row, key, article)) continue;
      const packPrice = packPriceOf(article);
      const reference = article.reviewedPrice > 0 && (!unit || article.reviewedUnit === unit) ? article.reviewedPrice : othersPrice(article);
      let kind = '';
      let reason = '';
      if (article.implausible) {
        kind = 'implausible';
        reason = article.status;
      } else if (!article.valid && /conversion|incompatible/i.test(article.status || '') && packPrice) {
        kind = 'conversion';
        reason = article.status === 'Incompatible unit or currency' ? `Priced per ${article.unit === 'l' ? 'L' : article.unit === 'each' ? 'unit' : article.unit}, product compared per ${unit === 'each' ? 'unit' : unit || '—'}` : 'No conversion to kg / L / unit';
      } else if (article.valid && article.unit === unit && reference > 0) {
        const ratio = article.price / reference;
        if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) {
          kind = 'outlier';
          reason = `${ratio >= 1 ? round(ratio, 1) + '× above' : round(1 / ratio, 1) + '× below'} the other suppliers`;
        }
      }
      if (!kind) continue;
      const options = conversionOptions(article.pack, packPrice, unit);
      items.push({
        id: key, key, kind, reason, productId: row.id, productName: row.name, department: row.department || '', unit,
        supplier: article.supplier || '', code: article.code || '', description: article.description || '', pack: article.pack || '',
        packPrice, date: article.date || '', source: article.source || '', invoiceNumber: article.invoiceNumber || '',
        currentPrice: article.valid || article.implausible ? article.price : null, currentUnit: article.valid || article.implausible ? article.unit : '', reference,
        options, recommended: recommendedOption(options, reference), article,
      });
    }
    if (row.comparison?.status === 'Select current article') {
      const candidates = articles.filter((article) => article.isCurrentSupplier);
      const key = `${row.id}|choose`;
      if (candidates.length > 1 && !(row.priceChecks || []).some((check) => check.key === key && check.count === candidates.length)) {
        items.push({ id: key, key, kind: 'choose', reason: `${candidates.length} articles from ${row.supplier || 'the current supplier'}; choose the one you buy now`,
          productId: row.id, productName: row.name, department: row.department || '', unit, supplier: row.supplier || '',
          candidates: candidates.map((article) => ({ key: article.key, code: article.code || '', description: article.description || '', pack: article.pack || '',
            date: article.date, price: article.valid ? article.price : null, unitLabel: article.valid ? article.unit : '', packPrice: packPriceOf(article) })),
          options: [], recommended: null });
      }
    }
  }
  const order = { implausible: 0, conversion: 1, outlier: 2, choose: 3 };
  return items.sort((a, b) => order[a.kind] - order[b.kind] || a.productName.localeCompare(b.productName) || a.supplier.localeCompare(b.supplier));
}

const sameArticleFormat = (format, article) => sameSupplierIdentity(format.supplier || '', article.supplier || '')
  && (normalizeSupplierProductCode(article.code)
    ? normalizeSupplierProductCode(format.supplierProductCode || format.code) === normalizeSupplierProductCode(article.code)
    : packKey(format.packSize || '') === packKey(article.pack || '')
      && (!article.description || !format.description || normalizeSupplierDescription(format.description) === normalizeSupplierDescription(article.description)));

const recordCheck = (product, item, now, extra = {}) => ({
  ...product,
  priceChecks: [...(product.priceChecks || []).filter((check) => check.key !== item.key),
    { key: item.key, packPrice: item.packPrice ?? null, date: item.date || '', checkedAt: now, ...extra }],
});

// Saves a confirmed conversion for one article. Reviewed catalogue articles are corrected in place;
// invoice articles get a confirmed format that the comparison applies to that article's invoices.
export function applyPriceCheckConversion(product, item, { baseQuantity, baseUnit }, now = new Date().toISOString()) {
  const quantity = Number(baseQuantity);
  if (!(quantity > 0) || !UNITS.includes(baseUnit)) throw new Error('Enter how many kg, litres or units the pack holds.');
  const packPrice = Number(item.packPrice);
  const normalizedCost = packPrice > 0 ? round(packPrice / quantity) : 0;
  const conversion = { baseQuantity: quantity, baseUnit, normalizedCost, conversionConfidence: 'manual', conversionReviewRequired: false,
    conversionReason: 'Confirmed in Check prices', checkedAt: now };
  const formats = product.supplierFormats || [];
  let updatedCatalogue = false;
  const next = formats.map((format) => {
    if (format.source === 'catalogue_import' && ['website', 'catalogue'].includes(item.source) && sameArticleFormat(format, item.article || item)) {
      updatedCatalogue = true;
      return { ...format, ...conversion };
    }
    return format;
  });
  const withCheck = next.filter((format) => !(format.source === PRICE_CHECK_SOURCE && sameArticleFormat(format, item.article || item)));
  if (!updatedCatalogue) {
    withCheck.push({ supplier: item.supplier, supplierProductCode: item.code || '', description: item.description || '', packSize: item.pack || '',
      purchaseUnitCost: packPrice > 0 ? packPrice : 0, quantity: 1, date: item.date || now.slice(0, 10), ...conversion, source: PRICE_CHECK_SOURCE });
  }
  return recordCheck({ ...product, supplierFormats: withCheck }, item, now, { baseQuantity: quantity, baseUnit });
}

// The price is right as it is (e.g. a genuinely cheaper supplier). Hidden until the price changes.
export function markPriceChecked(product, item, now = new Date().toISOString()) {
  return recordCheck(product, item, now, { accepted: true });
}

// Picks the article bought now from the current supplier.
export function chooseCurrentArticle(product, item, candidate, now = new Date().toISOString()) {
  const next = { ...product, supplierProductCode: candidate.code || '', packSize: candidate.pack || product.packSize };
  return recordCheck(next, item, now, { count: (item.candidates || []).length, chosen: candidate.key });
}
