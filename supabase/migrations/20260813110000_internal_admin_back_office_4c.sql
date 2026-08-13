-- MarginFlow Internal Admin Back Office 4C
--
-- Administrative reads and mutations live behind security-definer RPCs. The
-- browser never receives a service-role credential and customer membership is
-- never treated as internal staff access.

create table if not exists public.internal_staff_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null,
  full_name text not null,
  role_key text not null references public.internal_roles(role_key),
  permission_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled', 'expired')),
  delivery_status text not null default 'not_configured' check (delivery_status in ('not_configured', 'queued', 'sent', 'failed')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, status)
);

create table if not exists public.internal_support_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists internal_staff_invites_email_idx
  on public.internal_staff_invites(lower(email), status);
create index if not exists internal_support_sessions_actor_idx
  on public.internal_support_sessions(actor_id, closed_at);
create index if not exists internal_support_sessions_company_idx
  on public.internal_support_sessions(company_id, closed_at);

alter table public.internal_staff_invites enable row level security;
alter table public.internal_support_sessions enable row level security;

create or replace function public.is_support_workspace_scope(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and public.has_internal_permission('support.workspace_view')
    and exists (
      select 1
      from public.internal_support_sessions support_session
      where support_session.actor_id = auth.uid()
        and support_session.company_id = target_company_id
        and support_session.closed_at is null
    );
$$;

-- Support Mode is read-only by default. Keep the write permission available as
-- a future explicit override, but do not grant it to the Support template.
delete from public.internal_role_permissions
where role_key = 'support'
  and permission_key = 'support.workspace_write';

create or replace function public.get_internal_admin_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  context jsonb;
begin
  if not public.is_internal_staff() then
    raise exception 'Internal staff access is required';
  end if;

  select jsonb_build_object(
    'staff', jsonb_build_object(
      'user_id', staff.user_id,
      'role_key', staff.role_key,
      'status', staff.status,
      'name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', auth_user.email),
      'email', auth_user.email,
      'created_at', staff.created_at,
      'updated_at', staff.updated_at
    ),
    'permission_keys', coalesce((
      select jsonb_agg(permission_key order by permission_key)
      from (
        select permission.permission_key
        from public.internal_staff_permission_overrides permission
        where permission.user_id = staff.user_id
          and permission.allowed = true
        union
        select grant_permission.permission_key
        from public.internal_role_permissions grant_permission
        where grant_permission.role_key = staff.role_key
          and not exists (
            select 1
            from public.internal_staff_permission_overrides override
            where override.user_id = staff.user_id
              and override.permission_key = grant_permission.permission_key
          )
      ) granted
    ), '[]'::jsonb),
    'role_templates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'role_key', role.role_key,
        'name', role.name,
        'description', role.description
      ) order by role.name)
      from public.internal_roles role
      where role.active = true
    ), '[]'::jsonb)
  )
  into context
  from public.internal_staff_accounts staff
  left join public.profiles profile on profile.id = staff.user_id
  left join auth.users auth_user on auth_user.id = staff.user_id
  where staff.user_id = auth.uid()
    and staff.status = 'active';

  return context;
end;
$$;

