import assert from "node:assert/strict";
import test from "node:test";
import {
  BATCH_INVOICE_ITEM_STATUSES,
  batchItemStatusAfterPersistence,
  batchItemStatusForInvoice,
  createInvoiceBatch,
  hydrateInvoiceBatch,
  invoiceBatchSummary,
  runInvoiceBatchQueue,
  splitBatchInvoiceDocuments,
  splitBatchInvoiceDocumentsBySourceFile,
} from "./invoiceBatchUpload.js";

const suppliers = [{ name: "Elite Fine Foods" }, { name: "Albion Fine Foods" }, { name: "Woods" }];

function page(sourceFileName, pageNumber, text, pageCount = 1) {
  return {
    sourceFileId: sourceFileName,
    sourceFileName,
    pageNumber,
    pageCount,
    text,
  };
}

test("splits one multi-page PDF when invoice numbers change between pages", () => {
  const documents = splitBatchInvoiceDocuments([
    page("elite-august.pdf", 1, "Elite Fine Foods Invoice No 14258777 Invoice date 11/08/2026 Product Qty Total £257.26", 2),
    page("elite-august.pdf", 2, "Elite Fine Foods Invoice No 14259212 Invoice date 12/08/2026 Product Qty Total £338.43", 2),
  ], { suppliers });

  assert.equal(documents.length, 2);
  assert.equal(documents[0].signature.documentNumber, "14258777");
  assert.equal(documents[1].signature.documentNumber, "14259212");
  assert.equal(documents[0].pageCount, 1);
  assert.equal(documents[1].pageCount, 1);
});

test("splits Elite pages when invoice date appears before invoice number", () => {
  const documents = splitBatchInvoiceDocuments([
    page("elite-august.pdf", 1, "Elite Fine Foods Invoice Date 11/08/2026 Account 1821 Invoice Number 14258777 Product Qty Total £257.26", 2),
    page("elite-august.pdf", 2, "Elite Fine Foods Invoice Date 12/08/2026 Account 1821 Invoice Number 14259212 Product Qty Total £338.43", 2),
  ], { suppliers });

  assert.equal(documents.length, 2);
  assert.deepEqual(documents.map((document) => document.signature.documentNumber), ["14258777", "14259212"]);
  assert.deepEqual(documents.map((document) => document.signature.invoiceDate), ["2026-08-11", "2026-08-12"]);
});

test("splits Elite pages when header labels and values are extracted separately", () => {
  const documents = splitBatchInvoiceDocuments([
    page("elite-august.pdf", 1, "Elite Fine Foods Invoice Date Invoice Number Account No Page 11/08/2026 14258777 1821 1 Product Qty Total £257.26", 2),
    page("elite-august.pdf", 2, "Elite Fine Foods Invoice Date Invoice Number Account No Page 12/08/2026 14259212 1821 1 Product Qty Total £338.43", 2),
  ], { suppliers });

  assert.equal(documents.length, 2);
  assert.deepEqual(documents.map((document) => document.signature.documentNumber), ["14258777", "14259212"]);
});

test("keeps multi-page invoices together when the same invoice number repeats", () => {
  const documents = splitBatchInvoiceDocuments([
    page("albion-august.pdf", 1, "Albion Fine Foods Invoice No 11676921 Delivery Date 09/08/2026 Product Qty Total", 3),
    page("albion-august.pdf", 2, "Albion Fine Foods Invoice No 11676921 Delivery Date 09/08/2026 Continued products", 3),
    page("albion-august.pdf", 3, "Albion Fine Foods Invoice No 11676921 Delivery Date 09/08/2026 VAT Total Invoice Total", 3),
  ], { suppliers });

  assert.equal(documents.length, 1);
  assert.equal(documents[0].signature.documentNumber, "11676921");
  assert.equal(documents[0].pageCount, 3);
  assert.equal(documents[0].pageLabels.length, 3);
});

test("starts a new document for each separate uploaded file", () => {
  const documents = splitBatchInvoiceDocuments([
    page("woods-1.pdf", 1, "Woods Invoice No W-100 Date 10/08/2026"),
    page("woods-2.pdf", 1, "Woods Invoice No W-101 Date 11/08/2026"),
    page("elite.pdf", 1, "Elite Fine Foods Invoice No 14259212 Invoice date 12/08/2026"),
  ], { suppliers });

  assert.deepEqual(documents.map((document) => document.signature.documentNumber), ["W-100", "W-101", "14259212"]);
});

test("falls back to one document per uploaded file when no document numbers are readable", () => {
  const documents = splitBatchInvoiceDocumentsBySourceFile([
    page("invoice1127219.pdf", 1, ""),
    page("invoice1127023.pdf", 1, ""),
    page("invoice1126894.pdf", 1, ""),
  ], { suppliers });

  assert.equal(documents.length, 3);
  assert.deepEqual(documents.map((document) => document.sourceFileName), [
    "invoice1127219.pdf",
    "invoice1127023.pdf",
    "invoice1126894.pdf",
  ]);
});

test("keeps separate uploaded PDFs separate even when only the first has readable identity", () => {
  const documents = splitBatchInvoiceDocumentsBySourceFile([
    page("Invoice1127219.pdf", 1, "Brighton & Newhaven Fish Sales Invoice Number 1127219 Invoice date 07/09/2026 Product Qty Total £101.33"),
    page("Invoice1127023.pdf", 1, "Brighton & Newhaven Fish Sales Product Qty Total"),
    page("Invoice1126894.pdf", 1, "Brighton & Newhaven Fish Sales Product Qty Total"),
  ], { suppliers });

  assert.equal(documents.length, 3);
  assert.deepEqual(documents.map((document) => document.sourceFileName), [
    "Invoice1127219.pdf",
    "Invoice1127023.pdf",
    "Invoice1126894.pdf",
  ]);
  assert.deepEqual(documents.map((document) => document.pageCount), [1, 1, 1]);
});

