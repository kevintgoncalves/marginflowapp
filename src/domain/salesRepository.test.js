import assert from "node:assert/strict";
import test from "node:test";
import { loadRelationalSales, relationalSalesEntryToAppRow } from "../lib/salesRepository.js";

function salesClient(tables) {
  return {
    from(table) {
      const filters = [];
      let start = 0, end = Number.MAX_SAFE_INTEGER;
      const query = {
        select(_columns, options = {}) { query.head = Boolean(options.head); return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        gte(key, value) { filters.push(row => row[key] >= value); return query; },
        lte(key, value) { filters.push(row => row[key] <= value); return query; },
        in(key, values) { filters.push(row => values.includes(row[key])); return query; },
        or() { return query; },
        order() { return query; },
        range(first, last) { start = first; end = last; return query; },
        then(resolve, reject) {
          try {
            const rows = (tables[table] || []).filter(row => filters.every(matches => matches(row)));
            resolve({ data: query.head ? null : rows.slice(start, end + 1), count: rows.length, error: null });
          } catch (error) { reject(error); }
        },
      };
      return query;
    },
  };
}

test("relational sales rows preserve gross/net totals for Sales, Dashboard and GP inputs", () => {
  const departmentId = "33333333-3333-4333-8333-333333333333";
  const row = relationalSalesEntryToAppRow({
    id: "11111111-1111-4111-8111-111111111111",
    company_id: "22222222-2222-4222-8222-222222222222",
    location_id: "44444444-4444-4444-8444-444444444444",
    sales_date: "2026-08-05",
    gross_sales: "1200.00",
    net_sales: "1000.00",
    vat_amount: "200.00",
    service_charge: "50.00",
    discounts: "10.00",
    refunds: "5.00",
    source: "manual",
    metadata: { marginflow_snapshot: { department: "Total" } },
    updated_at: "2026-08-05T12:00:00Z",
  }, [
    {
      department_id: departmentId,
      gross_sales: "720.00",
      net_sales: "600.00",
      vat_amount: "120.00",
      service_charge: "30.00",
      metadata: {},
    },
  ], new Map([[departmentId, { id: departmentId, name: "Kitchen Made" }]]));

  assert.equal(row.persistenceSource, "relational");
  assert.equal(row.grossSales, 1200);
  assert.equal(row.netSales, 1000);
  assert.equal(row.sales, 1000);
  assert.equal(row.vatAmount, 200);
  assert.equal(row.departments["Kitchen Made"].grossSales, 720);
  assert.equal(row.departments["Kitchen Made"].netSales, 600);
});

test("September sales load only the confirmed company, Main Location and date range", async () => {
  const companyId = "afa22b1e-05a8-48b9-b62a-2dd57dddae94";
  const locationId = "74ef92c7-0203-4951-a085-2e49bfc65f3a";
  const entries = Array.from({ length: 28 }, (_, index) => ({
    id: `entry-${index}`, company_id: companyId, location_id: locationId,
    sales_date: `2026-09-${String(index + 1).padStart(2, "0")}`,
    net_sales: index === 27 ? "148175.48" : "0", gross_sales: index === 27 ? "176387.13" : "0",
    vat_amount: "0", service_charge: "0", discounts: "0", refunds: "0", source: "manual", metadata: {}, updated_at: "2026-09-30T10:00:00Z",
  }));
  entries.push({ ...entries[0], id: "other-company", company_id: "11111111-1111-4111-8111-111111111111" });
  entries.push({ ...entries[0], id: "other-location", location_id: "22222222-2222-4222-8222-222222222222" });
  entries.push({ ...entries[0], id: "october", sales_date: "2026-10-01" });
  const sales = await loadRelationalSales(salesClient({ sales_entries: entries, sales_department_lines: [], departments: [] }), { companyId, locationId }, { startDate: "2026-09-01", endDate: "2026-09-30" });
  assert.equal(sales.length, 28);
  assert.equal(sales.reduce((sum, row) => sum + row.netSales, 0), 148175.48);
  assert.equal(sales.reduce((sum, row) => sum + row.grossSales, 0), 176387.13);
});

// A day saved from the Input sales screen replaces the whole day. Older entries for the same date
// (legacy Kitchen-Made-only rows, or a day saved while outside the loaded period) doubled June sales.
function writeClient(state) {
  const C = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  return {
    calls: state.calls,
    from(table) {
      const filters = [];
      let op = "select", payload = null, returning = false;
      const rows = () => (state[table] ||= []);
      const matches = (row) => filters.every((f) => f(row));
      const q = {
        select() { if (op === "select") op = "select"; else returning = true; return q; },
        upsert(p) { op = "upsert"; payload = p; return q; },
        insert(p) { op = "insert"; payload = p; return q; },
        delete() { op = "delete"; return q; },
        eq(k, v) { filters.push((r) => r[k] === v); return q; },
        neq(k, v) { filters.push((r) => r[k] !== v); return q; },
        is(k, v) { filters.push((r) => (r[k] ?? null) === v); return q; },
        or() { return q; },
        order() { return q; },
        single() { return q.then((res) => ({ ...res, data: Array.isArray(res.data) ? res.data[0] : res.data })); },
        then(resolve, reject) {
          state.calls.push(`${op}:${table}`);
          let result;
          if (op === "upsert") { const list = rows().filter((r) => r.id !== payload.id); list.push(payload); state[table] = list; result = { data: [payload], error: null }; }
          else if (op === "insert") { const items = [].concat(payload); rows().push(...items); result = { data: items, error: null }; }
          else if (op === "delete") { const gone = rows().filter(matches); state[table] = rows().filter((r) => !matches(r)); result = { data: returning ? gone : null, error: null }; }
          else { result = { data: rows().filter(matches), error: null }; }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return q;
    },
    C,
  };
}

test("saving a day removes the other entries stored for that date", async () => {
  const { persistRelationalSalesEntry } = await import("../lib/salesRepository.js");
  const C = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", L = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";
  const keep = "11111111-2222-4333-8444-555555555555";
  const state = {
    calls: [],
    departments: [{ id: "d1", name: "Kitchen Made", company_id: C, active: true }],
    sales_entries: [
      { id: "99999999-2222-4333-8444-555555555555", company_id: C, location_id: L, sales_date: "2026-06-02", net_sales: 681.19 },
      { id: "88888888-2222-4333-8444-555555555555", company_id: C, location_id: L, sales_date: "2026-06-03", net_sales: 10 },
    ],
  };
  const client = writeClient(state);
  await persistRelationalSalesEntry(client, { id: keep, date: "2026-06-02", netSales: 1581.35, grossSales: 1897.6, departments: {} }, { companyId: C, locationId: L });
  const june2 = state.sales_entries.filter((r) => r.sales_date === "2026-06-02");
  assert.deepEqual(june2.map((r) => r.id), [keep]);
  assert.equal(state.sales_entries.filter((r) => r.sales_date === "2026-06-03").length, 1);
});
