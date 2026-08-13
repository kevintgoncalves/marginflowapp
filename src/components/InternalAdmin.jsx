import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  ChevronLeft,
  CircleDollarSign,
  ClipboardList,
  LogOut,
  Shield,
  TicketCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  ADMIN_NAV_ITEMS,
  ADMIN_PERMISSION_GROUPS,
  SUBSCRIPTION_STATUS_OPTIONS,
  canAdmin,
  formatAdminDate,
  trialDisplay,
} from '../domain/adminBackOffice.js';
import {
  inviteInternalStaff,
  loadAdminAuditLog,
  loadAdminCompanies,
  loadAdminCompanyDetail,
  loadAdminOverview,
  loadAdminPlans,
  loadAdminStaff,
  loadInternalAdminContext,
  openSupportWorkspace,
  updateAdminSubscription,
  updateInternalStaff,
} from '../lib/adminRepository.js';
import marginflowLogo from '../assets/marginflow-logo.png';

const ADMIN_ICONS = {
  overview: Activity,
  companies: Building2,
  subscriptions: CircleDollarSign,
  plans: TicketCheck,
  staff: Users,
  audit: ClipboardList,
  support: Wrench,
  settings: Shield,
};

function moneylessStatus(status = '') {
  return status.replace('_', ' ');
}

function AdminStatus({ status }) {
  return <span className={`admin-status admin-status-${status}`}>{moneylessStatus(status)}</span>;
}

function AdminMetric({ label, value, tone = '' }) {
  return <div className={`admin-metric ${tone}`}><span>{label}</span><strong>{value ?? 0}</strong></div>;
}

function AdminTable({ children, empty = 'No records found.' }) {
  return <div className="admin-table-wrap">{children || <div className="admin-empty">{empty}</div>}</div>;
}

