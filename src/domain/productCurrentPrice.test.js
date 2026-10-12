import test from "node:test";
import assert from "node:assert/strict";
import { currentPriceFieldsFromEntry, invoiceDateKey, isLatestInvoicePrice, latestInvoicePriceEntry, manualEditChangesPrice } from "./productCurrentPrice.js";
import { inferredTotalDiscount, reconcileInvoiceTotals } from "./invoiceValidation.js";

const history = [
  { date: "2026-09-01", price: 10, supplier: "Albion", source: "Invoice", invoiceId: "a", lineId: "1" },
  { date: "2026-10-05", price: 12, supplier: "Elite", source: "Invoice", invoiceId: "b", lineId: "1" },
  { date: "2026-10-12", price: 99, supplier: "Albion", source: "Manual edit" },
];

test("invoice dates in ISO and UK formats sort correctly", () => {
  assert.equal(invoiceDateKey("2026-10-05"), "2026-10-05");
  assert.equal(invoiceDateKey("05/10/2026"), "2026-10-05");
  assert.equal(invoiceDateKey("5/10/26"), "2026-10-05");
  assert.equal(invoiceDateKey(""), "");
});

test("an older invoice processed later does not become the current price", () => {
  assert.equal(isLatestInvoicePrice(history, "2026-09-20", { invoiceId: "c", lineId: "1" }), false);
  assert.equal(isLatestInvoicePrice(history, "2026-10-06", { invoiceId: "c", lineId: "1" }), true);
  assert.equal(isLatestInvoicePrice(history, "2026-10-05", { invoiceId: "c", lineId: "1" }), true, "same date: newest processed wins");
});

test("re-saving the same invoice line is compared against the other invoices only", () => {
  assert.equal(isLatestInvoicePrice(history, "2026-10-05", { invoiceId: "b", lineId: "1" }), true);
});

test("manual edits do not block invoice prices", () => {
  assert.equal(isLatestInvoicePrice(history, "2026-10-10", { invoiceId: "d" }), true);
});

test("first invoice for a product is always current; an undated one is current only if nothing is dated", () => {
  assert.equal(isLatestInvoicePrice([], "2026-01-01"), true);
  assert.equal(isLatestInvoicePrice([], ""), true);
  assert.equal(isLatestInvoicePrice(history, ""), false);
});

test("latest invoice entry ignores manual edits and supplies the current fields", () => {
  const latest = latestInvoicePriceEntry(history);
  assert.equal(latest.invoiceId, "b");
  assert.deepEqual(currentPriceFieldsFromEntry(latest), { supplier: "Elite", unitCost: 12 });
  assert.deepEqual(currentPriceFieldsFromEntry(null), {});
});

test("renaming a product does not add a price history entry", () => {
  const product = { name: "Milk", unitCost: 1.2, supplier: "TG Fruits", packSize: "2L" };
  assert.equal(manualEditChangesPrice(product, { ...product, name: "Milk, Whole" }), false);
  assert.equal(manualEditChangesPrice(product, { ...product, unitCost: "1.25" }), true);
  assert.equal(manualEditChangesPrice(product, { ...product, supplier: "Albion" }), true);
});

test("a round-percentage shortfall on the invoice total is inferred as a discount", () => {
  assert.deepEqual(inferredTotalDiscount(200, [-20]), { percent: 10, amount: -20 });
  assert.equal(inferredTotalDiscount(200, [-17.3]), null);
  assert.equal(inferredTotalDiscount(200, [5]), null);
});

test("Coburn-style invoice: 10% off the total is spread as a discount adjustment", () => {
  const lines = [
    { productName: "Sourdough", quantity: 10, unitCost: 4, lineTotal: 40 },
    { productName: "Brioche buns", quantity: 4, unitCost: 15, lineTotal: 60 },
  ];
  const result = reconcileInvoiceTotals({ invoiceSubtotal: 100, invoiceTotal: 90, vatTotal: 0 }, lines);
  assert.equal(result.negativeAdjustmentTotal, -10);
  assert.equal(result.adjustments[0].type, "discount");
  assert.equal(result.adjustments[0].inferred, true);
  assert.equal(result.totalMismatch, false);
});

test("an explicit discount adjustment from the AI is kept as is", () => {
  const lines = [{ productName: "Sourdough", quantity: 10, unitCost: 10, lineTotal: 100 }];
  const result = reconcileInvoiceTotals({ invoiceTotal: 90, vatTotal: 0, adjustments: [{ type: "discount", description: "Account discount", amount: 10 }] }, lines);
  assert.equal(result.negativeAdjustmentTotal, -10);
  assert.equal(result.adjustments[0].inferred, false);
});
