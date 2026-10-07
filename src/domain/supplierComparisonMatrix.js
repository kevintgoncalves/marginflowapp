import { isStockOriginSupplier } from './supplierIdentity.js';

// Group exact display-name duplicates for comparison only; stored supplier IDs remain unchanged.
export const matrixSupplierKey = article => article.supplier ? `name:${article.supplier.normalize("NFKC").trim().replace(/\s+/g," ").toLocaleLowerCase()}` : `id:${article.supplierId}`;
export function matrixSuppliers(products) {
  const options = new Map();
  for (const product of products) for (const article of product.comparison?.articles || []) {
    if ((!article.supplierId && !article.supplier) || isStockOriginSupplier(article.supplier)) continue;
    const key = matrixSupplierKey(article);
    options.set(key, { key, name: article.supplier || article.supplierId });
  }
  return [...options.values()].sort((a,b)=>a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
export function supplierComparisonMatrix(products, suppliers, { query = '', department = '', status = '' } = {}) {
  const term = query.trim().toLocaleLowerCase();
  return products.filter(p => (!department || p.department === department) && (!term || `${p.name} ${p.id}`.toLocaleLowerCase().includes(term))).map(product => {
    const cells = suppliers.map(supplier => {
      const articles = (product.comparison?.articles || []).filter(a => matrixSupplierKey(a) === supplier.key);
      if (!articles.length || articles.every(a => !a.date)) return { supplier, status: 'Sem preço', reason: 'No confirmed invoice price', article: null, percent: null };
      // Different article identities remain ambiguous even when one is newer/cheaper.
      if (articles.length !== 1) return { supplier, status: 'Não comparável', reason: 'Multiple supplier articles; select an article in the catalogue', article: null, percent: null };
      const article = articles[0];
      return { supplier, article, percent: null, status: article.valid && article.price > 0 ? 'Comparable' : 'Não comparável', reason: article.valid ? '' : article.status };
    });
    const valid = cells.filter(c => c.status === 'Comparable');
    const bases = new Set(valid.map(c => `${c.article.currency}:${c.article.unit}`));
    if (bases.size > 1) for (const cell of valid) { cell.status = 'Não comparável'; cell.reason = 'Different units or currency — no confirmed conversion'; }
    const comparable = cells.filter(c => c.status === 'Comparable');
    const minimum = comparable.length >= 2 ? Math.min(...comparable.map(c => c.article.price)) : null;
    const cheapest = minimum === null ? [] : comparable.filter(c => c.article.price === minimum).map(c => c.supplier.name);
    for (const cell of comparable) {
      if (minimum !== null) cell.percent = (cell.article.price / minimum - 1) * 100;
      else cell.reason = 'Only one comparable supplier';
    }
    return { id: product.id, name: product.name, department: product.department, cells, cheapest, minimum };
  }).filter(row => !status || (status === 'comparable' ? row.minimum !== null : row.cells.some(c => c.status !== 'Comparable')));
}
