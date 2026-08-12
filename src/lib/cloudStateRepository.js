export const SNAPSHOT_WRITE_EXCLUDED_MODULES = Object.freeze(["invoices", "sales"]);
export const CLOUD_STATE_SAVE_RPC = "save_cloud_state_module_v2";
export const CLOUD_STATE_SAVE_ARGUMENTS = Object.freeze([
  "p_company_id",
  "p_expected_revision",
  "p_location_id",
  "p_module_key",
  "p_payload",
  "p_scope_key",
]);

function payloadBytes(serialized = "") {
  return new TextEncoder().encode(serialized).byteLength;
}

function isMissingRpcError(error = {}) {
  return error.code === "PGRST202"
    || /could not find (?:the )?function|schema cache/i.test(error.message || "");
}

export async function saveRevisionedCloudModules(client, scope = {}, snapshot = {}, moduleDefinitions = [], {
  revisions = {},
  fingerprints = {},
} = {}) {
  if (!client || !scope.companyId) return { revisions, fingerprints, savedModules: [] };
  const nextRevisions = { ...revisions };
  const nextFingerprints = { ...fingerprints };
  const savedModules = [];
  for (const definition of moduleDefinitions) {
    if (SNAPSHOT_WRITE_EXCLUDED_MODULES.includes(definition.key) || snapshot[definition.key] === undefined) continue;
    const fingerprint = JSON.stringify(snapshot[definition.key]);
    if (fingerprints[definition.key] === fingerprint) continue;
    const startedAt = Date.now();
    const expectedRevision = Number(revisions[definition.key] || 0);
    const { data, error } = await client.rpc(CLOUD_STATE_SAVE_RPC, {
      p_company_id: scope.companyId,
      p_location_id: scope.locationId || null,
      p_scope_key: scope.scopeKey,
      p_module_key: definition.key,
      p_payload: snapshot[definition.key],
      p_expected_revision: expectedRevision,
    });
    if (error) {
      const missingRpc = isMissingRpcError(error);
      const message = missingRpc
        ? "Cloud sync is unavailable because Supabase does not expose save_cloud_state_module_v2. Local data remains unchanged and this module is still pending."
        : error.message || "Cloud module save failed";
      const diagnostic = new Error(`${message} [operation=${CLOUD_STATE_SAVE_RPC} module=${definition.key} bytes=${payloadBytes(fingerprint)} elapsedMs=${Date.now() - startedAt}]`);
      diagnostic.cause = error;
      diagnostic.code = error.code || "";
      diagnostic.operation = CLOUD_STATE_SAVE_RPC;
      diagnostic.moduleKey = definition.key;
      diagnostic.expectedRevision = expectedRevision;
      diagnostic.pending = true;
      diagnostic.retryable = missingRpc;
      diagnostic.revisions = nextRevisions;
      diagnostic.fingerprints = nextFingerprints;
      diagnostic.savedModules = savedModules;
      throw diagnostic;
    }
    const result = Array.isArray(data) ? data[0] : data;
    nextRevisions[definition.key] = Number(result?.revision || Number(revisions[definition.key] || 0) + 1);
    nextFingerprints[definition.key] = fingerprint;
    savedModules.push({ moduleKey: definition.key, bytes: payloadBytes(fingerprint), elapsedMs: Date.now() - startedAt });
  }
  return { revisions: nextRevisions, fingerprints: nextFingerprints, savedModules };
}
