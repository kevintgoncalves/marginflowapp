import test from "node:test";
import assert from "node:assert/strict";
import { invoiceUnitCostFromExtraction, parseCheesemanInvoiceRows } from "./invoiceParsing.js";
import { normalisedCostForPrice, priceComparisonForProduct } from "./productPackaging.js";
import { propagateInvoiceSupplierToLines, validateInvoiceLinesForApproval } from "./invoiceWorkflow.js";
import { findSupplierDuplicateCandidates, mergeSupplierReferences, reconcileSuppliersForSync } from "./supplierIdentity.js";

test("normalises comparable pack sizes and avoids false comparisons across unknown formats", () => {
  const kiloBox = normalisedCostForPrice(11.8, "6x1kg");
  assert.equal(kiloBox.baseUnit, "kg");
  assert.equal(kiloBox.normalizedCost, 1.9667);

  const product = { name: "Cherry Tomatoes", supplier: "TG Fruits", unitCost: 11.8, packSize: "BOX", aliases: ["Cherry Tomatoes"] };
  const comparison = priceComparisonForProduct(product, [
    { supplier: "TG Fruits", price: 11.8, packSize: "BOX" },
    { supplier: "Albion Fine Foods", price: 0.99, packSize: "PUNNET" },
  ]);
  assert.equal(comparison.comparable, false);
  assert.equal(comparison.reviewRequired, true);
});

test("allows validated manual lines to be added to parsed invoice lines", () => {
  const parsedLine = { productName: "Olive Oil", quantity: 1, unitCost: 12, departmentSplits: [{ department: "Kitchen Made", percentage: 100 }] };
  const manualLine = { productName: "Plain Flour", quantity: 2, unitCost: 3.5, departmentSplits: [{ department: "Kitchen Made", percentage: 100 }] };
  const validation = validateInvoiceLinesForApproval([parsedLine, manualLine], {
    splitValidator: (line) => line.departmentSplits.reduce((sum, split) => sum + split.percentage, 0) === 100,
    netTotalForLine: (line) => line.quantity * line.unitCost,
  });
  assert.equal(validation.valid, true);
});

test("parses representative Cheeseman invoice rows", () => {
  const rows = parseCheesemanInvoiceRows(`
    CHEESE MAN INVOICE 99881
    Large Eggs BOX X180 1 45.00 45.00
    Mature Cheddar 2.5KG 2 18.50 37.00
    Invoice Total 82.00
  `);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].productName, "Large Eggs");
  assert.equal(rows[0].packSize, "BOX X180");
  assert.equal(rows[1].unitCost, 18.5);
});

test("corrects TG Fruits style line total accidentally mapped into unit cost", () => {
  assert.equal(invoiceUnitCostFromExtraction({ quantity: 4, unitCost: 11.8, lineTotal: 11.8 }), 2.95);
  assert.equal(invoiceUnitCostFromExtraction({ quantity: 4, unitCost: 2.95, lineTotal: 11.8 }), 2.95);
});

test("supplier autocomplete duplicate detection finds legal suffix and punctuation variants", () => {
  const suppliers = [{ id: "s1", name: "Cake N Stuff Ltd", active: true }];
  const matches = findSupplierDuplicateCandidates(suppliers, "Cake n Stuff Limited");
  assert.equal(matches[0].exact, true);
  assert.equal(matches[0].supplier.id, "s1");
});

test("invoice supplier propagation preserves explicit line suppliers", () => {
  const lines = [
    { productName: "A", supplier: "Old Supplier" },
    { productName: "B", supplier: "Line Supplier" },
    { productName: "C", supplier: "" },
  ];
  const next = propagateInvoiceSupplierToLines(lines, "New Supplier", "Old Supplier");
  assert.equal(next[0].supplier, "New Supplier");
  assert.equal(next[1].supplier, "Line Supplier");
  assert.equal(next[2].supplier, "New Supplier");
  const noPrevious = propagateInvoiceSupplierToLines([{ productName: "A", supplier: "Explicit Supplier" }, { productName: "B", supplier: "" }], "Header Supplier", "");
  assert.equal(noPrevious[0].supplier, "Explicit Supplier");
  assert.equal(noPrevious[1].supplier, "Header Supplier");
});

test("supplier merge remaps history and leaves a tombstone", () => {
  const sourceSupplier = { id: "old", name: "The Cheese Man Ltd", active: true };
  const targetSupplier = { id: "new", name: "Cheese Man", active: true };
  const merged = mergeSupplierReferences({
    sourceSupplier,
    targetSupplier,
    suppliers: [sourceSupplier, targetSupplier],
    invoices: [{ id: "i1", supplier: "The Cheese Man Ltd", items: [{ id: "l1", supplier: "The Cheese Man Ltd" }] }],
    products: [{ id: "p1", supplier: "The Cheese Man Ltd", supplierPrices: [{ supplier: "The Cheese Man Ltd", price: 10 }], priceHistory: [{ supplier: "The Cheese Man Ltd", price: 10 }] }],
    creditNotes: [{ id: "c1", supplier: "The Cheese Man Ltd" }],
    supplierDeliverySchedules: [{ id: "d1", supplierId: "old", supplierName: "The Cheese Man Ltd" }],
    invoiceDayStatusOverrides: [{ id: "o1", supplierId: "old", supplierName: "The Cheese Man Ltd" }],
    idFactory: () => "merge-1",
    now: "2026-07-06T00:00:00.000Z",
  });
  assert.equal(merged.suppliers.find((supplier) => supplier.id === "old").tombstone, true);
  assert.equal(merged.invoices[0].supplier, "Cheese Man");
  assert.equal(merged.products[0].supplierPrices[0].supplier, "Cheese Man");
});

test("sync reconciliation preserves deleted supplier tombstones over stale imported rows", () => {
  const current = [{ id: "s1", name: "TG Fruits", tombstone: true, deletedAt: "2026-07-01T00:00:00.000Z" }];
  const imported = [{ id: "mobile-old", name: "T.G. Fruits Ltd", active: true }];
  const reconciled = reconcileSuppliersForSync(current, imported);
  assert.equal(reconciled.length, 1);
  assert.equal(reconciled[0].tombstone, true);
  assert.equal(reconciled[0].deletedAt, "2026-07-01T00:00:00.000Z");
});
