import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readAllPages } from "../lib/paginatedRead.js";
import { loadRelationalInvoiceDetails, loadRelationalInvoicePage, loadRelationalInvoiceReportRange, loadRelationalInvoices } from "../lib/invoiceRepository.js";
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
      let filters = [], predicates = [], options = {}, orExpression = "", start = 0, end = Infinity;
      const query = {
        select(columns, config = {}) { options = config; return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return this; },
        gte(key, value) { predicates.push((row) => row[key] >= value); return this; },
        lte(key, value) { predicates.push((row) => row[key] <= value); return this; },
        or(expression = "") { orExpression = expression; predicates.push((row) => !row.location_id || row.location_id === locationId); return this; },
        order() { return this; },
        limit(value) { start = 0; end = value - 1; return this; },
        range(first, last) { start = first; end = last; return this; },
        then(resolve, reject) {
          const request = { table, filters, orExpression, head: options.head, start, end };
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

test("initial invoice page fetches only 25 headers and no invoice lines", async () => {
  const tables = invoiceDataset();
  const client = cappedClient(tables, { cap: 1000 });
  const page = await loadRelationalInvoicePage(client, scope);
  assert.equal(page.invoices.length, 25);
  assert.equal(page.total, 1005);
  assert.equal(page.hasMore, true);
  assert.deepEqual([...new Set(client.requests.map(request => request.table))], ["invoices"]);
  assert.equal(page.invoices.every(invoice => invoice.items.length === 0), true);
});

test("invoice pagination loads the next headers without duplicate IDs", async () => {
  const tables = invoiceDataset();
  const client = cappedClient(tables, { cap: 1000 });
  const first = await loadRelationalInvoicePage(client, scope);
  const second = await loadRelationalInvoicePage(client, scope, { offset: first.nextOffset });
  assert.equal(new Set([...first.invoices, ...second.invoices].map(invoice => invoice.id)).size, 50);
  assert.equal(second.nextOffset, 50);
});

test("invoice search remains company and location scoped on the server", async () => {
  const client = cappedClient(invoiceDataset(), { cap: 1000 });
  await loadRelationalInvoicePage(client, scope, { filters: { search: "INV-835412" } });
  const request = client.requests[0];
  assert.equal(request.table, "invoices");
  assert.ok(request.filters.some(([key, value]) => key === "company_id" && value === companyId));
  assert.ok(request.filters.some(([key, value]) => key === "location_id" && value === locationId));
  assert.match(request.orExpression, /invoice_number\.ilike/);
  assert.match(request.orExpression, /document_number\.ilike/);
});

test("invoice page timeout rejects instead of being represented as no invoices", async () => {
  const client = cappedClient(invoiceDataset(), { intercept: request => request.table === "invoices" ? new Error("canceling statement due to statement timeout") : null });
  await assert.rejects(loadRelationalInvoicePage(client, scope), /statement timeout/);
});

test("opening one invoice fetches only its scoped lines and splits", async () => {
  const invoiceId = "33333333-3333-4333-8333-333333333333";
  const lineId = "44444444-4444-4444-8444-444444444444";
  const tables = {
    invoices: [{ id: invoiceId, company_id: companyId, location_id: locationId, invoice_date: "2026-09-11", metadata: {} }],
    invoice_lines: [{ id: lineId, invoice_id: invoiceId, company_id: companyId, location_id: locationId, active: true, quantity: 1, unit_cost: 3 }],
    invoice_line_department_splits: [{ id: "55555555-5555-4555-8555-555555555555", invoice_line_id: lineId, company_id: companyId, location_id: locationId, active: true }],
  };
  const client = cappedClient(tables, { cap: 1000 });
  const invoice = await loadRelationalInvoiceDetails(client, scope, invoiceId);
  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].departmentSplits.length, 1);
  assert.ok(client.requests.filter(request => request.table !== "invoices").every(request => request.filters.some(([key, value]) => key === "company_id" && value === companyId)));
  assert.ok(client.requests.find(request => request.table === "invoice_lines").filters.some(([key, value]) => key === "invoice_id" && value === invoiceId));
});

test("department reports use a separate date-scoped invoice and line query", async () => {
  const tables = invoiceDataset();
  tables.invoices[0].invoice_date = "2026-08-31";
  const client = cappedClient(tables, { cap: 10000 });
  const report = await loadRelationalInvoiceReportRange(client, scope, { startDate: "2026-09-01", endDate: "2026-09-30" });
  assert.equal(report.length, 1004);
  assert.equal(report.some(invoice => invoice.id === tables.invoices[0].id), false);
  assert.equal(report.every(invoice => invoice.items.length === 3), true);
  assert.deepEqual([...new Set(client.requests.map(request => request.table))], ["invoices", "invoice_lines", "invoice_line_department_splits"]);
});

test("current-month sales use a separate company and location scoped query", async () => {
  const tables = {
    departments: [],
    sales_entries: [
      { id: "sale-current", company_id: companyId, location_id: locationId, sales_date: "2026-10-01", net_sales: 10 },
      { id: "sale-old", company_id: companyId, location_id: locationId, sales_date: "2026-09-30", net_sales: 20 },
    ],
    sales_department_lines: [],
  };
  const client = cappedClient(tables, { cap: 1000 });
  const rows = await loadRelationalSales(client, scope, { startDate: "2026-10-01", endDate: "2026-10-31" });
  assert.deepEqual(rows.map(row => row.id), ["sale-current"]);
  assert.ok(client.requests.every(request => request.filters.some(([key, value]) => key === "company_id" && value === companyId)));
});

test("workspace refresh keeps reports period-scoped and stores only unsaved invoice recovery work", () => {
  const source = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /setInterval\(refreshRelationalOperations,\s*30000\)/);
  assert.match(source, /loadRelationalInvoicePage\(supabase, scope, \{ limit: 25 \}\)/);
  assert.match(source, /calculateMetrics\(analyticsInvoices,/);
  assert.match(source, /spendBySupplier\(analyticsInvoices,/);
  assert.doesNotMatch(source, /calculateMetrics\(operationalInvoices,/);
  assert.match(source, /saveLocalStorage\("marginflow\.pendingInvoices", next\.filter/);
  assert.doesNotMatch(source, /saveLocalStorage\("marginflow\.invoices", next\)/);
  assert.match(source, /Sync attention needed/);
});

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
