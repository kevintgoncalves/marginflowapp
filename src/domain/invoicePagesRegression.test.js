import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadRelationalInvoicePage, loadRelationalInvoiceCount, loadRelationalInvoiceSchedule, loadRelationalInvoiceReportRange } from "../lib/invoiceRepository.js";
import { loadRelationalSalesPage } from "../lib/salesRepository.js";
import { invoiceGroupForSupplierDate } from "./invoiceControlTracker.js";
import { invoiceNavigationRequest, invoiceBrowserRequest } from "./invoiceNavigation.js";

const scope = { companyId: "11111111-1111-4111-8111-111111111111", locationId: "22222222-2222-4222-8222-222222222222" };
const supplier = { id: "33333333-3333-4333-8333-333333333333", name: "Synthetic supplier" };
const week = { startDate: "2026-09-14", endDate: "2026-09-20" };

function fixture(count = 1105) {
  const invoices = Array.from({ length: count }, (_, n) => ({
    id: `id${String(n).padStart(5, "0")}`, company_id: scope.companyId, location_id: scope.locationId,
    supplier_id: supplier.id, invoice_date: "2026-09-15", document_number: `DOC-${n}`, invoice_number: `DOC-${n}`,
    document_type: n % 5 === 0 ? "credit_note" : "invoice", status: "Approved", subtotal: 10, total_amount: 12, absoluteNetTotal: 10,
    metadata: { marginflow_snapshot: { supplier: supplier.name, items: [{ largeSnapshot: "x".repeat(100) }] } },
  }));
  return { invoices, invoice_lines: invoices.map(row => ({ id: `${row.id}-line`, invoice_id: row.id, company_id: scope.companyId, location_id: scope.locationId, active: true, quantity: 1, unit_cost: 10, net_line_total: 10 })), invoice_line_department_splits: [] };
}

