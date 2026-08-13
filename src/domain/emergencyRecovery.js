import { invoiceComparisonFinancials } from "./invoiceFinancials.js";

export const EMERGENCY_BACKUP_SCHEMA = "marginflow-emergency-backup/v1";

const storageModules = Object.freeze({
  "marginflow.companySettings": "companySettings",
  "marginflow.financialSettings": "financialSettings",
  "marginflow.departmentSettings": "departmentSettings",
  "marginflow.labourSettings": "labourSettings",
  "marginflow.suppliers": "suppliers",
  "marginflow.supplierDeliverySchedules": "supplierDeliverySchedules",
  "marginflow.supplierProductMappings": "supplierProductMappings",
  "marginflow.invoiceLineCorrections": "invoiceLineCorrections",
  "marginflow.products": "products",
  "marginflow.invoices": "invoices",
  "marginflow.invoiceDayStatusOverrides": "invoiceDayStatusOverrides",
  "marginflow.creditNotes": "creditNotes",
  "marginflow.sales": "sales",
  "marginflow.labour": "labourData",
  "marginflow.recipes": "recipes",
  "marginflow.menus": "menus",
  "marginflow.stocktakes": "stocktakes",
  "marginflow.waste": "wasteItems",
  "marginflow.menuSettings": "menuSettings",
  "marginflow.invoiceSettings": "invoiceSettings",
  "marginflow.aiSettings": "aiSettings",
  "marginflow.department": "departmentSelection",
});

const sensitiveKeyPattern = /(access[_-]?token|refresh[_-]?token|service[_-]?role|openai|api[_-]?key|password|passwd|secret|supabase[_-]?session|authorization)/i;
function parseStorageValue(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function explicitStorageArray(payload = {}, storageKey = "") {
  const storage = payload.deviceStorage || payload.localStorage || {};
  const value = storage[storageKey] ?? payload[storageKey] ?? payload.businessData?.[storageKey];
  const parsed = parseStorageValue(value);
  return Array.isArray(parsed) ? parsed : [];
}

function sanitizeBusinessData(value, key = "") {
  if (sensitiveKeyPattern.test(key)) return undefined;
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeBusinessData(entry)).filter((entry) => entry !== undefined);
  }
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .map(([entryKey, entryValue]) => [entryKey, sanitizeBusinessData(entryValue, entryKey)])
    .filter(([, entryValue]) => entryValue !== undefined));
}

function snapshotFromStorage(storage = {}) {
  const snapshot = {};
  Object.entries(storageModules).forEach(([storageKey, moduleKey]) => {
    if (storage[storageKey] !== undefined) snapshot[moduleKey] = parseStorageValue(storage[storageKey]);
  });
  return snapshot;
}

export function backupBusinessSnapshot(payload = {}) {
  if (payload.businessData && typeof payload.businessData === "object") return payload.businessData;
  if (payload.snapshot && typeof payload.snapshot === "object") return payload.snapshot;
  const storage = payload.deviceStorage || payload.localStorage || Object.fromEntries(
    Object.entries(payload).filter(([key]) => key.startsWith("marginflow.")),
  );
  return snapshotFromStorage(storage);
}

export function buildEmergencyBackup({
  appVersion = "0.1.0",
  currentSnapshot = {},
  localStorageData = {},
  company = {},
  location = {},
  exportedAt = new Date().toISOString(),
} = {}) {
  const deviceStorage = Object.fromEntries(Object.entries(localStorageData)
    .filter(([key]) => key.startsWith("marginflow.") && key !== "marginflow.preImportBackup" && !sensitiveKeyPattern.test(key))
    .map(([key, value]) => [key, sanitizeBusinessData(parseStorageValue(value), key)]));
  const businessData = sanitizeBusinessData(currentSnapshot);
  const invoices = Array.isArray(businessData.invoices) ? businessData.invoices : [];
  return {
    schema: EMERGENCY_BACKUP_SCHEMA,
    schemaVersion: 1,
    app: "MarginFlow",
    appVersion,
    source: "current-device-offline-export",
    exportedAt,
    company: sanitizeBusinessData(company),
    location: sanitizeBusinessData(location),
    summary: {
      invoices: invoices.length,
      pendingInvoices: invoices.filter((invoice) => ["pending_sync", "sync_failed", "legacy_local"].includes(invoice.syncStatus)).length,
      products: Array.isArray(businessData.products) ? businessData.products.length : 0,
      suppliers: Array.isArray(businessData.suppliers) ? businessData.suppliers.length : 0,
      stocktakes: Array.isArray(businessData.stocktakes) ? businessData.stocktakes.length : 0,
    },
    businessData,
    deviceStorage,
  };
}

