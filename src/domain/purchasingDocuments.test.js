import assert from "node:assert/strict";
import test from "node:test";
import { validateInvoiceExtraction } from "./invoiceValidation.js";
import {
  PURCHASING_DOCUMENT_TYPES,
  assessPurchasingDocumentDuplicate,
  documentNumberFor,
  findDuplicatePurchasingDocument,
  inferDocumentTypeFromText,
  normalizePurchasingLineForDocument,
  signedPurchasesForDocuments,
  toSignedPurchasingAmount,
} from "./purchasingDocuments.js";

test("normal invoice line produces a positive signed purchasing amount", () => {
  const absoluteLine = 2 * 9.56;
  assert.equal(toSignedPurchasingAmount(absoluteLine, PURCHASING_DOCUMENT_TYPES.INVOICE), 19.12);
});

test("credit note line produces a negative signed purchasing amount", () => {
  const absoluteLine = 2 * 9.56;
  assert.equal(toSignedPurchasingAmount(absoluteLine, PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE), -19.12);
});

test("credit-note negative unit cost is normalised without a double negative", () => {
  const line = normalizePurchasingLineForDocument({
    productName: "CHORIZO COOKING SAUSAGE",
    quantity: 2,
    unitCost: -9.56,
    lineTotal: -19.12,
  }, PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE);

  assert.equal(line.quantity, 2);
  assert.equal(line.unitCost, 9.56);
  assert.equal(line.lineTotal, 19.12);
  assert.equal(toSignedPurchasingAmount(line.lineTotal, PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE), -19.12);
});

test("credit-note negative quantity is normalised without a double negative", () => {
  const line = normalizePurchasingLineForDocument({
    productName: "CHORIZO COOKING SAUSAGE",
    quantity: -2,
    unitCost: 9.56,
    lineTotal: -19.12,
  }, PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE);

  assert.equal(line.quantity, 2);
  assert.equal(line.unitCost, 9.56);
  assert.equal(line.lineTotal, 19.12);
  assert.equal(toSignedPurchasingAmount(line.lineTotal, PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE), -19.12);
});

test("Woods credit-note source values do not block confirmation validation", () => {
  const reviewed = validateInvoiceExtraction({
    invoice: {
      supplier: "Woods Foodservice Limited",
      documentType: "credit_note",
      documentNumber: "26-733594",
      invoiceDate: "2026-07-17",
      invoiceTotal: -19.12,
      creditReason: "price_adjustment",
      inventoryEffect: "financial_only",
    },
    lines: [{
      id: "woods-cn-line",
      productName: "CHORIZO COOKING SAUSAGE",
      rawDescription: "CHORIZO COOKING SAUSAGE",
      matchedProductId: "prod-chorizo",
      productMatchSource: "user_selected",
      quantity: 2,
      unitCost: -9.56,
      lineTotal: -19.12,
      department: "Kitchen Made",
      departmentMode: "Single",
      departmentSplits: [{ department: "Kitchen Made", percentage: 100 }],
    }],
  });

  assert.equal(reviewed.lines[0].unitCost, 9.56);
  assert.equal(reviewed.lines[0].lineTotal, 19.12);
  assert.equal(reviewed.lines[0].reviewReasons.includes("invalid_unit_cost"), false);
  assert.equal(reviewed.lines[0].reviewReasons.includes("invalid_line_total"), false);
  assert.equal(reviewed.invoiceHasBlockingReview, false);
});

test("manual change from invoice to credit note clears stale negative-value blockers", () => {
  const reviewed = validateInvoiceExtraction({
    invoice: {
      supplier: "Woods Foodservice Limited",
      documentType: "credit_note",
      documentNumber: "26-733594",
      invoiceDate: "2026-07-17",
      creditReason: "price_adjustment",
      inventoryEffect: "financial_only",
    },
    lines: [{
      productName: "CHORIZO COOKING SAUSAGE",
      matchedProductId: "prod-chorizo",
      productMatchSource: "user_selected",
      quantity: 2,
      unitCost: -9.56,
      lineTotal: -19.12,
      department: "Kitchen Made",
      departmentSplits: [{ department: "Kitchen Made", percentage: 100 }],
      reviewReasons: ["invalid_unit_cost", "invalid_line_total"],
    }],
  });

  assert.deepEqual(reviewed.lines[0].reviewReasons, []);
  assert.equal(reviewed.invoiceHasBlockingReview, false);
});