function clientFor(tables, { cap = 137, fail } = {}) {
  const requests = [];
  return { requests, from(table) {
    let predicates = [], columns = "", config = {}, start = 0, end = Infinity, orders = [];
    const query = {
      select(value, options = {}) { columns = value; config = options; return this; },
      eq(key, value) { predicates.push(row => key.includes(".") ? (row[key.split(".")[0]] || []).some(child => child[key.split(".")[1]] === value) : row[key] === value); return this; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
      gte(key, value) { predicates.push(row => row[key] >= value); return this; },
      lte(key, value) { predicates.push(row => row[key] <= value); return this; },
      ilike(key, value) { predicates.push(row => String(row[key] || "").toLowerCase().includes(value.replaceAll("%", "").toLowerCase())); return this; },
      or(value) {
        if (value.includes("invoice_number.ilike")) {
          const term = value.split("invoice_number.ilike.%")[1].split("%,")[0];
          predicates.push(row => String(row.invoice_number || row.document_number).includes(term));
        } else predicates.push(row => !row.location_id || row.location_id === scope.locationId);
        return this;
      },
      order(key, options) { orders.push([key, options?.ascending !== false ? 1 : -1]); return this; },
      range(first, last) { start = first; end = last; return this; },
      then(resolve, reject) {
        requests.push({ table, columns, start, end, head: config.head });
        const rows = (tables[table] || []).filter(row => predicates.every(predicate => predicate(row))).sort((a,b) => {
          for (const [key, dir] of orders) { const delta = String(a[key]).localeCompare(String(b[key])); if (delta) return delta * dir; } return 0;
        });
        return Promise.resolve({ data: config.head ? null : structuredClone(rows.slice(start, Math.min(end + 1, start + cap))), count: rows.length, error: fail?.({ table, start }) }).then(resolve, reject);
      },
    };
    return query;
  } };
}

test("25-row invoice pages search/filter all 1105 records without loading snapshots, lines or files", async () => {
  const tables = fixture();
  tables.invoices.push({ ...tables.invoices[0], id: "foreign", company_id: "other" });
  const client = clientFor(tables);
  const first = await loadRelationalInvoicePage(client, scope);
  const next = await loadRelationalInvoicePage(client, scope, { offset: 25 });
  assert.equal(first.total, 1105); assert.equal(first.invoices.length, 25);
  assert.equal(new Set([...first.invoices, ...next.invoices].map(row => row.id)).size, 50);
  const found = await loadRelationalInvoicePage(client, scope, { filters: { search: "DOC-15", supplierId: supplier.id, documentType: "credit_note", ...week } });
  assert.ok(found.total > 0); assert.ok(found.invoices.some(row => row.documentNumber === "DOC-15"));
  assert.ok(found.invoices.every(row => row.documentType === "credit_note" && row.supplierId === supplier.id));
  assert.ok(client.requests.every(row => row.table === "invoices" && row.end - row.start === 24));
  assert.ok(!client.requests[0].columns.split(",").includes("metadata"));
  assert.ok(first.invoices.every(row => row.items.length === 0));
});

test("complete pre-21 September schedule exceeds both 50 and 1000 rows, respects boundaries and supplier IDs", async () => {
  const tables = fixture();
  tables.invoices.push(...[
    { ...tables.invoices[0], id: "next-week", invoice_date: "2026-09-21" },
    { ...tables.invoices[0], id: "other-location", location_id: "other" },
    { ...tables.invoices[0], id: "other-company", company_id: "other" },
    { ...tables.invoices[0], id: "other-supplier", supplier_id: "different", invoice_date: "2026-09-14" },
    { ...tables.invoices[0], id: "week-end", invoice_date: "2026-09-20" },
  ]);
  const client = clientFor(tables);
  const rows = await loadRelationalInvoiceSchedule(client, scope, week);
  assert.equal(rows.length, 1107);
  const cell = invoiceGroupForSupplierDate(supplier, "2026-09-15", rows, { totalForInvoice: row => (row.documentType === "credit_note" ? -1 : 1) * row.absoluteNetTotal });
  assert.equal(cell.invoiceCount, 1105); assert.equal(cell.total, (884 - 221) * 10);
  assert.equal(cell.amountVerified, true);
  assert.equal(invoiceGroupForSupplierDate(supplier, "2026-09-14", rows).invoiceCount, 0);
  assert.equal(invoiceGroupForSupplierDate(supplier, "2026-09-20", rows).invoiceCount, 1);
  assert.ok(client.requests.every(row => row.table === "invoices"));
  const broken = clientFor(tables, { fail: ({ start }) => start > 0 ? new Error("statement timeout") : null });
  await assert.rejects(loadRelationalInvoiceSchedule(broken, scope, week), /statement timeout/);
});

test("financial range remains complete independently of the 25-row list and signed credits", async () => {
  const tables = fixture(); const client = clientFor(tables);
  await loadRelationalInvoicePage(client, scope);
  const report = await loadRelationalInvoiceReportRange(client, scope, week);
  const net = report.reduce((sum,row) => sum + (row.documentType === "credit_note" ? -1 : 1) * row.items.reduce((n,line) => n + line.lineTotal,0),0);
  assert.equal(report.length, 1105); assert.equal(net, 6630);
});

test("stored schedule net amount aliases preserve VAT basis and zero; missing values remain unverified", async () => {
  const tables = fixture(6);
  const aliases = ["absoluteNetTotal", "absolute_net_total", "finalInvoiceTotal", "total", "snapshot_total_amount"];
  tables.invoices.forEach((row, index) => {
    delete row.absoluteNetTotal;
    if (aliases[index]) row[aliases[index]] = index === 0 ? "0" : "10.50";
  });
  const client = clientFor(tables);
  const page = await loadRelationalInvoicePage(client, scope);
  for (const row of page.invoices) {
    if (row.id === "id00005") assert.equal(row.financialSummaryMissing, true);
    else { assert.equal(row.financialSummaryMissing, false); assert.equal(row.absoluteNetTotal, row.id === "id00000" ? 0 : 10.5); }
  }
  assert.equal(await loadRelationalInvoiceCount(client, scope, { documentType: "credit_note" }), 2);
  assert.equal(client.requests.at(-1).head, true);
});

test("Daily Sales page count and source/date/department filters cover 1105 entries and remain scoped", async () => {
  const department = { id: "dept", name: "Synthetic Food", company_id: scope.companyId, location_id: scope.locationId };
  const entries = fixture().invoices.map((row,index) => ({ id: row.id, company_id: row.company_id, location_id: row.location_id, sales_date: "2026-09-15", net_sales: 100, gross_sales: 120, source: index % 2 ? "manual" : "POS", sales_department_lines: [{ company_id: scope.companyId, location_id: scope.locationId, department_id: "dept", net_sales: 90, gross_sales: 108 }] }));
  entries.push({ ...entries[0], id: "foreign", company_id: "other" });
  const client = clientFor({ sales_entries: entries, departments: [department] });
  const first = await loadRelationalSalesPage(client, scope, week);
  assert.equal(first.total, 1105); assert.equal(first.rows.length, 25);
  const second = await loadRelationalSalesPage(client, scope, { ...week, offset: 25 });
  assert.equal(new Set([...first.rows,...second.rows].map(row=>row.id)).size,50);
  const filtered = await loadRelationalSalesPage(client, scope, { ...week, search: "POS", department: "Synthetic Food" });
  assert.equal(filtered.total, 553);
  assert.ok(filtered.rows.every(row => row.departments["Synthetic Food"].netSales === 90));
  assert.equal((await loadRelationalSalesPage(client, scope, { ...week, search: "2026-09-16" })).total, 0);
  await assert.rejects(loadRelationalSalesPage(client, scope, { ...week, department: "Another company department" }), /not available/);
});

test("Delivery schedule clears list intent; explicit list/cell actions start with clean filters", () => {
  let request = { ...invoiceNavigationRequest("invoices", "pending-click"), status: "Pending" };
  assert.equal(invoiceBrowserRequest(request).status, "Pending");
  request = invoiceNavigationRequest("invoiceControl", "schedule-click");
  assert.equal(request.view, "schedule");
  assert.notEqual(invoiceNavigationRequest("invoiceControl", "second-schedule-click").id, request.id);
  assert.deepEqual(invoiceBrowserRequest(invoiceNavigationRequest("invoices", "list-click")), { supplierId: "", search: "", startDate: "", endDate: "", status: "All", documentType: "" });
  assert.equal(invoiceBrowserRequest({ supplierId: supplier.id, startDate: week.startDate, endDate: week.startDate }).status, "All");
  const source = readFileSync(new URL("../main.jsx", import.meta.url), "utf8");
  assert.match(source, /setInvoiceBrowseRequest\(invoiceNavigationRequest\(page, uid\(\)\)\)/);
  assert.match(source, /setBrowserOpen\(Boolean\(browseRequest\?\.id && browseRequest.view !== "schedule" && !browseRequest.invoiceId\)\)/);
  assert.match(source, /loadRelationalInvoiceSchedule\(client,/);
  assert.doesNotMatch(source, /const dailySummaries = invoiceControlDailySummaries/);
});
