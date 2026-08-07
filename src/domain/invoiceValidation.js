import { amountsAlmostEqual, normalizeHeader, numberValue, roundMoney } from "./numberUtils.js";
import {
  departmentAssignmentForLine,
  departmentAssignmentIsValid,
  lineUsesSplitDepartmentMode,
} from "./departmentAssignment.js";
import {
  clearProductMatchReviewReasons,
  isAmbiguousProductResolution,
  isCreateNewProductResolution,
  isResolvedExistingProductResolution,
  isUnresolvedProductResolution,
} from "./invoiceProductResolution.js";
import {
  CREDIT_REASONS,
  INVENTORY_EFFECTS,
  absolutePurchasingAmount,
  isCreditNoteDocument,
  normalizeCreditReason,
  normalizeDocumentType,
  normalizeInventoryEffect,
  normalizePurchasingLineForDocument,
} from "./purchasingDocuments.js";

const DEFAULT_PRICE_DEVIATION_THRESHOLD = 0.25;
const DEFAULT_MIN_PRICE_SAMPLES = 3;
const DEFAULT_SMALL_CHARGE_LIMIT = 10;
const signSensitiveLineReasons = new Set(["invalid_quantity", "invalid_unit_cost", "invalid_line_total"]);
const recalculatedLineReasons = new Set([
  "low_extraction_confidence",
  "missing_product_name",
  "invalid_quantity",
  "invalid_unit_cost",
  "invalid_line_total",
  "no_confirmed_product_match",
  "ambiguous_product_match",
  "invalid_split",
  "missing_department",
  "price_deviation",
]);
const recalculatedInvoiceReasons = new Set(["invoice_total_mismatch", "invoice_subtotal_mismatch", "vat_mismatch", "unaccounted_invoice_charge"]);
const reducingAdjustmentTypes = new Set(["discount", "credit"]);
const chargeAdjustmentTypes = new Set(["handling", "delivery", "carriage", "shipping", "service_charge", "other"]);

export const REVIEW_REASON_SEVERITY = Object.freeze({
  missing_supplier: "error",
  no_invoice_lines: "error",
  missing_document_type: "error",
  no_confirmed_product_match: "error",
  missing_product_name: "error",
  invalid_quantity: "error",
  invalid_unit_cost: "error",
  invalid_line_total: "error",
  invalid_split: "error",
  missing_department: "error",
  missing_credit_treatment: "error",
  exact_product_duplicate: "error",
  supplier_code_product_conflict: "error",

  low_extraction_confidence: "warning",
  price_deviation: "warning",
  invoice_total_mismatch: "warning",
  invoice_subtotal_mismatch: "warning",
  vat_mismatch: "warning",
  duplicate_invoice_number: "warning",
  missing_invoice_number: "warning",
  missing_invoice_date: "warning",
  fallback_model_required: "warning",
  unit_conflict: "warning",
  pack_size_conflict: "warning",
  unaccounted_invoice_charge: "warning",
  ambiguous_product_match: "error",
});

export function reviewReasonSeverity(reason = "") {
  return REVIEW_REASON_SEVERITY[reason] || "warning";
}

export function hasBlockingReviewReasons(reasons = []) {
  return reasons.some((reason) => reviewReasonSeverity(reason) === "error");
}

export function highestReviewSeverity(reasons = []) {
  return hasBlockingReviewReasons(reasons) ? "error" : (reasons.length ? "warning" : "none");
}

export function invoiceLineHasBlockingReview(line = {}) {
  return hasBlockingReviewReasons(line.reviewReasons || []);
}

export function invoiceHasBlockingReview(invoice = {}) {
  const lines = invoice.lines || invoice.items || [];
  return hasBlockingReviewReasons(invoice.invoiceReviewReasons || [])
    || lines.some(invoiceLineHasBlockingReview);
}

