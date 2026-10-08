import { readAllPages } from './paginatedRead.js';
import { isCanonicalUuid } from './invoiceRepository.js';
import { RELATIONAL_PRODUCT_REFERENCE_TABLES } from '../domain/productMerge.js';

export function mergeSelectionKey(companyId, ids) {
  return JSON.stringify([companyId, [...new Set(ids)].sort()]);
}

// Company-wide: no date, location, status or UI-page filters. A missing table,
// denied read, incomplete page or missing product blocks the whole preview.
export async function loadProductMergeEvidence(client, companyId, productIds) {
  const ids = [...new Set(productIds)];
  if (!client || !isCanonicalUuid(companyId) || ids.length < 2 || ids.some(id => !isCanonicalUuid(id))) {
    throw new Error('Select at least two verified company products before merging.');
  }
  const read = (table, columns, field, values) => readAllPages((head = false) =>
    client.from(table).select(head ? 'id' : columns, { count: 'exact', head })
      .eq('company_id', companyId).in(field, values), { label: `merge preview ${table}` });
  const products = await read('products', 'id,company_id,name,supplier_id,active', 'id', ids);
  if (products.length !== ids.length || products.some(p => p.company_id !== companyId || p.active === false)) {
    throw new Error('Selected products are missing, inactive or outside the current company. Merge blocked.');
  }
  const references = {};
  for (const table of RELATIONAL_PRODUCT_REFERENCE_TABLES) {
    const extra = table === 'invoice_lines' ? ',invoice_id'
      : ['product_supplier_prices', 'product_price_history', 'product_supplier_formats', 'supplier_product_mappings'].includes(table) ? ',supplier_id' : '';
    references[table] = await read(table, `id,company_id,product_id${extra}`, 'product_id', ids);
    if (references[table].some(row => row.company_id !== companyId || !ids.includes(row.product_id))) {
      throw new Error(`Unexpected company/product scope in ${table}. Merge blocked.`);
    }
  }
  const invoiceIds = [...new Set(references.invoice_lines.map(row => row.invoice_id))];
  const invoices = [];
  for (let offset = 0; offset < invoiceIds.length; offset += 100) {
    invoices.push(...await read('invoices', 'id,company_id,supplier_id', 'id', invoiceIds.slice(offset, offset + 100)));
  }
  if (invoices.length !== invoiceIds.length || invoices.some(row => row.company_id !== companyId)) {
    throw new Error('Historical invoice supplier links could not be verified. Merge blocked.');
  }
  const invoiceSuppliers = new Map(invoices.map(row => [row.id, row.supplier_id]));
  const fields = { invoice_lines: 'invoiceLines', stocktake_lines: 'stocktakeLines', recipe_ingredients: 'recipeIngredients', menu_item_components: 'menuComponents', waste_entries: 'wasteEntries', invoice_line_corrections: 'invoiceCorrections', product_price_history: 'priceHistory', product_supplier_prices: 'supplierPrices' };
  const usageByProduct = {};
  for (const product of products) {
    const usage = {};
    for (const [table, field] of Object.entries(fields)) usage[field] = references[table].filter(row => row.product_id === product.id).length;
    const suppliers = new Set([product.supplier_id].filter(Boolean));
    for (const rows of Object.values(references)) for (const row of rows) {
      if (row.product_id === product.id) {
        const supplierId = row.supplier_id || invoiceSuppliers.get(row.invoice_id);
        if (supplierId) suppliers.add(supplierId);
      }
    }
    usage.supplierMappings = suppliers.size;
    usageByProduct[product.id] = usage;
  }
  return { key: mergeSelectionKey(companyId, ids), usageByProduct };
}

export function verifiedMergePreview(analysis, evidence, companyId, selectedIds, keepId) {
  if (!analysis || !selectedIds.includes(keepId) || evidence?.key !== mergeSelectionKey(companyId, selectedIds)
      || analysis.selectedProducts.length !== selectedIds.length
      || analysis.selectedProducts.some(p => !selectedIds.includes(p.id) || !evidence.usageByProduct[p.id])) return null;
  const totals = {};
  for (const usage of Object.values(evidence.usageByProduct)) for (const [key, value] of Object.entries(usage)) totals[key] = (totals[key] || 0) + value;
  return { ...analysis, usageByProduct: evidence.usageByProduct, totals };
}
