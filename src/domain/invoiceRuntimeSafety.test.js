import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInvoiceCollectionForRuntime,
  normalizeInvoiceForRuntime,
  runtimeInvoiceLineCount,
} from "./invoiceRuntimeSafety.js";

test("runtime invoice normalization recovers lines from relational and legacy shapes", () => {
  const normalized = normalizeInvoiceForRuntime({
    id: "invoice-a",
    supplier: { name: "TG Fruits" },
    document_number: 830571,
    invoice_date: "2026-09-10",
    lines: [{ product_name: "Apples", department_splits: [{ department: "Kitchen Made", percentage: 100 }] }],
  });

  assert.equal(normalized.supplier, "TG Fruits");
  assert.equal(normalized.documentNumber, "830571");
  assert.equal(normalized.date, "2026-09-10");
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].productName, "Apples");
  assert.equal(normalized.items[0].departmentSplits.length, 1);
  assert.equal(normalized.lines, normalized.items);
});

test("runtime invoice normalization makes partial persisted rows safe to render", () => {
  const normalized = normalizeInvoiceForRuntime({
    id: "invoice-b",
    supplier: null,
    invoiceNumber: "B-2",
    items: null,
    invoiceReviewReasons: null,
    auditEvents: null,
  });

  assert.equal(normalized.supplier, "Unknown Supplier");
  assert.deepEqual(normalized.items, []);
  assert.deepEqual(normalized.lines, []);
  assert.deepEqual(normalized.invoiceReviewReasons, []);
  assert.deepEqual(normalized.auditEvents, []);
  assert.equal(runtimeInvoiceLineCount(normalized), 0);
});

test("runtime invoice collections reject invalid container and row values", () => {
  assert.deepEqual(normalizeInvoiceCollectionForRuntime({ invoices: [] }), []);
  assert.deepEqual(normalizeInvoiceCollectionForRuntime([null, "bad", { id: "good", items: [] }]).map((row) => row.id), ["good"]);
});