export function getBlockingInvoiceIssues(invoice = {}) {
  const lines = invoice.lines || invoice.items || [];
  return [
    ...(invoice.invoiceReviewReasons || []).map((reason) => ({ reason, scope: "invoice" })),
    ...lines.flatMap((line) => (line.reviewReasons || []).map((reason) => ({ reason, scope: "line", lineId: line.id || "", productName: line.productName || line.rawDescription || "" }))),
  ].filter((issue) => reviewReasonSeverity(issue.reason) === "error");
}

export function getWarningInvoiceIssues(invoice = {}) {
  const lines = invoice.lines || invoice.items || [];
  return [
    ...(invoice.invoiceReviewReasons || []).map((reason) => ({ reason, scope: "invoice" })),
    ...lines.flatMap((line) => (line.reviewReasons || []).map((reason) => ({ reason, scope: "line", lineId: line.id || "", productName: line.productName || line.rawDescription || "" }))),
  ].filter((issue) => reviewReasonSeverity(issue.reason) === "warning");
}

export function canConfirmInvoice(invoice = {}) {
  return getBlockingInvoiceIssues(invoice).length === 0;
}

function addReason(reasons, reason) {
  if (reason && !reasons.includes(reason)) reasons.push(reason);
}

function isNonReceivedLine(line = {}) {
  return ["Missing", "Damaged", "Sent back", "Not ordered", "Credit note received"].includes(line.lineStatus || line.status || "");
}

function lineTotalValue(line = {}, documentType = "invoice") {
  const value = numberValue(line.lineTotal ?? line.netLineTotal, numberValue(line.quantity, 0) * numberValue(line.unitCost, 0));
  return isCreditNoteDocument(documentType) ? absolutePurchasingAmount(value) : value;
}

function optionalPurchasingAmount(...values) {
  const value = values.find((candidate) => candidate !== null && candidate !== undefined && String(candidate).trim() !== "");
  if (value === undefined) return null;
  const amount = Number(typeof value === "string" ? value.replace(/,/g, "").replace(/[^0-9.-]/g, "") : value);
  return Number.isFinite(amount) ? absolutePurchasingAmount(amount) : null;
}

function adjustmentType(value = "") {
  const type = String(value || "other").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (type === "service" || type === "servicecharge") return "service_charge";
  if (type === "rounding_adjustment") return "rounding";
  return type || "other";
}

function normalizedAdjustment(entry = {}, index = 0) {
  const type = adjustmentType(entry.type || entry.category || entry.description);
  const rawAmount = numberValue(entry.amount ?? entry.value ?? entry.total, 0);
  const amount = reducingAdjustmentTypes.has(type)
    ? -Math.abs(rawAmount)
    : type === "rounding"
      ? rawAmount
      : Math.abs(rawAmount);
  return {
    id: entry.id || `adjustment-${index}`,
    type,
    description: String(entry.description || entry.label || type.replace(/_/g, " ")).trim(),
    amount: roundMoney(amount),
    inferred: Boolean(entry.inferred),
  };
}

export function normalizeInvoiceAdjustments(invoice = {}) {
  const structured = invoice.adjustments || invoice.invoiceAdjustments || invoice.invoice_adjustments;
  if (Array.isArray(structured) && structured.length) {
    return structured.map(normalizedAdjustment).filter((entry) => entry.amount !== 0);
  }

  const chargeLines = invoice.invoiceCharges || invoice.additionalChargeLines || invoice.charges;
  if (Array.isArray(chargeLines) && chargeLines.length) {
    return chargeLines.map(normalizedAdjustment).filter((entry) => entry.amount !== 0);
  }

  const legacy = [];
  const additionalCharges = optionalPurchasingAmount(invoice.additionalCharges);
  if (additionalCharges) {
    legacy.push({ type: "other", description: invoice.additionalChargesDescription || "Additional charges", amount: additionalCharges });
  } else {
    [
      ["handling", "Handling", invoice.handlingCharge ?? invoice.handling],
      ["delivery", "Delivery", invoice.deliveryCharge ?? invoice.delivery],
      ["carriage", "Carriage", invoice.carriageCharge ?? invoice.carriage],
      ["shipping", "Shipping", invoice.shippingCharge ?? invoice.shipping],
      ["service_charge", "Service charge", invoice.serviceCharge ?? invoice.service_charge],
    ].forEach(([type, description, value]) => {
      const amount = optionalPurchasingAmount(value);
      if (amount) legacy.push({ type, description, amount });
    });
  }
  [
    ["discount", "Discount", invoice.invoiceLevelDiscount ?? invoice.invoice_level_discount],
    ["credit", "Credit", invoice.invoiceCredit ?? invoice.invoice_credit],
    ["rounding", "Rounding", invoice.roundingAdjustment ?? invoice.rounding_adjustment],
  ].forEach(([type, description, value]) => {
    const amount = optionalPurchasingAmount(value);
    if (amount) legacy.push({ type, description, amount });
  });
  return legacy.map(normalizedAdjustment);
}

