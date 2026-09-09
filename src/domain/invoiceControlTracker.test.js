import assert from "node:assert/strict";
import test from "node:test";
import { invoiceGroupForSupplierDate } from "./invoiceControlTracker.js";

test("groups every invoice for the same supplier and invoice date", () => {
  const supplier = { id: "albion", name: "Albion Fine Foods" };
  const invoices = [
    { id: "albion-0803", supplier: "Albion Fine Foods", date: "2026-08-03", invoiceNumber: "AF-0803", signed_total: 316.28 },
    { id: "albion-0809-a", supplier: "Albion Fine Foods", date: "2026-08-09", invoiceNumber: "AF-0809-1", signed_total: 509.36 },
    { id: "albion-0809-b", supplier: "Albion Fine Foods", date: "2026-08-09", invoiceNumber: "AF-0809-2", signed_total: 13.96 },
    { id: "albion-0809-c", supplier: "Albion Fine Foods", date: "2026-08-09", invoiceNumber: "AF-0809-3", signed_total: 46.71 },
    { id: "other-0809", supplier: "Other Supplier", date: "2026-08-09", invoiceNumber: "OS-0809", signed_total: 999 },
  ];

  const dayGroup = invoiceGroupForSupplierDate(supplier, "2026-08-09", invoices);
  const weeklyTotal = [
    "2026-08-03",
    "2026-08-04",
    "2026-08-05",
    "2026-08-06",
    "2026-08-07",
    "2026-08-08",
    "2026-08-09",
  ].reduce((sum, date) => sum + invoiceGroupForSupplierDate(supplier, date, invoices).dailyTotal, 0);

  assert.equal(dayGroup.invoiceCount, 3);
  assert.equal(dayGroup.dailyTotal, 570.03);
  assert.deepEqual(new Set(dayGroup.invoices.map((invoice) => invoice.id)), new Set(["albion-0809-a", "albion-0809-b", "albion-0809-c"]));
  assert.equal(Number(weeklyTotal.toFixed(2)), 886.31);
});

test("returns an empty daily group when no supplier invoice exists", () => {
  const group = invoiceGroupForSupplierDate({ id: "albion", name: "Albion Fine Foods" }, "2026-08-10", [
    { id: "other-0810", supplier: "Other Supplier", date: "2026-08-10", signed_total: 24 },
  ]);

  assert.equal(group.invoice, null);
  assert.equal(group.invoiceCount, 0);
  assert.equal(group.dailyTotal, 0);
  assert.deepEqual(group.invoices, []);
});
