import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { invoiceGroupForSupplierDate } from "../src/domain/invoiceControlTracker.js";
import { isCreditNoteDocument, normalizeDocumentType, toSignedPurchasingAmount } from "../src/domain/purchasingDocuments.js";

// Exercise the actual cell JSX, without mounting the entire authenticated app.
const source = readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
const cellSource = source.slice(source.indexOf("function InvoiceControlCell("), source.indexOf("function Products("));
const money = value => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
const Cell = runInNewContext(`${transformSync(cellSource, { loader: "jsx", jsx: "transform" }).code}\nInvoiceControlCell;`, {
  React, money, isCreditNoteDocument, documentTypeFor: invoice => normalizeDocumentType(invoice.documentType),
});

test("historical supplier/day cell renders complete count and signed stored net amount, not gross or a page total", () => {
  const supplier = { id: "synthetic-a", name: "Synthetic supplier" };
  const records = [
    { id: "one", supplierId: supplier.id, date: "2026-09-15", absoluteNetTotal: 100, sourceInvoiceTotal: 120, documentType: "invoice" },
    { id: "two", supplierId: supplier.id, date: "2026-09-15", absoluteNetTotal: 50, sourceInvoiceTotal: 60, documentType: "invoice" },
    { id: "credit", supplierId: supplier.id, date: "2026-09-15", absoluteNetTotal: 10, sourceInvoiceTotal: 12, documentType: "credit_note" },
    { id: "different-day", supplierId: supplier.id, date: "2026-09-16", absoluteNetTotal: 900, documentType: "invoice" },
    { id: "different-supplier", supplierId: "b", supplier: supplier.name, date: "2026-09-15", absoluteNetTotal: 900, documentType: "invoice" },
  ];
  const group = invoiceGroupForSupplierDate(supplier, "2026-09-15", records, { totalForInvoice: row => toSignedPurchasingAmount(row.absoluteNetTotal, row.documentType) });
  const html = renderToStaticMarkup(React.createElement(Cell, { cell: { ...group, supplier, date: "2026-09-15", label: "3 DOCUMENTS", state: "received", pendingCount: 1 } }));
  assert.match(html, /3 documents/);
  assert.match(html, /£140\.00/);
  assert.match(html, /Includes credit/);
  assert.match(html, /1 pending \/ failed/);
  assert.doesNotMatch(html, /Missing|£168\.00/);
});

test("missing historical summary is disclosed, never silently rendered as a confirmed zero", () => {
  const html = renderToStaticMarkup(React.createElement(Cell, { cell: { supplier: { name: "Synthetic supplier" }, date: "2026-09-14", state: "received", label: "INVOICE", invoiceCount: 1, total: 0, amountVerified: false } }));
  assert.match(html, /1 document/);
  assert.match(html, /Open for amount/);
  assert.doesNotMatch(html, /£0\.00/);
});