create or replace function public.get_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('companies.view') then
    raise exception 'Permission required: companies.view';
  end if;

  with current_subscriptions as (
    select distinct on (subscription.company_id)
      subscription.company_id,
      subscription.status,
      subscription.trial_ends_at,
      plan.slug as plan_slug
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    order by subscription.company_id,
      case subscription.status
        when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3
        when 'paused' then 4 when 'cancelled' then 5 when 'expired' then 6 else 7
      end,
      subscription.created_at desc
  ), resolved as (
    select current_subscriptions.*,
      case when status = 'trialing' and trial_ends_at is not null and trial_ends_at <= now()
        then 'expired' else status::text end as effective_status
    from current_subscriptions
  )
  select jsonb_build_object(
    'total_companies', (select count(*) from public.companies),
    'active_subscriptions', (select count(*) from resolved where effective_status = 'active'),
    'trialing_companies', (select count(*) from resolved where effective_status = 'trialing'),
    'expired_companies', (select count(*) from resolved where effective_status = 'expired'),
    'cancelled_companies', (select count(*) from resolved where effective_status = 'cancelled'),
    'plans', coalesce((select jsonb_object_agg(plan_slug, plan_count) from (
      select plan_slug, count(*) plan_count from resolved group by plan_slug
    ) plan_counts), '{}'::jsonb),
    'trials_ending_soon', (select count(*) from resolved where effective_status = 'trialing'
      and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days')
  ) into result;
  return result;
end;
$$;

create or replace function public.get_admin_companies(
  p_search text default '',
  p_status text default '',
  p_plan text default ''
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if not public.has_internal_permission('companies.view') then
    raise exception 'Permission required: companies.view';
  end if;

  with current_subscriptions as (
    select distinct on (subscription.company_id)
      subscription.company_id,
      subscription.id,
      subscription.status,
      subscription.trial_started_at,
      subscription.trial_ends_at,
      subscription.plan_id,
      plan.slug as plan_slug,
      plan.name as plan_name
    from public.subscriptions subscription
    join public.plans plan on plan.id = subscription.plan_id
    order by subscription.company_id,
      case subscription.status
        when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3
        when 'paused' then 4 when 'cancelled' then 5 when 'expired' then 6 else 7
      end,
      subscription.created_at desc
  ), rows as (
    select company.id,
      company.name,
      company.trading_name,
      coalesce(settings.country, location.country, company.country_code, 'Unknown') as country,
      coalesce(company.country_code, '') as country_code,
      coalesce(current_subscriptions.plan_slug, 'basic') as plan_slug,
      coalesce(current_subscriptions.plan_name, 'Basic') as plan_name,
      current_subscriptions.status as stored_status,
      case when current_subscriptions.status = 'trialing'
        and current_subscriptions.trial_ends_at is not null
        and current_subscriptions.trial_ends_at <= now()
        then 'expired' else coalesce(current_subscriptions.status::text, 'expired') end as subscription_status,
      current_subscriptions.trial_started_at,
      current_subscriptions.trial_ends_at,
      company.created_at,
      (select count(*) from public.company_members member where member.company_id = company.id and member.status = 'active') as customer_user_count
    from public.companies company
    left join public.company_settings settings on settings.company_id = company.id and settings.location_id is null
    left join lateral (
      select location.country from public.locations location where location.company_id = company.id order by location.created_at limit 1
    ) location on true
    left join current_subscriptions on current_subscriptions.company_id = company.id
    where (nullif(trim(p_search), '') is null or company.name ilike '%' || trim(p_search) || '%' or coalesce(company.trading_name, '') ilike '%' || trim(p_search) || '%')
      and (nullif(trim(p_status), '') is null or (case when current_subscriptions.status = 'trialing' and current_subscriptions.trial_ends_at <= now() then 'expired' else current_subscriptions.status::text end) = trim(p_status))
      and (nullif(trim(p_plan), '') is null or current_subscriptions.plan_slug = trim(p_plan))
  )
  select coalesce(jsonb_agg(to_jsonb(rows) order by rows.created_at desc), '[]'::jsonb) into result from rows;
  return result;
end;
$$;

create or replace function public.get_admin_company_detail(target_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  result jsonb;
begin
  if target_company_id is null or not public.has_internal_permission('companies.view') then
    raise exception 'Permission required: companies.view';
  end if;

  select jsonb_build_object(
    'company', to_jsonb(company),
    'settings', coalesce((select to_jsonb(settings) from public.company_settings settings where settings.company_id = company.id and settings.location_id is null limit 1), '{}'::jsonb),
    'locations', coalesce((select jsonb_agg(to_jsonb(location) order by location.created_at) from public.locations location where location.company_id = company.id), '[]'::jsonb),
    'subscription', coalesce((select jsonb_build_object(
      'id', subscription.id, 'status', subscription.status, 'effective_status', case when subscription.status = 'trialing' and subscription.trial_ends_at <= now() then 'expired' else subscription.status::text end,
      'plan_slug', plan.slug, 'plan_name', plan.name, 'trial_started_at', subscription.trial_started_at, 'trial_ends_at', subscription.trial_ends_at,
      'current_period_start', subscription.current_period_start, 'current_period_end', subscription.current_period_end, 'updated_at', subscription.updated_at
    ) from public.subscriptions subscription join public.plans plan on plan.id = subscription.plan_id where subscription.company_id = company.id order by subscription.created_at desc limit 1), '{}'::jsonb),
    'users', coalesce((select jsonb_agg(jsonb_build_object(
      'id', member.id, 'user_id', member.user_id, 'name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', auth_user.email),
      'email', auth_user.email, 'customer_role', member.role_label, 'status', member.status, 'location_id', member.location_id, 'location_name', location.name,
      'created_at', member.created_at, 'joined_at', member.joined_at, 'last_login_at', auth_user.last_sign_in_at
    ) order by member.created_at) from public.company_members member left join public.profiles profile on profile.id = member.user_id left join auth.users auth_user on auth_user.id = member.user_id left join public.locations location on location.id = member.location_id where member.company_id = company.id), '[]'::jsonb),
    'features', coalesce((select jsonb_agg(jsonb_build_object('feature_key', feature.feature_key, 'name', feature.name, 'source', 'plan', 'enabled', true) order by feature.feature_key)
      from public.plan_features plan_feature join public.features feature on feature.feature_key = plan_feature.feature_key join public.subscriptions subscription on subscription.plan_id = plan_feature.plan_id where subscription.company_id = company.id), '[]'::jsonb)
      || coalesce((select jsonb_agg(jsonb_build_object('feature_key', feature.feature_key, 'name', feature.name, 'source', 'custom', 'enabled', company_feature.enabled) order by feature.feature_key)
      from public.company_features company_feature join public.features feature on feature.feature_key = company_feature.feature_key where company_feature.company_id = company.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(audit) order by audit.created_at desc) from public.internal_audit_log audit where audit.company_id = company.id limit 50), '[]'::jsonb)
  ) into result
  from public.companies company
  where company.id = target_company_id;

  if result is null then raise exception 'Company not found'; end if;
  return result;
end;
$$;

create or replace function public.get_admin_plans()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('plans.view') then raise exception 'Permission required: plans.view'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', plan.id, 'slug', plan.slug, 'name', plan.name, 'description', plan.description, 'active', plan.active,
    'features', coalesce((select jsonb_agg(jsonb_build_object('feature_key', feature.feature_key, 'name', feature.name, 'description', feature.description) order by feature.feature_key) from public.plan_features plan_feature join public.features feature on feature.feature_key = plan_feature.feature_key where plan_feature.plan_id = plan.id), '[]'::jsonb)
  ) order by plan.slug), '[]'::jsonb) into result from public.plans plan;
  return result;
