import assert from "node:assert/strict";
import test from "node:test";
import { loadRelationalInvoiceReportRange } from "../lib/invoiceRepository.js";
import { readAllPages } from "../lib/paginatedRead.js";
import { loadRelationalSales, persistRelationalSalesEntry } from "../lib/salesRepository.js";
import { canonicalJson, compareInvoiceLists, headlineRows } from "./reportLoadComparison.js";

const companyId = "afa22b1e-05a8-48b9-b62a-2dd57dddae94";
const locationId = "74ef92c7-0203-4951-a085-2e49bfc65f3a";
const scope = { companyId, locationId };
const uuid = (prefix, n) => `${prefix}${String(n).padStart(12, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-4$3-8$4-$5").slice(0, 36);

// Same transformation as supabase/migrations/20261024200000_invoice_report_headers.sql.
function lightMetadata(metadata) {
  const snapshot = metadata?.marginflow_snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || !Array.isArray(snapshot.items)) return metadata;
  return {
    ...metadata,
    marginflow_snapshot: {
      ...snapshot,
      items: snapshot.items.map((item) => (item && typeof item === "object" && !Array.isArray(item) && "id" in item ? { id: item.id } : {})),
    },
  };
}

function fakeClient(tables, { cap = 1000, view = true } = {}) {
  const requests = [];
  return {
    requests,
    from(table) {
      const predicates = [];
      const embedFilters = [];
      let config = {}, start = 0, end = Infinity, columns = "*";
      const query = {
        select(value, options = {}) { columns = value; config = options; return query; },
        // PostgREST: a filter on an embedded table filters the embedded rows, not the parent rows.
        eq(key, value) { if (key.startsWith("invoice_line_department_splits.")) embedFilters.push([key.split(".")[1], value]); else predicates.push((row) => row[key] === value); return query; },
        in(key, values) { predicates.push((row) => values.includes(row[key])); return query; },
        gte(key, value) { predicates.push((row) => row[key] >= value); return query; },
        lte(key, value) { predicates.push((row) => row[key] <= value); return query; },
        or() { predicates.push((row) => !row.location_id || row.location_id === locationId); return query; },
        order() { return query; },
        range(first, last) { start = first; end = last; return query; },
        abortSignal() { return query; },
        then(resolve, reject) {
          requests.push({ table, head: Boolean(config.head), columns, start, end });
          if (table === "invoice_report_headers" && !view) {
            return Promise.resolve({ data: null, count: null, error: { code: "PGRST205", message: "Could not find the table 'public.invoice_report_headers' in the schema cache" } }).then(resolve, reject);
          }
          const source = table === "invoice_report_headers"
            ? tables.invoices.map((row) => ({ ...row, metadata: lightMetadata(row.metadata) }))
            : (tables[table] || []);
          const rows = source.filter((row) => predicates.every((p) => p(row))).sort((a, b) => a.id.localeCompare(b.id));
          const data = config.head ? null : structuredClone(rows.slice(start, Math.min(end + 1, start + cap)));
          if (data && String(columns).includes("invoice_line_department_splits(")) {
            data.forEach((row) => { row.invoice_line_department_splits = structuredClone((tables.invoice_line_department_splits || []).filter((split) => split.invoice_line_id === row.id && embedFilters.every(([key, value]) => split[key] === value)).sort((a, b) => a.id.localeCompare(b.id))); });
          }
          return Promise.resolve({ data, count: rows.length, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

function invoiceTables(count = 1205) {
  const invoices = [];
  const invoice_lines = [];
  const invoice_line_department_splits = [];
  for (let n = 0; n < count; n += 1) {
    const id = uuid("10000000", n);
    const lineIds = [uuid("20000000", n * 3), uuid("20000000", n * 3 + 1), uuid("20000000", n * 3 + 2)];
    // Snapshot order differs from id order, so the line order really depends on the snapshot.
    const snapshotOrder = [lineIds[2], lineIds[0], lineIds[1]];
    invoices.push({
      id, company_id: companyId, location_id: locationId, supplier_id: null, invoice_number: `INV-${n}`, document_number: `INV-${n}`,
      document_type: n % 10 === 0 ? "credit_note" : "invoice", invoice_date: `2026-0${6 + (n % 4)}-${String(1 + (n % 28)).padStart(2, "0")}`,
      status: "Approved", subtotal: 100 + n, tax_amount: 20, total_amount: 120 + n, sync_revision: 1, content_fingerprint: `fp${n}`,
      created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-02T00:00:00Z",
      metadata: {
        supplier_name: `Supplier ${n % 7}`,
        marginflow_snapshot: {
          supplier: `Supplier ${n % 7}`, absoluteNetTotal: 100 + n, additionalCharges: n % 3, invoiceDiscount: n % 2, creditReason: n % 10 === 0 ? "damaged" : "",
          items: [...snapshotOrder.map((lineId, index) => ({ id: lineId, productName: `Item ${index}`, lineTotal: 33, notes: "x".repeat(400) })), { productName: "line without id" }],
        },
      },
    });
    lineIds.forEach((lineId, index) => {
      invoice_lines.push({
        id: lineId, company_id: companyId, location_id: locationId, invoice_id: id, active: true, product_id: null, product_name: `Item ${index}`,
        quantity: 1 + index, unit_cost: 10 + index, net_line_total: 10 + index + n / 100, department_id: index === 2 ? null : `dept-${index}`,
        metadata: { marginflow_snapshot: { vatRate: 20, unit: "each" } },
      });
      if (index === 2) {
        invoice_line_department_splits.push({ id: uuid("30000000", n), company_id: companyId, location_id: locationId, invoice_line_id: lineId, department_id: "dept-0", percentage: 50, amount: 6, active: true });
        invoice_line_department_splits.push({ id: uuid("31000000", n), company_id: companyId, location_id: locationId, invoice_line_id: lineId, department_id: "dept-1", percentage: 50, amount: 6, active: true });
      }
    });
  }
  return { invoices, invoice_lines, invoice_line_department_splits };
}

const period = { startDate: "2026-06-01", endDate: "2026-10-23" };

test("the light header view gives exactly the same invoices as the full headers, line order included", async () => {
  const tables = invoiceTables();
  const full = await loadRelationalInvoiceReportRange(fakeClient(tables, { cap: 137 }), scope, { ...period, source: "full" });
  const light = await loadRelationalInvoiceReportRange(fakeClient(tables, { cap: 137 }), scope, { ...period, source: "light" });
  assert.equal(full.length, 1205);
  const comparison = compareInvoiceLists(full, light);
  assert.equal(comparison.identical, true, JSON.stringify(comparison).slice(0, 300));
  assert.equal(canonicalJson(full), canonicalJson(light));
  // the snapshot order (not the id order) is kept
  assert.deepEqual(light[0].items.map((item) => item.productName), ["Item 2", "Item 0", "Item 1"]);
  // and the light headers really are smaller
  const headerBytes = (rows) => JSON.stringify(rows.map((row) => row.metadata)).length;
  assert.ok(headerBytes(tables.invoices.map((row) => ({ metadata: lightMetadata(row.metadata) }))) < headerBytes(tables.invoices) / 3);
});

test("auto uses the view when installed and falls back to the full headers when it is missing", async () => {
  const tables = invoiceTables(30);
  const withView = fakeClient(tables);
  const result = await loadRelationalInvoiceReportRange(withView, scope, { ...period, withSource: true });
  assert.equal(result.source, "light");
  assert.equal(withView.requests.some((request) => request.table === "invoices"), false);

  const withoutView = fakeClient(tables, { view: false });
  const fallback = await loadRelationalInvoiceReportRange(withoutView, scope, { ...period, withSource: true });
  assert.equal(fallback.source, "full");
  assert.equal(canonicalJson(fallback.invoices), canonicalJson(result.invoices));
  // asking for the light read explicitly reports the missing view instead of hiding it
  await assert.rejects(loadRelationalInvoiceReportRange(fakeClient(tables, { view: false }), scope, { ...period, source: "light" }), (error) => /invoice_report_headers/.test(error.message));
});

test("a failed light read that is not a missing view is reported, not silently replaced", async () => {
  const tables = invoiceTables(5);
  const client = fakeClient(tables);
  const from = client.from.bind(client);
  client.from = (table) => {
    const query = from(table);
    if (table !== "invoice_report_headers") return query;
    query.then = (resolve) => resolve({ data: null, count: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    return query;
  };
  await assert.rejects(loadRelationalInvoiceReportRange(client, scope, period), (error) => /statement timeout/.test(error.message));
});

test("pages are read in parallel, capped responses are continued and every row is read once", async () => {
  const rows = Array.from({ length: 2345 }, (_, n) => ({ id: `row-${String(n).padStart(5, "0")}` }));
  const requests = [];
  let active = 0, maxActive = 0;
  const factory = (head = false) => {
    let start = 0, end = 0;
    const query = {
      order() { return query; },
      range(first, last) { start = first; end = last; return query; },
      then(resolve, reject) {
        requests.push({ head, start, end });
        active += 1; maxActive = Math.max(maxActive, active);
        return new Promise((done) => setTimeout(done, 2)).then(() => {
          active -= 1;
          return { data: head ? null : rows.slice(start, Math.min(end + 1, start + 300)), count: rows.length, error: null };
        }).then(resolve, reject);
      },
    };
    return query;
  };
  const result = await readAllPages(factory, { pageSize: 500, label: "rows" });
  assert.deepEqual(result.map((row) => row.id), rows.map((row) => row.id));
  assert.ok(maxActive > 1, "pages should overlap");
  assert.equal(requests.filter((request) => request.head).length, 1, "one final count check");
});

test("a single page needs no second count; a count that changes between pages is rejected", async () => {
  const requests = [];
  const small = (head = false) => ({
    order() { return this; },
    range() { return this; },
    then(resolve) { requests.push(head); resolve({ data: head ? null : [{ id: "a" }, { id: "b" }], count: 2, error: null }); },
  });
  assert.equal((await readAllPages(small)).length, 2);
  assert.deepEqual(requests, [false]);

  let calls = 0;
  const growing = () => ({
    order() { return this; },
    range(start, end) { this.start = start; this.end = end; return this; },
    then(resolve) {
      calls += 1;
      const count = calls === 1 ? 600 : 601;
      resolve({ data: Array.from({ length: Math.min(500, count - this.start) }, (_, i) => ({ id: `r${this.start + i}` })), count, error: null });
    },
  });
  await assert.rejects(readAllPages(growing, { pageSize: 500 }), /changed/);
});

function salesTables(days = 145) {
  const sales_entries = [];
  const sales_department_lines = [];
  for (let n = 0; n < days; n += 1) {
    const id = uuid("40000000", n);
    const date = new Date(Date.UTC(2026, 5, 1 + n)).toISOString().slice(0, 10);
    sales_entries.push({ id, company_id: companyId, location_id: locationId, sales_date: date, gross_sales: 1200 + n, net_sales: 1000 + n, vat_amount: 200, service_charge: 100, discounts: 0, refunds: 0, source: "manual", metadata: {}, created_at: "2026-06-01T00:00:00Z", updated_at: `2026-06-0${1 + (n % 9)}T00:00:00Z` });
    sales_department_lines.push({ id: uuid("50000000", n), company_id: companyId, location_id: locationId, sales_entry_id: id, department_id: "dept-0", gross_sales: 600, net_sales: 500, vat_amount: 100, service_charge: 0, metadata: {}, created_at: "x", updated_at: "x" });
    sales_department_lines.push({ id: uuid("51000000", n), company_id: companyId, location_id: locationId, sales_entry_id: id, department_id: "dept-1", gross_sales: 600 + n, net_sales: 500 + n, vat_amount: 100, service_charge: 0, metadata: {}, created_at: "x", updated_at: "x" });
  }
  return { sales_entries, sales_department_lines, departments: [{ id: "dept-0", company_id: companyId, location_id: null, name: "Kitchen Made", sort_order: 1 }, { id: "dept-1", company_id: companyId, location_id: null, name: "Bar", sort_order: 2 }] };
}

test("145 sales days load with fewer requests and the same totals; overlapping reads share one load", async () => {
  const tables = salesTables();
  const client = fakeClient(tables);
  const range = { startDate: "2026-06-01", endDate: "2026-10-23" };
  const [first, second] = await Promise.all([loadRelationalSales(client, scope, range), loadRelationalSales(client, scope, range)]);
  assert.equal(first, second, "the two overlapping reads share one result");
  assert.equal(first.length, 145);
  const net = first.reduce((sum, row) => sum + row.netSales, 0);
  assert.equal(Math.round(net * 100) / 100, tables.sales_entries.reduce((sum, row) => sum + row.net_sales, 0));
  assert.equal(first.find((row) => row.date === "2026-06-02").departments.Bar.netSales, 501);
  const count = (table) => client.requests.filter((request) => request.table === table).length;
  assert.equal(count("sales_entries"), 2, "one read and one id/version verification");
  assert.equal(count("sales_department_lines"), 2, "two groups of 100 entries, one request each");
  assert.equal(client.requests.find((request) => request.table === "sales_entries" && request !== client.requests.find((r) => r.table === "sales_entries")).columns, "id,updated_at");
});

test("a read started before a sales save is not handed to a read made after it", async () => {
  const tables = salesTables(3);
  const client = fakeClient(tables);
  const range = { startDate: "2026-06-01", endDate: "2026-06-30" };
  const before = loadRelationalSales(client, scope, range);
  // The save itself fails in this fake client (it has no write support); what matters is that it
  // forgets the shared read before and after.
  await persistRelationalSalesEntry(client, { date: "2026-06-01" }, scope).catch(() => {});
  const after = loadRelationalSales(client, scope, range);
  assert.notEqual(before, after);
  await Promise.all([before, after]);
});

test("headline rows show each department and flag any difference", () => {
  const metrics = { netSales: 100, purchases: 30, invoiceGp: 70, departmentRows: [{ department: "Bar", netSales: 60, purchases: 20, gp: 66.67 }] };
  assert.deepEqual(headlineRows(metrics, structuredClone(metrics)).map((row) => row.equal), [true, true]);
  const changed = structuredClone(metrics);
  changed.departmentRows[0].purchases = 20.01;
  assert.deepEqual(headlineRows(metrics, changed).map((row) => row.equal), [true, false]);
});

test("splits read inside the line requests give exactly the same invoices as the separate split reads", async () => {
  const tables = invoiceTables();
  // an inactive split, another company's split and another location's split must stay out either way
  const someLine = tables.invoice_lines[5].id;
  tables.invoice_line_department_splits.push(
    { id: uuid("32000000", 1), company_id: companyId, location_id: locationId, invoice_line_id: someLine, department_id: "dept-9", percentage: 10, amount: 1, active: false },
    { id: uuid("32000000", 2), company_id: "11111111-1111-4111-8111-111111111111", location_id: locationId, invoice_line_id: someLine, department_id: "dept-9", percentage: 10, amount: 1, active: true },
    { id: uuid("32000000", 3), company_id: companyId, location_id: "22222222-2222-4222-8222-222222222222", invoice_line_id: someLine, department_id: "dept-9", percentage: 10, amount: 1, active: true },
  );
  const separateClient = fakeClient(tables, { cap: 137 });
  const separate = await loadRelationalInvoiceReportRange(separateClient, scope, { ...period, source: "full", splits: "separate", withSource: true });
  const embeddedClient = fakeClient(tables, { cap: 137 });
  const embedded = await loadRelationalInvoiceReportRange(embeddedClient, scope, { ...period, source: "light", withSource: true });
  assert.equal(compareInvoiceLists(separate.invoices, embedded.invoices).identical, true);
  assert.equal(canonicalJson(separate.invoices), canonicalJson(embedded.invoices));
  assert.ok(separate.invoices.some((invoice) => invoice.items.some((item) => item.departmentSplits.length === 2)));
  assert.equal(separate.invoices.flatMap((invoice) => invoice.items).some((item) => item.departmentSplits.some((split) => split.departmentId === "dept-9")), false);
  // no request for the split table on the embedded path; the phase counts say where the requests went
  assert.equal(embeddedClient.requests.some((request) => request.table === "invoice_line_department_splits"), false);
  assert.equal(embedded.timings.splits, undefined);
  assert.equal(embedded.timings.lines.requests, embeddedClient.requests.filter((request) => request.table === "invoice_lines").length);
  assert.ok(separate.timings.splits.requests >= 37, `separate splits used ${separate.timings.splits.requests} requests`);
  assert.equal(embedded.timings.headers.requests + embedded.timings.lines.requests, embeddedClient.requests.length);
});
