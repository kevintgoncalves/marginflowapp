import { invoiceContentFingerprint } from "./emergencyRecovery.js";
import { supplierIdentityKey } from "./supplierIdentity.js";

export const RECOVERY_DIAGNOSTIC_SCHEMA = "marginflow-recovery-conflict-diagnostic/v1";

const reasonLabels = Object.freeze({
  date_mismatch: "Date mismatch",
  financial_content_mismatch: "Financial-content mismatch",
  product_mapping_unresolved: "Product mapping unresolved",
  product_identity_mismatch: "Product identity mismatch",
  department_split_mismatch: "Department/split mismatch",
  missing_extra_line: "Missing/extra line",
  line_content_mismatch: "Line-content mismatch",
  likely_technical_false_conflict: "Likely technical/normalization false conflict",
  duplicate_candidate_reuse: "Multiple legacy rows matched one relational invoice",
  document_identity_mismatch: "Document identity mismatch",
  other: "Other",
});

function text(value = "") {
  return String(value ?? "").trim();
}

function normalized(value = "") {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizedDocumentNumber(value = "") {
  return normalized(value);
}

function isoDate(value = "") {
  return text(value).slice(0, 10);
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function numberValue(row, fields, fallback = 0) {
  const value = firstValue(row, fields);
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function numberPresent(row, fields) {
  return firstValue(row, fields) !== undefined;
}

function referenceMapping(mappings = {}, id = "", nameKey = "") {
  return (id && mappings[`id:${id}`]) || (nameKey && mappings[`name:${nameKey}`]) || "";
}

function canonicalReference({ mappings = {}, id = "", name = "", nameKey = normalized(name), source = "legacy" }) {
  if (source === "relational" && id) return { id, resolved: true, proof: "relational_id" };
  const mapped = referenceMapping(mappings, text(id), nameKey);
  if (mapped) return { id: mapped, resolved: true, proof: text(id) ? "confirmed_id_mapping" : "unique_exact_name_mapping" };
  return { id: "", resolved: false, proof: "unresolved" };
}

function productReference(line, preview, source) {
  const id = text(line.matchedProductId || line.productId || line.product_id);
  const name = text(line.productName || line.product_name);
  return {
    name,
    sourceId: id,
    ...canonicalReference({ mappings: preview.products?.mappings, id, name, source }),
  };
}

function departmentReference(row, preview, source) {
  const id = text(row.departmentId || row.department_id);
  const name = text(row.department || row.departmentName || row.department_name);
  return {
    name,
    sourceId: id,
    ...canonicalReference({ mappings: preview.departments?.mappings, id, name, source }),
  };
}

function supplierReference(invoice, preview, source) {
  const id = text(invoice.supplierId || invoice.supplier_id);
  const name = text(invoice.supplier || invoice.supplierName || invoice.supplier_name);
  return {
    name,
    sourceId: id,
    ...canonicalReference({ mappings: preview.suppliers?.mappings, id, name, nameKey: supplierIdentityKey(name), source }),
  };
}

function splitSummary(split, preview, source) {
  const department = departmentReference(split, preview, source);
  const percentagePresent = numberPresent(split, ["percentage", "ratio"]);
  return {
    department: department.name,
    departmentSourceId: department.sourceId,
    canonicalDepartmentId: department.id,
    departmentResolved: department.resolved,
    percentage: numberValue(split, ["percentage", "ratio"]),
    amount: numberValue(split, ["amount"]),
    amountCompared: !percentagePresent,
  };
}

function lineSummary(line, preview, source) {
  const product = productReference(line, preview, source);
  const splits = (line.departmentSplits || line.department_splits || [])
    .map((split) => splitSummary(split, preview, source))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const department = splits.length ? { name: "Split", sourceId: "", id: "", resolved: true } : departmentReference(line, preview, source);
  const quantity = numberValue(line, ["quantity"]);
  const unitCost = numberValue(line, ["unitCost", "unit_cost"]);
  const explicitLineTotal = firstValue(line, ["netLineTotal", "net_line_total", "lineTotal"]);
  return {
    productName: product.name,
    productSourceId: product.sourceId,
    canonicalProductId: product.id,
    productResolved: product.resolved,
    productMappingProof: product.proof,
    quantity,
    unit: normalized(firstValue(line, ["unit", "purchaseUnit", "purchase_unit", "unitOfMeasure", "unit_of_measure"]) || ""),
    packSize: normalized(firstValue(line, ["packSize", "pack_size"]) || ""),
    unitCost,
    lineTotal: Number(explicitLineTotal ?? (quantity * unitCost)),
    vat: numberValue(line, ["vat", "vatAmount", "vat_amount"]),
    allocationMode: splits.length ? "split" : "single",
    department: department.name,
    departmentSourceId: department.sourceId,
    canonicalDepartmentId: department.id,
    departmentResolved: department.resolved,
    splits,
  };
}

function invoiceSummary(invoice = {}, preview, source) {
  const supplier = supplierReference(invoice, preview, source);
  const lines = (invoice.items || invoice.lines || []).map((line) => lineSummary(line, preview, source));
  return {
    supplier: supplier.name,
    supplierSourceId: supplier.sourceId,
    canonicalSupplierId: supplier.id,
    supplierResolved: supplier.resolved,
    supplierMappingProof: supplier.proof,
    documentNumber: text(invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number),
    normalizedDocumentNumber: normalizedDocumentNumber(invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number),
    documentType: normalized(invoice.documentType || invoice.document_type || "invoice").replace(/\s+/g, "_"),
    date: isoDate(invoice.date || invoice.invoiceDate || invoice.invoice_date),
    subtotal: numberValue(invoice, ["sourceInvoiceSubtotal", "subtotal", "subtotalBeforeDiscount"]),
    vatTotal: numberValue(invoice, ["vatTotal", "taxAmount", "tax_amount"]),
    discountAmount: numberValue(invoice, ["discountAmount", "discount_amount"]),
    additionalCharges: numberValue(invoice, ["additionalCharges", "handlingCharge", "deliveryCharge"]),
    total: numberValue(invoice, ["sourceInvoiceTotal", "total", "totalAmount", "total_amount", "finalInvoiceTotal"]),
    lineCount: lines.length,
    splitCount: lines.reduce((sum, line) => sum + line.splits.length, 0),
    lines,
  };
}

function comparableSplit(split) {
  return {
    department: split.canonicalDepartmentId || `unresolved:${normalized(split.department)}`,
    percentage: split.percentage,
    ...(split.amountCompared ? { amount: split.amount } : {}),
  };
}

function comparableLine(line) {
  return {
    product: line.canonicalProductId || `unresolved:${normalized(line.productName)}`,
    quantity: line.quantity,
    unit: line.unit,
    packSize: line.packSize,
    unitCost: line.unitCost,
    lineTotal: line.lineTotal,
    vat: line.vat,
    allocationMode: line.allocationMode,
    department: line.allocationMode === "single"
      ? line.canonicalDepartmentId || `unresolved:${normalized(line.department)}`
      : "split",
    splits: line.splits.map(comparableSplit).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

function canonicalBusinessShape(summary) {
  return {
    supplier: summary.canonicalSupplierId || `unresolved:${supplierIdentityKey(summary.supplier)}`,
    documentNumber: summary.normalizedDocumentNumber,
    documentType: summary.documentType,
    date: summary.date,
    subtotal: summary.subtotal,
    vatTotal: summary.vatTotal,
    discountAmount: summary.discountAmount,
    additionalCharges: summary.additionalCharges,
    total: summary.total,
    lines: summary.lines.map(comparableLine).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  };
}

function differenceRows(left, right, path = "", tolerance = 0.01) {
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) <= tolerance ? [] : [{ path, legacy: left, relational: right }];
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    const leftRows = Array.isArray(left) ? left : [];
    const rightRows = Array.isArray(right) ? right : [];
    const differences = leftRows.length === rightRows.length ? [] : [{ path: `${path}.length`, legacy: leftRows.length, relational: rightRows.length }];
    for (let index = 0; index < Math.max(leftRows.length, rightRows.length); index += 1) {
      differences.push(...differenceRows(leftRows[index], rightRows[index], `${path}[${index}]`, tolerance));
    }
    return differences;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    return [...new Set([...Object.keys(left), ...Object.keys(right)])]
      .sort()
      .flatMap((key) => differenceRows(left[key], right[key], path ? `${path}.${key}` : key, tolerance));
  }
  return left === right ? [] : [{ path, legacy: left ?? null, relational: right ?? null }];
}

function fingerprintShape(invoice) {
  try {
    return JSON.parse(invoiceContentFingerprint(invoice));
  } catch {
    return {};
  }
}

function mappedLegacyInvoice(invoice, preview) {
  const supplier = supplierReference(invoice, preview, "legacy");
  return {
    ...invoice,
    supplierId: supplier.id || invoice.supplierId || invoice.supplier_id || "",
    items: (invoice.items || invoice.lines || []).map((line) => {
      const product = productReference(line, preview, "legacy");
      const splits = line.departmentSplits || line.department_splits || [];
      const department = splits.length ? null : departmentReference(line, preview, "legacy");
      return {
        ...line,
        productId: product.id || line.productId || line.product_id || "",
        matchedProductId: product.id || line.matchedProductId || "",
        departmentId: department?.id || "",
        departmentSplits: splits.map((split) => ({
          ...split,
          departmentId: departmentReference(split, preview, "legacy").id || split.departmentId || split.department_id || "",
        })),
      };
    }),
  };
}

function codeForDifferences(materialDifferences, legacySummary, relationalSummary, currentDifferences, existingReason = "") {
  if (/product dependency is unresolved/i.test(existingReason) || legacySummary.lines.some((line) => !line.productResolved)) return "product_mapping_unresolved";
  if (/supplier dependency is unresolved/i.test(existingReason)) return "product_mapping_unresolved";
  if (/department/i.test(existingReason) && !relationalSummary) return "department_split_mismatch";
  if (!relationalSummary) return "other";
  if (!materialDifferences.length && currentDifferences.length) return "likely_technical_false_conflict";
  if (materialDifferences.some((row) => row.path === "date")) return "date_mismatch";
  if (materialDifferences.some((row) => ["subtotal", "vatTotal", "discountAmount", "additionalCharges", "total"].includes(row.path))) return "financial_content_mismatch";
  if (materialDifferences.some((row) => row.path === "supplier" || row.path === "documentNumber" || row.path === "documentType")) return "document_identity_mismatch";
  if (materialDifferences.some((row) => /lines\.length/.test(row.path))) return "missing_extra_line";
  if (materialDifferences.some((row) => /\.product$/.test(row.path))) return "product_identity_mismatch";
  if (materialDifferences.some((row) => /allocationMode|department|splits/.test(row.path))) return "department_split_mismatch";
  if (materialDifferences.some((row) => /quantity|unitCost|lineTotal|vat|unit|packSize/.test(row.path))) return "line_content_mismatch";
  return "other";
}

function conflictDiagnostic(conflict, preview) {
  const legacy = invoiceSummary(conflict.local || {}, preview, "legacy");
  const relational = conflict.cloud ? invoiceSummary(conflict.cloud, preview, "relational") : null;
  const mappedLocal = mappedLegacyInvoice(conflict.local || {}, preview);
  const currentDifferences = relational
    ? differenceRows(fingerprintShape(mappedLocal), fingerprintShape(conflict.cloud), "currentFingerprint", 0)
    : [];
  const materialDifferences = relational
    ? differenceRows(canonicalBusinessShape(legacy), canonicalBusinessShape(relational))
    : [];
  const code = codeForDifferences(materialDifferences, legacy, relational, currentDifferences, conflict.reason);
  const hasUnresolvedAllocation = [legacy, relational].filter(Boolean).some((summary) => summary.lines.some((line) => (
    (line.allocationMode === "single" && !line.departmentResolved)
    || line.splits.some((split) => !split.departmentResolved)
  )));
  const classification = code === "likely_technical_false_conflict"
    ? "likely false conflict"
    : code === "product_mapping_unresolved"
      ? "unresolved product mapping"
      : code === "department_split_mismatch" && (!relational || hasUnresolvedAllocation)
        ? "unresolved allocation/split conflict"
        : relational
          ? "genuine business conflict"
          : "other";
  return {
    conflictReasonCode: code,
    conflictReasonText: reasonLabels[code],
    classification,
    existingPreviewReason: conflict.reason,
    legacy,
    relational,
    materialDifferences,
    currentComparatorDifferences: currentDifferences.slice(0, 80),
  };
}

function representativeExamples(conflicts, limit) {
  const preferredCodes = [
    "likely_technical_false_conflict",
    "date_mismatch",
    "financial_content_mismatch",
    "department_split_mismatch",
    "product_mapping_unresolved",
    "missing_extra_line",
    "line_content_mismatch",
    "product_identity_mismatch",
    "other",
  ];
  const selected = [];
  preferredCodes.forEach((code) => {
    const match = conflicts.find((row) => row.conflictReasonCode === code && !selected.includes(row));
    if (match && selected.length < limit) selected.push(match);
  });
  conflicts.forEach((row) => {
    if (selected.length < limit && !selected.includes(row)) selected.push(row);
  });
  return selected;
}

export function diagnoseLaptopRecoveryConflicts(preview = {}, { exampleLimit = 5 } = {}) {
  const diagnostics = (preview.invoices?.conflicts || []).map((conflict) => conflictDiagnostic(conflict, preview));
  const breakdown = Object.entries(reasonLabels).map(([code, label]) => ({
    code,
    label,
    count: diagnostics.filter((row) => row.conflictReasonCode === code).length,
  })).filter((row) => row.count > 0);
  const candidateUsage = new Map();
  [...(preview.invoices?.already || []), ...(preview.invoices?.conflicts || [])].forEach((row) => {
    const cloud = row.cloud;
    if (!cloud?.id) return;
    candidateUsage.set(cloud.id, (candidateUsage.get(cloud.id) || 0) + 1);
  });
  const reusedCandidates = [...candidateUsage.entries()].filter(([, count]) => count > 1);
  return {
    schema: RECOVERY_DIAGNOSTIC_SCHEMA,
    generatedAt: new Date().toISOString(),
    readOnly: true,
    scope: preview.scope || {},
    currentCounts: {
      relationalInvoices: preview.relationalCounts?.invoices ?? null,
      legacyInvoices: preview.invoices?.counts?.legacy || 0,
      alreadyRelational: preview.invoices?.counts?.alreadyRelational || 0,
      needMigration: preview.invoices?.counts?.needMigration || 0,
      reviewConflicts: preview.invoices?.counts?.conflicts || 0,
    },
    breakdown,
    estimates: {
      likelyFalseConflicts: diagnostics.filter((row) => row.classification === "likely false conflict").length,
      likelyTrueConflicts: diagnostics.filter((row) => row.classification === "genuine business conflict").length,
      unresolvedMappings: diagnostics.filter((row) => row.classification === "unresolved product mapping").length,
      unresolvedAllocations: diagnostics.filter((row) => row.classification === "unresolved allocation/split conflict").length,
      other: diagnostics.filter((row) => row.classification === "other").length,
    },
    candidateReuse: {
      relationalCandidatesUsedMoreThanOnce: reusedCandidates.length,
      legacyRowsUsingReusedCandidates: reusedCandidates.reduce((sum, [, count]) => sum + count, 0),
      candidates: reusedCandidates.map(([relationalInvoiceId, legacyRowCount]) => ({ relationalInvoiceId, legacyRowCount })),
    },
    examples: representativeExamples(diagnostics, exampleLimit),
    conflicts: diagnostics,
    note: "Read-only diagnostic. Existing preview classifications and all device/relational records are unchanged.",
  };
}