function likelySmallInvoiceCharge(amount = 0, invoiceTotal = 0) {
  const absolute = Math.abs(roundMoney(amount));
  if (!absolute) return false;
  return absolute <= Math.max(DEFAULT_SMALL_CHARGE_LIMIT, Math.abs(numberValue(invoiceTotal, 0)) * 0.03);
}

function totalMatchesAny(expected = 0, candidates = []) {
  return candidates
    .map(roundMoney)
    .some((candidate) => amountsAlmostEqual(candidate, expected, Math.max(0.5, Math.abs(expected) * 0.01), 0.01));
}

export function reconcileInvoiceTotals(invoice = {}, lines = invoice.lines || invoice.items || []) {
  const documentType = normalizeDocumentType(invoice.documentType ?? invoice.document_type ?? "invoice");
  const lineSubtotal = roundMoney(lines.reduce((sum, line) => sum + lineTotalValue(line, documentType), 0));
  const printedSubtotal = optionalPurchasingAmount(invoice.invoiceSubtotal, invoice.netTotal, invoice.net_total, invoice.subtotal);
  const printedTotal = optionalPurchasingAmount(invoice.invoiceTotal, invoice.grossTotal, invoice.gross_total, invoice.finalInvoiceTotal, invoice.total_amount);
  const printedVat = optionalPurchasingAmount(invoice.vatTotal, invoice.taxAmount, invoice.tax_amount, invoice.vat_total);
  const vatTotal = printedVat ?? 0;
  let adjustments = normalizeInvoiceAdjustments(invoice);
  let adjustmentTotal = roundMoney(adjustments.reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const inferredFromTotal = printedTotal === null ? 0 : roundMoney(printedTotal - vatTotal - lineSubtotal);
  const inferredFromSubtotal = printedSubtotal === null ? 0 : roundMoney(printedSubtotal - lineSubtotal);

  if (!adjustments.length) {
    const inferredAmount = likelySmallInvoiceCharge(inferredFromTotal, printedTotal ?? 0)
      ? inferredFromTotal
      : (likelySmallInvoiceCharge(inferredFromSubtotal, printedSubtotal ?? 0) ? inferredFromSubtotal : 0);
    if (inferredAmount) {
      adjustments = [normalizedAdjustment({ type: inferredAmount < 0 ? "discount" : "other", description: "Inferred invoice adjustment", amount: inferredAmount, inferred: true })];
      adjustmentTotal = roundMoney(adjustments[0].amount);
    }
  }

  const calculatedTotal = roundMoney(lineSubtotal + adjustmentTotal + vatTotal);
  const subtotalCandidates = [lineSubtotal, lineSubtotal + adjustmentTotal];
  const totalCandidates = [calculatedTotal];
  if (printedSubtotal !== null) {
    totalCandidates.push(printedSubtotal + vatTotal, printedSubtotal + adjustmentTotal + vatTotal);
  }
  const subtotalMismatch = printedSubtotal !== null && !totalMatchesAny(printedSubtotal, subtotalCandidates);
  const totalMismatch = printedTotal !== null && !totalMatchesAny(printedTotal, totalCandidates);
  const positiveAdjustmentTotal = roundMoney(adjustments
    .filter((adjustment) => adjustment.amount > 0)
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const negativeAdjustmentTotal = roundMoney(adjustments
    .filter((adjustment) => adjustment.amount < 0)
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));
  const chargeTotal = roundMoney(adjustments
    .filter((adjustment) => chargeAdjustmentTypes.has(adjustment.type) && adjustment.amount > 0)
    .reduce((sum, adjustment) => sum + adjustment.amount, 0));

  return {
    lineSubtotal,
    printedSubtotal,
    vatTotal,
    printedVat,
    printedTotal,
    adjustments,
    adjustmentTotal,
    additionalCharges: positiveAdjustmentTotal,
    chargeTotal,
    positiveAdjustmentTotal,
    negativeAdjustmentTotal,
    inferredAdditionalCharges: adjustments.some((adjustment) => adjustment.inferred) ? adjustmentTotal : 0,
    calculatedTotal,
    subtotalMismatch,
    totalMismatch,
  };
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function priceDeviationForLine(line = {}, historicalPrices = [], {
  minSamples = DEFAULT_MIN_PRICE_SAMPLES,
  threshold = DEFAULT_PRICE_DEVIATION_THRESHOLD,
} = {}) {
  const productId = line.matchedProductId || line.productId || "";
  const supplier = line.supplier || "";
  const currentPrice = numberValue(line.unitCost, 0);
  if (!productId || !supplier || currentPrice <= 0) return null;
  const companyId = line.companyId || line.company_id || "";
  const packSize = line.packSize || line.pack_size || "";
  const unitOfMeasure = line.unitOfMeasure || line.unit_of_measure || line.unit || "";
  const currency = line.currency || "";
  const vatBasis = line.vatBasis ?? line.vat_basis;

  const comparable = historicalPrices
    .filter((entry) => (entry.productId || entry.product_id) === productId)
    .filter((entry) => !supplier || normalizeHeader(entry.supplier || entry.supplierName || "") === normalizeHeader(supplier))
    .filter((entry) => !companyId || (entry.companyId || entry.company_id) === companyId)
    .filter((entry) => !packSize || ((entry.packSize || entry.pack_size) && normalizeHeader(entry.packSize || entry.pack_size) === normalizeHeader(packSize)))
    .filter((entry) => !unitOfMeasure || ((entry.unitOfMeasure || entry.unit_of_measure || entry.unit) && normalizeHeader(entry.unitOfMeasure || entry.unit_of_measure || entry.unit) === normalizeHeader(unitOfMeasure)))
    .filter((entry) => !currency || (entry.currency && String(entry.currency).toUpperCase() === String(currency).toUpperCase()))
    .filter((entry) => vatBasis === undefined || ((entry.vatBasis ?? entry.vat_basis) !== undefined && vatBasis === (entry.vatBasis ?? entry.vat_basis)))
    .map((entry) => numberValue(entry.price ?? entry.unitCost ?? entry.unit_cost, 0))
    .filter((price) => price > 0);

  if (comparable.length < minSamples) return null;
  const baseline = median(comparable.slice(-12));
  if (!baseline) return null;
  const deviation = Math.abs(currentPrice - baseline) / baseline;
  return {
    comparable: true,
    baseline,
    sampleCount: comparable.length,
    deviation,
    exceedsThreshold: deviation > threshold,
  };
}

export function validateInvoiceExtraction({
  invoice = {},
  lines = invoice.lines || invoice.items || [],
  historicalPrices = [],
  duplicateInvoiceNumbers = [],
  priceDeviationThreshold = DEFAULT_PRICE_DEVIATION_THRESHOLD,
  minHistoricalPriceSamples = DEFAULT_MIN_PRICE_SAMPLES,
} = {}) {
  const documentType = normalizeDocumentType(invoice.documentType ?? invoice.document_type ?? "invoice", { allowUnknown: true });
  const signedDocumentType = normalizeDocumentType(documentType);
  const isCreditNote = isCreditNoteDocument(signedDocumentType);
  const validatedLines = lines.map((sourceLine) => {
    const line = normalizePurchasingLineForDocument(sourceLine, signedDocumentType);
    const createsNewProduct = isCreateNewProductResolution(line);
    const sourceReviewReasons = isCreditNote
      ? (line.reviewReasons || []).filter((reason) => !signSensitiveLineReasons.has(reason))
      : (line.reviewReasons || []);
    const existingReviewReasons = sourceReviewReasons.filter((reason) => !recalculatedLineReasons.has(reason));
    const reviewReasons = createsNewProduct ? clearProductMatchReviewReasons(existingReviewReasons) : [...existingReviewReasons];
    const rawDescription = line.rawDescription || line.productName || "";
    const requiredProductText = createsNewProduct ? line.productName : rawDescription;
    const quantity = numberValue(line.quantity, 0);
    const unitCost = numberValue(line.unitCost, 0);
    const lineTotal = lineTotalValue(line, signedDocumentType);
    const confidence = numberValue(line.confidence ?? line.extractionConfidence, 1);
    const resolvedExistingProduct = isResolvedExistingProductResolution(line);
    const unresolvedProduct = isUnresolvedProductResolution(line);
    const ambiguousProduct = isAmbiguousProductResolution(line)
      || (!createsNewProduct && line.productMatchSource === "no_product_match" && line.suggestedProducts?.length > 1 && numberValue(line.productMatchConfidence, 0) >= 0.75);

    if (confidence > 0 && confidence < 0.65) addReason(reviewReasons, "low_extraction_confidence");
    if (!String(requiredProductText || "").trim()) addReason(reviewReasons, "missing_product_name");
    if (!Number.isFinite(quantity) || (!isNonReceivedLine(line) && quantity <= 0)) addReason(reviewReasons, "invalid_quantity");
    if (!Number.isFinite(unitCost) || (!isNonReceivedLine(line) && unitCost < 0)) addReason(reviewReasons, "invalid_unit_cost");
    if (line.lineTotal !== undefined && (!Number.isFinite(lineTotal) || (!isCreditNote && !isNonReceivedLine(line) && lineTotal < 0))) addReason(reviewReasons, "invalid_line_total");
    if (!createsNewProduct && line.matchStatus !== "Manual invoice" && (unresolvedProduct || !resolvedExistingProduct)) addReason(reviewReasons, "no_confirmed_product_match");
    if (ambiguousProduct) addReason(reviewReasons, "ambiguous_product_match");

    const splitMode = lineUsesSplitDepartmentMode(line);
    const departmentAssignment = departmentAssignmentForLine(line);
    if (splitMode && !departmentAssignmentIsValid(line)) addReason(reviewReasons, "invalid_split");
    if (!isNonReceivedLine(line) && splitMode && departmentAssignment.departmentSplits.some((split) => !String(split.department || split.departmentId || split.department_id || "").trim())) addReason(reviewReasons, "missing_department");
    if (!isNonReceivedLine(line) && !splitMode && !String(departmentAssignment.department || departmentAssignment.departmentId || "").trim()) addReason(reviewReasons, "missing_department");

    const priceDeviation = priceDeviationForLine(line, historicalPrices, {
      threshold: priceDeviationThreshold,
      minSamples: minHistoricalPriceSamples,
    });
    if (priceDeviation?.exceedsThreshold) addReason(reviewReasons, "price_deviation");

    return {
      ...line,
      needsReview: reviewReasons.length > 0,
      reviewReasons,
      reviewSeverity: highestReviewSeverity(reviewReasons),
      hasBlockingReview: hasBlockingReviewReasons(reviewReasons),
      priceDeviation: priceDeviation || line.priceDeviation || null,
    };
  });

  const invoiceReviewReasons = (invoice.invoiceReviewReasons || []).filter((reason) => !recalculatedInvoiceReasons.has(reason));
  const supplier = invoice.supplier || "";
  const invoiceNumber = invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number || "";
  const invoiceDate = invoice.invoiceDate || invoice.date || "";
  const creditReason = normalizeCreditReason(invoice.creditReason ?? invoice.credit_reason ?? "", "");
  const inventoryEffect = normalizeInventoryEffect(invoice.inventoryEffect ?? invoice.inventory_effect ?? "", "");
  if (!supplier || /^unknown supplier$/i.test(supplier)) addReason(invoiceReviewReasons, "missing_supplier");
  if (documentType === "unknown") addReason(invoiceReviewReasons, "missing_document_type");
  if (!invoiceNumber) addReason(invoiceReviewReasons, "missing_invoice_number");
  if (!invoiceDate) addReason(invoiceReviewReasons, "missing_invoice_date");
  if (duplicateInvoiceNumbers.includes(invoiceNumber)) addReason(invoiceReviewReasons, "duplicate_invoice_number");
  if (!validatedLines.length) addReason(invoiceReviewReasons, "no_invoice_lines");
  if (isCreditNote && (
    !inventoryEffect
    || !Object.values(INVENTORY_EFFECTS).includes(inventoryEffect)
    || ([CREDIT_REASONS.DAMAGED_GOODS, CREDIT_REASONS.INVOICE_CORRECTION, CREDIT_REASONS.OTHER].includes(creditReason) && !inventoryEffect)
  )) {
    addReason(invoiceReviewReasons, "missing_credit_treatment");
  }

  const reconciliation = reconcileInvoiceTotals(invoice, validatedLines);
  if (reconciliation.inferredAdditionalCharges) addReason(invoiceReviewReasons, "unaccounted_invoice_charge");
  if (reconciliation.subtotalMismatch) addReason(invoiceReviewReasons, "invoice_subtotal_mismatch");
  if (reconciliation.totalMismatch) addReason(invoiceReviewReasons, "invoice_total_mismatch");

  const invoiceHasBlockers = hasBlockingReviewReasons(invoiceReviewReasons) || validatedLines.some((line) => line.hasBlockingReview);
  return {
    ...invoice,
    documentType: signedDocumentType,
    document_type: signedDocumentType,
    adjustments: reconciliation.adjustments,
    adjustmentTotal: reconciliation.adjustmentTotal,
    additionalCharges: reconciliation.additionalCharges,
    inferredAdditionalCharges: reconciliation.inferredAdditionalCharges,
    reconciliation,
    lines: validatedLines,
    invoiceNeedsReview: invoiceReviewReasons.length > 0 || validatedLines.some((line) => line.needsReview),
    invoiceReviewSeverity: highestReviewSeverity(invoiceReviewReasons),
    invoiceHasBlockingReview: invoiceHasBlockers,
    invoiceReviewReasons,
  };
}

export function fallbackReasonsForExtraction(validatedInvoice = {}) {
  const invoiceReasons = validatedInvoice.invoiceReviewReasons || [];
  const lines = validatedInvoice.lines || validatedInvoice.items || [];
  const lineReasons = lines.flatMap((line) => line.reviewReasons || []);
  const extractionReasons = new Set([
    "missing_supplier",
    "missing_invoice_number",
    "missing_invoice_date",
    "no_invoice_lines",
    "invoice_total_mismatch",
    "invoice_subtotal_mismatch",
    "low_extraction_confidence",
    "missing_product_name",
    "invalid_quantity",
    "invalid_unit_cost",
    "invalid_line_total",
  ]);
  return [...invoiceReasons, ...lineReasons].filter((reason, index, all) => extractionReasons.has(reason) && all.indexOf(reason) === index);
}

export function extractionQualityScore(validatedInvoice = {}) {
  const lines = validatedInvoice.lines || validatedInvoice.items || [];
  const invoiceReasons = validatedInvoice.invoiceReviewReasons || [];
  const lineReasons = lines.flatMap((line) => line.reviewReasons || []);
  const productOnlyReasons = new Set(["no_confirmed_product_match", "ambiguous_product_match", "price_deviation"]);
  const significantLineReasons = lineReasons.filter((reason) => !productOnlyReasons.has(reason));
  return (
    lines.filter((line) => line.productName || line.rawDescription).length * 4
    + lines.filter((line) => line.supplierProductCode).length
    - invoiceReasons.length * 3
    - significantLineReasons.length * 2
    - lines.filter((line) => line.needsReview).length
  );
}
