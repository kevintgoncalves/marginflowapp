import { amountsAlmostEqual, numberValue, roundMoney } from "./numberUtils.js";
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

function sumChargeLines(charges = []) {
  if (!Array.isArray(charges)) return 0;
  return charges.reduce((sum, charge) => sum + numberValue(charge.amount ?? charge.value ?? charge.total, 0), 0);
}

function explicitAdditionalCharges(invoice = {}) {
  return roundMoney(
    numberValue(invoice.additionalCharges ?? invoice.handlingCharge ?? invoice.deliveryCharge ?? invoice.carriageCharge ?? invoice.serviceCharge, 0)
    + sumChargeLines(invoice.invoiceCharges || invoice.additionalChargeLines || invoice.charges),
  );
}

function likelySmallInvoiceCharge(amount = 0, invoiceTotal = 0) {
  const absolute = Math.abs(roundMoney(amount));
  if (!absolute) return false;
  return absolute <= Math.max(DEFAULT_SMALL_CHARGE_LIMIT, Math.abs(numberValue(invoiceTotal, 0)) * 0.03);
}

function totalMatchesAny(expected = 0, candidates = []) {
  return candidates
    .map(roundMoney)
    .some((candidate) => candidate && amountsAlmostEqual(candidate, expected, Math.max(0.5, Math.abs(expected) * 0.01), 0.01));
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

  const comparable = historicalPrices
    .filter((entry) => (entry.productId || entry.product_id) === productId)
    .filter((entry) => !supplier || (entry.supplier || entry.supplierName || "") === supplier)
    .filter((entry) => !line.packSize || !entry.packSize || String(entry.packSize).toLowerCase() === String(line.packSize).toLowerCase())
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
    const existingReviewReasons = isCreditNote
      ? (line.reviewReasons || []).filter((reason) => !signSensitiveLineReasons.has(reason))
      : (line.reviewReasons || []);
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

  const invoiceReviewReasons = [...(invoice.invoiceReviewReasons || [])];
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

  const lineNetTotal = roundMoney(validatedLines.reduce((sum, line) => sum + lineTotalValue(line, signedDocumentType), 0));
  const invoiceSubtotal = absolutePurchasingAmount(invoice.invoiceSubtotal ?? invoice.netTotal ?? invoice.net_total ?? invoice.subtotalBeforeDiscount ?? invoice.subtotal);
  const invoiceTotal = absolutePurchasingAmount(invoice.invoiceTotal ?? invoice.grossTotal ?? invoice.gross_total ?? invoice.finalInvoiceTotal ?? invoice.total_amount);
  const vatTotal = absolutePurchasingAmount(invoice.vatTotal ?? invoice.taxAmount ?? invoice.tax_amount ?? invoice.vat_total);
  const explicitChargeTotal = absolutePurchasingAmount(explicitAdditionalCharges(invoice));
  const inferredFromTotal = invoiceTotal ? roundMoney(invoiceTotal - vatTotal - lineNetTotal) : 0;
  const inferredFromSubtotal = invoiceSubtotal ? roundMoney(invoiceSubtotal - lineNetTotal) : 0;
  const inferredChargeTotal = explicitChargeTotal
    ? 0
    : (likelySmallInvoiceCharge(inferredFromTotal, invoiceTotal) ? inferredFromTotal : (
      likelySmallInvoiceCharge(inferredFromSubtotal, invoiceSubtotal) ? inferredFromSubtotal : 0
    ));
  const additionalCharges = roundMoney(explicitChargeTotal || inferredChargeTotal);
  if (additionalCharges && !explicitChargeTotal) addReason(invoiceReviewReasons, "unaccounted_invoice_charge");

  if (invoiceSubtotal && !totalMatchesAny(invoiceSubtotal, [lineNetTotal, lineNetTotal + additionalCharges])) {
    addReason(invoiceReviewReasons, "invoice_subtotal_mismatch");
  }

  if (invoiceTotal) {
    const totalCandidates = [
      lineNetTotal + vatTotal,
      lineNetTotal + vatTotal + additionalCharges,
      invoiceSubtotal + vatTotal,
      invoiceSubtotal + vatTotal + additionalCharges,
    ];
    if (!totalMatchesAny(invoiceTotal, totalCandidates)) {
      addReason(invoiceReviewReasons, "invoice_total_mismatch");
    }
  }

  const invoiceHasBlockers = hasBlockingReviewReasons(invoiceReviewReasons) || validatedLines.some((line) => line.hasBlockingReview);
  return {
    ...invoice,
    documentType: signedDocumentType,
    document_type: signedDocumentType,
    additionalCharges,
    inferredAdditionalCharges: additionalCharges && !explicitChargeTotal ? additionalCharges : 0,
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
