import {
  invoiceContentFingerprint,
  invoiceRecoveryIdentity,
} from "./emergencyRecovery.js";
import { supplierIdentityKey } from "./supplierIdentity.js";

export const RECOVERY_DIAGNOSTIC_SCHEMA = "marginflow-recovery-conflict-diagnostic/v1";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const reasonLabels = Object.freeze({
  date_mismatch: "Date mismatch",
  financial_content_mismatch: "Financial-content mismatch",
  supplier_mapping_unresolved: "Supplier mapping unresolved",
  supplier_identity_mismatch: "Supplier identity mismatch",
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

const technicalPatternLabels = Object.freeze({
  supplier_name_vs_uuid: "Supplier name vs confirmed supplier UUID",
  department_name_vs_uuid: "Department name vs confirmed department UUID",
  split_department_name_vs_uuid: "Split department name vs confirmed department UUID",
  confirmed_product_mapping_raw_difference: "Legacy product value vs confirmed canonical product",
});

const conflictWriterMessage = "Device and cloud contain different versions. Review is required before persistence.";

function text(value = "") {
  return String(value ?? "").trim();
}

function normalized(value = "") {
  return text(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizedDocumentNumber(value = "") {
  return normalized(value);
}

function isUuid(value = "") {
  return uuidPattern.test(text(value));
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

function splitSummary(split, preview, source, lineTotal) {
  const department = departmentReference(split, preview, source);
  const percentagePresent = numberPresent(split, ["percentage", "ratio"]);
  const percentage = numberValue(split, ["percentage", "ratio"]);
  const amountPresent = numberPresent(split, ["amount"]);
  const amount = numberValue(split, ["amount"]);
  const amountIsDerived = percentagePresent
    && amountPresent
    && numbersEquivalent(amount, Number(lineTotal || 0) * percentage / 100);
  return {
    department: department.name,
    departmentSourceId: department.sourceId,
    canonicalDepartmentId: department.id,
    departmentResolved: department.resolved,
    percentage,
    amount,
    amountCompared: !percentagePresent || (amountPresent && !amountIsDerived),
  };
}

function lineSummary(line, preview, source) {
  const product = productReference(line, preview, source);
  const quantity = numberValue(line, ["quantity"]);
  const unitCost = numberValue(line, ["unitCost", "unit_cost"]);
  const explicitLineTotal = firstValue(line, ["netLineTotal", "net_line_total", "lineTotal"]);
  const lineTotal = Number(explicitLineTotal ?? (quantity * unitCost));
  const splits = (line.departmentSplits || line.department_splits || [])
    .map((split) => splitSummary(split, preview, source, lineTotal))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const department = splits.length ? { name: "Split", sourceId: "", id: "", resolved: true } : departmentReference(line, preview, source);
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
    lineTotal,
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
    id: text(invoice.id || invoice.relationalId || invoice.relational_id),
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

function rawInvoiceId(invoice = {}) {
  return text(invoice.id || invoice.relationalId || invoice.relational_id);
}

function currentRecoveryIdentity(invoice, preview, source) {
  const supplier = supplierReference(invoice, preview, source);
  const number = normalizedDocumentNumber(invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number);
  const type = normalized(invoice.documentType || invoice.document_type || "invoice").replace(/\s+/g, "_");
  if (!supplier.id || !number) return "";
  return [supplier.id, type, number].join("|");
}

function currentRecoveryCandidates(localInvoice, candidates, preview, source) {
  const localId = rawInvoiceId(localInvoice);
  const idMatches = localId
    ? candidates.filter((candidate) => rawInvoiceId(candidate) === localId)
    : [];
  if (idMatches.length) return { candidates: idMatches, basis: "same_invoice_uuid" };

  const identity = currentRecoveryIdentity(localInvoice, preview, "legacy");
  if (!identity) return { candidates: [], basis: "no_canonical_strong_identity" };
  const identityMatches = candidates.filter((candidate) => currentRecoveryIdentity(candidate, preview, source) === identity);
  return {
    candidates: identityMatches,
    basis: identityMatches.length ? "canonical_supplier_document_type_number" : "no_match",
  };
}

function legacyMergeIdentity(invoice, scope) {
  return invoiceRecoveryIdentity({
    ...invoice,
    companyId: invoice.companyId || invoice.company_id || scope.companyId || "company",
  }).key;
}

function legacyCloudCandidates(localInvoice, candidates, scope) {
  const localId = rawInvoiceId(localInvoice);
  const idMatches = localId
    ? candidates.filter((candidate) => rawInvoiceId(candidate) === localId)
    : [];
  if (idMatches.length) return { candidates: idMatches, basis: "same_invoice_uuid" };
  const identity = legacyMergeIdentity(localInvoice, scope);
  const identityMatches = candidates.filter((candidate) => legacyMergeIdentity(candidate, scope) === identity);
  return {
    candidates: identityMatches,
    basis: identityMatches.length ? "legacy_supplier_type_date_number_identity" : "no_match",
  };
}

function recordedConflictCondition(localInvoice, scope) {
  const versions = Array.isArray(localInvoice.recoveryConflictVersions)
    ? localInvoice.recoveryConflictVersions
    : [];
  const conditions = versions.map((version) => {
    if (rawInvoiceId(localInvoice) && rawInvoiceId(localInvoice) === rawInvoiceId(version)) {
      return "same_invoice_uuid_content_fingerprint_mismatch";
    }
    if (legacyMergeIdentity(localInvoice, scope) === legacyMergeIdentity(version, scope)) {
      return "legacy_supplier_type_date_number_identity_content_fingerprint_mismatch";
    }
    return "recorded_remote_version_no_longer_matches_current_identity";
  });
  return [...new Set(conditions)];
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

function numbersEquivalent(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;
}

function referenceEvidence({
  kind,
  path,
  legacyRaw,
  relationalRaw,
  legacyCanonicalId,
  relationalCanonicalId,
  legacyProof,
  relationalProof,
}) {
  const currentEquivalent = normalized(legacyRaw) === normalized(relationalRaw);
  const canonicalEquivalent = Boolean(
    legacyCanonicalId
    && relationalCanonicalId
    && legacyCanonicalId === relationalCanonicalId,
  );
  return {
    kind,
    path,
    legacyRaw: text(legacyRaw),
    relationalRaw: text(relationalRaw),
    legacyCanonicalId: text(legacyCanonicalId),
    relationalCanonicalId: text(relationalCanonicalId),
    legacyMappingProof: legacyProof || "unresolved",
    relationalMappingProof: relationalProof || "unresolved",
    currentComparator: currentEquivalent ? "same" : "different",
    materialComparison: canonicalEquivalent ? "same" : "different_or_unresolved",
    confirmedEquivalent: canonicalEquivalent,
    nameVsUuid: !currentEquivalent && (isUuid(legacyRaw) !== isUuid(relationalRaw)),
  };
}

function linePairScore(legacyLine, relationalLine) {
  let score = 0;
  if (legacyLine.canonicalProductId && legacyLine.canonicalProductId === relationalLine.canonicalProductId) score += 8;
  if (numbersEquivalent(legacyLine.quantity, relationalLine.quantity)) score += 2;
  if (numbersEquivalent(legacyLine.unitCost, relationalLine.unitCost)) score += 2;
  if (numbersEquivalent(legacyLine.lineTotal, relationalLine.lineTotal)) score += 2;
  if (legacyLine.allocationMode === relationalLine.allocationMode) score += 1;
  return score;
}

function pairedLines(legacyLines = [], relationalLines = []) {
  const remaining = relationalLines.map((line, index) => ({ line, index }));
  return legacyLines.map((legacyLine, legacyIndex) => {
    const ranked = remaining
      .map((entry) => ({ ...entry, score: linePairScore(legacyLine, entry.line) }))
      .sort((left, right) => right.score - left.score || left.index - right.index);
    const selected = ranked[0];
    if (!selected) return { legacyLine, relationalLine: null, legacyIndex, relationalIndex: null };
    remaining.splice(remaining.findIndex((entry) => entry.index === selected.index), 1);
    return { legacyLine, relationalLine: selected.line, legacyIndex, relationalIndex: selected.index };
  });
}

function mappingEvidence(legacy, relational) {
  if (!relational) return [];
  const evidence = [referenceEvidence({
    kind: "supplier",
    path: "supplier",
    legacyRaw: legacy.supplier || legacy.supplierSourceId,
    relationalRaw: relational.supplier || relational.supplierSourceId,
    legacyCanonicalId: legacy.canonicalSupplierId,
    relationalCanonicalId: relational.canonicalSupplierId,
    legacyProof: legacy.supplierMappingProof,
    relationalProof: relational.supplierMappingProof,
  })];

  pairedLines(legacy.lines, relational.lines).forEach(({ legacyLine, relationalLine, legacyIndex }) => {
    if (!relationalLine) return;
    evidence.push(referenceEvidence({
      kind: "product",
      path: `lines[${legacyIndex}].product`,
      legacyRaw: legacyLine.productName,
      relationalRaw: relationalLine.productName,
      legacyCanonicalId: legacyLine.canonicalProductId,
      relationalCanonicalId: relationalLine.canonicalProductId,
      legacyProof: legacyLine.productMappingProof,
      relationalProof: relationalLine.productMappingProof,
    }));
    if (legacyLine.allocationMode === "single" && relationalLine.allocationMode === "single") {
      evidence.push(referenceEvidence({
        kind: "department",
        path: `lines[${legacyIndex}].department`,
        legacyRaw: legacyLine.department || legacyLine.departmentSourceId,
        relationalRaw: relationalLine.department || relationalLine.departmentSourceId,
        legacyCanonicalId: legacyLine.canonicalDepartmentId,
        relationalCanonicalId: relationalLine.canonicalDepartmentId,
        legacyProof: legacyLine.departmentResolved ? "confirmed_recovery_mapping" : "unresolved",
        relationalProof: relationalLine.departmentResolved ? "relational_id" : "unresolved",
      }));
    }
    legacyLine.splits.forEach((legacySplit, splitIndex) => {
      const relationalSplit = relationalLine.splits.find((split) => (
        legacySplit.canonicalDepartmentId
        && split.canonicalDepartmentId === legacySplit.canonicalDepartmentId
      )) || relationalLine.splits[splitIndex];
      if (!relationalSplit) return;
      evidence.push(referenceEvidence({
        kind: "split_department",
        path: `lines[${legacyIndex}].splits[${splitIndex}].department`,
        legacyRaw: legacySplit.department || legacySplit.departmentSourceId,
        relationalRaw: relationalSplit.department || relationalSplit.departmentSourceId,
        legacyCanonicalId: legacySplit.canonicalDepartmentId,
        relationalCanonicalId: relationalSplit.canonicalDepartmentId,
        legacyProof: legacySplit.departmentResolved ? "confirmed_recovery_mapping" : "unresolved",
        relationalProof: relationalSplit.departmentResolved ? "relational_id" : "unresolved",
      }));
    });
  });

  return evidence.filter((row) => row.currentComparator === "different" || row.materialComparison !== "same");
}

function technicalPatternsForEvidence(evidence = []) {
  return {
    supplier_name_vs_uuid: evidence.filter((row) => row.kind === "supplier" && row.confirmedEquivalent && row.nameVsUuid),
    department_name_vs_uuid: evidence.filter((row) => row.kind === "department" && row.confirmedEquivalent && row.nameVsUuid),
    split_department_name_vs_uuid: evidence.filter((row) => row.kind === "split_department" && row.confirmedEquivalent && row.nameVsUuid),
    confirmed_product_mapping_raw_difference: evidence.filter((row) => row.kind === "product" && row.confirmedEquivalent && row.currentComparator === "different"),
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
  if (/supplier dependency is unresolved/i.test(existingReason)) return "supplier_mapping_unresolved";
  if (/department/i.test(existingReason) && !relationalSummary) return "department_split_mismatch";
  if (!relationalSummary) return "other";
  if (!materialDifferences.length) return "likely_technical_false_conflict";
  if (materialDifferences.some((row) => row.path === "date")) return "date_mismatch";
  if (materialDifferences.some((row) => ["subtotal", "vatTotal", "discountAmount", "additionalCharges", "total"].includes(row.path))) return "financial_content_mismatch";
  if (materialDifferences.some((row) => row.path === "supplier")) return "supplier_identity_mismatch";
  if (materialDifferences.some((row) => row.path === "documentNumber" || row.path === "documentType")) return "document_identity_mismatch";
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
  const referenceMappings = mappingEvidence(legacy, relational);
  const code = codeForDifferences(materialDifferences, legacy, relational, currentDifferences, conflict.reason);
  const hasUnresolvedAllocation = [legacy, relational].filter(Boolean).some((summary) => summary.lines.some((line) => (
    (line.allocationMode === "single" && !line.departmentResolved)
    || line.splits.some((split) => !split.departmentResolved)
  )));
  const classification = code === "likely_technical_false_conflict"
    ? "likely false conflict"
    : code === "product_mapping_unresolved"
      ? "unresolved product mapping"
      : code === "supplier_mapping_unresolved"
        ? "unresolved supplier mapping"
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
    invoiceIdentity: {
      canonicalSupplierId: legacy.canonicalSupplierId,
      documentNumber: legacy.documentNumber,
      documentType: legacy.documentType,
      date: legacy.date,
    },
    legacy,
    relational,
    mappingEvidence: referenceMappings,
    materialDifferences,
    currentComparatorDifferences: currentDifferences,
  };
}

function conflictProvenanceDiagnostic({
  localInvoice,
  previewConflict,
  preview,
  relationalInvoices,
  legacyCloudInvoices,
}) {
  const relationalMatch = currentRecoveryCandidates(localInvoice, relationalInvoices, preview, "relational");
  const legacyCloudMatch = legacyCloudCandidates(localInvoice, legacyCloudInvoices, preview.scope || {});
  const uniqueRelational = relationalMatch.candidates.length === 1 ? relationalMatch.candidates[0] : null;
  const comparison = conflictDiagnostic({
    ...(previewConflict || {}),
    local: localInvoice,
    cloud: uniqueRelational,
    reason: previewConflict?.reason || "This device record is already marked Review conflict.",
  }, preview);
  const recordedVersions = Array.isArray(localInvoice.recoveryConflictVersions)
    ? localInvoice.recoveryConflictVersions
    : [];
  const recordedFingerprints = new Set(recordedVersions.map(invoiceContentFingerprint));
  const legacyCloudRecordedVersionMatches = legacyCloudMatch.candidates.filter((candidate) => recordedFingerprints.has(invoiceContentFingerprint(candidate)));
  const relationalRecordedVersionMatches = relationalMatch.candidates.filter((candidate) => recordedFingerprints.has(invoiceContentFingerprint(candidate)));
  const writerSignature = localInvoice.syncError === conflictWriterMessage || recordedVersions.length > 0;
  let likelyOrigin = "unknown";
  if (legacyCloudRecordedVersionMatches.length && relationalRecordedVersionMatches.length) likelyOrigin = "legacy_cloud_or_relational_merge";
  else if (legacyCloudRecordedVersionMatches.length) likelyOrigin = "legacy_cloud_snapshot_merge";
  else if (relationalRecordedVersionMatches.length) likelyOrigin = "relational_invoice_merge";
  else if (writerSignature && recordedVersions.length) likelyOrigin = "merge_writer_remote_version_no_longer_present";
  else if (writerSignature) likelyOrigin = "merge_writer_metadata_only";

  const noRelationalCandidate = relationalMatch.candidates.length === 0;
  const materiallyEquivalentCandidate = Boolean(uniqueRelational && comparison.materialDifferences.length === 0);
  const genuineMaterialMismatch = Boolean(uniqueRelational && comparison.materialDifferences.length > 0);
  return {
    ...comparison,
    provenance: {
      preExistingConflict: true,
      currentSyncStatus: text(localInvoice.syncStatus),
      currentSyncError: text(localInvoice.syncError),
      writerSignature,
      writer: writerSignature ? "src/domain/emergencyRecovery.js:mergeInvoiceCollectionsPreservingAll" : "not_proven_from_record_metadata",
      recordedConflictVersionCount: recordedVersions.length,
      recordedConflictConditions: recordedConflictCondition(localInvoice, preview.scope || {}),
      likelyOrigin,
      relationalCandidateCount: relationalMatch.candidates.length,
      relationalCandidateIds: relationalMatch.candidates.map(rawInvoiceId).filter(Boolean),
      relationalMatchBasis: relationalMatch.basis,
      legacyCloudCandidateCount: legacyCloudMatch.candidates.length,
      legacyCloudCandidateIds: legacyCloudMatch.candidates.map(rawInvoiceId).filter(Boolean),
      legacyCloudMatchBasis: legacyCloudMatch.basis,
      recordedVersionMatchesLegacyCloud: legacyCloudRecordedVersionMatches.length,
      recordedVersionMatchesRelational: relationalRecordedVersionMatches.length,
      noRelationalCandidate,
      materiallyEquivalentCandidate,
      genuineMaterialMismatch,
      staleAgainstCurrentRelational: noRelationalCandidate || materiallyEquivalentCandidate,
      staleReason: noRelationalCandidate
        ? "No current relational candidate exists; only the cached conflict flag blocks comparison."
        : materiallyEquivalentCandidate
          ? "The current relational candidate is materially equivalent after confirmed mappings."
          : genuineMaterialMismatch
            ? "The current relational candidate has material business differences."
            : "Multiple current relational candidates require review.",
    },
  };
}

function representativeExamples(conflicts, limit) {
  const preferredCodes = [
    "likely_technical_false_conflict",
    "date_mismatch",
    "financial_content_mismatch",
    "department_split_mismatch",
    "supplier_mapping_unresolved",
    "supplier_identity_mismatch",
    "product_mapping_unresolved",
    "missing_extra_line",
    "line_content_mismatch",
    "product_identity_mismatch",
    "other",
  ];
  const selected = conflicts
    .filter((row) => row.provenance?.preExistingConflict && row.provenance.noRelationalCandidate)
    .slice(0, 1);
  conflicts
    .filter((row) => row.provenance?.preExistingConflict && !row.provenance.noRelationalCandidate)
    .slice(0, 1)
    .forEach((row) => {
      if (selected.length < limit && !selected.includes(row)) selected.push(row);
    });
  preferredCodes.forEach((code) => {
    const match = conflicts.find((row) => row.conflictReasonCode === code && !selected.includes(row));
    if (match && selected.length < limit) selected.push(match);
  });
  conflicts.forEach((row) => {
    if (selected.length < limit && !selected.includes(row)) selected.push(row);
  });
  return selected;
}

export function diagnoseLaptopRecoveryConflicts(preview = {}, {
  exampleLimit = 15,
  deviceInvoices = [],
  relationalInvoices = [],
  legacyCloudInvoices = [],
  legacyCloudModule = {},
} = {}) {
  const previewConflicts = preview.invoices?.conflicts || [];
  const previewConflictLocals = new Set(previewConflicts.map((conflict) => conflict.local));
  const previewConflictById = new Map(previewConflicts.map((conflict) => [rawInvoiceId(conflict.local), conflict]));
  const flaggedInvoices = deviceInvoices.filter((invoice) => invoice.syncStatus === "conflict");
  const flaggedById = new Map(flaggedInvoices.map((invoice) => [rawInvoiceId(invoice), invoice]));
  const diagnostics = previewConflicts.map((conflict) => {
    const localId = rawInvoiceId(conflict.local);
    const flaggedInvoice = flaggedById.get(localId) || (conflict.local?.syncStatus === "conflict" ? conflict.local : null);
    return flaggedInvoice
      ? conflictProvenanceDiagnostic({
        localInvoice: flaggedInvoice,
        previewConflict: conflict,
        preview,
        relationalInvoices,
        legacyCloudInvoices,
      })
      : conflictDiagnostic(conflict, preview);
  });
  flaggedInvoices.forEach((invoice) => {
    const id = rawInvoiceId(invoice);
    if (previewConflictLocals.has(invoice) || (id && previewConflictById.has(id))) return;
    diagnostics.push(conflictProvenanceDiagnostic({
      localInvoice: invoice,
      previewConflict: null,
      preview,
      relationalInvoices,
      legacyCloudInvoices,
    }));
  });
  const provenanceRows = diagnostics.filter((row) => row.provenance?.preExistingConflict);
  const breakdown = Object.entries(reasonLabels).map(([code, label]) => ({
    code,
    label,
    count: diagnostics.filter((row) => row.conflictReasonCode === code).length,
  })).filter((row) => row.count > 0);
  const candidateUsage = new Map();
  [...(preview.invoices?.already || []), ...previewConflicts].forEach((row) => {
    const cloud = row.cloud;
    if (!cloud?.id) return;
    candidateUsage.set(cloud.id, (candidateUsage.get(cloud.id) || 0) + 1);
  });
  provenanceRows.forEach((row) => {
    row.provenance.relationalCandidateIds.forEach((id) => candidateUsage.set(id, (candidateUsage.get(id) || 0) + 1));
  });
  const reusedCandidates = [...candidateUsage.entries()].filter(([, count]) => count > 1);
  const technicalFalsePositivePatterns = Object.entries(technicalPatternLabels).map(([code, label]) => {
    const matchingConflicts = diagnostics.filter((row) => technicalPatternsForEvidence(row.mappingEvidence)[code].length > 0);
    return {
      code,
      label,
      conflictCount: matchingConflicts.length,
      likelyFalseConflictCount: matchingConflicts.filter((row) => row.classification === "likely false conflict").length,
      occurrenceCount: matchingConflicts.reduce((sum, row) => sum + technicalPatternsForEvidence(row.mappingEvidence)[code].length, 0),
    };
  });
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
      trueBusinessConflicts: diagnostics.filter((row) => row.classification === "genuine business conflict").length,
      productRelatedConflicts: diagnostics.filter((row) => ["product_mapping_unresolved", "product_identity_mismatch"].includes(row.conflictReasonCode)).length,
      dateRelatedConflicts: diagnostics.filter((row) => row.conflictReasonCode === "date_mismatch").length,
      allocationRelatedConflicts: diagnostics.filter((row) => row.conflictReasonCode === "department_split_mismatch").length,
      unresolvedMappings: diagnostics.filter((row) => row.classification === "unresolved product mapping").length,
      unresolvedSupplierMappings: diagnostics.filter((row) => row.classification === "unresolved supplier mapping").length,
      unresolvedAllocations: diagnostics.filter((row) => row.classification === "unresolved allocation/split conflict").length,
      other: diagnostics.filter((row) => row.classification === "other").length,
    },
    conflictFlagProvenance: {
      totalFlagged: provenanceRows.length,
      withRelationalCandidate: provenanceRows.filter((row) => row.provenance.relationalCandidateCount > 0).length,
      withoutRelationalCandidate: provenanceRows.filter((row) => row.provenance.noRelationalCandidate).length,
      withMultipleRelationalCandidates: provenanceRows.filter((row) => row.provenance.relationalCandidateCount > 1).length,
      materiallyEquivalentCandidate: provenanceRows.filter((row) => row.provenance.materiallyEquivalentCandidate).length,
      genuineMaterialMismatch: provenanceRows.filter((row) => row.provenance.genuineMaterialMismatch).length,
      staleAgainstCurrentRelational: provenanceRows.filter((row) => row.provenance.staleAgainstCurrentRelational).length,
      writerSignatureConfirmed: provenanceRows.filter((row) => row.provenance.writerSignature).length,
      withLegacyCloudCandidate: provenanceRows.filter((row) => row.provenance.legacyCloudCandidateCount > 0).length,
      likelyLegacyCloudOrigin: provenanceRows.filter((row) => row.provenance.likelyOrigin === "legacy_cloud_snapshot_merge").length,
      likelyRelationalOrigin: provenanceRows.filter((row) => row.provenance.likelyOrigin === "relational_invoice_merge").length,
      originIndistinguishable: provenanceRows.filter((row) => row.provenance.likelyOrigin === "legacy_cloud_or_relational_merge").length,
      originUnknownOrNoLongerPresent: provenanceRows.filter((row) => [
        "unknown",
        "merge_writer_remote_version_no_longer_present",
        "merge_writer_metadata_only",
      ].includes(row.provenance.likelyOrigin)).length,
    },
    legacyCloudInvoiceModule: {
      exists: Boolean(legacyCloudModule.exists),
      available: legacyCloudModule.available !== false,
      invoiceCount: legacyCloudInvoices.length,
      revision: Number(legacyCloudModule.revision || 0),
      syncedAt: text(legacyCloudModule.syncedAt),
      error: text(legacyCloudModule.error),
    },
    technicalFalsePositivePatterns,
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

export function recoveryDiagnosticExport(report = {}) {
  return {
    schema: report.schema || RECOVERY_DIAGNOSTIC_SCHEMA,
    generatedAt: report.generatedAt || new Date().toISOString(),
    companyId: text(report.scope?.companyId),
    locationId: text(report.scope?.locationId) || null,
    currentCounts: report.currentCounts || {},
    breakdown: report.breakdown || [],
    estimates: report.estimates || {},
    technicalFalsePositivePatterns: report.technicalFalsePositivePatterns || [],
    candidateReuse: report.candidateReuse || {},
    conflictFlagProvenance: report.conflictFlagProvenance || {},
    legacyCloudInvoiceModule: report.legacyCloudInvoiceModule || {},
    examples: (report.examples || []).map((example) => ({
      invoiceIdentity: example.invoiceIdentity,
      classification: example.classification,
      conflictReasonCode: example.conflictReasonCode,
      conflictReasonText: example.conflictReasonText,
      existingPreviewReason: example.existingPreviewReason,
      legacy: example.legacy,
      relational: example.relational,
      mappingEvidence: example.mappingEvidence,
      currentComparatorDifferences: example.currentComparatorDifferences,
      materialDifferences: example.materialDifferences,
      provenance: example.provenance || null,
    })),
  };
}
