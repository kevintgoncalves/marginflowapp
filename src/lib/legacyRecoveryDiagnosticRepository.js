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

export async function diagnoseLaptopLegacyRecovery(client, snapshot, scope, {
  exampleLimit = 15,
  loadRelationalState = loadLegacyRecoveryRelationalState,
  loadCloudInvoiceModule = loadLegacyCloudInvoiceModule,
  buildPreview = buildLaptopRecoveryPreview,
} = {}) {
  const [relational, legacyCloudModule] = await Promise.all([
    loadRelationalState(client, scope),
    loadCloudInvoiceModule(client, scope),
  ]);
  const preview = await buildPreview({ snapshot, relational, scope });
  return {
    preview,
    report: diagnoseLaptopRecoveryConflicts(preview, {
      exampleLimit,
      deviceInvoices: snapshot.invoices || [],
      relationalInvoices: relational.invoices || [],
      legacyCloudInvoices: legacyCloudModule.invoices,
      legacyCloudModule,
    }),
  };
}
