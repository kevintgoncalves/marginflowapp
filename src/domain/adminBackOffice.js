export const ADMIN_NAV_ITEMS = Object.freeze([
  { id: 'overview', label: 'Overview' },
  { id: 'companies', label: 'Companies' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'plans', label: 'Plans & Features' },
  { id: 'staff', label: 'Internal Staff' },
  { id: 'audit', label: 'Audit Log' },
  { id: 'support', label: 'Support' },
  { id: 'settings', label: 'Settings' },
]);

export const ADMIN_PERMISSION_GROUPS = Object.freeze([
  { label: 'Companies', keys: ['companies.view', 'companies.edit'] },
  { label: 'Subscriptions', keys: ['subscriptions.view', 'subscriptions.activate', 'subscriptions.extend_trial', 'subscriptions.change_plan'] },
  { label: 'Customer users', keys: ['customer_users.view', 'customer_users.password_reset', 'customer_users.disable'] },
  { label: 'Support', keys: ['support.workspace_view', 'support.workspace_write'] },
  { label: 'Staff', keys: ['staff.view', 'staff.invite', 'staff.edit_permissions', 'staff.disable'] },
  { label: 'Plans', keys: ['plans.view', 'plans.manage'] },
  { label: 'Audit', keys: ['audit.view'] },
]);

export const SUBSCRIPTION_STATUS_OPTIONS = Object.freeze([
  { value: 'trialing', label: 'Trialing' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]);

export function permissionSet(context = {}) {
  return new Set(context.permission_keys || []);
}

export function canAdmin(context, permission) {
  return permissionSet(context).has(permission);
}

export function effectiveSubscriptionStatus(subscription = {}) {
  if (subscription.status === 'trialing' && subscription.trial_ends_at && new Date(subscription.trial_ends_at).getTime() <= Date.now()) return 'expired';
  return subscription.effective_status || subscription.status || 'expired';
}

export function trialDisplay(subscription = {}, now = new Date()) {
  const status = effectiveSubscriptionStatus(subscription);
  if (status !== 'trialing' || !subscription.trial_ends_at) return status === 'expired' ? 'Trial ended' : '';
  const end = new Date(subscription.trial_ends_at);
  const days = Math.max(0, Math.ceil((end.getTime() - new Date(now).getTime()) / 86400000));
  return `${days} day${days === 1 ? '' : 's'} remaining`;
}

export function formatAdminDate(value, fallback = 'Not set') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function companyMatchesFilters(company = {}, { search = '', status = '', plan = '' } = {}) {
  const needle = search.trim().toLocaleLowerCase();
  return (!needle || `${company.name || ''} ${company.trading_name || ''}`.toLocaleLowerCase().includes(needle))
    && (!status || company.subscription_status === status)
    && (!plan || company.plan_slug === plan);
}
