import assert from "node:assert/strict";
import test from "node:test";
import {
  BATCH_INVOICE_ITEM_STATUSES,
  batchItemStatusForInvoice,
  createInvoiceBatch,
  hydrateInvoiceBatch,
  invoiceBatchSummary,
  runInvoiceBatchQueue,
  splitBatchInvoiceDocuments,
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
