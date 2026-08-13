import { supabase } from './supabase';

function normaliseSnapshot(snapshot) {
  if (!snapshot) return null;

  return {
    ...snapshot,
    featureKeys: Array.isArray(snapshot.feature_keys) ? snapshot.feature_keys : [],
    effectiveStatus: snapshot.effective_status,
    trialIsValid: Boolean(snapshot.trial_valid),
    writeAccess: Boolean(snapshot.write_access),
  };
}

// Server-side RPC is the only source for persisted plan/trial access decisions.
export async function loadEffectiveCompanyAccess(companyId, client = supabase) {
  if (!companyId) return null;

  const { data, error } = await client.rpc('get_effective_company_access', {
    target_company_id: companyId,
  });

  if (error) throw error;
  return normaliseSnapshot(data);
}
