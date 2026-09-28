import { numberValue } from "./numberUtils.js";
import { normalizePurchasingLineForDocument } from "./purchasingDocuments.js";
import { sameSupplierIdentity } from "./supplierIdentity.js";

export function propagateInvoiceSupplierToLines(lines = [], nextSupplier = "", previousSupplier = "") {
  const supplier = String(nextSupplier || "").trim();
  if (!supplier) return lines;
  return lines.map((line) => {
    const lineSupplier = String(line.supplier || "").trim();
    const placeholder = /^unknown supplier$/i.test(lineSupplier);
    const shouldUpdate = !lineSupplier || placeholder || (previousSupplier && sameSupplierIdentity(lineSupplier, previousSupplier));
    return shouldUpdate ? { ...line, supplier } : line;
  });
}

export function validateInvoiceLinesForApproval(lines = [], { documentType = "invoice", splitValidator = null, netTotalForLine = null } = {}) {
  const errors = [];
  lines.map((line) => normalizePurchasingLineForDocument(line, documentType)).forEach((line, index) => {
    const rowLabel = line.productName?.trim() || `line ${index + 1}`;
    if (!line.productName?.trim()) errors.push(`Add a product name on line ${index + 1}.`);
    if (numberValue(line.quantity, 0) <= 0) errors.push(`${rowLabel}: quantity must be greater than 0.`);
    if (numberValue(line.unitCost, 0) <= 0) errors.push(`${rowLabel}: unit cost must be greater than 0.`);
    if (splitValidator && !splitValidator(line)) errors.push(`${rowLabel}: department split must total 100%.`);
    if (netTotalForLine && line.lineStatus !== "Missing" && line.lineStatus !== "Damaged" && line.lineStatus !== "Sent back" && line.lineStatus !== "Not ordered") {
      if (numberValue(netTotalForLine(line), 0) <= 0) errors.push(`${rowLabel}: net line total must be greater than 0.`);
    }
  });
  return { valid: errors.length === 0, errors };
}