end;
$$;

create or replace function public.get_admin_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('staff.view') then raise exception 'Permission required: staff.view'; end if;
  select jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'user_id', staff.user_id, 'name', coalesce(profile.full_name, auth_user.raw_user_meta_data->>'full_name', auth_user.email), 'email', auth_user.email,
      'role_key', staff.role_key, 'status', staff.status, 'created_at', staff.created_at, 'updated_at', staff.updated_at,
      'last_login_at', auth_user.last_sign_in_at,
      'overrides', coalesce((select jsonb_object_agg(permission_key, allowed) from public.internal_staff_permission_overrides override where override.user_id = staff.user_id), '{}'::jsonb)
    ) order by staff.created_at desc) from public.internal_staff_accounts staff left join public.profiles profile on profile.id = staff.user_id left join auth.users auth_user on auth_user.id = staff.user_id), '[]'::jsonb),
    'invites', coalesce((select jsonb_agg(to_jsonb(invite) order by invite.created_at desc) from public.internal_staff_invites invite where invite.status = 'pending'), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(jsonb_build_object('permission_key', permission.permission_key, 'name', permission.name, 'description', permission.description) order by permission.permission_key) from public.internal_permissions permission), '[]'::jsonb),
    'roles', coalesce((select jsonb_agg(jsonb_build_object('role_key', role.role_key, 'name', role.name, 'description', role.description, 'permissions', coalesce((select jsonb_agg(permission_key order by permission_key) from public.internal_role_permissions grant_permission where grant_permission.role_key = role.role_key), '[]'::jsonb)) order by role.name) from public.internal_roles role where role.active), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.get_admin_audit_log(
  p_company_id uuid default null,
  p_actor_id uuid default null,
  p_action text default '',
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare result jsonb;
begin
  if not public.has_internal_permission('audit.view') then raise exception 'Permission required: audit.view'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', audit.id, 'timestamp', audit.created_at, 'action', audit.action, 'entity_table', audit.entity_table, 'entity_id', audit.entity_id,
    'company_id', audit.company_id, 'company_name', company.name, 'actor_id', audit.actor_id,
    'actor_name', coalesce(profile.full_name, auth_user.email, 'System'), 'old_record', audit.old_record, 'new_record', audit.new_record, 'metadata', audit.metadata
  ) order by audit.created_at desc), '[]'::jsonb) into result
  from public.internal_audit_log audit
  left join public.companies company on company.id = audit.company_id
  left join public.profiles profile on profile.id = audit.actor_id
  left join auth.users auth_user on auth_user.id = audit.actor_id
  where (p_company_id is null or audit.company_id = p_company_id)
    and (p_actor_id is null or audit.actor_id = p_actor_id)
    and (nullif(trim(p_action), '') is null or audit.action ilike '%' || trim(p_action) || '%')
    and (p_from is null or audit.created_at >= p_from)
    and (p_to is null or audit.created_at < p_to + interval '1 day');
  return result;
