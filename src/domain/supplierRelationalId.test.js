import assert from "node:assert/strict";
import test from "node:test";
import { invoiceGroupForSupplierDate, invoicesForSupplierDate } from "./invoiceControlTracker.js";
import { supplierIdCandidates, supplierMatchesId, supplierScopeId, suppliersWithMismatchedIds } from "./supplierIdentity.js";

// Synthetic ids: a supplier saved with an older app id whose invoices use the database id.
const seafood = { id: "app-id-seafood", relationalId: "db-id-seafood", name: "Seafood Supplier" };
const regular = { id: "db-id-regular", relationalId: "db-id-regular", name: "Regular Supplier" };

test("supplier filters use the database id first", () => {
  assert.equal(supplierScopeId(seafood), "db-id-seafood");
  assert.equal(supplierScopeId(regular), "db-id-regular");
  assert.deepEqual(supplierIdCandidates(seafood), ["db-id-seafood", "app-id-seafood"]);
  assert.ok(supplierMatchesId(seafood, "db-id-seafood"));
  assert.ok(supplierMatchesId(seafood, "app-id-seafood"), "older schedule rows keep matching");
  assert.ok(!supplierMatchesId(seafood, "db-id-regular"));
  assert.ok(!supplierMatchesId(seafood, ""));
});

test("weekly tracker finds invoices stored with the database id (no longer Missing)", () => {
  const invoices = [
    { id: "i1", supplierId: "db-id-seafood", supplier: "Seafood Supplier", date: "2026-11-02", invoiceNumber: "S-1", signed_total: 120 },
    { id: "i2", supplierId: "db-id-seafood", supplier: "Seafood Supplier", date: "2026-11-02", invoiceNumber: "S-2", signed_total: 30 },
    { id: "i3", supplierId: "db-id-regular", supplier: "Regular Supplier", date: "2026-11-02", invoiceNumber: "R-1", signed_total: 999 },
  ];
  assert.deepEqual(invoicesForSupplierDate(seafood, "2026-11-02", invoices).map((invoice) => invoice.id).sort(), ["i1", "i2"]);
  const group = invoiceGroupForSupplierDate(seafood, "2026-11-02", invoices);
  assert.equal(group.invoiceCount, 2);
  assert.equal(group.dailyTotal, 150);
  assert.deepEqual(invoicesForSupplierDate(regular, "2026-11-02", invoices).map((invoice) => invoice.id), ["i3"]);
});

test("an invoice still tagged with the older app id is not lost", () => {
  const invoices = [{ id: "old", supplierId: "app-id-seafood", supplier: "Seafood Supplier", date: "2026-11-03" }];
  assert.equal(invoicesForSupplierDate(seafood, "2026-11-03", invoices).length, 1);
});

test("diagnostic lists only suppliers whose app id differs from the database id", () => {
  assert.deepEqual(suppliersWithMismatchedIds([seafood, regular, { id: "no-db-row", name: "Local only" }]), [
    { name: "Seafood Supplier", id: "app-id-seafood", relationalId: "db-id-seafood" },
  ]);
  assert.deepEqual(suppliersWithMismatchedIds(undefined), []);
});

test("after the data fix, references to the old id still match through legacyIds", () => {
  const fixed = { id: "db-id-seafood", relationalId: "db-id-seafood", legacyIds: ["app-id-seafood"], name: "Seafood Supplier" };
  assert.equal(supplierScopeId(fixed), "db-id-seafood");
  assert.ok(supplierMatchesId(fixed, "app-id-seafood"));
  assert.deepEqual(suppliersWithMismatchedIds([fixed]), []);
  const invoices = [{ id: "old", supplierId: "app-id-seafood", supplier: "Renamed", date: "2026-11-03" }];
  assert.equal(invoicesForSupplierDate(fixed, "2026-11-03", invoices).length, 1);
});
