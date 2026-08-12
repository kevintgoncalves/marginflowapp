import { compareInvoiceCollections } from "../domain/emergencyRecovery.js";
import { withCanonicalInvoiceFinancials } from "../domain/invoiceFinancials.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCanonicalUuid(value = "") {
  return uuidPattern.test(value);
}

function validScope({ companyId = "", locationId = "" } = {}) {
  return uuidPattern.test(companyId) && (!locationId || uuidPattern.test(locationId));
}

export async function deterministicRecoveryUuid(seed = "") {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed)));
  digest[6] = (digest[6] & 0x0f) | 0x40;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = [...digest.slice(0, 16)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function ensureInvoicePersistenceIds(invoice = {}, scope = {}) {
  const identitySeed = [
    scope.companyId || invoice.companyId || invoice.company_id || "company",
    invoice.supplierId || invoice.supplier_id || invoice.supplier || "supplier",
    invoice.documentType || invoice.document_type || "invoice",
    invoice.documentNumber || invoice.document_number || invoice.invoiceNumber || invoice.invoice_number || "unnumbered",
    invoice.date || invoice.invoiceDate || invoice.invoice_date || "undated",
  ].join("|");
  const invoiceId = uuidPattern.test(invoice.id || "") ? invoice.id : await deterministicRecoveryUuid(`invoice|${identitySeed}|${invoice.id || ""}`);
  const items = [];
  for (const [lineIndex, line] of (invoice.items || invoice.lines || []).entries()) {
    const lineId = uuidPattern.test(line.id || "")
      ? line.id
      : await deterministicRecoveryUuid(`line|${invoiceId}|${lineIndex}|${line.id || ""}|${line.productName || line.product_name || ""}`);
    const departmentSplits = [];
    for (const [splitIndex, split] of (line.departmentSplits || line.department_splits || []).entries()) {
      const splitId = uuidPattern.test(split.id || "")
        ? split.id
        : await deterministicRecoveryUuid(`split|${lineId}|${splitIndex}|${split.id || ""}|${split.departmentId || split.department_id || split.department || ""}`);
      departmentSplits.push({ ...split, id: splitId });
    }
    items.push({ ...line, id: lineId, departmentSplits });
  }
  return withCanonicalInvoiceFinancials({
    ...invoice,
    id: invoiceId,
    companyId: scope.companyId || invoice.companyId || invoice.company_id || "",
    locationId: scope.locationId || invoice.locationId || invoice.location_id || "",
    items,
  }, items);
}

function invoiceFromRelationalRow(row = {}) {
  const metadata = row.metadata || {};
  const storedSnapshot = metadata.marginflow_snapshot && typeof metadata.marginflow_snapshot === "object"
    ? metadata.marginflow_snapshot
    : {};
  const snapshotLineOrder = new Map((storedSnapshot.items || storedSnapshot.lines || []).map((line, index) => [line.id, index]));
  const lines = (row.invoice_lines || row.lines || [])
    .filter((line) => line.active !== false)
    .sort((left, right) => (snapshotLineOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (snapshotLineOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  const items = lines.map((line) => {
    const lineSnapshot = line.metadata?.marginflow_snapshot && typeof line.metadata.marginflow_snapshot === "object"
      ? line.metadata.marginflow_snapshot
      : {};
    const splits = (line.invoice_line_department_splits || line.department_splits || []).filter((split) => split.active !== false);
    const snapshotUnit = String(lineSnapshot.unit || lineSnapshot.purchaseUnit || lineSnapshot.purchase_unit || lineSnapshot.unitOfMeasure || lineSnapshot.unit_of_measure || "").trim().toLowerCase();
    const snapshotPackSize = String(line.pack_size || lineSnapshot.packSize || lineSnapshot.pack_size || "").trim().toLowerCase();
    const quantity = Number(line.quantity ?? lineSnapshot.quantity ?? 0);
    const unitPersistenceCompatibility = snapshotUnit === "qty"
      && snapshotPackSize === "kg"
      && !Number.isInteger(quantity)
      ? "historical_qty_pack_measure_fallback"
      : "";
    return {
      ...lineSnapshot,
      id: line.id,
      productId: line.product_id || lineSnapshot.productId || "",
      matchedProductId: line.product_id || lineSnapshot.matchedProductId || "",
      productName: line.product_name || lineSnapshot.productName || "",
      packSize: line.pack_size || lineSnapshot.packSize || "",
      quantity,
      unitCost: Number(line.unit_cost ?? lineSnapshot.unitCost ?? 0),
      lineTotal: Number(line.net_line_total ?? lineSnapshot.lineTotal ?? 0),
      departmentId: line.department_id || lineSnapshot.departmentId || "",
      unitPersistenceCompatibility,
      departmentSplits: splits.map((split) => ({
        ...(split.metadata?.marginflow_snapshot || {}),
        id: split.id,
        departmentId: split.department_id,
        percentage: Number(split.percentage || 0),
        amount: Number(split.amount || 0),
      })),
    };
  });
  return {
    ...storedSnapshot,
    id: row.id,
    companyId: row.company_id,
    locationId: row.location_id || "",
    supplierId: row.supplier_id || storedSnapshot.supplierId || "",
    supplier: storedSnapshot.supplier || storedSnapshot.supplierName || metadata.supplier_name || "",
    invoiceNumber: row.invoice_number || storedSnapshot.invoiceNumber || "",
    documentNumber: row.document_number || row.invoice_number || storedSnapshot.documentNumber || "",
    documentType: row.document_type || storedSnapshot.documentType || "invoice",
    date: row.invoice_date || storedSnapshot.date || "",
    status: row.status || storedSnapshot.status || "Approved",
    subtotal: Number(row.subtotal ?? storedSnapshot.subtotal ?? 0),
    sourceInvoiceSubtotal: Number(row.subtotal ?? storedSnapshot.sourceInvoiceSubtotal ?? 0),
    vatTotal: Number(row.tax_amount ?? storedSnapshot.vatTotal ?? 0),
    sourceInvoiceTotal: Number(row.total_amount ?? storedSnapshot.sourceInvoiceTotal ?? 0),
    items,
    syncStatus: "synced",
    syncError: "",
    relationalId: row.id,
    syncRevision: Number(row.sync_revision || 1),
    contentFingerprint: row.content_fingerprint || "",
    syncedAt: row.updated_at || row.created_at || "",
    persistenceSource: "relational",
  };
}

export function upsertInvoiceInCollection(invoices = [], invoice = {}) {
  const exists = invoices.some((entry) => entry.id === invoice.id);
  return exists
    ? invoices.map((entry) => entry.id === invoice.id ? invoice : entry)
    : [invoice, ...invoices];
}

export async function persistRelationalInvoice(client, invoice = {}, scope = {}, {
  duplicateAction = null,
  existingInvoiceId = null,
  expectedRevision = null,
} = {}) {
  if (!client || !validScope(scope)) {
    throw new Error("Relational invoice persistence needs canonical company and invoice identifiers.");
  }
  const canonicalInvoice = await ensureInvoicePersistenceIds(invoice, scope);
  const { data, error } = await client.rpc("persist_invoice_document_v3", {
    p_company_id: scope.companyId,
    p_location_id: scope.locationId || null,
    p_invoice: canonicalInvoice,
    p_duplicate_action: duplicateAction,
    p_existing_invoice_id: existingInvoiceId,
    p_expected_revision: expectedRevision,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  const expectedLineCount = canonicalInvoice.items.length;
  const expectedSplitCount = canonicalInvoice.items.reduce((sum, line) => sum + (line.departmentSplits || []).length, 0);
  if (Number(result?.line_count) !== expectedLineCount || Number(result?.split_count) !== expectedSplitCount) {
    throw new Error(`Relational invoice verification failed: expected ${expectedLineCount} line(s) and ${expectedSplitCount} split(s), received ${Number(result?.line_count || 0)} and ${Number(result?.split_count || 0)}.`);
  }
  return {
    ...result,
    invoice: {
      ...canonicalInvoice,
      id: result?.invoice_id || canonicalInvoice.id,
      relationalId: result?.invoice_id || canonicalInvoice.id,
    },
  };
}

export async function persistInvoiceWithLocalFallback({
  client,
  invoice,
  scope,
  storeLocal = () => {},
  now = () => new Date().toISOString(),
  duplicateAction = null,
  existingInvoiceId = null,
  expectedRevision = null,
} = {}) {
  const canonicalInvoice = await ensureInvoicePersistenceIds(invoice, scope);
  const pending = {
    ...canonicalInvoice,
    syncStatus: client && validScope(scope) ? "pending_sync" : "local_only",
    syncError: "",
    pendingSince: invoice.pendingSince || now(),
  };
  storeLocal(pending);
  if (!client || !validScope(scope)) return { invoice: pending, persisted: false, error: null };
  try {
    const result = await persistRelationalInvoice(client, pending, scope, { duplicateAction, existingInvoiceId, expectedRevision });
    const synced = {
      ...result.invoice,
      syncStatus: "synced",
      syncError: "",
      syncedAt: result?.saved_at || now(),
      relationalId: result?.invoice_id || pending.id,
      syncRevision: Number(result?.sync_revision || pending.syncRevision || 1),
      persistenceSource: "relational",
    };
    storeLocal(synced);
    return { invoice: synced, persisted: true, result, error: null };
  } catch (error) {
    const failed = {
      ...pending,
      syncStatus: "sync_failed",
      syncError: error.message || "Relational invoice save failed.",
    };
    storeLocal(failed);
    return { invoice: failed, persisted: false, error };
  }
}

export async function loadLegacyInvoiceArchive(client, scope = {}) {
  if (!client || !validScope(scope)) return [];
  let query = client
    .from("legacy_invoice_archive")
    .select("id,company_id,location_id,source_invoice_id,supplier_id,supplier_name,document_type,document_number,invoice_date,subtotal,vat_amount,discount_amount,additional_charges,total_amount,currency,financial_header_reliable,archive_reason,classification,payload,created_at")
    .eq("company_id", scope.companyId);
  if (scope.locationId) query = query.eq("location_id", scope.locationId);
  const { data, error } = await query.order("invoice_date", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    sourceInvoiceId: row.source_invoice_id,
    supplierId: row.supplier_id || "",
    supplier: row.supplier_name || row.payload?.supplier || "Unknown supplier",
    documentType: row.document_type || "invoice",
    documentNumber: row.document_number || "",
    invoiceNumber: row.document_number || "",
    date: row.invoice_date || "",
    subtotal: Number(row.subtotal || 0),
    vatTotal: Number(row.vat_amount || 0),
    discountAmount: Number(row.discount_amount || 0),
    additionalCharges: Number(row.additional_charges || 0),
    sourceInvoiceTotal: Number(row.total_amount || 0),
    currency: row.currency || "GBP",
    financialHeaderReliable: row.financial_header_reliable === true,
    archiveReason: row.archive_reason,
    classification: row.classification || "archive_only",
    payload: row.payload || {},
    items: [],
    archiveOnly: true,
    analyticsScope: "supplier_financials_only",
    syncStatus: "synced",
    persistenceSource: "legacy_archive",
    archivedAt: row.created_at,
  }));
}

export async function loadRelationalInvoices(client, scope = {}) {
  if (!client || !validScope(scope)) return [];
  const scopedQuery = (table) => {
    let query = client.from(table).select("*").eq("company_id", scope.companyId);
    if (scope.locationId) query = query.eq("location_id", scope.locationId);
    return query;
  };
  const [invoiceResult, lineResult, splitResult] = await Promise.all([
    scopedQuery("invoices").order("invoice_date", { ascending: false }),
    scopedQuery("invoice_lines"),
    scopedQuery("invoice_line_department_splits"),
  ]);
  if (invoiceResult.error) throw invoiceResult.error;
  if (lineResult.error) throw lineResult.error;
  if (splitResult.error) throw splitResult.error;

  const splitsByLineId = new Map();
  (splitResult.data || []).forEach((split) => {
    const rows = splitsByLineId.get(split.invoice_line_id) || [];
    rows.push(split);
    splitsByLineId.set(split.invoice_line_id, rows);
  });
  const linesByInvoiceId = new Map();
  (lineResult.data || []).forEach((line) => {
    const rows = linesByInvoiceId.get(line.invoice_id) || [];
    rows.push({ ...line, invoice_line_department_splits: splitsByLineId.get(line.id) || [] });
    linesByInvoiceId.set(line.invoice_id, rows);
  });
  return (invoiceResult.data || []).map((invoice) => invoiceFromRelationalRow({
    ...invoice,
    invoice_lines: linesByInvoiceId.get(invoice.id) || [],
  }));
}

export async function importMissingRecoveryInvoices(client, invoices = [], scope = {}, onPersisted = () => {}) {
  const imported = [];
  const failed = [];
  for (const invoice of invoices) {
    try {
      const result = await persistRelationalInvoice(client, invoice, scope);
      const synced = { ...result.invoice, syncStatus: "synced", syncError: "", relationalId: result?.invoice_id || result.invoice.id, syncRevision: Number(result?.sync_revision || 1), syncedAt: result?.saved_at || new Date().toISOString() };
      imported.push(synced);
      onPersisted(synced);
    } catch (error) {
      failed.push({ invoice, error: error.message || "Recovery import failed." });
    }
  }
  return { imported, failed };
}

export async function compareLocalWithRelationalInvoices(client, localInvoices = [], scope = {}) {
  const relationalInvoices = await loadRelationalInvoices(client, scope);
  return { relationalInvoices, comparison: compareInvoiceCollections(localInvoices, relationalInvoices) };
}
