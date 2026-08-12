import assert from "node:assert/strict";
import test from "node:test";
import { relationalSalesEntryToAppRow } from "../lib/salesRepository.js";

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
