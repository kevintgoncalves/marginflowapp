-- MarginFlow SaaS Foundation 4A
--
-- This migration is additive. It establishes plan entitlements, dormant trial
-- provisioning, an internal-staff boundary and an append-only internal audit
-- trail without changing operational data or financial calculations.

create table if not exists public.features (
  feature_key text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.plan_features (
  plan_id uuid not null references public.plans(id) on delete cascade,
  feature_key text not null references public.features(feature_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

create table if not exists public.internal_roles (
  role_key text primary key,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_permissions (
  permission_key text primary key,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.internal_role_permissions (
  role_key text not null references public.internal_roles(role_key) on delete cascade,
  permission_key text not null references public.internal_permissions(permission_key) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_key, permission_key)
);

create table if not exists public.internal_staff_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role_key text not null references public.internal_roles(role_key),
  status text not null default 'active' check (status in ('active', 'disabled', 'invited')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.internal_staff_permission_overrides (
  user_id uuid not null references public.internal_staff_accounts(user_id) on delete cascade,
  permission_key text not null references public.internal_permissions(permission_key) on delete cascade,
  allowed boolean not null,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key (user_id, permission_key)
);

create table if not exists public.internal_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  old_record jsonb,
  new_record jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.subscriptions
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_plan_id uuid references public.plans(id),
  add column if not exists trial_length_days smallint not null default 14 check (trial_length_days between 1 and 365);

create index if not exists plan_features_feature_key_idx
  on public.plan_features(feature_key);
create index if not exists internal_staff_accounts_role_key_idx
  on public.internal_staff_accounts(role_key);
create index if not exists internal_audit_log_company_id_idx
  on public.internal_audit_log(company_id);
create index if not exists internal_audit_log_actor_id_idx
  on public.internal_audit_log(actor_id);
create index if not exists internal_audit_log_created_at_idx
  on public.internal_audit_log(created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'features',
    'internal_roles',
    'internal_permissions',
    'internal_staff_accounts',
    'internal_staff_permission_overrides'
  ] loop
    if not exists (
      select 1
      from pg_trigger
      where tgname = 'set_updated_at'
        and tgrelid = to_regclass(format('public.%I', table_name))
    ) then
      execute format(
        'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
        table_name
      );
    end if;
  end loop;
end
$$;

-- `plans.features` remains intact for compatibility. plan_features is the
-- authoritative, relational entitlement source going forward.
insert into public.plans (slug, name, description, active)
values
  ('basic', 'Basic', 'Core operational visibility and invoice capture.', true),
  ('plus', 'Plus', 'Core operations with inventory and control workflows.', true),
  ('pro', 'Pro', 'Full MarginFlow operational intelligence.', true)
on conflict (slug) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into public.features (feature_key, name, description)
values
  ('dashboard', 'Dashboard', 'Company dashboard.'),
  ('sales', 'Sales', 'Sales input and reporting.'),
  ('invoices', 'Invoices', 'Invoice workflow.'),
  ('invoice_ai', 'Invoice AI', 'Invoice extraction and AI assistance.'),
  ('products', 'Products', 'Product catalogue.'),
  ('suppliers', 'Suppliers', 'Supplier management.'),
  ('stocktake', 'Stocktake', 'Stocktaking.'),
  ('invoice_control_centre', 'Invoice Control Centre', 'Invoice control centre.'),
  ('recipes', 'Recipes', 'Recipe management.'),
  ('waste', 'Waste', 'Waste tracking.'),
  ('menu_costing', 'Menu Costing', 'Menu costing.'),
  ('labour', 'Labour', 'Labour reporting.'),
  ('ai_insights', 'AI Insights', 'AI insight reporting.'),
  ('advanced_reporting', 'Advanced Reporting', 'Advanced reporting.')
on conflict (feature_key) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into public.plan_features (plan_id, feature_key)
select plan.id, feature.feature_key
from public.plans plan
join public.features feature on feature.feature_key in (
  'dashboard', 'sales', 'invoices', 'invoice_ai'
)
where plan.slug = 'basic'
on conflict do nothing;

insert into public.plan_features (plan_id, feature_key)
select plan.id, feature.feature_key
from public.plans plan
join public.features feature on feature.feature_key in (
  'dashboard', 'sales', 'invoices', 'invoice_ai',
  'products', 'suppliers', 'stocktake', 'invoice_control_centre', 'recipes', 'waste'
)
where plan.slug = 'plus'
on conflict do nothing;

insert into public.plan_features (plan_id, feature_key)
select plan.id, feature.feature_key
from public.plans plan
join public.features feature on feature.feature_key in (
  'dashboard', 'sales', 'invoices', 'invoice_ai',
  'products', 'suppliers', 'stocktake', 'invoice_control_centre', 'recipes', 'waste',
  'menu_costing', 'labour', 'ai_insights', 'advanced_reporting'
)
where plan.slug = 'pro'
on conflict do nothing;

-- Existing companies are explicitly kept on full Pro access. New companies
-- receive a dormant 14-day Pro trial through the trigger below; 4B will start
-- the clock only after onboarding completes.
update public.subscriptions subscription
set plan_id = pro_plan.id,
    trial_plan_id = pro_plan.id,
    status = 'active',
    trial_started_at = null,
    trial_ends_at = null,
    trial_length_days = 14,
    updated_at = now()
from public.plans pro_plan
where pro_plan.slug = 'pro';

insert into public.subscriptions (
  company_id,
  plan_id,
  trial_plan_id,
  status,
  trial_length_days,
  metadata
)
select
  company.id,
  pro_plan.id,
  pro_plan.id,
  'active'::marginflow.subscription_status,
  14,
  jsonb_build_object('provisioned_by', 'saas_foundation_4a_existing_company')
from public.companies company
cross join public.plans pro_plan
where pro_plan.slug = 'pro'
  and not exists (
    select 1
    from public.subscriptions subscription
    where subscription.company_id = company.id
  );

create or replace function public.provision_default_company_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  pro_plan_id uuid;
begin
  select id into pro_plan_id
  from public.plans
  where slug = 'pro'
    and active = true
  limit 1;

  if pro_plan_id is null then
    raise exception 'MarginFlow Pro plan must exist before creating a company';
  end if;

  insert into public.subscriptions (
    company_id,
    plan_id,
    trial_plan_id,
    status,
    trial_length_days,
    metadata
  ) values (
    new.id,
    pro_plan_id,
    pro_plan_id,
    'trialing',
    14,
    jsonb_build_object('provisioned_by', 'company_creation', 'trial_start_pending', true)
  );

  return new;
end;
$$;

drop trigger if exists provision_default_company_subscription on public.companies;
create trigger provision_default_company_subscription
  after insert on public.companies
  for each row execute function public.provision_default_company_subscription();

insert into public.internal_roles (role_key, name, description)
values
  ('super_admin', 'Super Admin', 'Full internal MarginFlow administration.'),
  ('admin', 'Admin', 'Internal company, subscription and staff administration.'),
  ('support', 'Support', 'Internal support workspace access.'),
  ('billing', 'Billing', 'Internal billing and subscription administration.')
on conflict (role_key) do update
set name = excluded.name,
    description = excluded.description,
    active = true,
    updated_at = now();

insert into public.internal_permissions (permission_key, name, description)
values
  ('companies.view', 'View companies', 'View customer company records.'),
  ('companies.edit', 'Edit companies', 'Edit customer company records.'),
  ('subscriptions.view', 'View subscriptions', 'View subscriptions and entitlements.'),
  ('subscriptions.activate', 'Activate subscriptions', 'Activate or expire a subscription.'),
  ('subscriptions.extend_trial', 'Extend trial', 'Extend a customer trial.'),
  ('subscriptions.change_plan', 'Change plan', 'Change a customer plan.'),
  ('customer_users.view', 'View customer users', 'View customer memberships.'),
  ('customer_users.disable', 'Disable customer users', 'Disable a customer membership.'),
  ('customer_users.password_reset', 'Reset customer password', 'Initiate a customer password reset.'),
  ('support.workspace_view', 'View support workspace', 'View a support workspace.'),
  ('support.workspace_write', 'Write support workspace', 'Write within a support workspace.'),
  ('staff.view', 'View internal staff', 'View internal staff accounts.'),
  ('staff.invite', 'Invite internal staff', 'Create internal staff invitations.'),
  ('staff.edit_permissions', 'Edit internal permissions', 'Change internal roles and overrides.'),
  ('staff.disable', 'Disable internal staff', 'Disable internal staff accounts.'),
  ('plans.view', 'View plans', 'View plan configuration.'),
  ('plans.manage', 'Manage plans', 'Manage plans and custom feature entitlements.'),
  ('audit.view', 'View audit', 'View internal audit entries.')
on conflict (permission_key) do update
set name = excluded.name,
    description = excluded.description,
    updated_at = now();

insert into public.internal_role_permissions (role_key, permission_key)
select 'super_admin', permission_key
from public.internal_permissions
on conflict do nothing;

insert into public.internal_role_permissions (role_key, permission_key)
values
  ('admin', 'companies.view'),
  ('admin', 'companies.edit'),
  ('admin', 'subscriptions.view'),
  ('admin', 'subscriptions.activate'),
  ('admin', 'subscriptions.extend_trial'),
  ('admin', 'subscriptions.change_plan'),
  ('admin', 'customer_users.view'),
  ('admin', 'customer_users.disable'),
  ('admin', 'customer_users.password_reset'),
  ('admin', 'staff.view'),
  ('admin', 'staff.invite'),
  ('admin', 'plans.view'),
  ('admin', 'plans.manage'),
  ('admin', 'audit.view'),
  ('support', 'companies.view'),
  ('support', 'customer_users.view'),
  ('support', 'support.workspace_view'),
  ('support', 'support.workspace_write'),
  ('billing', 'companies.view'),
  ('billing', 'subscriptions.view'),
  ('billing', 'subscriptions.activate'),
  ('billing', 'subscriptions.extend_trial'),
  ('billing', 'subscriptions.change_plan'),
  ('billing', 'plans.view')
on conflict do nothing;

create or replace function public.is_internal_staff()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.internal_staff_accounts staff
    join public.internal_roles role on role.role_key = staff.role_key
    where staff.user_id = auth.uid()
      and staff.status = 'active'
      and role.active = true
  );
$$;

create or replace function public.has_internal_permission(target_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  with staff as (
    select account.user_id, account.role_key
    from public.internal_staff_accounts account
    join public.internal_roles role on role.role_key = account.role_key
    where account.user_id = auth.uid()
      and account.status = 'active'
      and role.active = true
  ), override as (
    select permission.allowed
    from public.internal_staff_permission_overrides permission
    join staff on staff.user_id = permission.user_id
    where permission.permission_key = nullif(trim(target_permission_key), '')
  )
  select case
    when exists (select 1 from override) then (select allowed from override limit 1)
    else exists (
      select 1
      from staff
      join public.internal_role_permissions grant_permission
        on grant_permission.role_key = staff.role_key
      where grant_permission.permission_key = nullif(trim(target_permission_key), '')
    )
  end;
$$;

-- This replaces the mutable profile-metadata implementation. An internal
-- account must be explicitly created by a privileged server-side operation.
create or replace function public.is_platform_owner()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.internal_staff_accounts staff
    join public.internal_roles role on role.role_key = staff.role_key
    where staff.user_id = auth.uid()
      and staff.status = 'active'
      and role.active = true
      and staff.role_key = 'super_admin'
  );
$$;

create or replace function public.is_company_feature_beta_eligible(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.company_members member
    where member.company_id = target_company_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and trim(lower(member.role_label)) in (
        'owner',
        'company administrator',
        'company admin',
        'platform owner',
        'developer'
      )
  );
$$;

create or replace function public.get_effective_company_access(target_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  access_snapshot jsonb;
begin
  if not public.is_active_company_member(target_company_id) then
    return null;
  end if;

  with selected_subscription as (
    select subscription.*,
           plan.slug as selected_plan_key
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    where subscription.company_id = target_company_id
    order by case subscription.status
      when 'active' then 1
      when 'trialing' then 2
      when 'past_due' then 3
      when 'paused' then 4
      when 'cancelled' then 5
      when 'expired' then 6
      else 7
    end,
    subscription.created_at desc
    limit 1
  ), resolved_subscription as (
    select subscription.*,
           case
             when subscription.status = 'trialing'
               and subscription.trial_ends_at is not null
               and subscription.trial_ends_at <= now()
               then 'expired'::marginflow.subscription_status
             else subscription.status
           end as effective_status,
           case
             when subscription.status = 'trialing'
               and subscription.trial_ends_at is not null
               and subscription.trial_ends_at > now()
               then coalesce(subscription.trial_plan_id, subscription.plan_id)
             else subscription.plan_id
           end as effective_plan_id
    from selected_subscription subscription
  ), entitled_features as (
    select plan_feature.feature_key
    from resolved_subscription subscription
    join public.plan_features plan_feature on plan_feature.plan_id = subscription.effective_plan_id
    union
    select company_feature.feature_key
    from public.company_features company_feature
    where company_feature.company_id = target_company_id
      and company_feature.enabled = true
      and (
        company_feature.beta_access = false
        or public.is_company_feature_beta_eligible(target_company_id)
      )
  )
  select jsonb_build_object(
    'company_id', target_company_id,
    'subscription_id', subscription.id,
    'stored_status', subscription.status,
    'effective_status', subscription.effective_status,
    'plan_key', effective_plan.slug,
    'trial_started_at', subscription.trial_started_at,
    'trial_ends_at', subscription.trial_ends_at,
    'trial_length_days', subscription.trial_length_days,
    'trial_valid', subscription.status = 'trialing'
      and subscription.trial_ends_at is not null
      and subscription.trial_ends_at > now(),
    'write_access', subscription.effective_status = 'active'
      or (
        subscription.effective_status = 'trialing'
        and subscription.trial_ends_at is not null
        and subscription.trial_ends_at > now()
      ),
    'feature_keys', coalesce((select jsonb_agg(feature_key order by feature_key) from entitled_features), '[]'::jsonb)
  )
  into access_snapshot
  from resolved_subscription subscription
  join public.plans effective_plan on effective_plan.id = subscription.effective_plan_id;

  return coalesce(
    access_snapshot,
    jsonb_build_object(
      'company_id', target_company_id,
      'effective_status', 'expired',
      'trial_valid', false,
      'write_access', false,
      'feature_keys', '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.can_access_feature(
  target_company_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    public.get_effective_company_access(target_company_id)->'feature_keys'
      ? nullif(trim(target_feature_key), ''),
    false
  );
$$;

create or replace function public.company_subscription_allows_write(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    (public.get_effective_company_access(target_company_id)->>'write_access')::boolean,
    false
  );
$$;

create or replace function public.record_internal_audit_event(
  event_action text,
  event_entity_table text,
  event_entity_id uuid default null,
  event_company_id uuid default null,
  event_location_id uuid default null,
  event_old_record jsonb default null,
  event_new_record jsonb default null,
  event_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  audit_id uuid;
begin
  if not public.is_internal_staff() then
    raise exception 'Internal staff access is required';
  end if;

  insert into public.internal_audit_log (
    company_id,
    location_id,
    actor_id,
    action,
    entity_table,
    entity_id,
    old_record,
    new_record,
    metadata
  ) values (
    event_company_id,
    event_location_id,
    auth.uid(),
    nullif(trim(event_action), ''),
    nullif(trim(event_entity_table), ''),
    event_entity_id,
    event_old_record,
    event_new_record,
    coalesce(event_metadata, '{}'::jsonb)
  ) returning id into audit_id;

  return audit_id;
end;
$$;

create or replace function public.can_manage_company_features(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and public.has_internal_permission('plans.manage');
$$;

-- RLS and grants deliberately separate customers from internal staff. Customer
-- membership alone does not make an account internal, and no browser-exposed
-- API can create staff membership, change plans or mutate subscriptions.
alter table public.features enable row level security;
alter table public.plan_features enable row level security;
alter table public.internal_roles enable row level security;
alter table public.internal_permissions enable row level security;
alter table public.internal_role_permissions enable row level security;
alter table public.internal_staff_accounts enable row level security;
alter table public.internal_staff_permission_overrides enable row level security;
alter table public.internal_audit_log enable row level security;

drop policy if exists subscriptions_select_member on public.subscriptions;
drop policy if exists subscriptions_insert_member on public.subscriptions;
drop policy if exists subscriptions_update_member on public.subscriptions;
drop policy if exists subscriptions_delete_owner on public.subscriptions;
create policy subscriptions_select_member_or_internal
  on public.subscriptions for select to authenticated
  using (
    public.is_active_company_member(company_id)
    or public.has_internal_permission('subscriptions.view')
  );
create policy subscriptions_write_internal
  on public.subscriptions for all to authenticated
  using (
    public.has_internal_permission('subscriptions.activate')
    or public.has_internal_permission('subscriptions.extend_trial')
    or public.has_internal_permission('subscriptions.change_plan')
  )
  with check (
    public.has_internal_permission('subscriptions.activate')
    or public.has_internal_permission('subscriptions.extend_trial')
    or public.has_internal_permission('subscriptions.change_plan')
  );

drop policy if exists plans_select_authenticated on public.plans;
create policy plans_select_authenticated_or_internal
  on public.plans for select to authenticated
  using (active = true or public.has_internal_permission('plans.view'));
create policy plans_write_internal
  on public.plans for all to authenticated
  using (public.has_internal_permission('plans.manage'))
  with check (public.has_internal_permission('plans.manage'));

create policy features_select_internal
  on public.features for select to authenticated
  using (public.has_internal_permission('plans.view'));
create policy features_write_internal
  on public.features for all to authenticated
  using (public.has_internal_permission('plans.manage'))
  with check (public.has_internal_permission('plans.manage'));
create policy plan_features_select_internal
  on public.plan_features for select to authenticated
  using (public.has_internal_permission('plans.view'));
create policy plan_features_write_internal
  on public.plan_features for all to authenticated
  using (public.has_internal_permission('plans.manage'))
  with check (public.has_internal_permission('plans.manage'));

create policy internal_roles_select_staff
  on public.internal_roles for select to authenticated
  using (public.has_internal_permission('staff.view'));
create policy internal_roles_write_permission_admin
  on public.internal_roles for all to authenticated
  using (public.has_internal_permission('staff.edit_permissions'))
  with check (public.has_internal_permission('staff.edit_permissions'));
create policy internal_permissions_select_staff
  on public.internal_permissions for select to authenticated
  using (public.has_internal_permission('staff.view'));
create policy internal_permissions_write_permission_admin
  on public.internal_permissions for all to authenticated
  using (public.has_internal_permission('staff.edit_permissions'))
  with check (public.has_internal_permission('staff.edit_permissions'));
create policy internal_role_permissions_select_staff
  on public.internal_role_permissions for select to authenticated
  using (public.has_internal_permission('staff.view'));
create policy internal_role_permissions_write_permission_admin
  on public.internal_role_permissions for all to authenticated
  using (public.has_internal_permission('staff.edit_permissions'))
  with check (public.has_internal_permission('staff.edit_permissions'));
create policy internal_staff_accounts_select_self_or_staff
  on public.internal_staff_accounts for select to authenticated
  using (user_id = auth.uid() or public.has_internal_permission('staff.view'));
create policy internal_staff_accounts_write_permission_admin
  on public.internal_staff_accounts for all to authenticated
  using (
    public.has_internal_permission('staff.invite')
    or public.has_internal_permission('staff.edit_permissions')
    or public.has_internal_permission('staff.disable')
  )
  with check (
    public.has_internal_permission('staff.invite')
    or public.has_internal_permission('staff.edit_permissions')
    or public.has_internal_permission('staff.disable')
  );
create policy internal_staff_overrides_select_self_or_staff
  on public.internal_staff_permission_overrides for select to authenticated
  using (user_id = auth.uid() or public.has_internal_permission('staff.view'));
create policy internal_staff_overrides_write_permission_admin
  on public.internal_staff_permission_overrides for all to authenticated
  using (public.has_internal_permission('staff.edit_permissions'))
  with check (public.has_internal_permission('staff.edit_permissions'));
create policy internal_audit_log_select_auditor
  on public.internal_audit_log for select to authenticated
  using (public.has_internal_permission('audit.view'));

drop policy if exists company_features_select_member on public.company_features;
create policy company_features_select_member_or_internal
  on public.company_features for select to authenticated
  using (
    public.is_active_company_member(company_id)
    or public.has_internal_permission('plans.view')
  );
drop policy if exists company_features_insert_platform on public.company_features;
drop policy if exists company_features_update_platform on public.company_features;
drop policy if exists company_features_delete_platform on public.company_features;
drop policy if exists company_features_insert_platform_owner on public.company_features;
drop policy if exists company_features_update_platform_owner on public.company_features;
drop policy if exists company_features_delete_platform_owner on public.company_features;
create policy company_features_write_internal
  on public.company_features for all to authenticated
  using (public.can_manage_company_features(company_id))
  with check (public.can_manage_company_features(company_id));

grant select, insert, update, delete on table public.plans to authenticated;
grant select, insert, update, delete on table public.subscriptions to authenticated;
grant select, insert, update, delete on table public.company_features to authenticated;
grant select, insert, update, delete on table public.features to authenticated;
grant select, insert, update, delete on table public.plan_features to authenticated;
grant select, insert, update, delete on table public.internal_roles to authenticated;
grant select, insert, update, delete on table public.internal_permissions to authenticated;
grant select, insert, update, delete on table public.internal_role_permissions to authenticated;
grant select, insert, update, delete on table public.internal_staff_accounts to authenticated;
grant select, insert, update, delete on table public.internal_staff_permission_overrides to authenticated;
grant select on table public.internal_audit_log to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on table public.internal_audit_log from authenticated;
revoke all on table public.features, public.plan_features, public.internal_roles,
  public.internal_permissions, public.internal_role_permissions,
  public.internal_staff_accounts, public.internal_staff_permission_overrides,
  public.internal_audit_log from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.subscriptions from anon;
revoke all on table public.internal_audit_log from public;

revoke all on function public.is_internal_staff() from public;
revoke all on function public.has_internal_permission(text) from public;
revoke all on function public.is_platform_owner() from public;
revoke all on function public.is_company_feature_beta_eligible(uuid) from public;
revoke all on function public.get_effective_company_access(uuid) from public;
revoke all on function public.can_access_feature(uuid, text) from public;
revoke all on function public.company_subscription_allows_write(uuid) from public;
revoke all on function public.record_internal_audit_event(text, text, uuid, uuid, uuid, jsonb, jsonb, jsonb) from public;
revoke all on function public.can_manage_company_features(uuid) from public;
grant execute on function public.is_internal_staff() to authenticated;
grant execute on function public.has_internal_permission(text) to authenticated;
grant execute on function public.is_platform_owner() to authenticated;
grant execute on function public.is_company_feature_beta_eligible(uuid) to authenticated;
grant execute on function public.get_effective_company_access(uuid) to authenticated;
grant execute on function public.can_access_feature(uuid, text) to authenticated;
grant execute on function public.company_subscription_allows_write(uuid) to authenticated;
grant execute on function public.record_internal_audit_event(text, text, uuid, uuid, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.can_manage_company_features(uuid) to authenticated;

comment on table public.company_features is
  'Company-specific custom entitlements and private-beta flags. It supplements plan_features; it never represents the base plan.';
comment on function public.get_effective_company_access(uuid) is
  'Authoritative customer-scoped plan, trial and effective-entitlement snapshot. Trial expiry is time based and requires no scheduler.';
comment on function public.company_subscription_allows_write(uuid) is
  'Authoritative write-access decision for future server/RPC enforcement.';
comment on table public.internal_staff_accounts is
  'Explicit MarginFlow internal accounts. Customer company membership and customer roles never create rows here.';
comment on table public.internal_audit_log is
  'Append-only audit foundation for actions performed by authenticated internal staff.';
