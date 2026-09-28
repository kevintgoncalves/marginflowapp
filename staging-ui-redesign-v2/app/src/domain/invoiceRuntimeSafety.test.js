import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeInvoiceCollectionForRuntime,
  normalizeInvoiceForRuntime,
  normalizeProductCollectionForRuntime,
  normalizeProductForRuntime,
  runtimeInvoiceLineCount,
} from "./invoiceRuntimeSafety.js";
import { correctionHistoryForInvoice, learnSupplierProductMappings } from "./invoiceLearning.js";

test("runtime invoice normalization recovers lines from relational and legacy shapes", () => {
  const normalized = normalizeInvoiceForRuntime({
    id: "invoice-a",
    supplier: { name: "TG Fruits" },
    document_number: 830571,
    invoice_date: "2026-09-10",
    lines: [{
      product_name: "Apples",
      matchedProductName: { name: "Matched apples" },
      suggestedProducts: [{ id: 12, product_name: "Suggested apples" }],
      reviewReasons: [{ value: "price_deviation" }],
      department_splits: [{ department: "Kitchen Made", department_id: 42, percentage: 100 }],
    }],
  });

  assert.equal(normalized.supplier, "TG Fruits");
  assert.equal(normalized.documentNumber, "830571");
  assert.equal(normalized.date, "2026-09-10");
  assert.equal(normalized.items.length, 1);
  assert.equal(normalized.items[0].productName, "Apples");
  assert.equal(normalized.items[0].matchedProductName, "Matched apples");
  assert.equal(normalized.items[0].suggestedProducts[0].name, "Suggested apples");
  assert.deepEqual(normalized.items[0].reviewReasons, ["price_deviation"]);
  assert.equal(normalized.items[0].departmentSplits.length, 1);
  assert.equal(normalized.items[0].departmentSplits[0].departmentId, "42");
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

test("runtime product normalization repairs legacy history containers before invoice save", () => {
  const normalized = normalizeProductForRuntime({
    id: "product-a",
    product_name: "Apples",
    aliases: "Red apples",
    priceHistory: null,
    supplierPrices: { supplier: "TG Fruits" },
    supplierFormats: "legacy",
  });

  assert.equal(normalized.name, "Apples");
  assert.deepEqual(normalized.aliases, ["Red apples"]);
  assert.deepEqual(normalized.priceHistory, []);
  assert.deepEqual(normalized.supplierPrices, []);
  assert.deepEqual(normalized.supplierFormats, []);
  assert.deepEqual(normalizeProductCollectionForRuntime([null, normalized]).map((product) => product.id), ["product-a"]);
});

test("invoice learning tolerates malformed legacy mapping and correction containers", () => {
  const invoice = {
    id: "invoice-a",
    supplier: "TG Fruits",
    items: [{ id: "line-a", matchedProductId: "product-a", productName: "Apples", supplierProductCode: "A1" }],
  };

  const learning = learnSupplierProductMappings({ mappings: {}, products: null, invoice });
  const corrections = correctionHistoryForInvoice({ existingCorrections: {}, invoice });

  assert.equal(Array.isArray(learning.mappings), true);
  assert.equal(learning.mappings.length, 1);
  assert.deepEqual(corrections, []);
});
