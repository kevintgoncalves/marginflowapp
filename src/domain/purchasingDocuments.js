import { numberValue, roundMoney } from "./numberUtils.js";

export const PURCHASING_DOCUMENT_TYPES = Object.freeze({
  INVOICE: "invoice",
  CREDIT_NOTE: "credit_note",
  UNKNOWN: "unknown",
});

export const CREDIT_REASONS = Object.freeze({
  GOODS_RETURN: "goods_return",
  PRICE_ADJUSTMENT: "price_adjustment",
  REBATE: "rebate",
  DAMAGED_GOODS: "damaged_goods",
  INVOICE_CORRECTION: "invoice_correction",
  OTHER: "other",
});

export const INVENTORY_EFFECTS = Object.freeze({
  DECREASE_STOCK: "decrease_stock",
  FINANCIAL_ONLY: "financial_only",
  NONE: "none",
});

const documentTypeAliases = new Map([
  ["invoice", PURCHASING_DOCUMENT_TYPES.INVOICE],
  ["inv", PURCHASING_DOCUMENT_TYPES.INVOICE],
  ["credit_note", PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE],
  ["credit note", PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE],
  ["credit-note", PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE],
  ["credit memo", PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE],
  ["credit_memo", PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE],
  ["credit", PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE],
  ["unknown", PURCHASING_DOCUMENT_TYPES.UNKNOWN],
]);

const creditReasonAliases = new Map([
  ["goods_return", CREDIT_REASONS.GOODS_RETURN],
  ["goods return", CREDIT_REASONS.GOODS_RETURN],
  ["goods_returned", CREDIT_REASONS.GOODS_RETURN],
  ["goods returned", CREDIT_REASONS.GOODS_RETURN],
  ["return", CREDIT_REASONS.GOODS_RETURN],
  ["returned_goods", CREDIT_REASONS.GOODS_RETURN],
  ["price_adjustment", CREDIT_REASONS.PRICE_ADJUSTMENT],
  ["price adjustment", CREDIT_REASONS.PRICE_ADJUSTMENT],
  ["pricing correction", CREDIT_REASONS.PRICE_ADJUSTMENT],
  ["price correction", CREDIT_REASONS.PRICE_ADJUSTMENT],
  ["rebate", CREDIT_REASONS.REBATE],
  ["allowance", CREDIT_REASONS.REBATE],
  ["damaged_goods", CREDIT_REASONS.DAMAGED_GOODS],
  ["damaged goods", CREDIT_REASONS.DAMAGED_GOODS],
  ["damaged", CREDIT_REASONS.DAMAGED_GOODS],
  ["invoice_correction", CREDIT_REASONS.INVOICE_CORRECTION],
  ["invoice correction", CREDIT_REASONS.INVOICE_CORRECTION],
  ["correction", CREDIT_REASONS.INVOICE_CORRECTION],
  ["other", CREDIT_REASONS.OTHER],
]);

const inventoryEffectAliases = new Map([
  ["decrease_stock", INVENTORY_EFFECTS.DECREASE_STOCK],
  ["decrease stock", INVENTORY_EFFECTS.DECREASE_STOCK],
  ["reduce_stock", INVENTORY_EFFECTS.DECREASE_STOCK],
  ["reduce stock", INVENTORY_EFFECTS.DECREASE_STOCK],
  ["financial_only", INVENTORY_EFFECTS.FINANCIAL_ONLY],
  ["financial only", INVENTORY_EFFECTS.FINANCIAL_ONLY],
  ["no_stock_change", INVENTORY_EFFECTS.FINANCIAL_ONLY],
  ["no stock change", INVENTORY_EFFECTS.FINANCIAL_ONLY],
  ["none", INVENTORY_EFFECTS.NONE],
]);

