import { supabase } from './supabase';

function rpc(client, name, args) {
  return client.rpc(name, args).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

export function loadCustomerOnboardingState(companyId, client = supabase) {
  if (!companyId) return Promise.resolve(null);
  return rpc(client, 'get_customer_onboarding_state', { p_company_id: companyId });
}

export function beginCustomerOnboarding(draft, client = supabase) {
  return rpc(client, 'begin_customer_onboarding', {
    p_company_name: draft.companyName,
    p_country_code: draft.countryCode,
    p_country_name: draft.country,
    p_language: draft.language,
    p_currency: draft.currency,
    p_timezone: draft.timezone,
    p_default_vat: Number(draft.defaultVat),
    p_week_starts_on: draft.weekStartsOn,
  });
}

export function saveCustomerOnboardingProgress(companyId, step, draft, client = supabase) {
  return rpc(client, 'save_customer_onboarding_progress', {
    p_company_id: companyId,
    p_onboarding_step: step,
    p_company_name: draft.companyName,
    p_country_code: draft.countryCode,
    p_country_name: draft.country,
    p_language: draft.language,
    p_currency: draft.currency,
    p_timezone: draft.timezone,
    p_default_vat: Number(draft.defaultVat),
    p_week_starts_on: draft.weekStartsOn,
    p_target_gp: Number(draft.targetGp),
    p_regional_overrides: draft.regionalOverrides || {},
  });
}

export function saveCustomerOnboardingDepartments(companyId, departments, client = supabase) {
  return rpc(client, 'save_customer_onboarding_departments', {
    p_company_id: companyId,
    p_departments: departments.map((department) => ({ name: department.name })),
  });
}

export function completeCustomerOnboarding(companyId, client = supabase) {
  return rpc(client, 'complete_customer_onboarding', { p_company_id: companyId });
}
