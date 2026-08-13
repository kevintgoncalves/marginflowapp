import { supabase } from './supabase.js';

function call(name, args = {}, client = supabase) {
  if (!client) return Promise.reject(new Error('Supabase is not configured.'));
  return client.rpc(name, args).then(({ data, error }) => {
    if (error) throw error;
    return data;
  });
}

export function claimInternalStaffInvite(client = supabase) {
  return call('claim_internal_staff_invite', {}, client);
}

export function loadInternalAdminContext(client = supabase) {
  return call('get_internal_admin_context', {}, client);
}

export function loadAdminOverview(client = supabase) {
  return call('get_admin_overview', {}, client);
}

export function loadAdminCompanies({ search = '', status = '', plan = '' } = {}, client = supabase) {
  return call('get_admin_companies', { p_search: search, p_status: status, p_plan: plan }, client);
}

export function loadAdminCompanyDetail(companyId, client = supabase) {
  return call('get_admin_company_detail', { target_company_id: companyId }, client);
}

export function loadAdminPlans(client = supabase) {
  return call('get_admin_plans', {}, client);
}

export function loadAdminStaff(client = supabase) {
  return call('get_admin_staff', {}, client);
}

export function loadAdminAuditLog({ companyId = null, actorId = null, action = '', from = null, to = null } = {}, client = supabase) {
  return call('get_admin_audit_log', {
    p_company_id: companyId,
    p_actor_id: actorId,
    p_action: action,
    p_from: from,
    p_to: to,
  }, client);
}

export function updateAdminSubscription({ companyId, status = null, planSlug = null, trialEndsAt = null }, client = supabase) {
  return call('admin_update_subscription', {
    p_company_id: companyId,
    p_status: status,
    p_plan_slug: planSlug,
    p_trial_ends_at: trialEndsAt,
  }, client);
}

export function inviteInternalStaff({ email, fullName, roleKey, permissionOverrides = {} }, client = supabase) {
  return call('admin_invite_internal_staff', {
    p_email: email,
    p_full_name: fullName,
    p_role_key: roleKey,
    p_permission_overrides: permissionOverrides,
  }, client);
}

export function updateInternalStaff({ userId, roleKey = null, status = null, permissionOverrides = null }, client = supabase) {
  return call('admin_update_internal_staff', {
    p_user_id: userId,
    p_role_key: roleKey,
    p_status: status,
    p_permission_overrides: permissionOverrides,
  }, client);
}

export function openSupportWorkspace(companyId, locationId = null, client = supabase) {
  return call('open_support_workspace', { target_company_id: companyId, target_location_id: locationId }, client);
}

export function closeSupportWorkspace(sessionId, client = supabase) {
  return call('close_support_workspace', { target_session_id: sessionId }, client);
}