export default function InternalAdmin({ onExitSupport, onOpenSupport, onSignOut }) {
  const [context, setContext] = useState(null);
  const [page, setPage] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [companyFilters, setCompanyFilters] = useState({ search: '', status: '', plan: '' });
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companyDetail, setCompanyDetail] = useState(null);
  const [plans, setPlans] = useState([]);
  const [staff, setStaff] = useState({ accounts: [], invites: [], permissions: [], roles: [] });
  const [audit, setAudit] = useState([]);
  const [auditFilters, setAuditFilters] = useState({ companyId: '', actorId: '', action: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = async (targetPage = page) => {
    setLoading(true);
    setError('');
    try {
      if (targetPage === 'overview') setOverview(await loadAdminOverview());
      if (['companies', 'subscriptions', 'support'].includes(targetPage)) setCompanies(await loadAdminCompanies(companyFilters));
      if (targetPage === 'plans') setPlans(await loadAdminPlans());
      if (targetPage === 'staff') setStaff(await loadAdminStaff());
      if (targetPage === 'audit') setAudit(await loadAdminAuditLog({ companyId: auditFilters.companyId || null, actorId: auditFilters.actorId || null, action: auditFilters.action }));
    } catch (loadError) {
      setError(loadError.message || 'Could not load internal data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    loadInternalAdminContext()
      .then((nextContext) => { if (mounted) setContext(nextContext); })
      .catch((loadError) => { if (mounted) setError(loadError.message || 'Could not load internal access.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!context) return;
    refresh(page);
  }, [context, page]);

  const selectCompany = async (companyId) => {
    setSelectedCompanyId(companyId);
    setPage('companies');
    setLoading(true);
    setError('');
    try {
      setCompanyDetail(await loadAdminCompanyDetail(companyId));
    } catch (loadError) {
      setError(loadError.message || 'Could not load company detail.');
    } finally {
      setLoading(false);
    }
  };

  const saveSubscription = async (input) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateAdminSubscription(input);
      setNotice('Subscription updated and audit entry created.');
      setCompanyDetail(await loadAdminCompanyDetail(input.companyId));
      await refresh('overview');
      await refresh('companies');
    } catch (saveError) {
      setError(saveError.message || 'Could not update subscription.');
    } finally {
      setBusy(false);
    }
  };

  const handleOpenSupport = async (company, locationId = null) => {
    setBusy(true);
    setError('');
    try {
      const session = await openSupportWorkspace(company.id, locationId);
      onOpenSupport?.({ ...session, target: company });
    } catch (supportError) {
      setError(supportError.message || 'Could not open Support Mode.');
    } finally {
      setBusy(false);
    }
  };

  if (!context && loading) return <div className="admin-loading">Loading MarginFlow Admin...</div>;

  const permissions = new Set(context?.permission_keys || []);
  const canViewCompanies = permissions.has('companies.view');
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand"><img src={marginflowLogo} alt="MarginFlow" /><span>Internal Admin</span></div>
        <div className="admin-staff-chip"><Shield size={16} /><span><strong>{context?.staff?.name || 'Internal staff'}</strong><small>{context?.staff?.role_key || 'Staff'}</small></span></div>
        <nav className="admin-nav" aria-label="Internal navigation">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = ADMIN_ICONS[item.id] || Shield;
            const visible = item.id === 'overview'
              || (item.id === 'companies' && canViewCompanies)
              || (item.id === 'subscriptions' && permissions.has('subscriptions.view'))
              || (item.id === 'plans' && permissions.has('plans.view'))
              || (item.id === 'staff' && permissions.has('staff.view'))
              || (item.id === 'audit' && permissions.has('audit.view'))
              || (item.id === 'support' && permissions.has('support.workspace_view'))
              || item.id === 'settings';
            if (!visible) return null;
            return <button className={page === item.id ? 'active' : ''} key={item.id} onClick={() => { setNotice(''); setPage(item.id); }} type="button"><Icon size={17} /><span>{item.label}</span></button>;
          })}
        </nav>
        <button className="admin-signout" onClick={onSignOut} type="button"><LogOut size={16} /> Sign out</button>
      </aside>

      <main className="admin-workspace">
        <header className="admin-topbar">
          <div><span className="admin-eyebrow">MarginFlow internal</span><h1>{ADMIN_NAV_ITEMS.find((item) => item.id === page)?.label || 'Overview'}</h1></div>
          {selectedCompanyId && <button className="admin-back-button" onClick={() => { setSelectedCompanyId(''); setCompanyDetail(null); }} type="button"><ChevronLeft size={16} /> All companies</button>}
        </header>
        {error && <div className="admin-alert error">{error}</div>}
        {notice && <div className="admin-alert success">{notice}</div>}
        {loading && <div className="admin-loading inline">Loading...</div>}

        {!loading && page === 'overview' && <OverviewPage overview={overview} onNavigate={setPage} />}
        {!loading && page === 'companies' && (companyDetail
          ? <CompanyDetail detail={companyDetail} busy={busy} canAdmin={canAdmin} permissions={permissions} onBack={() => { setSelectedCompanyId(''); setCompanyDetail(null); }} onOpenSupport={handleOpenSupport} onSaveSubscription={saveSubscription} />
          : <CompaniesPage companies={companies} filters={companyFilters} onFilters={setCompanyFilters} onRefresh={() => refresh('companies')} onSelect={selectCompany} />)}
        {!loading && page === 'subscriptions' && <SubscriptionsPage companies={companies} filters={companyFilters} onFilters={setCompanyFilters} onSelect={selectCompany} onRefresh={() => refresh('subscriptions')} />}
        {!loading && page === 'plans' && <PlansPage plans={plans} />}
        {!loading && page === 'staff' && <StaffPage staff={staff} context={context} busy={busy} onRefresh={() => refresh('staff')} onSetBusy={setBusy} onSetError={setError} onSetNotice={setNotice} />}
        {!loading && page === 'audit' && <AuditPage audit={audit} companies={companies} filters={auditFilters} onFilters={setAuditFilters} onRefresh={() => refresh('audit')} />}
        {!loading && page === 'support' && <SupportPage companies={companies} onOpenSupport={handleOpenSupport} />}
        {!loading && page === 'settings' && <AdminSettings context={context} />}
        {selectedCompanyId && page !== 'companies' && <CompanyDetail detail={companyDetail} busy={busy} canAdmin={canAdmin} permissions={permissions} onBack={() => { setSelectedCompanyId(''); setCompanyDetail(null); setPage('companies'); }} onOpenSupport={handleOpenSupport} onSaveSubscription={saveSubscription} />}
        {onExitSupport && <div className="admin-support-return"><button onClick={onExitSupport} type="button">Return to Admin Back Office</button></div>}
      </main>
    </div>
  );
}

