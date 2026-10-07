import { invoiceWithVerifiedDepartments } from '../domain/invoiceDepartmentScope.js';
import { compareInvoiceCollections } from "../domain/emergencyRecovery.js";
import { withCanonicalInvoiceFinancials } from "../domain/invoiceFinancials.js";
import { firstInvoiceAmount } from "../domain/invoiceFinancials.js";
import { readAllPages } from "./paginatedRead.js";

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
  const preserveChildIds = invoice.persistenceIdsCanonical === true
    || Boolean(invoice.relationalId || invoice.relational_id)
    || String(invoice.persistenceSource || "").startsWith("relational");
  const items = [];
  for (const [lineIndex, line] of (invoice.items || invoice.lines || []).entries()) {
    const lineId = preserveChildIds && uuidPattern.test(line.id || "")
      ? line.id
      : await deterministicRecoveryUuid(`line|${invoiceId}|${lineIndex}|${line.id || ""}|${line.productName || line.product_name || ""}`);
    const departmentSplits = [];
    for (const [splitIndex, split] of (line.departmentSplits || line.department_splits || []).entries()) {
      const splitId = preserveChildIds && uuidPattern.test(split.id || "")
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
    persistenceIdsCanonical: true,
    items,
  }, items);
}

export function invoiceFromRelationalRow(row = {}) {
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

export function replaceInvoiceInCollection(invoices = [], sourceInvoiceId = "", invoice = {}) {
  const withoutSource = sourceInvoiceId && sourceInvoiceId !== invoice.id
    ? invoices.filter((entry) => entry.id !== sourceInvoiceId)
    : invoices;
  return upsertInvoiceInCollection(withoutSource, invoice);
}

export async function persistRelationalInvoice(client, invoice = {}, scope = {}, {
  duplicateAction = null,
  existingInvoiceId = null,
  expectedRevision = null,
} = {}) {
  if (!client || !validScope(scope)) {
    throw new Error("Relational invoice persistence needs canonical company and invoice identifiers.");
  }
  if (client?.from && validScope(scope)) {
    const {data:departments,error} = await client.from("departments").select("id,name,company_id,location_id,active").eq("company_id",scope.companyId).eq("active",true);
    if (error || !departments) throw error || new Error("Could not verify departments. Draft preserved.");
    invoice = invoiceWithVerifiedDepartments(invoice, departments, scope);
  }
  const canonicalInvoice = await ensureInvoicePersistenceIds(invoice, scope);
  const invoicePayload = { ...canonicalInvoice };
  delete invoicePayload.syncRetryContext;
  const { data, error } = await client.rpc("persist_invoice_document_v3", {
    p_company_id: scope.companyId,
    p_location_id: scope.locationId || null,
    p_invoice: invoicePayload,
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
      supplierId: result?.supplier_id || canonicalInvoice.supplierId,
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
  const storedRetryContext = invoice.syncRetryContext && typeof invoice.syncRetryContext === "object"
    ? invoice.syncRetryContext
    : {};
  const resolvedDuplicateAction = duplicateAction || storedRetryContext.duplicateAction || null;
  const resolvedExistingInvoiceId = existingInvoiceId || storedRetryContext.existingInvoiceId || null;
  const hasStoredExpectedRevision = storedRetryContext.expectedRevision !== null
    && storedRetryContext.expectedRevision !== undefined
    && storedRetryContext.expectedRevision !== "";
  const storedExpectedRevision = hasStoredExpectedRevision ? Number(storedRetryContext.expectedRevision) : Number.NaN;
  const resolvedExpectedRevision = expectedRevision !== null && expectedRevision !== undefined
    ? expectedRevision
    : (Number.isFinite(storedExpectedRevision) ? storedExpectedRevision : null);
  const syncRetryContext = resolvedDuplicateAction ? {
    duplicateAction: resolvedDuplicateAction,
    existingInvoiceId: resolvedExistingInvoiceId,
    expectedRevision: resolvedExpectedRevision,
  } : null;
  const attemptedAt = now();
  const syncAttemptCount = Number(invoice.syncAttemptCount || 0) + 1;
  const pending = {
    ...canonicalInvoice,
    syncStatus: client && validScope(scope) ? "pending_sync" : "local_only",
    syncError: "",
    pendingSince: invoice.pendingSince || attemptedAt,
    lastSyncAttemptAt: attemptedAt,
    nextSyncAttemptAt: "",
    syncAttemptCount,
    syncRetryBlocked: false,
    syncRetryContext,
  };
  storeLocal(pending);
  if (!client || !validScope(scope)) return { invoice: pending, persisted: false, error: null };
  try {
    const result = await persistRelationalInvoice(client, pending, scope, {
      duplicateAction: resolvedDuplicateAction,
      existingInvoiceId: resolvedExistingInvoiceId,
      expectedRevision: resolvedExpectedRevision,
    });
    const synced = {
      ...result.invoice,
      syncStatus: "synced",
      syncError: "",
      syncedAt: result?.saved_at || now(),
      relationalId: result?.invoice_id || pending.id,
      syncRevision: Number(result?.sync_revision || pending.syncRevision || 1),
      persistenceSource: "relational",
      nextSyncAttemptAt: "",
      syncRetryBlocked: false,
      syncRetryContext: null,
    };
    storeLocal(synced);
    return { invoice: synced, persisted: true, result, error: null };
  } catch (error) {
    const errorMessage = error.message || "Relational invoice save failed.";
    const retryBlocked = /possible_invoice_duplicate|invoice_(?:identity|revision)_conflict|invoice_update_confirmation_required|multiple_equivalent_invoice_candidates/i.test(errorMessage);
    const attemptedAtMs = Date.parse(attemptedAt);
    const retryDelayMs = Math.min(5 * 60 * 1000, 30 * 1000 * (2 ** Math.max(0, syncAttemptCount - 1)));
    const failed = {
      ...pending,
      syncStatus: "sync_failed",
      syncError: errorMessage,
      nextSyncAttemptAt: retryBlocked ? "" : new Date((Number.isFinite(attemptedAtMs) ? attemptedAtMs : Date.now()) + retryDelayMs).toISOString(),
      syncRetryBlocked: retryBlocked,
    };
    storeLocal(failed);
    return { invoice: failed, persisted: false, error };
  }
}

export function invoiceCanRetrySyncAutomatically(invoice = {}, { at = Date.now(), maxAttempts = 3 } = {}) {
  if (!["sync_failed", "local_only"].includes(invoice.syncStatus)) return false;
  if (invoice.syncRetryBlocked || Number(invoice.syncAttemptCount || 0) >= maxAttempts) return false;
  const retryAt = Date.parse(invoice.nextSyncAttemptAt || "");
  return !Number.isFinite(retryAt) || retryAt <= Number(at);
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

const invoiceHeaderColumns = "id,company_id,location_id,supplier_id,invoice_number,document_number,document_type,invoice_date,status,subtotal,tax_amount,total_amount,sync_revision,content_fingerprint,metadata,created_at,updated_at";
// The embedded snapshot may contain every line and the source document. Lists
// deliberately project only its supplier label; the editor loads the rest later.
const invoiceListColumns = "id,company_id,location_id,supplier_id,invoice_number,document_number,document_type,invoice_date,status,subtotal,tax_amount,total_amount,sync_revision,updated_at,supplier_name:metadata->marginflow_snapshot->>supplier,absoluteNetTotal:metadata->marginflow_snapshot->>absoluteNetTotal,absolute_net_total:metadata->marginflow_snapshot->>absolute_net_total,finalInvoiceTotal:metadata->marginflow_snapshot->>finalInvoiceTotal,total:metadata->marginflow_snapshot->>total,snapshot_total_amount:metadata->marginflow_snapshot->>total_amount,suppliers(name)";

function invoiceListRow(row) {
  // Preserve the existing schedule/list net amount precedence, without fetching
  // the entire snapshot. Never silently substitute a gross header for a net value.
  const amount = firstInvoiceAmount(row, ["absoluteNetTotal", "absolute_net_total", "finalInvoiceTotal", "total", "snapshot_total_amount"]);
  return { ...invoiceFromRelationalRow({ ...row, metadata: { supplier_name: row.suppliers?.name || row.supplier_name || row.metadata?.supplier_name || row.metadata?.marginflow_snapshot?.supplier || "" }, invoice_lines: [] }), absoluteNetTotal: amount, financialSummaryMissing: amount === null };
}

function applyInvoiceFilters(query, filters = {}) {
  if (filters.startDate) query = query.gte("invoice_date", filters.startDate);
  if (filters.endDate) query = query.lte("invoice_date", filters.endDate);
  if (filters.supplierId) query = query.eq("supplier_id", filters.supplierId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.documentType) query = query.eq("document_type", filters.documentType);
  const search = String(filters.search || "").trim();
  if (search) {
    // PostgREST `.or` uses a filter expression rather than a parameter object.
    // Keep only text that can be part of a literal ILIKE pattern so a search can
    // never broaden the company/location scope above.
    const pattern = search.replace(/[(),]/g, " ").replace(/[%_\\]/g, "\\$&").replace(/\s+/g, " ");
    query = query.or(`invoice_number.ilike.%${pattern}%,document_number.ilike.%${pattern}%`);
  }
  return query;
}

export async function loadRelationalInvoicePage(client, scope = {}, { offset = 0, limit = 25, filters = {} } = {}) {
  if (!client || !validScope(scope)) return { invoices: [], total: 0, hasMore: false, nextOffset: 0 };
  const pageSize = Math.min(25, Math.max(1, Number(limit) || 25));
  let query = client.from("invoices")
    .select(invoiceListColumns, { count: "exact" })
    .eq("company_id", scope.companyId);
  if (scope.locationId) query = query.eq("location_id", scope.locationId);
  query = applyInvoiceFilters(query, filters)
    .order("invoice_date", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + pageSize - 1);
  const { data, count, error } = await query;
  if (error) throw error;
  if (!Array.isArray(data) || !Number.isSafeInteger(count)) throw new Error("Invoice page count could not be verified. Retry; previous records are retained.");
  const invoices = data.map(invoiceListRow);
  const total = count;
  return { invoices, total, hasMore: offset + invoices.length < total, nextOffset: offset + invoices.length };
}

export async function loadRelationalInvoiceCount(client, scope, filters = {}) {
  if (!client || !validScope(scope)) throw new Error("Invoice count requires an authenticated company scope.");
  let query = client.from("invoices").select("id", { count: "exact", head: true }).eq("company_id", scope.companyId);
  if (scope.locationId) query = query.eq("location_id", scope.locationId);
  const { count, error } = await applyInvoiceFilters(query, filters);
  if (error) throw error;
  if (!Number.isSafeInteger(count)) throw new Error("Invoice count could not be verified.");
  return count;
}

// A schedule is a complete week, never the current list page. Count-checked
// pagination handles server caps without falsely declaring historical cells missing.
export async function loadRelationalInvoiceSchedule(client, scope, { startDate, endDate }) {
  if (!client || !validScope(scope) || !startDate || !endDate) throw new Error("Schedule requires company, location and week boundaries.");
  const rows = await readAllPages((head = false) => {
    let query = client.from("invoices").select(head ? "id" : invoiceListColumns, { count: "exact", head })
      .eq("company_id", scope.companyId).gte("invoice_date", startDate).lte("invoice_date", endDate);
    if (scope.locationId) query = query.eq("location_id", scope.locationId);
    return query;
  }, { label: "delivery schedule", pageSize: 500 });
  return rows.map(invoiceListRow);
}

export async function loadRelationalInvoiceDetails(client, scope = {}, invoiceId = "") {
  if (!client || !validScope(scope) || !uuidPattern.test(invoiceId)) throw new Error("Invoice details need a canonical scoped invoice ID.");
  let headerQuery = client.from("invoices").select(invoiceHeaderColumns).eq("company_id", scope.companyId).eq("id", invoiceId);
  if (scope.locationId) headerQuery = headerQuery.eq("location_id", scope.locationId);
  const { data: headerRows, error: headerError } = await headerQuery.limit(1);
  if (headerError) throw headerError;
  const header = headerRows?.[0];
  if (!header) throw new Error("Invoice was not found in the active company and location.");

  let lineQuery = client.from("invoice_lines").select("*").eq("company_id", scope.companyId).eq("invoice_id", invoiceId).eq("active", true);
  if (scope.locationId) lineQuery = lineQuery.eq("location_id", scope.locationId);
  const { data: lines, error: lineError } = await lineQuery.order("created_at", { ascending: true });
  if (lineError) throw lineError;
  const lineIds = (lines || []).map(line => line.id);
  let splits = [];
  if (lineIds.length) {
    let splitQuery = client.from("invoice_line_department_splits").select("*").eq("company_id", scope.companyId).in("invoice_line_id", lineIds).eq("active", true);
    if (scope.locationId) splitQuery = splitQuery.eq("location_id", scope.locationId);
    const splitResult = await splitQuery.order("created_at", { ascending: true });
    if (splitResult.error) throw splitResult.error;
    splits = splitResult.data || [];
  }
  const splitsByLine = new Map();
  splits.forEach(split => splitsByLine.set(split.invoice_line_id, [...(splitsByLine.get(split.invoice_line_id) || []), split]));
  return invoiceFromRelationalRow({
    ...header,
    invoice_lines: (lines || []).map(line => ({ ...line, invoice_line_department_splits: splitsByLine.get(line.id) || [] })),
  });
}

export async function loadRelationalInvoiceReportRange(client, scope = {}, { startDate, endDate } = {}) {
  if (!startDate || !endDate) throw new Error("Invoice reports require an explicit date range.");
  if (!client || !validScope(scope)) return [];
  const headers = await readAllPages((head = false) => {
    let query = client.from("invoices").select(head ? "id" : invoiceHeaderColumns, { count: "exact", head })
      .eq("company_id", scope.companyId).gte("invoice_date", startDate).lte("invoice_date", endDate);
    if (scope.locationId) query = query.eq("location_id", scope.locationId);
    return query;
  }, { pageSize: 500, label: "invoice report headers" });
  if (!(headers || []).length) return [];
  const invoiceIds = headers.map(row => row.id);
  const lines = [];
  for (let offset = 0; offset < invoiceIds.length; offset += 100) {
    const invoiceIdChunk = invoiceIds.slice(offset, offset + 100);
    lines.push(...await readAllPages((head = false) => {
      let query = client.from("invoice_lines").select(head ? "id" : "*", { count: "exact", head })
        .eq("company_id", scope.companyId).in("invoice_id", invoiceIdChunk).eq("active", true);
      if (scope.locationId) query = query.eq("location_id", scope.locationId);
      return query;
    }, { pageSize: 500, label: "invoice report lines" }));
  }
  const lineIds = lines.map(row => row.id);
  const splits = [];
  for (let offset = 0; offset < lineIds.length; offset += 100) {
    const lineIdChunk = lineIds.slice(offset, offset + 100);
    splits.push(...await readAllPages((head = false) => {
      let query = client.from("invoice_line_department_splits").select(head ? "id" : "*", { count: "exact", head })
        .eq("company_id", scope.companyId).in("invoice_line_id", lineIdChunk).eq("active", true);
      if (scope.locationId) query = query.eq("location_id", scope.locationId);
      return query;
    }, { pageSize: 500, label: "invoice report department splits" }));
  }
  const splitsByLine = new Map();
  splits.forEach(split => splitsByLine.set(split.invoice_line_id, [...(splitsByLine.get(split.invoice_line_id) || []), split]));
  const linesByInvoice = new Map();
  lines.forEach(line => linesByInvoice.set(line.invoice_id, [...(linesByInvoice.get(line.invoice_id) || []), { ...line, invoice_line_department_splits: splitsByLine.get(line.id) || [] }]));
  return headers.map(header => invoiceFromRelationalRow({ ...header, invoice_lines: linesByInvoice.get(header.id) || [] }));
}

export async function loadRelationalInvoices(client, scope = {}) {
  if (!client || !validScope(scope)) return [];
  const scopedQuery = (table, head = false) => {
    let query = client.from(table).select("*", { count: "exact", head }).eq("company_id", scope.companyId);
    if (scope.locationId) query = query.eq("location_id", scope.locationId);
    return query;
  };
  const readTable = (table) => readAllPages((head = false) => scopedQuery(table, head), { label: table });
  const invoiceRows = await readTable("invoices");
  const [lineRows, splitRows] = await Promise.all([
    readTable("invoice_lines"), readTable("invoice_line_department_splits"),
  ]);
  // The invoice RPC advances revision/updated_at with its children. Refuse a
  // document assembled across different committed revisions.
  const verifiedRows = await readTable("invoices");
  const versions = (rows) => JSON.stringify(rows.map((row) => [row.id, row.sync_revision, row.updated_at]));
  if (versions(invoiceRows) !== versions(verifiedRows)) {
    throw new Error("Invoices changed during loading. Retry to read a consistent version; previous data has been retained.");
  }

  const splitsByLineId = new Map();
  splitRows.forEach((split) => {
    const rows = splitsByLineId.get(split.invoice_line_id) || [];
    rows.push(split);
    splitsByLineId.set(split.invoice_line_id, rows);
  });
  const linesByInvoiceId = new Map();
  lineRows.forEach((line) => {
    const rows = linesByInvoiceId.get(line.invoice_id) || [];
    rows.push({ ...line, invoice_line_department_splits: splitsByLineId.get(line.id) || [] });
    linesByInvoiceId.set(line.invoice_id, rows);
  });
  return invoiceRows.sort((a, b) => String(b.invoice_date || "").localeCompare(String(a.invoice_date || "")) || a.id.localeCompare(b.id)).map((invoice) => invoiceFromRelationalRow({
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