end;
$$;

create or replace function public.admin_update_subscription(
  p_company_id uuid,
  p_status text default null,
  p_plan_slug text default null,
  p_trial_ends_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_subscription public.subscriptions%rowtype;
  next_subscription public.subscriptions%rowtype;
  next_plan_id uuid;
  next_status marginflow.subscription_status;
begin
  if p_company_id is null or not public.has_internal_permission('subscriptions.view') then raise exception 'Permission required: subscriptions.view'; end if;
  if p_status is not null and p_status not in ('trialing', 'active', 'expired', 'cancelled', 'past_due', 'paused') then raise exception 'Unsupported subscription status'; end if;
  if p_status is not null and p_status in ('active', 'expired', 'cancelled') and not public.has_internal_permission('subscriptions.activate') then raise exception 'Permission required: subscriptions.activate'; end if;
  if p_status = 'trialing' and p_trial_ends_at is not null and not public.has_internal_permission('subscriptions.extend_trial') then raise exception 'Permission required: subscriptions.extend_trial'; end if;

  if p_plan_slug is not null then
    if not public.has_internal_permission('subscriptions.change_plan') then raise exception 'Permission required: subscriptions.change_plan'; end if;
    select id into next_plan_id from public.plans where slug = lower(trim(p_plan_slug)) and active = true;
    if next_plan_id is null then raise exception 'Plan not found'; end if;
  end if;

  select * into old_subscription from public.subscriptions where company_id = p_company_id order by created_at desc limit 1 for update;
  if old_subscription.id is null then raise exception 'Subscription not found'; end if;
  next_status := coalesce(p_status::marginflow.subscription_status, old_subscription.status);

  update public.subscriptions set
    status = next_status,
    plan_id = coalesce(next_plan_id, plan_id),
    trial_ends_at = case when p_trial_ends_at is not null then p_trial_ends_at else trial_ends_at end,
    cancelled_at = case when next_status = 'cancelled' then coalesce(cancelled_at, now()) else null end,
    updated_at = now(), updated_by = auth.uid()
  where id = old_subscription.id
  returning * into next_subscription;

  if old_subscription.status is distinct from next_subscription.status then
    perform public.record_internal_audit_event('subscription.status_changed', 'subscriptions', next_subscription.id, p_company_id, next_subscription.location_id, to_jsonb(old_subscription), to_jsonb(next_subscription), '{}'::jsonb);
  end if;
  if old_subscription.trial_ends_at is distinct from next_subscription.trial_ends_at then
    perform public.record_internal_audit_event('subscription.trial_extended', 'subscriptions', next_subscription.id, p_company_id, next_subscription.location_id, to_jsonb(old_subscription), to_jsonb(next_subscription), jsonb_build_object('source', 'internal_admin'));
  end if;
  if old_subscription.plan_id is distinct from next_subscription.plan_id then
    perform public.record_internal_audit_event('subscription.plan_changed', 'subscriptions', next_subscription.id, p_company_id, next_subscription.location_id, to_jsonb(old_subscription), to_jsonb(next_subscription), '{}'::jsonb);
  end if;

  return jsonb_build_object('id', next_subscription.id, 'status', next_subscription.status, 'trial_ends_at', next_subscription.trial_ends_at, 'plan_id', next_subscription.plan_id);
end;
$$;

create or replace function public.admin_invite_internal_staff(
  p_email text,
  p_full_name text,
  p_role_key text,
  p_permission_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare invite public.internal_staff_invites%rowtype;
begin
  if not public.has_internal_permission('staff.invite') then raise exception 'Permission required: staff.invite'; end if;
  if nullif(trim(p_email), '') is null or position('@' in p_email) < 2 then raise exception 'A valid staff email is required'; end if;
  if nullif(trim(p_full_name), '') is null then raise exception 'A staff name is required'; end if;
  if not exists (select 1 from public.internal_roles where role_key = lower(trim(p_role_key)) and active) then raise exception 'Role template not found'; end if;

  insert into public.internal_staff_invites (email, full_name, role_key, permission_overrides, invited_by, delivery_status)
  values (lower(trim(p_email)), trim(p_full_name), lower(trim(p_role_key)), coalesce(p_permission_overrides, '{}'::jsonb), auth.uid(), 'not_configured')
  on conflict (email, status) do update set
    full_name = excluded.full_name,
    role_key = excluded.role_key,
    permission_overrides = excluded.permission_overrides,
    invited_by = auth.uid(),
    updated_at = now()
  returning * into invite;

  perform public.record_internal_audit_event('staff.invited', 'internal_staff_invites', invite.id, null, null, null, to_jsonb(invite), jsonb_build_object('delivery', 'not_configured'));
  return jsonb_build_object('invite_id', invite.id, 'status', invite.status, 'delivery_status', invite.delivery_status);
end;
$$;

create or replace function public.claim_internal_staff_invite()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare invite public.internal_staff_invites%rowtype;
begin
  select * into invite from public.internal_staff_invites where lower(email) = lower((select email from auth.users where id = auth.uid())) and status = 'pending' order by created_at limit 1 for update;
  if invite.id is null then return false; end if;
  insert into public.internal_staff_accounts (user_id, role_key, status, created_by, updated_by)
  values (auth.uid(), invite.role_key, 'active', invite.invited_by, auth.uid())
  on conflict (user_id) do update set role_key = excluded.role_key, status = 'active', updated_by = auth.uid(), updated_at = now();
  delete from public.internal_staff_permission_overrides where user_id = auth.uid();
  insert into public.internal_staff_permission_overrides (user_id, permission_key, allowed, created_by, updated_by)
  select auth.uid(), key, value::boolean, auth.uid(), auth.uid() from jsonb_each(invite.permission_overrides) where key in (select permission_key from public.internal_permissions);
  update public.internal_staff_invites set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now() where id = invite.id;
  perform public.record_internal_audit_event('staff.invite_accepted', 'internal_staff_accounts', auth.uid(), null, null, null, jsonb_build_object('role_key', invite.role_key), jsonb_build_object('invite_id', invite.id));
  return true;
end;
$$;

create or replace function public.admin_update_internal_staff(
  p_user_id uuid,
  p_role_key text default null,
  p_status text default null,
  p_permission_overrides jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare old_staff public.internal_staff_accounts%rowtype; new_staff public.internal_staff_accounts%rowtype;
begin
  if not public.has_internal_permission('staff.edit_permissions') and not public.has_internal_permission('staff.disable') then raise exception 'Internal staff management permission required'; end if;
  if p_user_id is null then raise exception 'Staff user is required'; end if;
  if p_user_id = auth.uid() and p_status = 'disabled' then raise exception 'You cannot disable your own access'; end if;
  select * into old_staff from public.internal_staff_accounts where user_id = p_user_id for update;
  if old_staff.user_id is null then raise exception 'Staff account not found'; end if;
  if p_role_key is not null and not public.has_internal_permission('staff.edit_permissions') then raise exception 'Permission required: staff.edit_permissions'; end if;
  if p_status is not null and p_status not in ('active', 'disabled') then raise exception 'Unsupported staff status'; end if;
  if p_status is not null and not public.has_internal_permission('staff.disable') then raise exception 'Permission required: staff.disable'; end if;
  if p_role_key is not null and not exists (select 1 from public.internal_roles where role_key = lower(trim(p_role_key)) and active) then raise exception 'Role template not found'; end if;

  update public.internal_staff_accounts set role_key = coalesce(lower(trim(p_role_key)), role_key), status = coalesce(p_status, status), updated_by = auth.uid(), updated_at = now() where user_id = p_user_id returning * into new_staff;
  if p_permission_overrides is not null then
    if not public.has_internal_permission('staff.edit_permissions') then raise exception 'Permission required: staff.edit_permissions'; end if;
    delete from public.internal_staff_permission_overrides where user_id = p_user_id;
    insert into public.internal_staff_permission_overrides (user_id, permission_key, allowed, reason, created_by, updated_by)
    select p_user_id, key, value::boolean, 'Internal admin override', auth.uid(), auth.uid() from jsonb_each(p_permission_overrides) where key in (select permission_key from public.internal_permissions);
  end if;
  perform public.record_internal_audit_event(case when old_staff.status is distinct from new_staff.status and new_staff.status = 'disabled' then 'staff.disabled' else 'staff.permissions_changed' end, 'internal_staff_accounts', p_user_id, null, null, to_jsonb(old_staff), to_jsonb(new_staff), jsonb_build_object('overrides_updated', p_permission_overrides is not null));
  return jsonb_build_object('user_id', new_staff.user_id, 'role_key', new_staff.role_key, 'status', new_staff.status);
end;
$$;

create or replace function public.open_support_workspace(target_company_id uuid, target_location_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare session_row public.internal_support_sessions%rowtype; company_row public.companies%rowtype; location_name text; feature_keys jsonb;
begin
  if not public.has_internal_permission('support.workspace_view') then raise exception 'Permission required: support.workspace_view'; end if;
  select * into company_row from public.companies where id = target_company_id;
  if company_row.id is null then raise exception 'Company not found'; end if;
  if target_location_id is not null and not exists (select 1 from public.locations where id = target_location_id and company_id = target_company_id) then raise exception 'Location does not belong to company'; end if;
  update public.internal_support_sessions set closed_at = now() where actor_id = auth.uid() and closed_at is null;
  insert into public.internal_support_sessions (actor_id, company_id, location_id) values (auth.uid(), target_company_id, target_location_id) returning * into session_row;
  select name into location_name from public.locations where id = target_location_id;
  with selected_subscription as (
    select subscription.*
    from public.subscriptions subscription
    where subscription.company_id = target_company_id
    order by case subscription.status
      when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3
      when 'paused' then 4 when 'cancelled' then 5 when 'expired' then 6 else 7
    end, subscription.created_at desc
    limit 1
  ), resolved_subscription as (
    select selected.*,
      case when selected.status = 'trialing' and selected.trial_ends_at is not null and selected.trial_ends_at <= now()
        then selected.plan_id else coalesce(selected.trial_plan_id, selected.plan_id) end as effective_plan_id
    from selected_subscription selected
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
        or exists (
          select 1 from public.company_members member
          where member.company_id = target_company_id
            and member.status = 'active'
            and trim(lower(member.role_label)) in ('owner', 'company admin', 'company administrator', 'platform owner', 'developer')
        )
      )
  )
  select coalesce(jsonb_agg(feature_key order by feature_key), '[]'::jsonb)
    into feature_keys
  from (select distinct feature_key from entitled_features) distinct_features;
  perform public.record_internal_audit_event('support.workspace_opened', 'companies', target_company_id, target_company_id, target_location_id, null, jsonb_build_object('support_session_id', session_row.id), jsonb_build_object('location_name', location_name, 'read_only', true));
  return jsonb_build_object('session_id', session_row.id, 'company_id', target_company_id, 'location_id', target_location_id, 'company_name', company_row.name, 'location_name', location_name, 'feature_keys', coalesce(feature_keys, '[]'::jsonb));
end;
$$;

create or replace function public.close_support_workspace(target_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare session_row public.internal_support_sessions%rowtype;
begin
  select * into session_row from public.internal_support_sessions where id = target_session_id and actor_id = auth.uid() and closed_at is null for update;
  if session_row.id is null then raise exception 'Support session not found'; end if;
  update public.internal_support_sessions set closed_at = now() where id = target_session_id;
  perform public.record_internal_audit_event('support.workspace_closed', 'companies', session_row.company_id, session_row.company_id, session_row.location_id, null, jsonb_build_object('support_session_id', target_session_id), '{}'::jsonb);
  return true;
end;
$$;

-- Add read-only support policies to company-scoped tables. No insert/update
-- policy is granted, so Support Mode cannot mutate operational data.
do $$
declare table_name text;
begin
  foreach table_name in array[
    'locations', 'departments', 'company_settings', 'labour_settings', 'ai_settings',
    'suppliers', 'products', 'product_supplier_prices', 'product_price_history',
    'invoices', 'invoice_lines', 'invoice_line_department_splits', 'invoice_files', 'credit_notes',
    'sales_entries', 'sales_department_lines', 'employees', 'employee_rate_history', 'labour_entries', 'labour_imports',
    'holiday_bookings', 'holiday_balances', 'stocktakes', 'stocktake_lines', 'recipes', 'recipe_ingredients',
    'menu_items', 'menu_item_components', 'waste_entries', 'waste_photos', 'ai_runs', 'ai_usage', 'marginflow_cloud_state'
  ] loop
    execute format('drop policy if exists internal_support_select_%I on public.%I', table_name, table_name);
    execute format('create policy internal_support_select_%I on public.%I for select to authenticated using (public.is_support_workspace_scope(company_id))', table_name, table_name);
  end loop;
end
$$;

-- Support template receives view only; explicit workspace_write overrides remain
-- possible for a separately authorized staff account in a later release.
delete from public.internal_role_permissions where role_key = 'support' and permission_key = 'support.workspace_write';

revoke all on table public.internal_staff_invites, public.internal_support_sessions from anon, authenticated;
revoke all on function public.get_internal_admin_context() from public;
revoke all on function public.get_admin_overview() from public;
revoke all on function public.get_admin_companies(text, text, text) from public;
revoke all on function public.get_admin_company_detail(uuid) from public;
revoke all on function public.get_admin_plans() from public;
revoke all on function public.get_admin_staff() from public;
revoke all on function public.get_admin_audit_log(uuid, uuid, text, timestamptz, timestamptz) from public;
revoke all on function public.admin_update_subscription(uuid, text, text, timestamptz) from public;
revoke all on function public.admin_invite_internal_staff(text, text, text, jsonb) from public;
revoke all on function public.claim_internal_staff_invite() from public;
revoke all on function public.admin_update_internal_staff(uuid, text, text, jsonb) from public;
revoke all on function public.open_support_workspace(uuid, uuid) from public;
revoke all on function public.close_support_workspace(uuid) from public;
grant execute on function public.get_internal_admin_context() to authenticated;
grant execute on function public.get_admin_overview() to authenticated;
grant execute on function public.get_admin_companies(text, text, text) to authenticated;
grant execute on function public.get_admin_company_detail(uuid) to authenticated;
grant execute on function public.get_admin_plans() to authenticated;
grant execute on function public.get_admin_staff() to authenticated;
grant execute on function public.get_admin_audit_log(uuid, uuid, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.admin_update_subscription(uuid, text, text, timestamptz) to authenticated;
grant execute on function public.admin_invite_internal_staff(text, text, text, jsonb) to authenticated;
grant execute on function public.claim_internal_staff_invite() to authenticated;
grant execute on function public.admin_update_internal_staff(uuid, text, text, jsonb) to authenticated;
grant execute on function public.open_support_workspace(uuid, uuid) to authenticated;
grant execute on function public.close_support_workspace(uuid) to authenticated;

comment on table public.internal_staff_invites is 'Passwordless internal invitation queue. Delivery is provided by auth infrastructure, never by an admin-created password.';
comment on table public.internal_support_sessions is 'Explicit actor-to-company read-only Support Mode scope.';
comment on function public.is_support_workspace_scope(uuid) is 'RLS helper requiring an active internal support session for the exact company.';

notify pgrst, 'reload schema';
