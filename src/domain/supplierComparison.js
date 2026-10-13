// Side-by-side supplier price comparison built from latestProductComparisons() rows.
// Prices are compared only on the same basis (currency + per kg / l / each), using each
// supplier's latest comparable article for the product.
import { sameSupplierIdentity } from './supplierIdentity.js';

const basisOf = (article) => `${article.currency || 'GBP'}:${article.unit}`;

// Suppliers that have at least one comparable price, with how many products they price.
export function comparableSuppliers(rows = []) {
  const counts = [];
  rows.forEach((row) => {
    const seen = [];
    (row.comparison?.comparable || []).forEach((article) => {
      if (!article.supplier || seen.some((name) => sameSupplierIdentity(name, article.supplier))) return;
      seen.push(article.supplier);
      const entry = counts.find((item) => sameSupplierIdentity(item.name, article.supplier));
      if (entry) entry.products += 1;
      else counts.push({ name: article.supplier, products: 1 });
    });
  });
  return counts.sort((a, b) => b.products - a.products || a.name.localeCompare(b.name));
}

function bestArticleFor(row, supplier) {
  return (row.comparison?.comparable || [])
    .filter((article) => article.valid && sameSupplierIdentity(article.supplier || '', supplier))
    .sort((a, b) => a.price - b.price || String(b.date).localeCompare(String(a.date)))[0] || null;
}

// One row per product priced by at least `minSuppliers` of the selected suppliers.
export function supplierComparisonTable(rows = [], suppliers = [], { minSuppliers = 2 } = {}) {
  const table = [];
  rows.forEach((row) => {
    const prices = {};
    suppliers.forEach((supplier) => {
      const article = bestArticleFor(row, supplier);
      if (article) prices[supplier] = article;
    });
    // Keep one basis: the most common among the selected suppliers' prices.
    const bases = Object.values(prices).map(basisOf);
    const basis = bases.sort((a, b) => bases.filter((x) => x === b).length - bases.filter((x) => x === a).length)[0];
    Object.keys(prices).forEach((supplier) => { if (basisOf(prices[supplier]) !== basis) delete prices[supplier]; });
    const priced = Object.keys(prices);
    if (priced.length < minSuppliers) return;
    const cheapest = priced.reduce((best, supplier) => (!best || prices[supplier].price < prices[best].price ? supplier : best), '');
    const dearest = priced.reduce((worst, supplier) => (!worst || prices[supplier].price > prices[worst].price ? supplier : worst), '');
    const [currency, unit] = basis.split(':');
    table.push({
      id: row.id,
      product: row.name,
      department: row.department || '',
      comparisonUnit: row.comparisonUnit || '',
      unit,
      currency,
      prices,
      cheapest,
      spread: prices[dearest].price - prices[cheapest].price,
      spreadPercent: prices[cheapest].price > 0 ? (prices[dearest].price - prices[cheapest].price) / prices[cheapest].price : null,
    });
  });
  return table.sort((a, b) => (b.spreadPercent ?? 0) - (a.spreadPercent ?? 0) || a.product.localeCompare(b.product));
}

export function comparisonSummary(table = [], suppliers = []) {
  return suppliers.map((supplier) => ({
    supplier,
    priced: table.filter((row) => row.prices[supplier]).length,
    cheapest: table.filter((row) => row.cheapest && sameSupplierIdentity(row.cheapest, supplier)).length,
  }));
}

// Anonymous price-request rows for one supplier: their price next to the best price seen at the
// other selected suppliers, without naming them. Only products both they and another supplier price.
export function anonymousPriceRequestRows(table = [], supplier = '') {
  return table.filter((row) => row.prices[supplier]).map((row) => {
    const own = row.prices[supplier];
    const others = Object.entries(row.prices).filter(([name]) => !sameSupplierIdentity(name, supplier)).map(([, article]) => article);
    if (!others.length) return null;
    const bestOther = others.reduce((best, article) => (!best || article.price < best.price ? article : best), null);
    const gap = own.price - bestOther.price;
    return {
      product: row.product,
      code: own.code || '',
      description: own.description || '',
      pack: own.pack || '',
      unit: row.unit,
      currency: row.currency,
      yourPrice: own.price,
      yourPriceDate: own.date || '',
      bestOtherPrice: bestOther.price,
      bestOtherDate: bestOther.date || '',
      difference: gap,
      differencePercent: bestOther.price > 0 ? gap / bestOther.price : null,
      position: gap > 1e-9 ? 'Above best price' : 'Best price',
    };
  }).filter(Boolean).sort((a, b) => (b.differencePercent ?? 0) - (a.differencePercent ?? 0) || a.product.localeCompare(b.product));
}