function normalized(value = "") {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function invoiceDocumentType(invoice = {}) {
  return normalized(invoice.documentType || invoice.document_type || "invoice").replace(/ /g, "_") || "invoice";
}

function invoiceDocumentNumber(invoice = {}) {
  return normalized(invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number || "");
}

function invoiceDate(invoice = {}) {
  return String(invoice.date || invoice.invoiceDate || invoice.invoice_date || "").slice(0, 10);
}

function invoiceSupplier(invoice = {}) {
  return normalized(invoice.supplier || invoice.supplierName || invoice.supplierId || invoice.supplier_id || "unknown supplier");
}

export function invoiceRecoveryIdentity(invoice = {}) {
  const company = invoice.companyId || invoice.company_id || "company";
  const number = invoiceDocumentNumber(invoice);
  const base = [company, invoiceSupplier(invoice), invoiceDocumentType(invoice), invoiceDate(invoice)];
  if (number) return { key: [...base, number].join("|"), confidence: "strong", hasDocumentNumber: true };
  const lines = invoice.items || invoice.lines || [];
  const lineSignature = lines.map((line) => [
    normalized(line.productName || line.product_name),
    Number(line.quantity || 0),
    Number(line.unitCost ?? line.unit_cost ?? 0),
  ].join(":"))
    .sort()
    .join(";");
  return { key: [...base, lineSignature].join("|"), confidence: "ambiguous", hasDocumentNumber: false };
}

function invoiceContentShape(invoice = {}) {
  const number = (...values) => {
    const value = values.find((candidate) => candidate !== undefined && candidate !== null && candidate !== "");
    return Number.isFinite(Number(value)) ? Number(value) : 0;
  };
  const lines = (invoice.items || invoice.lines || []).map((line) => {
    const quantity = number(line.quantity);
    const unitCost = number(line.unitCost, line.unit_cost);
    const hasExplicitTotal = [line.netLineTotal, line.net_line_total, line.lineTotal].some((value) => value !== undefined && value !== null && value !== "");
    return {
      product: normalized(line.productName || line.product_name),
      supplierCode: normalized(line.supplierProductCode || line.supplier_product_code),
      packSize: normalized(line.packSize || line.pack_size),
      quantity,
      unitCost,
      netLineTotal: hasExplicitTotal ? number(line.netLineTotal, line.net_line_total, line.lineTotal) : Number((quantity * unitCost).toFixed(4)),
      vat: number(line.vat, line.vatAmount, line.vat_amount),
      status: normalized(line.lineStatus || line.status || "received"),
      department: normalized(line.department || line.departmentId || line.department_id),
      splits: (line.departmentSplits || line.department_splits || []).map((split) => ({
        department: normalized(split.department || split.departmentId || split.department_id),
        percentage: number(split.percentage),
        amount: number(split.amount),
      })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    };
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return {
    documentType: invoiceDocumentType(invoice),
    documentNumber: invoiceDocumentNumber(invoice),
    date: invoiceDate(invoice),
    supplier: normalized(invoice.supplier || invoice.supplierName || invoice.supplierId || invoice.supplier_id),
    currency: normalized(invoice.currency || "GBP"),
    subtotal: number(invoice.sourceInvoiceSubtotal, invoice.subtotal, invoice.subtotalBeforeDiscount),
    discountAmount: number(invoice.discountAmount, invoice.discount_amount),
    vatTotal: number(invoice.vatTotal, invoice.taxAmount, invoice.tax_amount),
    total: number(invoice.sourceInvoiceTotal, invoice.total, invoice.totalAmount, invoice.total_amount, invoice.finalInvoiceTotal),
    additionalCharges: number(invoice.additionalCharges),
    originalInvoiceNumber: normalized(invoice.originalInvoiceNumber || invoice.original_invoice_number),
    creditReason: normalized(invoice.creditReason || invoice.credit_reason),
    inventoryEffect: normalized(invoice.inventoryEffect || invoice.inventory_effect),
    lines,
  };
}

export function invoiceContentFingerprint(invoice = {}) {
  return JSON.stringify(invoiceContentShape(invoice));
}

function invoiceId(invoice = {}) {
  return String(invoice.id || invoice.relationalId || invoice.relational_id || "");
}

function genericDocumentNumber(value = "") {
  return new Set(["", "date", "document", "inv", "invoice", "invoice number", "n/a", "na", "receipt", "total", "unit", "unknown"])
    .has(normalized(value));
}

function supplierMatchKeys(invoice = {}) {
  return [...new Set([
    invoice.supplierId || invoice.supplier_id || "",
    normalized(invoice.supplier || invoice.supplierName || invoice.supplier_name || ""),
  ].map((value) => String(value || "").trim()).filter(Boolean))];
}

function invoiceScopeCompany(invoice = {}, fallbackCompanyId = "") {
  return invoice.companyId || invoice.company_id || fallbackCompanyId || "company";
}

function invoiceScopeLocation(invoice = {}, fallbackLocationId = "") {
  return invoice.locationId || invoice.location_id || fallbackLocationId || "";
}

function matchKeysFor(invoice = {}, fallbackCompanyId = "", fallbackLocationId = "") {
  const company = invoiceScopeCompany(invoice, fallbackCompanyId);
  const location = invoiceScopeLocation(invoice, fallbackLocationId) || "company";
  const number = invoiceDocumentNumber(invoice);
  const type = invoiceDocumentType(invoice);
  const date = invoiceDate(invoice);
  const suppliers = supplierMatchKeys(invoice);
  const scoped = (parts) => [company, location, ...parts].join("|");
  const supplierDocument = !genericDocumentNumber(number)
    ? suppliers.map((supplier) => scoped(["supplier-document", supplier, type, number]))
    : [];
  const supplierDocumentDate = !genericDocumentNumber(number) && date
    ? suppliers.map((supplier) => scoped(["supplier-document-date", supplier, type, number, date]))
    : [];
  return {
    id: invoiceId(invoice) ? scoped(["id", invoiceId(invoice)]) : "",
    supplierDocument,
    content: scoped(["content", invoiceContentFingerprint(invoice)]),
    supplierDocumentDate,
    lineContent: scoped(["line-content", supplierLineContentFingerprint(invoice)]),
  };
}

function indexUnique(rows = [], keysFor) {
  const groupedRows = new Map();
  rows.forEach((row, index) => {
    const keys = keysFor(row).filter(Boolean);
    keys.forEach((key) => groupedRows.set(key, [...(groupedRows.get(key) || []), { row, index }]));
  });
  return groupedRows;
}

function uniqueMatch(index, keys = []) {
  const matches = [];
  keys.filter(Boolean).forEach((key) => {
    const rows = index.get(key) || [];
    rows.forEach((entry) => {
      if (!matches.some((match) => match.index === entry.index)) matches.push(entry);
    });
  });
  if (matches.length === 1) return { status: "matched", ...matches[0] };
  if (matches.length > 1) return { status: "ambiguous", candidates: matches.map((entry) => entry.row) };
  return { status: "none", candidates: [] };
}

function lineShape(line = {}) {
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const quantity = number(line.quantity);
  const unitCost = number(line.unitCost ?? line.unit_cost);
  const lineTotal = number(line.netLineTotal ?? line.net_line_total ?? line.lineTotal ?? (quantity * unitCost));
  return {
    product: normalized(line.productName || line.product_name || line.matchedProductId || line.productId || line.product_id),
    supplierCode: normalized(line.supplierProductCode || line.supplier_product_code),
    packSize: normalized(line.packSize || line.pack_size),
    quantity,
    unitCost,
    lineTotal,
    vat: number(line.vat ?? line.vatAmount ?? line.vat_amount),
  };
}

function supplierLineContentFingerprint(invoice = {}) {
  return JSON.stringify({
    supplier: supplierMatchKeys(invoice).sort(),
    documentType: invoiceDocumentType(invoice),
    date: invoiceDate(invoice),
    total: invoiceComparisonFinancials(invoice).total,
    lines: (invoice.items || invoice.lines || []).map(lineShape)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
  });
}

function invoiceTimestamp(invoice = {}) {
  const value = invoice.updatedAt || invoice.updated_at || invoice.syncedAt || invoice.synced_at || invoice.createdAt || invoice.created_at || "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function completenessMetrics(invoice = {}) {
  const lines = invoice.items || invoice.lines || [];
  const financials = invoiceComparisonFinancials(invoice);
  const headerFields = [
    invoice.supplier || invoice.supplierName || invoice.supplierId || invoice.supplier_id,
    invoiceDocumentNumber(invoice),
    invoiceDate(invoice),
    financials.subtotal || invoice.subtotal || invoice.sourceInvoiceSubtotal,
    financials.vatTotal || invoice.vatTotal || invoice.taxAmount || invoice.tax_amount,
    financials.total || invoice.total || invoice.sourceInvoiceTotal,
  ];
  const lineDetailScore = lines.reduce((sum, line) => sum + [
    line.productName || line.product_name || line.productId || line.product_id || line.matchedProductId,
    line.quantity,
    line.unitCost ?? line.unit_cost,
    line.departmentId || line.department_id || line.department,
  ].filter((value) => value !== undefined && value !== null && value !== "").length, 0);
  const splitCount = lines.reduce((sum, line) => sum + (line.departmentSplits || line.department_splits || []).length, 0);
  return {
    lineCount: lines.length,
    splitCount,
    fieldScore: headerFields.filter((value) => value !== undefined && value !== null && value !== "").length + lineDetailScore,
    total: financials.total,
    timestamp: invoiceTimestamp(invoice),
    revision: Number(invoice.syncRevision || invoice.sync_revision || 0),
  };
}

function amountsEquivalent(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01;
}

function fieldMissing(value) {
  return value === undefined || value === null || value === "" || Number(value) === 0;
}

function backupOnlyAddsMissingData(backupInvoice = {}, cloudInvoice = {}) {
  const backupMetrics = completenessMetrics(backupInvoice);
  const cloudMetrics = completenessMetrics(cloudInvoice);
  const backupFinancials = invoiceComparisonFinancials(backupInvoice);
  const cloudFinancials = invoiceComparisonFinancials(cloudInvoice);
  const fields = [
    ["documentNumber", invoiceDocumentNumber(backupInvoice), invoiceDocumentNumber(cloudInvoice)],
    ["date", invoiceDate(backupInvoice), invoiceDate(cloudInvoice)],
    ["subtotal", backupFinancials.subtotal, cloudFinancials.subtotal],
    ["vatTotal", backupFinancials.vatTotal, cloudFinancials.vatTotal],
    ["total", backupFinancials.total, cloudFinancials.total],
  ];
  const hasConflictingPresentField = fields.some(([, backupValue, cloudValue]) => {
    if (fieldMissing(backupValue) || fieldMissing(cloudValue)) return false;
    if (typeof backupValue === "number" || typeof cloudValue === "number") return !amountsEquivalent(backupValue, cloudValue);
    return normalized(backupValue) !== normalized(cloudValue);
  });
  if (hasConflictingPresentField) return false;
  if (backupMetrics.lineCount > 0 && cloudMetrics.lineCount === 0) return true;
  if (backupMetrics.splitCount > 0 && cloudMetrics.splitCount === 0 && backupMetrics.lineCount === cloudMetrics.lineCount) return true;
  return fields.some(([, backupValue, cloudValue]) => !fieldMissing(backupValue) && fieldMissing(cloudValue));
}

function classifyMatchedInvoice(backupInvoice = {}, cloudInvoice = {}, exportedAt = "") {
  if (invoiceContentFingerprint(backupInvoice) === invoiceContentFingerprint(cloudInvoice)) {
    return { category: "exactlyExists", code: "A", reason: "Exact content fingerprint exists in cloud." };
  }
  const backupMetrics = completenessMetrics(backupInvoice);
  const cloudMetrics = completenessMetrics(cloudInvoice);
  const backupExportedAt = Date.parse(exportedAt);
  const cloudNewer = (
    (Number.isFinite(backupExportedAt) && cloudMetrics.timestamp > backupExportedAt)
    || (cloudMetrics.timestamp && backupMetrics.timestamp && cloudMetrics.timestamp > backupMetrics.timestamp)
    || (cloudMetrics.revision && backupMetrics.revision && cloudMetrics.revision > backupMetrics.revision)
  );
  const cloudMoreComplete = cloudMetrics.lineCount > backupMetrics.lineCount
    || cloudMetrics.splitCount > backupMetrics.splitCount
    || cloudMetrics.fieldScore > backupMetrics.fieldScore;
  if (backupOnlyAddsMissingData(backupInvoice, cloudInvoice) && !cloudNewer) {
    return { category: "safeMergeCandidates", code: "D", reason: "Backup appears to contain fields, lines or splits missing from the cloud record." };
  }
  if (cloudNewer || cloudMoreComplete) {
    return { category: "cloudNewerOrMoreComplete", code: "C", reason: "Cloud version is newer or at least as complete as the backup version." };
  }
  return { category: "trueConflicts", code: "E", reason: "Same probable invoice has material content differences requiring manual review." };
}

function backupDuplicateClassifications(invoices = [], companyId = "", locationId = "") {
  const duplicateRepeatIndexes = new Set();
  const duplicateConflictIndexes = new Set();
  const duplicateDetails = [];
  const groupedByKey = new Map();
  invoices.forEach((invoice, index) => {
    const keys = [
      matchKeysFor(invoice, companyId, locationId).id,
      ...matchKeysFor(invoice, companyId, locationId).supplierDocumentDate,
    ].filter(Boolean);
    keys.forEach((key) => groupedByKey.set(key, [...(groupedByKey.get(key) || []), index]));
  });
  [...groupedByKey.entries()].forEach(([key, indexes]) => {
    const uniqueIndexes = [...new Set(indexes)];
    if (uniqueIndexes.length <= 1) return;
    const fingerprints = new Set(uniqueIndexes.map((index) => invoiceContentFingerprint(invoices[index])));
    duplicateDetails.push({ key, indexes: uniqueIndexes, exactContent: fingerprints.size === 1 });
    if (fingerprints.size === 1) uniqueIndexes.slice(1).forEach((index) => duplicateRepeatIndexes.add(index));
    else uniqueIndexes.forEach((index) => duplicateConflictIndexes.add(index));
  });
  return { duplicateRepeatIndexes, duplicateConflictIndexes, duplicateDetails };
}

function findCurrentInvoiceMatch(backupInvoice = {}, currentIndexes = {}, companyId = "", locationId = "") {
  const keys = matchKeysFor(backupInvoice, companyId, locationId);
  const ordered = [
    ["exact_relational_id", currentIndexes.byId, [keys.id]],
    ["supplier_document_number", currentIndexes.bySupplierDocument, keys.supplierDocument],
    ["canonical_content_fingerprint", currentIndexes.byContent, [keys.content]],
    ["supplier_document_number_date", currentIndexes.bySupplierDocumentDate, keys.supplierDocumentDate],
    ["supplier_date_line_content", currentIndexes.byLineContent, [keys.lineContent]],
  ];
  for (const [basis, index, matchKeys] of ordered) {
    const result = uniqueMatch(index, matchKeys);
    if (result.status === "matched") return { match: result.row, basis, ambiguous: false, candidates: [] };
    if (result.status === "ambiguous") return { match: null, basis, ambiguous: true, candidates: result.candidates };
  }
  return { match: null, basis: "no_match", ambiguous: false, candidates: [] };
}

export const emergencyRecoveryCategoryLabels = Object.freeze({
  exactlyExists: "Exactly already in cloud",
  missing: "Missing from cloud",
  cloudNewerOrMoreComplete: "Cloud version newer/more complete",
  safeMergeCandidates: "Safe merge candidates",
  trueConflicts: "True conflicts",
  duplicatesInsideBackup: "Duplicates inside backup",
  unclassified: "Unclassified",
});

export function compareInvoiceCollections(localInvoices = [], cloudInvoices = []) {
  const cloudById = new Map();
  const cloudByIdentity = new Map();
  cloudInvoices.forEach((invoice, index) => {
    if (invoiceId(invoice)) cloudById.set(invoiceId(invoice), { invoice, index });
    const identity = invoiceRecoveryIdentity(invoice).key;
    cloudByIdentity.set(identity, [...(cloudByIdentity.get(identity) || []), { invoice, index }]);
  });

  const usedCloudIndexes = new Set();
  const onlyLocal = [];
  const presentInBoth = [];
  const conflicts = [];
  const ambiguous = [];

  localInvoices.forEach((localInvoice) => {
    const identity = invoiceRecoveryIdentity(localInvoice);
    const idMatch = invoiceId(localInvoice) ? cloudById.get(invoiceId(localInvoice)) : null;
    const identityMatches = cloudByIdentity.get(identity.key) || [];
    const match = idMatch || (identityMatches.length === 1 ? identityMatches[0] : null);
    if (!match && identityMatches.length > 1) {
      ambiguous.push({ local: localInvoice, candidates: identityMatches.map((entry) => entry.invoice), identity });
      return;
    }
    if (!match) {
      onlyLocal.push(localInvoice);
      return;
    }
    usedCloudIndexes.add(match.index);
    if (invoiceContentFingerprint(localInvoice) === invoiceContentFingerprint(match.invoice)) {
      presentInBoth.push({ local: localInvoice, cloud: match.invoice, identity });
    } else {
      conflicts.push({ local: localInvoice, cloud: match.invoice, identity });
    }
  });

  const onlyCloud = cloudInvoices.filter((_, index) => !usedCloudIndexes.has(index));
  return {
    counts: {
      local: localInvoices.length,
      cloud: cloudInvoices.length,
      onlyLocal: onlyLocal.length,
      onlyCloud: onlyCloud.length,
      presentInBoth: presentInBoth.length,
      conflicts: conflicts.length,
      ambiguous: ambiguous.length,
    },
    onlyLocal,
    onlyCloud,
    presentInBoth,
    conflicts,
    ambiguous,
  };
}

export function mergeInvoiceCollectionsPreservingAll(localInvoices = [], relationalInvoices = []) {
  const comparison = compareInvoiceCollections(localInvoices, relationalInvoices);
  const remoteById = new Map(relationalInvoices.map((invoice) => [invoiceId(invoice), invoice]));
  const remoteByIdentity = new Map(relationalInvoices.map((invoice) => [invoiceRecoveryIdentity(invoice).key, invoice]));
  const merged = localInvoices.map((localInvoice) => {
    const remote = remoteById.get(invoiceId(localInvoice)) || remoteByIdentity.get(invoiceRecoveryIdentity(localInvoice).key);
    if (!remote) return localInvoice;
    if (invoiceContentFingerprint(localInvoice) === invoiceContentFingerprint(remote)) {
      return { ...localInvoice, ...remote, syncStatus: "synced", syncError: "" };
    }
    return {
      ...localInvoice,
      syncStatus: "conflict",
      syncError: "Device and cloud contain different versions. Review is required before persistence.",
      recoveryConflictVersions: [...(localInvoice.recoveryConflictVersions || []), remote]
        .filter((invoice, index, rows) => rows.findIndex((candidate) => invoiceContentFingerprint(candidate) === invoiceContentFingerprint(invoice)) === index),
    };
  });
  const representedRemoteIds = new Set(merged.map(invoiceId).filter(Boolean));
  const representedIdentities = new Set(merged.map((invoice) => invoiceRecoveryIdentity(invoice).key));
  relationalInvoices.forEach((invoice) => {
    if (!representedRemoteIds.has(invoiceId(invoice)) && !representedIdentities.has(invoiceRecoveryIdentity(invoice).key)) merged.push(invoice);
  });
  return { invoices: merged, comparison };
}

const UNSYNCED_INVOICE_STATUSES = new Set(["pending_sync", "sync_failed", "local_only"]);

function invoiceMatchesOperationalScope(invoice = {}, companyId = "", locationId = "") {
  const invoiceCompanyId = invoice.companyId || invoice.company_id || "";
  const invoiceLocationId = invoice.locationId || invoice.location_id || "";
  return invoiceCompanyId === companyId && (!locationId || invoiceLocationId === locationId);
}

export function relationalOperationalInvoiceCollection({
  localInvoices = [],
  relationalInvoices = [],
  companyId = "",
  locationId = "",
  readOnly = false,
} = {}) {
  const canonicalInvoices = Array.isArray(relationalInvoices) ? relationalInvoices : [];
  if (readOnly) return canonicalInvoices;

  const canonicalIds = new Set(canonicalInvoices.map(invoiceId).filter(Boolean));
  const canonicalIdentities = new Set(canonicalInvoices.map((invoice) => invoiceRecoveryIdentity(invoice).key));
  const unsyncedInvoices = (Array.isArray(localInvoices) ? localInvoices : [])
    .filter((invoice) => UNSYNCED_INVOICE_STATUSES.has(invoice?.syncStatus))
    .filter((invoice) => invoiceMatchesOperationalScope(invoice, companyId, locationId))
    .filter((invoice) => {
      const id = invoiceId(invoice);
      const identity = invoiceRecoveryIdentity(invoice).key;
      return (!id || !canonicalIds.has(id)) && !canonicalIdentities.has(identity);
    });

  return [...unsyncedInvoices, ...canonicalInvoices];
}

export function inspectEmergencyBackup(payload = {}) {
  const snapshot = backupBusinessSnapshot(payload);
  const invoices = Array.isArray(snapshot.invoices) ? snapshot.invoices : [];
  const explicitMarginflowInvoices = explicitStorageArray(payload, "marginflow.invoices");
  const dates = invoices.map(invoiceDate).filter(Boolean).sort();
  const lineCounts = invoices.map((invoice) => (invoice.items || invoice.lines || []).length);
  const splitCounts = invoices.map((invoice) => (invoice.items || invoice.lines || [])
    .reduce((sum, line) => sum + (line.departmentSplits || line.department_splits || []).length, 0));
  const syncStatuses = invoices.reduce((counts, invoice) => {
    const key = invoice.syncStatus || "(none)";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const recoveryConflictVersions = invoices.reduce((summary, invoice) => {
    const versions = Array.isArray(invoice.recoveryConflictVersions) ? invoice.recoveryConflictVersions : [];
    if (versions.length) summary.invoiceCount += 1;
    summary.versionRows += versions.length;
    return summary;
  }, { invoiceCount: 0, versionRows: 0 });
  const errors = [];
  if (payload.schema && payload.schema !== EMERGENCY_BACKUP_SCHEMA) errors.push(`Unsupported emergency backup schema: ${payload.schema}`);
  const recognizedModules = Object.values(storageModules);
  if (!snapshot || typeof snapshot !== "object" || !recognizedModules.some((key) => Object.hasOwn(snapshot, key))) {
    errors.push("Backup does not contain readable MarginFlow business data.");
  }
  ["invoices", "products", "suppliers", "stocktakes"].forEach((key) => {
    if (snapshot[key] !== undefined && !Array.isArray(snapshot[key])) errors.push(`${key} must be an array.`);
  });
  return {
    valid: errors.length === 0,
    errors,
    schema: payload.schema || "legacy-marginflow-backup",
    schemaVersion: payload.schemaVersion || 0,
    exportedAt: payload.exportedAt || "",
    company: payload.company || snapshot.companySettings || {},
    location: payload.location || {},
    counts: {
      invoices: invoices.length,
      products: Array.isArray(snapshot.products) ? snapshot.products.length : 0,
      suppliers: Array.isArray(snapshot.suppliers) ? snapshot.suppliers.length : 0,
      stocktakes: Array.isArray(snapshot.stocktakes) ? snapshot.stocktakes.length : 0,
      recipes: Array.isArray(snapshot.recipes) ? snapshot.recipes.length : 0,
      waste: Array.isArray(snapshot.wasteItems) ? snapshot.wasteItems.length : 0,
    },
    explicitDatasets: {
      marginflowInvoices: explicitMarginflowInvoices.length,
      hasMarginflowInvoices: explicitMarginflowInvoices.length > 0,
    },
    invoiceLineData: {
      invoicesWithLines: lineCounts.filter(Boolean).length,
      totalLines: lineCounts.reduce((sum, count) => sum + count, 0),
      minLines: lineCounts.length ? Math.min(...lineCounts) : 0,
      maxLines: lineCounts.length ? Math.max(...lineCounts) : 0,
    },
    departmentSplits: {
      invoicesWithSplits: splitCounts.filter(Boolean).length,
      totalSplits: splitCounts.reduce((sum, count) => sum + count, 0),
      maxSplits: splitCounts.length ? Math.max(...splitCounts) : 0,
    },
    relationalIds: {
      invoicesWithIds: invoices.filter((invoice) => invoiceId(invoice)).length,
      invoicesWithDocumentNumbers: invoices.filter((invoice) => invoiceDocumentNumber(invoice)).length,
    },
    syncStatuses,
    recoveryConflictVersions,
    invoiceDateRange: dates.length ? { from: dates[0], to: dates.at(-1) } : { from: "", to: "" },
    invoiceNumbers: invoices.map((invoice) => invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number || "(no number)"),
    snapshot,
  };
}

export function recoveryPreviewForBackup(payload = {}, canonicalInvoices = []) {
  const inspection = inspectEmergencyBackup(payload);
  const companyId = inspection.company?.id || inspection.company?.company_id || "";
  const backupInvoices = (inspection.snapshot.invoices || []).map((invoice) => ({
    ...invoice,
    companyId: invoice.companyId || invoice.company_id || companyId,
  }));
  const scopedCanonicalInvoices = canonicalInvoices.map((invoice) => ({
    ...invoice,
    companyId: invoice.companyId || invoice.company_id || companyId,
  }));
  const comparison = compareInvoiceCollections(backupInvoices, scopedCanonicalInvoices);
  return { ...inspection, comparison };
}

export function currentCloudRecoveryStats({
  invoices = [],
  invoiceLines = [],
  invoiceLineDepartmentSplits = [],
  products = [],
  suppliers = [],
  stocktakes = [],
} = {}) {
  const dates = invoices.map(invoiceDate).filter(Boolean).sort();
  const documents = new Set(invoices.map((invoice) => [
    invoice.companyId || invoice.company_id || "",
    invoice.locationId || invoice.location_id || "",
    invoice.supplierId || invoice.supplier_id || invoice.supplier || invoice.supplierName || "",
    invoiceDocumentType(invoice),
    invoiceDocumentNumber(invoice),
  ].join("|")));
  return {
    invoices: invoices.length,
    invoiceLines: invoiceLines.length || invoices.reduce((sum, invoice) => sum + (invoice.items || invoice.lines || []).length, 0),
    splits: invoiceLineDepartmentSplits.length || invoices.reduce((sum, invoice) => sum + (invoice.items || invoice.lines || [])
      .reduce((lineSum, line) => lineSum + (line.departmentSplits || line.department_splits || []).length, 0), 0),
    products: products.length,
    suppliers: suppliers.length,
    stocktakes: stocktakes.length,
    earliestInvoiceDate: dates[0] || "",
    latestInvoiceDate: dates.at(-1) || "",
    distinctInvoiceDocumentCount: documents.size,
  };
}

export function invoiceOnlyRecoveryDryRun(payload = {}, current = {}) {
  const inspection = inspectEmergencyBackup(payload);
  const companyId = inspection.company?.id || inspection.company?.company_id || "";
  const locationId = inspection.location?.id || inspection.location?.location_id || "";
  const backupInvoices = (inspection.snapshot.invoices || []).map((invoice) => ({
    ...invoice,
    companyId: invoice.companyId || invoice.company_id || companyId,
    locationId: invoice.locationId || invoice.location_id || locationId,
  }));
  const currentInvoices = (current.invoices || []).map((invoice) => ({
    ...invoice,
    companyId: invoice.companyId || invoice.company_id || companyId,
    locationId: invoice.locationId || invoice.location_id || locationId,
  }));
  const duplicateClassification = backupDuplicateClassifications(backupInvoices, companyId, locationId);
  const currentIndexes = {
    byId: indexUnique(currentInvoices, (invoice) => [matchKeysFor(invoice, companyId, locationId).id]),
    bySupplierDocument: indexUnique(currentInvoices, (invoice) => matchKeysFor(invoice, companyId, locationId).supplierDocument),
    byContent: indexUnique(currentInvoices, (invoice) => [matchKeysFor(invoice, companyId, locationId).content]),
    bySupplierDocumentDate: indexUnique(currentInvoices, (invoice) => matchKeysFor(invoice, companyId, locationId).supplierDocumentDate),
    byLineContent: indexUnique(currentInvoices, (invoice) => [matchKeysFor(invoice, companyId, locationId).lineContent]),
  };
  const rows = backupInvoices.map((invoice, index) => {
    if (duplicateClassification.duplicateRepeatIndexes.has(index)) {
      return { index, invoice, category: "duplicatesInsideBackup", code: "F", matchBasis: "backup_duplicate", reason: "Duplicate invoice identity and content appears earlier inside the backup." };
    }
    if (duplicateClassification.duplicateConflictIndexes.has(index)) {
      return { index, invoice, category: "duplicatesInsideBackup", code: "F", matchBasis: "backup_duplicate_conflict", manualReviewRequired: true, reason: "Duplicate invoice identity inside backup has differing content." };
    }
    const match = findCurrentInvoiceMatch(invoice, currentIndexes, companyId, locationId);
    if (match.ambiguous) {
      return { index, invoice, category: "trueConflicts", code: "E", matchBasis: match.basis, reason: "Multiple current cloud invoices match this backup invoice.", candidates: match.candidates };
    }
    if (!match.match) {
      return { index, invoice, category: "missing", code: "B", matchBasis: "no_match", reason: "No safe current cloud match found." };
    }
    const classification = classifyMatchedInvoice(invoice, match.match, inspection.exportedAt);
    return { index, invoice, cloud: match.match, matchBasis: match.basis, ...classification };
  });
  const categoryCounts = Object.keys(emergencyRecoveryCategoryLabels).reduce((counts, key) => ({ ...counts, [key]: 0 }), {});
  rows.forEach((row) => {
    categoryCounts[row.category] = (categoryCounts[row.category] || 0) + 1;
  });
  const classified = Object.values(categoryCounts).reduce((sum, value) => sum + Number(value || 0), 0);
  categoryCounts.unclassified += Math.max(0, backupInvoices.length - classified);
  const unchanged = categoryCounts.exactlyExists + categoryCounts.cloudNewerOrMoreComplete + categoryCounts.duplicatesInsideBackup;
  const duplicateManualReview = rows.filter((row) => row.category === "duplicatesInsideBackup" && row.manualReviewRequired).length;
  const manualReview = categoryCounts.trueConflicts + duplicateManualReview;
  return {
    generatedAt: new Date().toISOString(),
    mode: "invoices_only_dry_run",
    backup: inspection,
    currentCloud: currentCloudRecoveryStats(current),
    rows,
    duplicatesInsideBackup: duplicateClassification.duplicateDetails,
    categoryCounts,
    preview: {
      invoicesThatWouldBeInserted: categoryCounts.missing,
      invoicesThatWouldBeMerged: categoryCounts.safeMergeCandidates,
      invoicesThatWouldRemainUnchanged: unchanged,
      invoicesRequiringManualReview: manualReview,
      invoicesThatWouldBeDeleted: 0,
      currentCloudInvoicesThatWouldBeOverwritten: 0,
      dataModified: false,
      restoreExecuted: false,
      backupFileModified: false,
    },
    idempotency: {
      pass: rows.every((row) => row.category !== "missing" || Boolean(invoiceDocumentNumber(row.invoice) || invoiceId(row.invoice))),
      reason: "Missing invoices use existing deterministic persistence IDs and pre-insert matching keys; a second run should reclassify successful inserts as already present.",
    },
    invariant: {
      totalBackupInvoices: backupInvoices.length,
      classifiedTotal: Object.values(categoryCounts).reduce((sum, value) => sum + Number(value || 0), 0),
      exact: Object.values(categoryCounts).reduce((sum, value) => sum + Number(value || 0), 0) === backupInvoices.length,
    },
  };
}
