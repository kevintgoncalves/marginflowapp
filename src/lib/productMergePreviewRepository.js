import { readAllPages } from './paginatedRead.js';
import { isCanonicalUuid } from './invoiceRepository.js';
import { RELATIONAL_PRODUCT_REFERENCE_TABLES, suggestCanonicalProduct } from '../domain/productMerge.js';

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
  // Snapshots still contain catalogue/learning references in legacy companies.
  // They are not a replacement financial ledger and cannot be silently ignored.
  const snapshots = await read('marginflow_cloud_state', 'id,company_id,scope_key,module_key,revision,payload', 'module_key',
    ['products','invoices','stocktakes','recipes','menus','wasteItems','supplierProductMappings','invoiceLineCorrections']);
  if (snapshots.some(row => row.company_id !== companyId || !Array.isArray(row.payload))) {
    throw new Error('Company snapshot references could not be verified. Merge blocked.');
  }
  const products = await read('products', '*', 'id', ids);
  if (products.length !== ids.length || products.some(p => p.company_id !== companyId || p.active === false)) {
    throw new Error('Selected products are missing, inactive or outside the current company. Merge blocked.');
  }
  const references = {};
  for (const table of RELATIONAL_PRODUCT_REFERENCE_TABLES) {
    const extra = table === 'recipe_ingredients' ? ',recipe_id' : table === 'menu_item_components' ? ',menu_item_id' : table === 'stocktake_lines' ? ',stocktake_id' : table === 'invoice_lines' ? ',invoice_id'
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
  const conflicts = [];
  for (const [table, parent] of [['recipe_ingredients','recipe_id'],['menu_item_components','menu_item_id'],['stocktake_lines','stocktake_id']]) {
    const groups = new Map();
    for (const row of references[table]) {
      if (!row[parent]) continue;
      if (!groups.has(row[parent])) groups.set(row[parent], new Set());
      groups.get(row[parent]).add(row.product_id);
    }
    for (const [recordId, products] of groups) if (products.size > 1) conflicts.push({type:'shared_reference',level:'blocking',recordId,message:`${table}: selected products share record ${recordId}. Review its lines before merging.`});
  }
  const snapshotReferences = [];
  const inspect = (value, snapshot) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { value.forEach(row => inspect(row, snapshot)); return; }
    const productId = value.matchedProductId || value.productId || value.product_id ||
      (String(value.type || 'Product').toLowerCase() === 'product' ? value.sourceId : null);
    const catalogueEntry = snapshot.module_key === 'products' && ids.includes(value.id);
    if (ids.includes(productId) || catalogueEntry) {
      snapshotReferences.push({ productId: productId || value.id, module: snapshot.module_key,
        scopeKey: snapshot.scope_key, revision: snapshot.revision, recordId: value.id || null });
    }
    Object.values(value).forEach(child => inspect(child, snapshot));
  };
  snapshots.forEach(snapshot => inspect(snapshot.payload, snapshot));
  // The merge RPC accepts a single location snapshot. Until its write plan covers
  // every observed revision/reference, do not claim these links will be preserved.
  if (snapshotReferences.length) conflicts.push({ type:'snapshot_reconciliation', level:'blocking',
    message:'Existing cloud snapshot catalogue/history references require reconciliation before merging. No links have been treated as zero.' });
  return { key: mergeSelectionKey(companyId, ids), usageByProduct, products, conflicts, snapshotReferences };


}

export function verifiedMergePreview(analysis, evidence, companyId, selectedIds, keepId) {
  if (!analysis || !selectedIds.includes(keepId) || evidence?.key !== mergeSelectionKey(companyId, selectedIds)
      || analysis.selectedProducts.length !== selectedIds.length
      || analysis.selectedProducts.some(p => !selectedIds.includes(p.id) || !evidence.usageByProduct[p.id])) return null;
  const totals = {};
  for (const usage of Object.values(evidence.usageByProduct)) for (const [key, value] of Object.entries(usage)) totals[key] = (totals[key] || 0) + value;
  const conflicts = [...analysis.conflicts, ...(evidence.conflicts || [])];
  return { ...analysis, usageByProduct: evidence.usageByProduct, totals,
    recommendedKeepProductId: suggestCanonicalProduct(analysis.selectedProducts, evidence.usageByProduct)?.id || '',
    conflicts, blockingConflicts: conflicts.filter(row => row.level === 'blocking'),
    canMerge: analysis.canMerge && !conflicts.some(row => row.level === 'blocking') };

}
