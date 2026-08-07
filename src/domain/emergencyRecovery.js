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

export function inspectEmergencyBackup(payload = {}) {
  const snapshot = backupBusinessSnapshot(payload);
  const invoices = Array.isArray(snapshot.invoices) ? snapshot.invoices : [];
  const dates = invoices.map(invoiceDate).filter(Boolean).sort();
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
