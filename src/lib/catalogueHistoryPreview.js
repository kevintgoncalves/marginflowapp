import { readAllPages } from './paginatedRead.js';
import { isCanonicalUuid } from './invoiceRepository.js';
import { matchInvoiceLineToExistingProduct } from '../domain/invoiceProductMatching.js';

// Read-only proposal. Never writes invoice identities, prices or learned rules.
export async function loadCatalogueHistoryPreview(client, scope, { products = [], mappings = [] } = {}) {
  if (!client || !isCanonicalUuid(scope.companyId) || (scope.locationId && !isCanonicalUuid(scope.locationId))) throw new Error('A verified company and location are required.');
  const read = (table, columns, configure) => readAllPages((head = false) => {
    let q = client.from(table).select(head ? 'id' : columns, { count: 'exact', head }).eq('company_id', scope.companyId);
    if (scope.locationId) q = q.eq('location_id', scope.locationId);
    return configure(q);
  }, { label: `catalogue recovery ${table}` });
  const invoiceRows = await read('invoices', 'id,company_id,location_id,supplier_id,invoice_number,invoice_date,status', q => q);
  // Historical rows predate the current lower-case status convention. The SQL
  // reconciliation normalises status before filtering, so the UI must do the
  // same or valid `Confirmed`/`Saved` rows disappear from the preview.
  const confirmedStatuses = new Set(['approved', 'confirmed', 'imported', 'saved']);
  const invoices = invoiceRows.filter(row => confirmedStatuses.has(String(row.status || '').trim().toLowerCase()));
  const counts = { processed: 0, linked: 0, recoverable: 0, ambiguous: 0, errors: 0, withPrice: 0, withoutPrice: 0, safeAssociation: 0 };
  const rows = [];
  for (let start = 0; start < invoices.length; start += 100) {
    const batch = invoices.slice(start, start + 100);
    const headers = new Map(batch.map(row => [row.id, row]));
    const lines = await read('invoice_lines', 'id,company_id,location_id,invoice_id,product_id,product_name,pack_size,quantity,unit_cost,net_line_total,metadata', q => q.eq('active', true).in('invoice_id', batch.map(row => row.id)));
    for (const line of lines) {
      const invoice = headers.get(line.invoice_id);
      if (!invoice || line.company_id !== scope.companyId || invoice.company_id !== scope.companyId || (scope.locationId && (line.location_id !== scope.locationId || invoice.location_id !== scope.locationId))) throw new Error('Unexpected scope in historical records. Preview discarded.');
      counts.processed++;
      const saved = line.metadata?.marginflow_snapshot || {};
      const product = products.find(p => p.id === line.product_id && (p.companyId || p.company_id) === scope.companyId && p.active !== false);
      const match = product ? null : matchInvoiceLineToExistingProduct({ organisationId: scope.companyId, locationId: invoice.location_id, supplierId: invoice.supplier_id, supplierProductCode: saved.supplierProductCode,
        rawDescription: saved.rawDescription || line.product_name, packSize: line.pack_size, existingProducts: products.filter(p => (p.companyId || p.company_id) === scope.companyId), supplierMappings: mappings });
      const priceKnown = line.unit_cost !== null && line.unit_cost !== undefined && Number.isFinite(Number(line.unit_cost)) && Boolean(invoice.invoice_date && invoice.supplier_id);
      const hasPrice = line.unit_cost !== null && line.unit_cost !== undefined && String(line.unit_cost).trim() !== '' && Number.isFinite(Number(line.unit_cost));
      counts[hasPrice ? 'withPrice' : 'withoutPrice']++;
      if (product || (!line.product_id && match?.matchedProductId && !match.needsReview)) counts.safeAssociation++;
      // Never redirect an existing FK silently, even when the loaded catalogue lacks it.
      const canRecover = !line.product_id && match?.matchedProductId && !match.needsReview && priceKnown;
      const status = product && priceKnown ? 'linked' : canRecover ? 'recoverable' : !priceKnown ? 'errors' : 'ambiguous';
      counts[status]++;
      rows.push({ lineId: line.id, invoiceId: invoice.id, invoiceNumber: invoice.invoice_number, date: invoice.invoice_date, supplierId: invoice.supplier_id,
        productId: line.product_id || match?.matchedProductId || null, description: saved.rawDescription || line.product_name,
        pack: line.pack_size, originalUnitPrice: priceKnown ? Number(line.unit_cost) : null, status,
        reason: status === 'ambiguous' ? 'No unambiguous confirmed link; existing IDs are never reassigned.' : status === 'errors' ? 'Missing confirmed price, supplier or date.' : '' });
    }
  }
  return { scope: { ...scope }, counts, rows };
}
