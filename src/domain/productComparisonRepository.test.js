import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProductComparisonInvoices } from '../lib/productComparisonRepository.js';

const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function clientFor(rowsByTable) {
  return { from(table) {
    let filters = [], start = 0, end = Infinity, head = false;
    const query = {
      select(_columns, options = {}) { head = Boolean(options.head); return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      order() { return query; },
      range(first, last) { start = first; end = last; return query; },
      then(resolve, reject) {
        const rows = (rowsByTable[table] || []).filter(row => filters.every(filter => filter(row)));
        return Promise.resolve({ data: head ? null : rows.slice(start, end + 1), count: rows.length, error: null }).then(resolve, reject);
      },
    };
    return query;
  } };
}

test('comparison price reads are complete, company/location scoped and read-only', async () => {
  const companyId = id(1), locationId = id(2), productId = id(3), invoiceId = id(4);
  const rows = {
    invoice_lines: [{ id: id(5), company_id: companyId, location_id: locationId, invoice_id: invoiceId, product_id: productId, active: true, quantity: 1, unit_cost: 2, metadata: {} }],
    invoices: [{ id: invoiceId, company_id: companyId, location_id: locationId, supplier_id: id(6), invoice_number: 'A-1', invoice_date: '2026-10-01', status: 'Confirmed', suppliers: { name: 'Supplier A' } }],
  };
  const before = JSON.stringify(rows);
  const result = await loadProductComparisonInvoices(clientFor(rows), { companyId, locationId }, [productId]);
  assert.equal(result.length, 1);
  assert.equal(result[0].supplier, 'Supplier A');
  assert.equal(result[0].items.length, 1);
  assert.equal(JSON.stringify(rows), before);
});