const CREDIT_HEADING_PATTERN = /\b(credit\s+(?:note|memo)|goods?\s+returned|goods?\s+return|rebate|allowance|pricing\s+correction|price\s+adjustment|invoice\s+correction)\b/i;
const INVOICE_HEADING_PATTERN = /\b(tax\s+invoice|invoice\s+(?:number|no\.?|#)|invoice\b)\b/i;

export function normalizeDocumentType(value, { allowUnknown = false, fallback = PURCHASING_DOCUMENT_TYPES.INVOICE } = {}) {
  const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
  const normalized = documentTypeAliases.get(raw) || "";
  if (normalized === PURCHASING_DOCUMENT_TYPES.UNKNOWN && !allowUnknown) return fallback;
  if (normalized) return normalized;
  return allowUnknown ? PURCHASING_DOCUMENT_TYPES.UNKNOWN : fallback;
}

export function isCreditNoteDocument(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return normalizeDocumentType(documentType) === PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE;
}

export function isInvoiceDocument(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return normalizeDocumentType(documentType) === PURCHASING_DOCUMENT_TYPES.INVOICE;
}

export function getDocumentSign(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return isCreditNoteDocument(documentType) ? -1 : 1;
}

export function absolutePurchasingAmount(amount = 0) {
  return Math.abs(numberValue(amount, 0));
}

export function toSignedPurchasingAmount(amount = 0, documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return roundMoney(absolutePurchasingAmount(amount) * getDocumentSign(documentType));
}

export function documentTypeLabel(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return isCreditNoteDocument(documentType) ? "Credit note" : "Invoice";
}

export function documentTypeBadgeLabel(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return isCreditNoteDocument(documentType) ? "CREDIT NOTE" : "INVOICE";
}

export function purchasingDocumentNoun(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return isCreditNoteDocument(documentType) ? "credit note" : "invoice";
}

export function confirmationLabelForDocument(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return isCreditNoteDocument(documentType) ? "Confirm Credit Note" : "Confirm Invoice";
}

export function confirmingLabelForDocument(documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return isCreditNoteDocument(documentType) ? "Confirming credit note..." : "Confirming invoice...";
}

export function documentNumberFor(document = {}) {
  return String(document.documentNumber ?? document.document_number ?? document.invoiceNumber ?? document.invoice_number ?? "").trim();
}

export function documentTypeFor(document = {}) {
  return normalizeDocumentType(document.documentType ?? document.document_type);
}

export function duplicateDocumentKey({ companyId = "", supplierId = "", supplier = "", documentType = PURCHASING_DOCUMENT_TYPES.INVOICE, documentNumber = "" } = {}) {
  return [
    String(companyId || "").trim().toLowerCase(),
    String(supplierId || supplier || "").trim().toLowerCase(),
    normalizeDocumentType(documentType),
    String(documentNumber || "").trim().toLowerCase(),
  ].join("|");
}

export const GENERIC_PURCHASING_DOCUMENT_NUMBERS = new Set([
  "",
  "date",
  "document",
  "inv",
  "invoice",
  "invoice number",
  "n/a",
  "na",
  "receipt",
  "total",
  "unit",
  "unknown",
]);

export function isGenericPurchasingDocumentNumber(value = "") {
  return GENERIC_PURCHASING_DOCUMENT_NUMBERS.has(String(value || "").trim().toLowerCase().replace(/\s+/g, " "));
}

export function findDuplicatePurchasingDocument(documents = [], document = {}, { companyId = "", excludeId = "" } = {}) {
  const documentNumber = documentNumberFor(document);
  if (isGenericPurchasingDocumentNumber(documentNumber)) return null;
  const key = duplicateDocumentKey({
    companyId,
    supplierId: document.supplierId || document.supplier_id || "",
    supplier: document.supplier || "",
    documentType: documentTypeFor(document),
    documentNumber,
  });
  return documents.find((candidate) => {
    if (excludeId && candidate.id === excludeId) return false;
    return duplicateDocumentKey({
      companyId,
      supplierId: candidate.supplierId || candidate.supplier_id || "",
      supplier: candidate.supplier || "",
      documentType: documentTypeFor(candidate),
      documentNumber: documentNumberFor(candidate),
    }) === key;
  }) || null;
}

function canonicalSplit(split = {}) {
  return {
    department: String(split.departmentId || split.department_id || split.department || split.departmentName || "").trim().toLowerCase(),
    percentage: roundMoney(numberValue(split.percentage, 0)),
    amount: roundMoney(numberValue(split.amount, 0)),
  };
}

function canonicalLine(line = {}) {
  const splits = (line.departmentSplits || line.department_splits || []).map(canonicalSplit).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    product: String(line.matchedProductId || line.productId || line.product_id || line.productName || line.product_name || "").trim().toLowerCase(),
    packSize: String(line.packSize || line.pack_size || "").trim().toLowerCase(),
    quantity: numberValue(line.quantity, 0),
    unitCost: numberValue(line.unitCost ?? line.unit_cost, 0),
    lineTotal: roundMoney(numberValue(line.netLineTotal ?? line.net_line_total ?? line.lineTotal, numberValue(line.quantity, 0) * numberValue(line.unitCost ?? line.unit_cost, 0))),
    discountAmount: roundMoney(numberValue(line.discountAmount ?? line.discount_amount, 0)),
    discountPercent: numberValue(line.discountPercent ?? line.discount_percent, 0),
    vat: roundMoney(numberValue(line.vat ?? line.vatAmount ?? line.vat_amount, 0)),
    department: String(line.departmentId || line.department_id || line.department || line.departmentName || "").trim().toLowerCase(),
    splits,
  };
}

export function purchasingDocumentBusinessShape(document = {}) {
  const lines = (document.items || document.lines || []).map(canonicalLine).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const documentNumber = documentNumberFor(document);
  return {
    supplier: String(document.supplierId || document.supplier_id || document.supplier || document.supplierName || "").trim().toLowerCase(),
    documentType: documentTypeFor(document),
    documentNumber: isGenericPurchasingDocumentNumber(documentNumber) ? "" : documentNumber.toLowerCase(),
    date: String(document.date || document.invoiceDate || document.invoice_date || "").slice(0, 10),
    subtotal: roundMoney(numberValue(document.sourceInvoiceSubtotal ?? document.invoiceSubtotal ?? document.subtotal, 0)),
    vat: roundMoney(numberValue(document.vatTotal ?? document.taxAmount ?? document.tax_amount, 0)),
    discount: roundMoney(numberValue(document.discountAmount ?? document.discount_amount, 0)),
    charges: roundMoney(numberValue(document.additionalCharges ?? document.additional_charges, 0)),
    total: roundMoney(numberValue(document.sourceInvoiceTotal ?? document.invoiceTotal ?? document.totalAmount ?? document.total, 0)),
    currency: String(document.currency || "GBP").trim().toUpperCase(),
    lines,
  };
}

export function purchasingDocumentsMateriallyEquivalent(left = {}, right = {}) {
  return JSON.stringify(purchasingDocumentBusinessShape(left)) === JSON.stringify(purchasingDocumentBusinessShape(right));
}

export function assessPurchasingDocumentDuplicate(documents = [], document = {}, { companyId = "" } = {}) {
  const sameId = document.id ? documents.find((candidate) => candidate.id === document.id && candidate.persistenceSource === "relational") : null;
  if (sameId) {
    return {
      kind: purchasingDocumentsMateriallyEquivalent(sameId, document) ? "same_document" : "same_uuid_changed",
      existing: sameId,
      candidates: [sameId],
    };
  }

  const documentNumber = documentNumberFor(document);
  let candidates = [];
  if (isGenericPurchasingDocumentNumber(documentNumber)) {
    const supplier = String(document.supplierId || document.supplier_id || document.supplier || "").trim().toLowerCase();
    const date = String(document.date || document.invoiceDate || document.invoice_date || "").slice(0, 10);
    candidates = documents.filter((candidate) => (
      candidate.persistenceSource === "relational"
      && String(candidate.supplierId || candidate.supplier_id || candidate.supplier || "").trim().toLowerCase() === supplier
      && documentTypeFor(candidate) === documentTypeFor(document)
      && String(candidate.date || candidate.invoiceDate || candidate.invoice_date || "").slice(0, 10) === date
      && isGenericPurchasingDocumentNumber(documentNumberFor(candidate))
    ));
  } else {
    const key = duplicateDocumentKey({
      companyId,
      supplierId: document.supplierId || document.supplier_id || "",
      supplier: document.supplier || "",
      documentType: documentTypeFor(document),
      documentNumber,
    });
    candidates = documents.filter((candidate) => candidate.persistenceSource === "relational" && duplicateDocumentKey({
      companyId,
      supplierId: candidate.supplierId || candidate.supplier_id || "",
      supplier: candidate.supplier || "",
      documentType: documentTypeFor(candidate),
      documentNumber: documentNumberFor(candidate),
    }) === key);
  }
  const equivalent = candidates.filter((candidate) => purchasingDocumentsMateriallyEquivalent(candidate, document));
  if (equivalent.length === 1) return { kind: "same_document", existing: equivalent[0], candidates };
  if (!isGenericPurchasingDocumentNumber(documentNumber) && candidates.length) return { kind: "possible_duplicate", existing: candidates[0], candidates };
  return { kind: "none", existing: null, candidates };
}

export function normalizeCreditReason(value = "", fallback = CREDIT_REASONS.PRICE_ADJUSTMENT) {
  const raw = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, " ");
  return creditReasonAliases.get(raw) || fallback;
}

