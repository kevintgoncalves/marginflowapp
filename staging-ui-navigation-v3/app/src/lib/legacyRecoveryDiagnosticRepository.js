import { diagnoseLaptopRecoveryConflicts } from "../domain/legacyRecoveryDiagnostics.js";
import { buildLaptopRecoveryPreview } from "../domain/legacyRecovery.js";
import { loadLegacyRecoveryRelationalState } from "./legacyRecoveryRepository.js";

async function loadLegacyCloudInvoiceModule(client, scope) {
  const scopeKey = scope.scopeKey || scope.locationId || "company";
  let result = await client
    .from("marginflow_cloud_state")
    .select("module_key,payload,synced_at,revision")
    .eq("company_id", scope.companyId)
    .eq("scope_key", scopeKey)
    .eq("module_key", "invoices");
  if (result.error?.code === "42703") {
    result = await client
      .from("marginflow_cloud_state")
      .select("module_key,payload,synced_at")
      .eq("company_id", scope.companyId)
      .eq("scope_key", scopeKey)
      .eq("module_key", "invoices");
  }
  if (result.error) {
    return { available: false, exists: false, invoices: [], error: result.error.message || "Legacy cloud invoice module could not be read." };
  }
  const row = (result.data || [])[0];
  return {
    available: true,
    exists: Boolean(row),
    invoices: Array.isArray(row?.payload) ? row.payload : [],
    revision: Number(row?.revision || 0),
    syncedAt: row?.synced_at || "",
    error: "",
  };
}

async function loadRelationalInvoiceAuditRows(client, scope) {
  let query = client
    .from("invoices")
    .select("id,supplier_id,invoice_number,document_number,invoice_date,total_amount,source,created_at,updated_at,metadata")
    .eq("company_id", scope.companyId);
  if (scope.locationId) query = query.eq("location_id", scope.locationId);
  const result = await query.order("created_at", { ascending: false });
  if (result.error) {
    return { available: false, rows: [], error: result.error.message || "Relational invoice creation audit could not be read." };
  }
  return { available: true, rows: result.data || [], error: "" };
}

export async function diagnoseLaptopLegacyRecovery(client, snapshot, scope, {
  exampleLimit = 15,
  baselineRelationalCount = null,
  loadRelationalState = loadLegacyRecoveryRelationalState,
  loadCloudInvoiceModule = loadLegacyCloudInvoiceModule,
  loadRelationalAuditRows = loadRelationalInvoiceAuditRows,
  buildPreview = buildLaptopRecoveryPreview,
} = {}) {
  const [relational, legacyCloudModule, relationalAudit] = await Promise.all([
    loadRelationalState(client, scope),
    loadCloudInvoiceModule(client, scope),
    loadRelationalAuditRows(client, scope),
  ]);
  const preview = await buildPreview({ snapshot, relational, scope });
  return {
    preview,
    report: diagnoseLaptopRecoveryConflicts(preview, {
      exampleLimit,
      deviceInvoices: snapshot.invoices || [],
      relationalInvoices: relational.invoices || [],
      relationalSuppliers: relational.suppliers || [],
      relationalAuditRows: relationalAudit.rows,
      relationalAuditAvailable: relationalAudit.available,
      relationalAuditError: relationalAudit.error,
      baselineRelationalCount,
      legacyCloudInvoices: legacyCloudModule.invoices,
      legacyCloudModule,
    }),
  };
}