function OverviewPage({ overview, onNavigate }) {
  const plans = overview?.plans || {};
  return <div className="admin-page">
    <div className="admin-page-intro"><div><h2>Overview</h2><p>Operational view of MarginFlow customer workspaces and subscriptions.</p></div><button className="admin-primary" onClick={() => onNavigate('companies')} type="button">View companies</button></div>
    <div className="admin-metrics"><AdminMetric label="Total companies" value={overview?.total_companies} /><AdminMetric label="Active subscriptions" value={overview?.active_subscriptions} tone="success" /><AdminMetric label="Trialing companies" value={overview?.trialing_companies} tone="warning" /><AdminMetric label="Expired companies" value={overview?.expired_companies} tone="danger" /><AdminMetric label="Cancelled companies" value={overview?.cancelled_companies} /></div>
    <div className="admin-two-column"><section className="admin-card"><div className="admin-card-heading"><h3>Companies by plan</h3><span>Current assignment</span></div><div className="admin-plan-counts"><div><strong>{plans.basic || 0}</strong><span>Basic</span></div><div><strong>{plans.plus || 0}</strong><span>Plus</span></div><div><strong>{plans.pro || 0}</strong><span>Pro</span></div></div></section><section className="admin-card admin-attention"><div className="admin-card-heading"><h3>Trials ending soon</h3><span>Next 7 days</span></div><strong className="admin-big-number">{overview?.trials_ending_soon || 0}</strong><p>Use Subscriptions to review or extend a trial.</p></section></div>
  </div>;
}

function CompaniesPage({ companies, filters, onFilters, onRefresh, onSelect }) {
  return <div className="admin-page"><div className="admin-toolbar"><input aria-label="Search companies" placeholder="Search companies..." value={filters.search} onChange={(event) => onFilters({ ...filters, search: event.target.value })} /><select aria-label="Filter by status" value={filters.status} onChange={(event) => onFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{SUBSCRIPTION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><select aria-label="Filter by plan" value={filters.plan} onChange={(event) => onFilters({ ...filters, plan: event.target.value })}><option value="">All plans</option><option value="basic">Basic</option><option value="plus">Plus</option><option value="pro">Pro</option></select><button className="admin-secondary" onClick={onRefresh} type="button">Apply filters</button></div><AdminTable empty="No companies match these filters."><table className="admin-table"><thead><tr><th>Company</th><th>Country</th><th>Plan</th><th>Status</th><th>Trial ends</th><th>Users</th><th>Created</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id} onClick={() => onSelect(company.id)}><td><strong>{company.trading_name || company.name}</strong><small>{company.name}</small></td><td>{company.country || 'Unknown'}</td><td>{company.plan_name}</td><td><AdminStatus status={company.subscription_status} /></td><td>{formatAdminDate(company.trial_ends_at, '—')}</td><td>{company.customer_user_count}</td><td>{formatAdminDate(company.created_at)}</td></tr>)}</tbody></table></AdminTable></div>;
}

function SubscriptionsPage({ companies, filters, onFilters, onRefresh, onSelect }) {
  return <div className="admin-page"><div className="admin-page-intro"><div><h2>Subscriptions</h2><p>Manual subscription controls are permission protected and audit logged.</p></div></div><CompaniesPage companies={companies} filters={filters} onFilters={onFilters} onRefresh={onRefresh} onSelect={onSelect} /></div>;
}

