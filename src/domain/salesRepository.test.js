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