export function defaultInventoryEffectForCreditReason(reason = CREDIT_REASONS.PRICE_ADJUSTMENT) {
  const normalized = normalizeCreditReason(reason);
  if (normalized === CREDIT_REASONS.GOODS_RETURN) return INVENTORY_EFFECTS.DECREASE_STOCK;
  return INVENTORY_EFFECTS.FINANCIAL_ONLY;
}

export function normalizeInventoryEffect(value = "", fallback = "") {
  const raw = String(value || "").trim().toLowerCase().replace(/[-\s]+/g, " ");
  return inventoryEffectAliases.get(raw) || fallback;
}

export function inferCreditReasonFromText(text = "") {
  const lower = String(text || "").toLowerCase();
  if (/\b(goods?\s+returned|goods?\s+return|return(?:ed)?\s+goods?)\b/.test(lower)) return CREDIT_REASONS.GOODS_RETURN;
  if (/\b(damaged|spoiled|broken)\b/.test(lower)) return CREDIT_REASONS.DAMAGED_GOODS;
  if (/\b(rebate|allowance)\b/.test(lower)) return CREDIT_REASONS.REBATE;
  if (/\b(invoice\s+correction|correction|incorrect\s+invoice)\b/.test(lower)) return CREDIT_REASONS.INVOICE_CORRECTION;
  if (/\b(price\s+adjustment|pricing\s+correction|price\s+correction|adjustment)\b/.test(lower)) return CREDIT_REASONS.PRICE_ADJUSTMENT;
  return CREDIT_REASONS.PRICE_ADJUSTMENT;
}