test("credit-note detection recognises explicit headings and preserves document number separately", () => {
  const type = inferDocumentTypeFromText("Credit Note\nDocument number: 26-733594\nGoods returned");
  assert.equal(type, PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE);
  assert.equal(documentNumberFor({ documentType: type, documentNumber: "26-733594" }), "26-733594");
});

test("duplicate detection separates invoice and credit note with the same supplier document number", () => {
  const existing = [{ id: "inv-1", supplier: "Woods", documentType: "invoice", documentNumber: "26-733594" }];
  assert.equal(findDuplicatePurchasingDocument(existing, { supplier: "Woods", documentType: "credit_note", documentNumber: "26-733594" }), null);
  assert.equal(findDuplicatePurchasingDocument(existing, { supplier: "Woods", documentType: "invoice", documentNumber: "26-733594" })?.id, "inv-1");
});

test("equivalent re-upload resolves to the existing relational invoice", () => {
  const existing = {
    id: "existing",
    persistenceSource: "relational",
    supplier: "Woods",
    documentType: "invoice",
    documentNumber: "INV-22",
    date: "2026-08-10",
    sourceInvoiceTotal: 20,
    items: [{ productName: "Milk", quantity: 2, unitCost: 10, lineTotal: 20 }],
  };
  const assessment = assessPurchasingDocumentDuplicate([existing], { ...existing, id: "upload", persistenceSource: undefined });
  assert.equal(assessment.kind, "same_document");
  assert.equal(assessment.existing.id, "existing");
});

test("same strong number with different content requires an explicit duplicate choice", () => {
  const existing = {
    id: "existing",
    persistenceSource: "relational",
    supplier: "Woods",
    documentType: "invoice",
    documentNumber: "INV-22",
    date: "2026-08-10",
    sourceInvoiceTotal: 20,
    items: [{ productName: "Milk", quantity: 2, unitCost: 10, lineTotal: 20 }],
  };
  const assessment = assessPurchasingDocumentDuplicate([existing], {
    ...existing,
    id: "upload",
    persistenceSource: undefined,
    sourceInvoiceTotal: 30,
    items: [{ productName: "Milk", quantity: 3, unitCost: 10, lineTotal: 30 }],
  });
  assert.equal(assessment.kind, "possible_duplicate");
});

test("generic Unit documents with different UUIDs and contents remain independent", () => {
  const existing = {
    id: "existing",
    persistenceSource: "relational",
    supplier: "Woods",
    documentType: "invoice",
    documentNumber: "Unit",
    date: "2026-08-10",
    sourceInvoiceTotal: 20,
    items: [{ productName: "Milk", quantity: 2, unitCost: 10, lineTotal: 20 }],
  };
  const assessment = assessPurchasingDocumentDuplicate([existing], {
    ...existing,
    id: "upload",
    persistenceSource: undefined,
    sourceInvoiceTotal: 30,
    items: [{ productName: "Milk", quantity: 3, unitCost: 10, lineTotal: 30 }],
  });
  assert.equal(assessment.kind, "none");
});

test("different generic labels do not prevent exact-content duplicate recognition", () => {
  const existing = {
    id: "existing",
    persistenceSource: "relational",
    supplier: "Woods",
    documentType: "invoice",
    documentNumber: "Unit",
    date: "2026-08-10",
    sourceInvoiceTotal: 20,
    items: [{ productName: "Milk", quantity: 2, unitCost: 10, lineTotal: 20 }],
  };
  const assessment = assessPurchasingDocumentDuplicate([existing], {
    ...existing,
    id: "upload",
    documentNumber: "Invoice",
    persistenceSource: undefined,
  });
  assert.equal(assessment.kind, "same_document");
  assert.equal(assessment.existing.id, "existing");
});

test("signed purchasing totals reduce COGS and increase GP in the credit-note example", () => {
  const sales = 20000;
  const netCogs = signedPurchasesForDocuments([
    { documentType: "invoice", absoluteGrossTotal: 8000 },
    { documentType: "credit_note", absoluteGrossTotal: 500 },
  ]);
  const grossProfit = sales - netCogs;
  const gpPercent = (grossProfit / sales) * 100;

  assert.equal(netCogs, 7500);
  assert.equal(grossProfit, 12500);
  assert.equal(gpPercent, 62.5);
});
