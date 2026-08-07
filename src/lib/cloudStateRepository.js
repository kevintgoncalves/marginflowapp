export const SNAPSHOT_WRITE_EXCLUDED_MODULES = Object.freeze(["invoices"]);

function payloadBytes(serialized = "") {
  return new TextEncoder().encode(serialized).byteLength;
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
    const { data, error } = await client.rpc("save_cloud_state_module_v2", {
      p_company_id: scope.companyId,
      p_location_id: scope.locationId || null,
      p_scope_key: scope.scopeKey,
      p_module_key: definition.key,
      p_payload: snapshot[definition.key],
      p_expected_revision: Number(revisions[definition.key] || 0),
    });
    if (error) {
      const diagnostic = new Error(`${error.message || "Cloud module save failed"} [operation=save_cloud_state_module_v2 module=${definition.key} bytes=${payloadBytes(fingerprint)} elapsedMs=${Date.now() - startedAt}]`);
      diagnostic.cause = error;
      diagnostic.moduleKey = definition.key;
      throw diagnostic;
    }
    const result = Array.isArray(data) ? data[0] : data;
    nextRevisions[definition.key] = Number(result?.revision || Number(revisions[definition.key] || 0) + 1);
    nextFingerprints[definition.key] = fingerprint;
    savedModules.push({ moduleKey: definition.key, bytes: payloadBytes(fingerprint), elapsedMs: Date.now() - startedAt });
  }
  return { revisions: nextRevisions, fingerprints: nextFingerprints, savedModules };
}