export function inferDocumentTypeFromText(text = "", extracted = {}) {
  const combined = [
    text,
    extracted.document_type,
    extracted.documentType,
    extracted.documentNumber,
    extracted.document_number,
    extracted.invoiceNumber,
    extracted.invoice_number,
    extracted.credit_reason,
    extracted.creditReason,
  ].filter(Boolean).join(" ");

  const explicitType = normalizeDocumentType(extracted.document_type ?? extracted.documentType ?? "", { allowUnknown: true });
  if (explicitType !== PURCHASING_DOCUMENT_TYPES.UNKNOWN) return explicitType;
  if (CREDIT_HEADING_PATTERN.test(combined)) return PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE;
  if (INVOICE_HEADING_PATTERN.test(combined)) return PURCHASING_DOCUMENT_TYPES.INVOICE;

  const totals = [
    extracted.gross_total,
    extracted.grossTotal,
    extracted.invoiceTotal,
    extracted.invoice_total,
    extracted.total,
  ].map((value) => numberValue(value, 0));
  if (totals.some((value) => value < 0) && /\b(total|vat|net|gross)\b/i.test(combined)) {
    return PURCHASING_DOCUMENT_TYPES.CREDIT_NOTE;
  }

  return PURCHASING_DOCUMENT_TYPES.UNKNOWN;
}

export function normalizePurchasingLineForDocument(line = {}, documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  if (!isCreditNoteDocument(documentType)) return { ...line };

  const sourceQuantity = line.sourceQuantity ?? line.source_quantity ?? line.quantity;
  const sourceUnitCost = line.sourceUnitCost ?? line.source_unit_cost ?? line.unitCost;
  const sourceLineTotal = line.sourceLineTotal ?? line.source_line_total ?? line.lineTotal ?? line.netLineTotal;
  const quantity = absolutePurchasingAmount(line.quantity);
  const unitCost = absolutePurchasingAmount(line.unitCost);
  const lineTotal = line.lineTotal === undefined && line.netLineTotal === undefined
    ? quantity * unitCost
    : absolutePurchasingAmount(line.lineTotal ?? line.netLineTotal);
  const vat = absolutePurchasingAmount(line.vat ?? line.vatAmount ?? line.taxAmount ?? 0);

  return {
    ...line,
    quantity,
    unitCost,
    lineTotal,
    netLineTotal: line.netLineTotal === undefined ? line.netLineTotal : absolutePurchasingAmount(line.netLineTotal),
    vat,
    vatAmount: line.vatAmount === undefined ? line.vatAmount : absolutePurchasingAmount(line.vatAmount),
    sourceQuantity,
    sourceUnitCost,
    sourceLineTotal,
  };
}

export function normalizePurchasingLinesForDocument(lines = [], documentType = PURCHASING_DOCUMENT_TYPES.INVOICE) {
  return lines.map((line) => normalizePurchasingLineForDocument(line, documentType));
}

export function absoluteDocumentTotalsFromLines(lines = []) {
  return roundMoney(lines.reduce((sum, line) => {
    const net = line.netLineTotal ?? line.lineTotal ?? (numberValue(line.quantity, 0) * numberValue(line.unitCost, 0));
    return sum + absolutePurchasingAmount(net);
  }, 0));
}

export function signedPurchasesForDocuments(documents = []) {
  return documents.reduce((sum, document) => sum + toSignedPurchasingAmount(
    document.absoluteGrossTotal ?? document.absolute_gross_total ?? document.finalInvoiceTotal ?? document.total ?? document.total_amount ?? absoluteDocumentTotalsFromLines(document.items || document.lines || []),
    documentTypeFor(document),
  ), 0);
}
