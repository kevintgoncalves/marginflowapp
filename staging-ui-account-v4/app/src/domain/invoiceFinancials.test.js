import test from "node:test";
import assert from "node:assert/strict";
import { invoiceComparisonFinancials, withCanonicalInvoiceFinancials } from "./invoiceFinancials.js";

const line = (overrides = {}) => ({ quantity: 2, unitCost: 5, lineTotal: 10, ...overrides });

test("normal invoice derives a gross total from complete lines", () => {
  const result = invoiceComparisonFinancials({ items: [line()] });
  assert.equal(result.subtotal, 10);
  assert.equal(result.total, 10);
});

test("VAT invoice gross total includes header VAT", () => {
  const result = invoiceComparisonFinancials({ vatTotal: 2, items: [line()] });
  assert.equal(result.derivedNetTotal, 10);
  assert.equal(result.total, 12);
});

test("discount invoice distinguishes pre-discount subtotal from final net alias", () => {
  const result = invoiceComparisonFinancials({
    subtotalBeforeDiscount: 10,
    finalInvoiceTotal: 9,
    discountAmount: 1,
    vatTotal: 1.8,
    items: [line({ lineTotal: 9 })],
  });
  assert.equal(result.subtotal, 10);
  assert.equal(result.total, 10.8);
  assert.equal(result.totalSource, "legacy_net_header_alias_plus_vat");
});

test("additional charge is included once in derived gross total", () => {
  const result = invoiceComparisonFinancials({ additionalCharges: 2.5, items: [line()] });
  assert.equal(result.total, 12.5);
});

test("handling and delivery aliases combine when additionalCharges is absent", () => {
  const result = invoiceComparisonFinancials({ handlingCharge: 1, deliveryCharge: 2, items: [line()] });
  assert.equal(result.additionalCharges, 3);
  assert.equal(result.total, 13);
});

test("legitimate zero invoice remains zero", () => {
  const result = invoiceComparisonFinancials({ sourceInvoiceSubtotal: 0, sourceInvoiceTotal: 0, items: [line({ quantity: 0, unitCost: 0, lineTotal: 0 })] });
  assert.equal(result.subtotal, 0);
  assert.equal(result.total, 0);
});

test("legitimate fully discounted zero invoice is not replaced by its positive line sum", () => {
  const result = invoiceComparisonFinancials({
    sourceInvoiceSubtotal: 10,
    sourceInvoiceTotal: 0,
    discountAmount: 10,
    items: [line()],
  });
  assert.equal(result.subtotal, 10);
  assert.equal(result.total, 0);
});

test("nonzero canonical gross total wins over legacy aliases", () => {
  const result = invoiceComparisonFinancials({ sourceInvoiceTotal: 12, invoiceTotal: 11, finalInvoiceTotal: 9, vatTotal: 2, items: [line()] });
  assert.equal(result.total, 12);
  assert.equal(result.totalSource, "invoice_header");
});

test("old mobile payload aliases become canonical server-facing fields", () => {
  const result = withCanonicalInvoiceFinancials({ subtotalBeforeDiscount: 10, finalInvoiceTotal: 9, vatTotal: 1.8, items: [line({ lineTotal: 9 })] });
  assert.equal(result.sourceInvoiceSubtotal, 10);
  assert.equal(result.sourceInvoiceTotal, 10.8);
});

test("credit note canonical values remain absolute for the signed database model", () => {
  const result = invoiceComparisonFinancials({ documentType: "credit_note", sourceInvoiceTotal: 12, sourceInvoiceSubtotal: 10, vatTotal: 2, items: [line()] });
  assert.equal(result.total, 12);
  assert.equal(result.subtotal, 10);
});
