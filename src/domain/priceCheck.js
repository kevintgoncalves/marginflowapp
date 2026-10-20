// "Check prices": supplier articles whose price per kg / L / unit cannot be trusted yet, with the
// likely conversion suggested. Pure functions; the page saves through setProducts.
//
// Kinds:
//  - conversion: the article has a price but no conversion to the product's unit.
//  - implausible: an invoice price far from the reviewed price for the same article (kept aside).
//  - outlier: a converted price 3x above or below the other suppliers (usually case vs item).
//  - choose: several articles from the current supplier and none chosen as the current one.
//  - unit: the product card's unit differs from the unit its suppliers sell in.
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
const unitName = (unit) => (unit === 'l' ? 'L' : unit === 'each' ? 'unit' : unit);
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
    // The unit the comparison actually uses; the product card's unit can be wrong (checked below).
    const unit = UNITS.includes(row.comparisonUnit) ? row.comparisonUnit
      : row.comparison?.best?.unit || row.comparison?.current?.unit || (UNITS.includes(row.baseUnit) ? row.baseUnit : row.comparison?.unit || '');
    const solid = articles.filter((article) => article.valid && article.unit === unit && !article.estimated);
    const typical = median(solid.map((article) => article.price));
    const outliers = new Set();
    if (solid.length >= 3) {
      // Three or more prices: away from the median of all of them.
      solid.forEach((article) => { const ratio = article.price / typical; if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) outliers.add(article); });
    } else if (solid.length === 2) {
      // Two prices far apart: flag the one a different pack reading explains; if that does not
      // decide it, the one that is not from the current supplier.
      const [a, b] = solid;
      const ratio = a.price / b.price;
      if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) {
        const fixable = (article, other) => {
          const pick = recommendedOption(conversionOptions(article.pack, packPriceOf(article), unit), other.price);
          return Boolean(pick && Math.abs(pick.unitPrice - article.price) / article.price > 0.01);
        };
        const fixA = fixable(a, b);
        const fixB = fixable(b, a);
        if (fixA !== fixB) outliers.add(fixA ? a : b);
        else [a, b].filter((article) => !article.isCurrentSupplier).forEach((article) => outliers.add(article));
        if (!outliers.size) { outliers.add(a); outliers.add(b); }
      }
    }
    articles.filter((article) => article.valid && article.unit === unit && article.estimated && typical > 0).forEach((article) => {
      const ratio = article.price / typical;
      if (ratio >= OUTLIER_RATIO || ratio <= 1 / OUTLIER_RATIO) outliers.add(article);
    });
    // Product-level unit: what most suppliers sell in, against what the product uses.
    // - no supplier price in the product's own unit (butter set up "per L", all sell per kg), or
    // - most suppliers in one unit while the comparison uses another (one butter invoice read per L).
    // A tie (blueberries: one per kg, one per punnet) is a comparison choice, not a wrong unit.
    // Priced in a unit: comparable, or valid in its own unit but set aside as "incompatible" because
    // the product compares in another unit.
    const priced = (article) => Number(article.price) > 0 && UNITS.includes(article.unit) && !article.estimated
      && (article.valid || article.status === 'Incompatible unit or currency');
    const suppliersIn = (target) => new Set(articles.filter((article) => priced(article) && article.unit === target)
      .map((article) => article.supplierId || normalizeSupplierDescription(article.supplier || ''))).size;
    const counts = UNITS.map((target) => [target, suppliersIn(target)]).sort((a, b) => b[1] - a[1]);
    const [majority, majorityCount] = counts[0];
    const secondCount = counts[1][1];
    let unitItem = null;
    if (majorityCount > 0) {
      const ownUnit = UNITS.includes(row.baseUnit) ? row.baseUnit : '';
      const noneInOwn = ownUnit && !UNITS.includes(row.comparisonUnit) && suppliersIn(ownUnit) === 0 && majority !== ownUnit;
      const clearMajority = majorityCount >= 2 && majorityCount > secondCount && unit && majority !== unit;
      if (noneInOwn || clearMajority) {
        const from = clearMajority ? unit : ownUnit;
        unitItem = { kind: 'unit', unit: majority, fromUnit: from,
          reason: clearMajority
            ? `${majorityCount} suppliers sell per ${unitName(majority)}, the product is compared per ${unitName(from)} (${suppliersIn(from)})`
            : `The product is set up per ${unitName(ownUnit)}, but its suppliers sell per ${unitName(majority)}` };
      }
    }
    if (unitItem) {
      const key = `${row.id}|unit`;
      if (!(row.priceChecks || []).some((check) => check.key === key && check.unit === unitItem.unit)) {
        items.push({ id: key, key, ...unitItem, productId: row.id, productName: row.name, department: row.department || '', supplier: '',
          options: [], recommended: null });
      } else unitItem = null;
    }
    for (const article of [...(row.comparison?.setAside || []), ...articles]) {
      const key = priceCheckKey(row.id, article);
      if (checked(row, key, article)) continue;
      const packPrice = packPriceOf(article);
      const others = median(solid.filter((other) => other !== article && !sameSupplierIdentity(other.supplier || '', article.supplier || '')).map((other) => other.price));
      const reference = article.reviewedPrice > 0 && (!unit || article.reviewedUnit === unit) ? article.reviewedPrice : (solid.length >= 3 ? typical : others);
      let kind = '';
      let reason = '';
      if (article.implausible) {
        kind = 'implausible';
        reason = article.status;
      } else if (unitItem && priced(article) && article.unit === unitItem.unit) {
        continue;
      } else if (!article.valid && /conversion|incompatible/i.test(article.status || '') && packPrice) {
        kind = 'conversion';
        reason = article.status === 'Incompatible unit or currency' ? `Priced per ${article.unit === 'l' ? 'L' : article.unit === 'each' ? 'unit' : article.unit}, the others per ${unit === 'each' ? 'unit' : unit === 'l' ? 'L' : unit || '—'} — maybe a different product` : 'No conversion to kg / L / unit';
      } else if (outliers.has(article)) {
        const ratio = article.price / reference;
        kind = 'outlier';
        reason = reference > 0 ? `${ratio >= 1 ? round(ratio, 1) + '× above' : round(1 / ratio, 1) + '× below'} the other suppliers` : 'Far from the other suppliers';
      }
      if (!kind) continue;
      const options = conversionOptions(article.pack, packPrice, unit);
      // The reviewed article already knows what this pack holds (e.g. a punnet of micro herbs = 75 g).
      if (article.reviewedQuantity > 0 && UNITS.includes(article.reviewedUnit) && (!unit || article.reviewedUnit === unit)
        && !options.some((option) => option.baseUnit === article.reviewedUnit && Math.abs(option.baseQuantity - article.reviewedQuantity) < 1e-9)) {
        options.unshift({ label: `Same as the reviewed article${article.reviewedPack ? ` (${article.reviewedPack})` : ''}`, baseQuantity: round(article.reviewedQuantity, 6),
          baseUnit: article.reviewedUnit, unitPrice: packPrice ? round(packPrice / article.reviewedQuantity) : null });
      }
      if (items.some((existing) => existing.key === key)) continue;
      items.push({
        id: key, key, kind, reason, productId: row.id, productName: row.name, department: row.department || '', unit,
        supplier: article.supplier || '', code: article.code || '', description: article.description || '', pack: article.pack || '',
        packPrice, date: article.date || '', source: article.source || '', invoiceNumber: article.invoiceNumber || '',
        currentPrice: article.valid || article.implausible ? article.price : null, currentUnit: article.valid || article.implausible ? article.unit : '', reference,
        options, recommended: recommendedOption(options, reference), article,
      });
    }
    // The product card says one unit, the suppliers sell in another (e.g. butter "per L").
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
  const order = { implausible: 0, unit: 1, conversion: 2, outlier: 3, choose: 4 };
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

// Sets the product's own unit to the one its suppliers sell in (used for stock and recipes too).
export function applyProductUnit(product, item, now = new Date().toISOString()) {
  if (!UNITS.includes(item.unit)) throw new Error('Choose kg, L or unit.');
  return recordCheck({ ...product, baseUnit: item.unit, comparisonUnit: item.unit }, item, now, { unit: item.unit });
}

// Keeps the product's unit as it is; asked again only if the suppliers' unit changes.
export function keepProductUnit(product, item, now = new Date().toISOString()) {
  return recordCheck(product, item, now, { unit: item.unit, kept: true });
}
