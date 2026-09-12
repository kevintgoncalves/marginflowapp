import assert from "node:assert/strict";
import test from "node:test";
import { readAllPages } from "../lib/paginatedRead.js";
import { loadRelationalInvoices } from "../lib/invoiceRepository.js";
import { loadRelationalSales } from "../lib/salesRepository.js";
import { confirmedInvoicesForScope, rememberConfirmedInvoice } from "./confirmedInvoices.js";
import { relationalOperationalInvoiceCollection } from "./emergencyRecovery.js";

const companyId = "11111111-1111-4111-8111-111111111111";
const locationId = "22222222-2222-4222-8222-222222222222";
const scope = { companyId, locationId };

// Emulates the response cap and count semantics rather than assuming one response.
function cappedClient(tables, { cap = 77, intercept = () => {} } = {}) {
  const requests = [];
  return {
    requests,
    from(table) {
      let filters = [], predicates = [], options = {}, start = 0, end = Infinity;
      const query = {
        select(columns, config = {}) { options = config; return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return this; },
        gte(key, value) { predicates.push((row) => row[key] >= value); return this; },
        lte(key, value) { predicates.push((row) => row[key] <= value); return this; },
        or() { predicates.push((row) => !row.location_id || row.location_id === locationId); return this; },
        order() { return this; },
        range(first, last) { start = first; end = last; return this; },
        then(resolve, reject) {
          const request = { table, filters, head: options.head, start, end };
          requests.push(request);
          const error = intercept(request, requests);
          const filtered = (tables[table] || []).filter((row) => filters.every(([key, value]) => row[key] === value) && predicates.every((p) => p(row))).sort((a,b) => a.id.localeCompare(b.id));
          return Promise.resolve({ error, count: filtered.length, data: options.head ? null : structuredClone(filtered.slice(start, Math.min(end + 1, start + cap))) }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function invoiceDataset() {
  const invoices = Array.from({ length: 1005 }, (_, i) => ({
    id: `i${String(i).padStart(5, "0")}`, company_id: companyId, location_id: locationId,
    invoice_date: "2026-09-11", sync_revision: 1, updated_at: "2026-09-11T10:00:00Z", subtotal: 6, total_amount: 6,
  }));
  const invoice_lines = invoices.flatMap((invoice) => Array.from({ length: 3 }, (_, i) => ({
    id: `${invoice.id}-l${i}`, invoice_id: invoice.id, company_id: companyId, location_id: locationId,
    active: true, quantity: 1, unit_cost: 2, net_line_total: 2,
  })));
  const invoice_line_department_splits = invoice_lines.map((line) => ({ id: `${line.id}-s`, invoice_line_id: line.id,
    company_id: companyId, location_id: locationId, active: true, percentage: 100, amount: 2 }));
  return { invoices, invoice_lines, invoice_line_department_splits };
}

test("fresh-device read loads every invoice, line and split beyond the server cap, without writes", async () => {
  const tables = invoiceDataset();
  tables.invoices.push({ ...tables.invoices[0], id: "wrong-company", company_id: "other" });
  tables.invoice_lines.push({ ...tables.invoice_lines[0], id: "wrong-location", location_id: "other" });
  const before = structuredClone(tables);
  const client = cappedClient(tables);
  const loaded = await loadRelationalInvoices(client, scope);
  assert.equal(loaded.length, 1005);
  assert.equal(loaded.reduce((n, row) => n + row.items.length, 0), 3015);
  assert.equal(loaded.flatMap((row) => row.items).reduce((n, row) => n + row.departmentSplits.length, 0), 3015);
  assert.equal(loaded.flatMap((row) => row.items).reduce((n, row) => n + row.lineTotal, 0), 6030);
  assert.deepEqual(tables, before);
  assert.ok(client.requests.every((r) => r.filters.some(([key,value]) => key === "company_id" && value === companyId)));
});

test("an intermediate page failure rejects the load instead of returning partial financial data", async () => {
  const tables = invoiceDataset();
  const before = structuredClone(tables);
  const client = cappedClient(tables, { intercept: (r) => r.table === "invoice_lines" && r.start > 0 ? new Error("Page unavailable") : null });
  await assert.rejects(loadRelationalInvoices(client, scope), /Page unavailable/);
  assert.deepEqual(tables, before);
});

test("a cloud revision changed during the document read is rejected", async () => {
  const tables = invoiceDataset();
  const client = cappedClient(tables, { intercept: (r) => {
    if (r.table === "invoice_lines" && r.start === 0) tables.invoices[0].sync_revision += 1;
    return null;
  } });
  await assert.rejects(loadRelationalInvoices(client, scope), /changed during loading/);
});

test("missing counts, empty partial pages and repeated rows cannot masquerade as complete data", async () => {
  const factory = (result) => () => ({ order(){ return this; }, range(){ return Promise.resolve(result); } });
  await assert.rejects(readAllPages(factory({ data: [], count: null })), /verify complete/);
  await assert.rejects(readAllPages(factory({ data: [], count: 10 })), /incomplete/);
  await assert.rejects(readAllPages(factory({ data: [{id: "same"}], count: 2 })), /Duplicate/);
});

test("pending edits survive a newer cloud revision but cannot change official totals", () => {
  const cloud = { id: "i1", companyId, locationId, syncStatus: "synced", persistenceSource: "relational", syncRevision: 5,
    documentNumber: "INV1", date: "2026-09-11", total: 10, items: [{id:"l1",lineTotal:10}] };
  const pending = { ...cloud, syncRevision: 4, syncStatus: "sync_failed", total: 99, items: [{id:"l1",lineTotal:99}] };
  const work = relationalOperationalInvoiceCollection({ ...scope, localInvoices: [pending], relationalInvoices: [cloud] });
  assert.equal(work[0].total, 99);
  assert.equal(work[0].syncRetryBlocked, true);
  assert.deepEqual(pending.items, [{id:"l1",lineTotal:99}]);
  const confirmed = confirmedInvoicesForScope([cloud], scope);
  assert.equal(confirmed[0].total, 10);
  assert.deepEqual(confirmedInvoicesForScope(work, scope), []);
  assert.deepEqual(rememberConfirmedInvoice(confirmed, pending), confirmed);
});

test("only a confirmed write advances the financial view, and an older acknowledgement cannot revert it", () => {
  const cloud = { id: "i1", companyId, locationId, syncStatus: "synced", persistenceSource: "relational", syncRevision: 5, total: 10 };
  const updated = { ...cloud, syncRevision: 6, total: 99 };
  const state = rememberConfirmedInvoice([cloud], updated);
  assert.equal(state[0].total, 99);
  assert.equal(rememberConfirmedInvoice(state, cloud)[0].total, 99);
  assert.deepEqual(confirmedInvoicesForScope(state, { companyId: "another-company" }), []);
  assert.deepEqual(confirmedInvoicesForScope(state, { companyId, locationId: "another-location" }), []);
});

test("a pending document with a different UUID is not silently discarded by identity matching", () => {
  const cloud = { id: "i1", companyId, locationId, documentNumber: "INV1", supplier: "ABC", date: "2026-09-11", total: 10, syncStatus: "synced", persistenceSource: "relational" };
  const pending = { ...cloud, id: "i2", total: 99, syncStatus: "sync_failed" };
  const work = relationalOperationalInvoiceCollection({ ...scope, localInvoices: [pending], relationalInvoices: [cloud] });
  assert.equal(work.length, 2);
  assert.ok(work.some((row) => row.id === "i2" && row.total === 99));
});

test("sales beyond the response cap retain every selected entry and department total", async () => {
  const entries = Array.from({length:1005},(_,i) => ({id:`sale-${String(i).padStart(5,'0')}`,company_id:companyId,location_id:locationId,
    sales_date:'2026-09-11',net_sales:10,gross_sales:12,updated_at:'2026-09-11T10:00:00Z'}));
  const lines = entries.map((row) => ({id:`${row.id}-line`,company_id:companyId,location_id:locationId,sales_entry_id:row.id,department_id:'d1',net_sales:10,gross_sales:12}));
  const tables = {sales_entries:entries,sales_department_lines:lines,departments:[{id:'d1',company_id:companyId,location_id:locationId,name:'Kitchen'}]};
  const before = structuredClone(tables);
  const loaded = await loadRelationalSales(cappedClient(tables),scope,{startDate:'2026-09-01',endDate:'2026-09-30'});
  assert.equal(loaded.length,1005);
  assert.equal(loaded.reduce((sum,row) => sum+row.departments.Kitchen.netSales,0),10050);
  assert.deepEqual(tables,before);
});