test("still splits multiple invoices inside one uploaded PDF when grouping by source file", () => {
  const documents = splitBatchInvoiceDocumentsBySourceFile([
    page("elite-august.pdf", 1, "Elite Fine Foods Invoice Number 14258777 Invoice date 11/08/2026 Product Qty Total £257.26", 3),
    page("elite-august.pdf", 2, "Elite Fine Foods Invoice Number 14258777 continued products", 3),
    page("elite-august.pdf", 3, "Elite Fine Foods Invoice Number 14259212 Invoice date 12/08/2026 Product Qty Total £338.43", 3),
  ], { suppliers });

  assert.equal(documents.length, 2);
  assert.equal(documents[0].signature.documentNumber, "14258777");
  assert.equal(documents[0].pageCount, 2);
  assert.equal(documents[1].signature.documentNumber, "14259212");
  assert.equal(documents[1].pageCount, 1);
});

test("marks existing supplier and document number matches as possible duplicates", () => {
  const invoice = {
    id: "batch-item",
    supplier: "Elite Fine Foods",
    documentType: "invoice",
    documentNumber: "14258777",
    date: "2026-08-11",
    items: [{ productName: "Tomatoes", quantity: 1, unitCost: 12, lineTotal: 12 }],
  };
  const existing = [{
    ...invoice,
    id: "saved",
    persistenceSource: "relational",
    sourceInvoiceTotal: 10,
    items: [{ productName: "Tomatoes", quantity: 1, unitCost: 10, lineTotal: 10 }],
  }];

  const result = batchItemStatusForInvoice(invoice, { invoiceNeedsReview: false, lines: invoice.items }, { existingInvoices: existing });
  assert.equal(result.status, BATCH_INVOICE_ITEM_STATUSES.POSSIBLE_DUPLICATE);
  assert.equal(result.duplicate.kind, "possible_duplicate");
});

test("marks extraction review flags separately from ready invoices", () => {
  const invoice = {
    id: "batch-item",
    supplier: "Elite Fine Foods",
    documentType: "invoice",
    documentNumber: "14258777",
    date: "2026-08-11",
    items: [],
  };

  const result = batchItemStatusForInvoice(invoice, { invoiceNeedsReview: true, invoiceReviewReasons: ["no_invoice_lines"], lines: [] });
  assert.equal(result.status, BATCH_INVOICE_ITEM_STATUSES.NEEDS_REVIEW);
});

test("queue processes independent invoices with partial failures", async () => {
  const batch = createInvoiceBatch([
    { id: "one", sourceFileName: "one.pdf" },
    { id: "two", sourceFileName: "two.pdf" },
    { id: "three", sourceFileName: "three.pdf" },
  ], { id: "batch", now: () => "2026-08-12T10:00:00.000Z", concurrency: 2 });
  const updates = new Map(batch.items.map((item) => [item.id, item]));

  await runInvoiceBatchQueue(batch.items, async (item) => {
    if (item.id === "two") throw new Error("AI timeout");
    return { status: BATCH_INVOICE_ITEM_STATUSES.READY, statusLabel: "Ready", invoice: { id: item.id } };
  }, {
    concurrency: 2,
    onItemUpdate: (id, patch) => updates.set(id, { ...updates.get(id), ...patch }),
  });

  assert.equal(updates.get("one").status, BATCH_INVOICE_ITEM_STATUSES.READY);
  assert.equal(updates.get("two").status, BATCH_INVOICE_ITEM_STATUSES.FAILED);
  assert.equal(updates.get("three").status, BATCH_INVOICE_ITEM_STATUSES.READY);
  assert.match(updates.get("two").error, /AI timeout/);
});

test("hydrate preserves completed results and marks interrupted work for retry", () => {
  const restored = hydrateInvoiceBatch({
    id: "batch",
    stage: "processing",
    items: [
      { id: "done", status: BATCH_INVOICE_ITEM_STATUSES.READY, invoice: { id: "done" } },
      { id: "stuck", status: BATCH_INVOICE_ITEM_STATUSES.PROCESSING },
    ],
  }, { now: () => "2026-08-12T10:01:00.000Z" });
  const summary = invoiceBatchSummary(restored);

  assert.equal(restored.items[0].status, BATCH_INVOICE_ITEM_STATUSES.READY);
  assert.equal(restored.items[1].status, BATCH_INVOICE_ITEM_STATUSES.FAILED);
  assert.equal(summary.ready, 1);
  assert.equal(summary.failed, 1);
  assert.equal(restored.stage, "review");
});

test("batch keeps a cloud sync failure visible and retryable", () => {
  const invoice = { id: "tg-830571", supplier: "TG Fruits", documentNumber: "830571" };
  const result = batchItemStatusAfterPersistence({
    invoice: { ...invoice, syncStatus: "sync_failed" },
    persisted: false,
    error: new Error("statement timeout"),
  });

  assert.equal(result.status, BATCH_INVOICE_ITEM_STATUSES.FAILED);
  assert.equal(result.failureStage, "sync");
  assert.equal(result.invoice.id, invoice.id);
  assert.match(result.error, /statement timeout/);
});

test("batch only marks an invoice imported after persistence succeeds", () => {
  const result = batchItemStatusAfterPersistence({
    invoice: { id: "tg-830571", syncStatus: "synced" },
    persisted: true,
    error: null,
  }, { now: () => "2026-09-10T10:30:00.000Z" });

  assert.equal(result.status, BATCH_INVOICE_ITEM_STATUSES.IMPORTED);
  assert.equal(result.failureStage, "");
  assert.equal(result.importedAt, "2026-09-10T10:30:00.000Z");
});
