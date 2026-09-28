import { buildFinalRecoveryWorkspace, recoveryResolutionPayload } from "../domain/finalRecovery.js";
import { diagnoseLaptopRecoveryConflicts } from "../domain/legacyRecoveryDiagnostics.js";
import { buildLaptopRecoveryPreview } from "../domain/legacyRecovery.js";
import { loadLegacyRecoveryRelationalState } from "./legacyRecoveryRepository.js";
import { persistRelationalInvoice } from "./invoiceRepository.js";

function resultRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function loadFinalRecoveryWorkspace(client, snapshot, scope) {
  const relational = await loadLegacyRecoveryRelationalState(client, scope);
  const preview = await buildLaptopRecoveryPreview({ snapshot, relational, scope });
  const report = diagnoseLaptopRecoveryConflicts(preview, {
    deviceInvoices: snapshot.invoices || [],
    relationalInvoices: relational.invoices || [],
    relationalSuppliers: relational.suppliers || [],
    legacyCloudInvoices: [],
    legacyCloudModule: { available: true, exists: false, invoices: [] },
  });
  return buildFinalRecoveryWorkspace({ preview, report, relational, resolutions: relational.resolutions || [] });
}

export async function saveRecoveryResolution(client, scope, input = {}) {
  const resolution = recoveryResolutionPayload(input);
  let expectedRevision = input.expectedRevision;
  if (expectedRevision === undefined) {
    let query = client
      .from("marginflow_recovery_resolutions")
      .select("revision")
      .eq("company_id", scope.companyId)
      .eq("resolution_type", resolution.resolutionType)
      .eq("source_key", resolution.sourceKey);
    query = scope.locationId ? query.eq("location_id", scope.locationId) : query.is("location_id", null);
    const existing = await query.maybeSingle();
    if (existing.error) throw existing.error;
    expectedRevision = Number(existing.data?.revision || 0);
  }
  const { data, error } = await client.rpc("save_recovery_resolution_v1", {
    p_company_id: scope.companyId,
    p_location_id: scope.locationId || null,
    p_resolution_type: resolution.resolutionType,
    p_source_key: resolution.sourceKey,
    p_decision: resolution.decision,
    p_target_id: resolution.targetId || null,
    p_value: resolution.value,
    p_metadata: resolution.metadata,
    p_expected_revision: expectedRevision,
  });
  if (error) throw error;
  return resultRow(data);
}

export async function applySafeFinancialHeaderRepairs(client, scope, candidates = []) {
  const repaired = [];
  const failed = [];
  for (const candidate of candidates) {
    try {
      const { data, error } = await client.rpc("repair_invoice_financial_headers_v1", {
        p_company_id: scope.companyId,
        p_location_id: scope.locationId || null,
        p_invoice_id: candidate.invoiceId,
        p_expected_revision: candidate.expectedRevision,
        p_expected_content_fingerprint: candidate.expectedContentFingerprint || null,
        p_expected_subtotal: candidate.stored.subtotal,
        p_expected_vat: candidate.stored.vat,
        p_expected_discount: candidate.stored.discount,
        p_expected_total: candidate.stored.total,
        p_proposed_subtotal: candidate.proposed.subtotal,
        p_proposed_vat: candidate.proposed.vat,
        p_proposed_discount: candidate.proposed.discount,
        p_proposed_total: candidate.proposed.total,
        p_proof: candidate.proof,
        p_repair_key: `financial-header:${candidate.invoiceId}:${candidate.expectedRevision}`,
      });
      if (error) throw error;
      repaired.push({ candidate, result: resultRow(data) });
    } catch (error) {
      failed.push({ candidate, error: error.message || "Financial header repair failed." });
    }
  }
  return { repaired, failed };
}

export async function resolveRecoveryInvoiceDate(client, scope, {
  legacyInvoiceId,
  invoiceId,
  expectedRevision,
  expectedContentFingerprint,
  date,
} = {}) {
  const { data, error } = await client.rpc("resolve_recovery_invoice_date_v1", {
    p_company_id: scope.companyId,
    p_location_id: scope.locationId || null,
    p_legacy_invoice_id: legacyInvoiceId,
    p_invoice_id: invoiceId,
    p_expected_revision: expectedRevision,
    p_expected_content_fingerprint: expectedContentFingerprint || null,
    p_invoice_date: date,
  });
  if (error) throw error;
  return resultRow(data);
}

export async function useDeviceRecoveryInvoiceVersion(client, scope, invoice = {}, cloud = {}) {
  return persistRelationalInvoice(client, {
    ...invoice,
    id: cloud.id || invoice.id,
    relationalId: cloud.id || invoice.id,
    syncRevision: Number(cloud.syncRevision || invoice.syncRevision || 0),
  }, scope);
}

export async function verifyRecoveryIntegrity(client, scope) {
  const { data, error } = await client.rpc("verify_recovery_integrity_v1", {
    p_company_id: scope.companyId,
    p_location_id: scope.locationId || null,
  });
  if (error) throw error;
  return resultRow(data);
}
