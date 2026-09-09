import { numberValue, roundMoney } from "./numberUtils.js";
import { documentNumberFor } from "./purchasingDocuments.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";

function supplierNameFor(supplier = {}) {
  return typeof supplier === "string" ? supplier : supplier.name || supplier.supplierName || "";
}

function supplierIdFor(supplier = {}) {
  return typeof supplier === "string" ? "" : supplier.id || supplier.supplierId || "";
}

function invoiceSupplierName(invoice = {}) {
  return invoice.supplier || invoice.supplierName || "";
}

function invoiceSupplierId(invoice = {}) {
  return invoice.supplierId || invoice.supplier_id || "";
}

function defaultSignedInvoiceTotal(invoice = {}) {
  const total = invoice.signed_total
    ?? invoice.signedTotal
    ?? invoice.total
    ?? invoice.invoiceTotal
    ?? invoice.finalInvoiceTotal
    ?? 0;
  return numberValue(total, 0);
}

function compareDocumentsByNumber(left = {}, right = {}) {
  return String(documentNumberFor(right))
    .localeCompare(String(documentNumberFor(left)), undefined, { numeric: true })
    || String(right.id || "").localeCompare(String(left.id || ""), undefined, { numeric: true });
}

export function invoicesForSupplierDate(supplier, date, invoices = []) {
  const supplierName = supplierNameFor(supplier);
  const supplierId = supplierIdFor(supplier);
  return invoices
    .filter((invoice) => (
      invoice.date === date
      && (
        (supplierId && invoiceSupplierId(invoice) === supplierId)
        || sameSupplierIdentity(invoiceSupplierName(invoice), supplierName)
      )
    ))
    .sort(compareDocumentsByNumber);
}

export function invoiceGroupForSupplierDate(supplier, date, invoices = [], { totalForInvoice = defaultSignedInvoiceTotal } = {}) {
  const matchingInvoices = invoicesForSupplierDate(supplier, date, invoices);
  const dailyTotal = roundMoney(matchingInvoices.reduce((sum, invoice) => sum + numberValue(totalForInvoice(invoice), 0), 0));
  return {
    invoice: matchingInvoices[0] || null,
    invoices: matchingInvoices,
    invoiceCount: matchingInvoices.length,
    dailyTotal,
    total: dailyTotal,
  };
}