function CompanyDetail({ detail, busy, permissions, onBack, onOpenSupport, onSaveSubscription }) {
  const company = detail?.company || {};
  const subscription = detail?.subscription || {};
  const [status, setStatus] = useState(subscription.status || 'trialing');
  const [plan, setPlan] = useState(subscription.plan_slug || 'basic');
  const [trialEnd, setTrialEnd] = useState(subscription.trial_ends_at ? new Date(subscription.trial_ends_at).toISOString().slice(0, 10) : '');
  useEffect(() => { setStatus(subscription.status || 'trialing'); setPlan(subscription.plan_slug || 'basic'); setTrialEnd(subscription.trial_ends_at ? new Date(subscription.trial_ends_at).toISOString().slice(0, 10) : ''); }, [subscription.status, subscription.plan_slug, subscription.trial_ends_at]);
  const update = () => onSaveSubscription({ companyId: company.id, status, planSlug: plan, trialEndsAt: trialEnd ? new Date(`${trialEnd}T23:59:59.000Z`).toISOString() : null });
  return <div className="admin-page company-detail-page"><button className="admin-back-link" onClick={onBack} type="button"><ChevronLeft size={16} /> Back to companies</button><div className="admin-company-heading"><div><span className="admin-eyebrow">Company detail</span><h2>{company.trading_name || company.name}</h2><p className="admin-mono">{company.id}</p></div><button className="admin-primary" disabled={!permissions.has('support.workspace_view') || busy} onClick={() => onOpenSupport(company, detail.locations?.[0]?.id || null)} type="button"><Wrench size={16} /> Open workspace in Support Mode</button></div><div className="admin-detail-grid"><section className="admin-card"><div className="admin-card-heading"><h3>Overview</h3><span>Administrative record</span></div><dl className="admin-definition-list"><div><dt>Country</dt><dd>{company.country_code || '—'}</dd></div><div><dt>Currency</dt><dd>{detail.settings?.currency || company.currency || '—'}</dd></div><div><dt>Language</dt><dd>{detail.settings?.language || '—'}</dd></div><div><dt>Created</dt><dd>{formatAdminDate(company.created_at)}</dd></div><div><dt>Customer users</dt><dd>{detail.users?.filter((user) => user.status === 'active').length || 0}</dd></div><div><dt>Locations</dt><dd>{detail.locations?.length || 0}</dd></div></dl></section><section className="admin-card"><div className="admin-card-heading"><h3>Subscription</h3><AdminStatus status={subscription.effective_status || subscription.status} /></div><div className="admin-form-grid"><label>Status<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!permissions.has('subscriptions.activate') && !permissions.has('subscriptions.extend_trial')}>{SUBSCRIPTION_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label>Plan<select value={plan} onChange={(event) => setPlan(event.target.value)} disabled={!permissions.has('subscriptions.change_plan')}><option value="basic">Basic</option><option value="plus">Plus</option><option value="pro">Pro</option></select></label><label>Trial end<input type="date" value={trialEnd} onChange={(event) => setTrialEnd(event.target.value)} disabled={!permissions.has('subscriptions.extend_trial')} /></label></div><div className="admin-trial-line"><span>{trialDisplay(subscription)}</span><small>Source of truth: trial_ends_at</small></div><div className="admin-button-row"><button className="admin-primary" disabled={busy || !permissions.has('subscriptions.view')} onClick={update} type="button">Save subscription</button><button className="admin-secondary" disabled={busy || !permissions.has('subscriptions.extend_trial')} onClick={() => { const date = new Date(subscription.trial_ends_at || Date.now()); date.setDate(date.getDate() + 7); setStatus('trialing'); setTrialEnd(date.toISOString().slice(0, 10)); }} type="button">+7 days</button><button className="admin-secondary" disabled={busy || !permissions.has('subscriptions.extend_trial')} onClick={() => { const date = new Date(subscription.trial_ends_at || Date.now()); date.setDate(date.getDate() + 14); setStatus('trialing'); setTrialEnd(date.toISOString().slice(0, 10)); }} type="button">+14 days</button></div></section></div><div className="admin-two-column"><section className="admin-card"><div className="admin-card-heading"><h3>Customer users</h3><span>Customer role is separate from internal role</span></div><AdminTable empty="No customer users."><table className="admin-table compact"><thead><tr><th>Name</th><th>Email</th><th>Customer role</th><th>Status</th><th>Last login</th></tr></thead><tbody>{(detail.users || []).map((user) => <tr key={user.id}><td>{user.name}</td><td>{user.email}</td><td>{user.customer_role}</td><td>{user.status}</td><td>{formatAdminDate(user.last_login_at, '—')}</td></tr>)}</tbody></table></AdminTable></section><section className="admin-card"><div className="admin-card-heading"><h3>Features</h3><span>Plan + custom overrides</span></div><div className="admin-feature-list">{(detail.features || []).map((feature, index) => <div key={`${feature.feature_key}-${index}`}><span>{feature.name || feature.feature_key}</span><small>{feature.source}{feature.enabled === false ? ' · disabled' : ''}</small></div>)}</div></section></div><section className="admin-card"><div className="admin-card-heading"><h3>Activity</h3><span>Company audit history</span></div><AuditRows rows={detail.audit || []} /></section></div>;
}

function PlansPage({ plans }) {
  return <div className="admin-page"><div className="admin-page-intro"><div><h2>Plans & Features</h2><p>Read-only plan definitions. Company plan changes use the entitlement system.</p></div><span className="admin-read-only">Read-only</span></div><div className="admin-plan-grid">{plans.map((plan) => <section className="admin-card" key={plan.slug}><div className="admin-card-heading"><h3>{plan.name}</h3><span>{plan.active ? 'Active' : 'Inactive'}</span></div><p>{plan.description}</p><ul className="admin-feature-list">{(plan.features || []).map((feature) => <li key={feature.feature_key}><span>{feature.name}</span>{feature.feature_key === 'invoice_ai' && <small>Included</small>}</li>)}</ul></section>)}</div></div>;
}

