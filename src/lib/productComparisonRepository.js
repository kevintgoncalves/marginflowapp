import { readAllPages } from './paginatedRead.js';
import { isCanonicalUuid, invoiceFromRelationalRow } from './invoiceRepository.js';

// Page-local, read-only price evidence. Never populate the invoice UI collection,
// fetch attachments, or fall back to cached invoice pages after a read failure.
export async function loadProductComparisonInvoices(client, scope, productIds) {
  if (!client || !isCanonicalUuid(scope.companyId) || (scope.locationId && !isCanonicalUuid(scope.locationId))) {
    throw new Error('A verified company/location is required to load supplier prices.');
  }
  const ids = [...new Set(productIds)].filter(isCanonicalUuid);
  const lines = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    lines.push(...await readAllPages((head = false) => {
      let q = client.from('invoice_lines').select(head ? 'id' : 'id,company_id,location_id,invoice_id,product_id,product_name,pack_size,quantity,unit_cost,net_line_total,metadata', { count: 'exact', head })
        .eq('company_id', scope.companyId).eq('active', true).in('product_id', ids.slice(offset, offset + 100));
      if (scope.locationId) q = q.eq('location_id', scope.locationId);
      return q;
    }, { label: 'supplier price lines' }));
  }
  const invoiceIds = [...new Set(lines.map(line => line.invoice_id))];
  const headers = [];
  for (let offset = 0; offset < invoiceIds.length; offset += 100) {
    headers.push(...await readAllPages((head = false) => {
      let q = client.from('invoices').select(head ? 'id' : 'id,company_id,location_id,supplier_id,invoice_number,invoice_date,document_type,status,suppliers(name),currency:metadata->marginflow_snapshot->>currency', { count: 'exact', head })
        .eq('company_id', scope.companyId).in('id', invoiceIds.slice(offset, offset + 100));
      if (scope.locationId) q = q.eq('location_id', scope.locationId);
      return q;
    }, { label: 'supplier price invoices' }));
  }
  const byInvoice = new Map();
  for (const line of lines) byInvoice.set(line.invoice_id, [...(byInvoice.get(line.invoice_id) || []), line]);
  return headers.filter(row => /^(approved|confirmed|imported|saved)$/i.test(row.status || ''))
    .map(row => invoiceFromRelationalRow({ ...row, metadata: { supplier_name: row.suppliers?.name || '', marginflow_snapshot: { currency: row.currency || 'GBP' } }, invoice_lines: byInvoice.get(row.id) || [] }));
}