function StaffPage({ staff, context, busy, onRefresh, onSetBusy, onSetError, onSetNotice }) {
  const [form, setForm] = useState({ fullName: '', email: '', roleKey: staff.roles?.[0]?.role_key || 'support', overrides: {} });
  const [selectedDraft, setSelectedDraft] = useState(null);
  useEffect(() => { if (!form.roleKey && staff.roles?.[0]) setForm((current) => ({ ...current, roleKey: staff.roles[0].role_key })); }, [staff.roles]);
  const submitInvite = async () => {
    onSetBusy(true); onSetError(''); onSetNotice('');
    try { await inviteInternalStaff({ email: form.email, fullName: form.fullName, roleKey: form.roleKey, permissionOverrides: form.overrides }); onSetNotice('Invitation queued. Delivery provider is not configured; no password was created.'); setForm({ fullName: '', email: '', roleKey: form.roleKey, overrides: {} }); onRefresh(); } catch (error) { onSetError(error.message || 'Could not queue invitation.'); } finally { onSetBusy(false); }
  };
  const saveSelected = async () => {
    if (!selectedDraft) return;
    onSetBusy(true); onSetError(''); onSetNotice('');
    try { await updateInternalStaff({ userId: selectedDraft.user_id, roleKey: selectedDraft.role_key, status: selectedDraft.status, permissionOverrides: selectedDraft.overrides || {} }); onSetNotice('Staff permissions saved and audited.'); onRefresh(); } catch (error) { onSetError(error.message || 'Could not update staff.'); } finally { onSetBusy(false); }
  };
  return <div className="admin-page"><div className="admin-page-intro"><div><h2>Internal Staff</h2><p>Explicit MarginFlow staff accounts, separate from customer Owners.</p></div></div><div className="admin-two-column"><section className="admin-card"><div className="admin-card-heading"><h3>Invite staff</h3><span>No admin-created passwords</span></div><div className="admin-form-grid"><label>Name<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Role template<select value={form.roleKey} onChange={(event) => setForm({ ...form, roleKey: event.target.value })}>{staff.roles?.map((role) => <option key={role.role_key} value={role.role_key}>{role.name}</option>)}</select></label></div><PermissionEditor permissions={staff.permissions} roles={staff.roles} roleKey={form.roleKey} overrides={form.overrides} onChange={(overrides) => setForm({ ...form, overrides })} /><button className="admin-primary" disabled={busy || !form.fullName || !form.email} onClick={submitInvite} type="button">Send invitation</button></section><section className="admin-card"><div className="admin-card-heading"><h3>Role templates</h3><span>Baseline permissions</span></div>{(staff.roles || []).map((role) => <div className="admin-role-row" key={role.role_key}><strong>{role.name}</strong><small>{role.description}</small><span>{role.permissions?.length || 0} permissions</span></div>)}</section></div><section className="admin-card"><div className="admin-card-heading"><h3>Staff accounts</h3><span>{staff.accounts?.length || 0} active or disabled</span></div><AdminTable empty="No internal staff accounts."><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Action</th></tr></thead><tbody>{(staff.accounts || []).map((account) => <tr key={account.user_id}><td>{account.name}</td><td>{account.email}</td><td>{account.role_key}</td><td><AdminStatus status={account.status} /></td><td>{formatAdminDate(account.last_login_at, '—')}</td><td><button className="admin-secondary small" onClick={() => setSelectedDraft({ ...account, overrides: account.overrides || {} })} type="button">Edit</button></td></tr>)}</tbody></table></AdminTable>{selectedDraft && <div className="admin-inline-editor"><div><strong>Edit {selectedDraft.name}</strong><button className="admin-close" onClick={() => setSelectedDraft(null)} type="button">Close</button></div><div className="admin-form-grid"><label>Role<select value={selectedDraft.role_key} onChange={(event) => setSelectedDraft({ ...selectedDraft, role_key: event.target.value })}>{(staff.roles || []).map((role) => <option key={role.role_key} value={role.role_key}>{role.name}</option>)}</select></label><label>Status<select value={selectedDraft.status} onChange={(event) => setSelectedDraft({ ...selectedDraft, status: event.target.value })}>{['active', 'disabled'].map((value) => <option key={value}>{value}</option>)}</select></label></div><p className="helper-text">Permission overrides are stored separately from the role baseline and are audited.</p><button className="admin-primary" disabled={busy || selectedDraft.user_id === context?.staff?.user_id} onClick={saveSelected} type="button">Save staff access</button></div>}</section><section className="admin-card"><div className="admin-card-heading"><h3>Pending invitations</h3><span>Delivery status is explicit</span></div><AdminTable empty="No pending invitations."><table className="admin-table compact"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Delivery</th><th>Created</th></tr></thead><tbody>{(staff.invites || []).map((invite) => <tr key={invite.id}><td>{invite.full_name}</td><td>{invite.email}</td><td>{invite.role_key}</td><td>{invite.delivery_status}</td><td>{formatAdminDate(invite.created_at)}</td></tr>)}</tbody></table></AdminTable></section></div>;
}

function PermissionEditor({ permissions = [], roles = [], roleKey, overrides = {}, onChange }) {
  const baseline = new Set(roles.find((role) => role.role_key === roleKey)?.permissions || []);
  const names = Object.fromEntries(permissions.map((permission) => [permission.permission_key, permission.name]));
  return <div className="admin-permission-editor"><strong>Review permissions</strong>{ADMIN_PERMISSION_GROUPS.map((group) => <fieldset key={group.label}><legend>{group.label}</legend>{group.keys.map((key) => <label key={key}><input type="checkbox" checked={overrides[key] ?? baseline.has(key)} onChange={(event) => onChange({ ...overrides, [key]: event.target.checked })} />{names[key] || key}</label>)}</fieldset>)}</div>;
}

function AuditRows({ rows }) {
  return <AdminTable empty="No audit entries."><table className="admin-table compact"><thead><tr><th>Timestamp</th><th>Internal user</th><th>Action</th><th>Company</th><th>Context</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{formatAdminDate(row.timestamp)}</td><td>{row.actor_name}</td><td><strong>{row.action}</strong></td><td>{row.company_name || row.company_id || '—'}</td><td><code>{JSON.stringify(row.metadata || {})}</code></td></tr>)}</tbody></table></AdminTable>;
}

function AuditPage({ audit, companies, filters, onFilters, onRefresh }) {
  return <div className="admin-page"><div className="admin-toolbar"><select aria-label="Filter audit by company" value={filters.companyId} onChange={(event) => onFilters({ ...filters, companyId: event.target.value })}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><input aria-label="Filter audit by action" placeholder="Action contains..." value={filters.action} onChange={(event) => onFilters({ ...filters, action: event.target.value })} /><button className="admin-secondary" onClick={onRefresh} type="button">Apply filters</button></div><AuditRows rows={audit} /></div>;
}

function SupportPage({ companies, onOpenSupport }) {
  return <div className="admin-page"><div className="admin-page-intro"><div><h2>Support</h2><p>Open a clearly scoped customer workspace in read-only mode.</p></div></div><section className="admin-card"><div className="admin-card-heading"><h3>Support workspaces</h3><span>Every entry is audited</span></div><AdminTable empty="No companies available."><table className="admin-table"><thead><tr><th>Company</th><th>Plan</th><th>Status</th><th>Action</th></tr></thead><tbody>{companies.map((company) => <tr key={company.id}><td>{company.trading_name || company.name}</td><td>{company.plan_name}</td><td><AdminStatus status={company.subscription_status} /></td><td><button className="admin-secondary small" onClick={() => onOpenSupport(company)} type="button">Open read-only workspace</button></td></tr>)}</tbody></table></AdminTable></section></div>;
}

function AdminSettings({ context }) {
  return <div className="admin-page"><div className="admin-page-intro"><div><h2>Settings</h2><p>Internal account and environment controls.</p></div></div><div className="admin-two-column"><section className="admin-card"><div className="admin-card-heading"><h3>Your access</h3><span>Server-authorized</span></div><dl className="admin-definition-list"><div><dt>Name</dt><dd>{context?.staff?.name}</dd></div><div><dt>Email</dt><dd>{context?.staff?.email}</dd></div><div><dt>Role</dt><dd>{context?.staff?.role_key}</dd></div><div><dt>Permissions</dt><dd>{context?.permission_keys?.length || 0}</dd></div></dl></section><section className="admin-card"><div className="admin-card-heading"><h3>Billing integrations</h3><span>Not connected</span></div><p>Stripe, checkout, payment webhooks and usage billing are intentionally out of scope for 4C. Subscriptions are controlled manually and audit logged.</p></section></div></div>;
}
