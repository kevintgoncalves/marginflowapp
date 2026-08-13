-- MarginFlow Customer Onboarding 4B
--
-- This migration adds the persisted onboarding state for newly-created
-- customer workspaces. Existing companies remain complete and active.

alter table public.companies
  add column if not exists country_code text,
  add column if not exists onboarding_status text not null default 'complete'
    check (onboarding_status in ('not_started', 'in_progress', 'complete')),
  add column if not exists onboarding_step text,
  add column if not exists onboarding_owner_id uuid references auth.users(id) on delete set null,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.company_settings
  add column if not exists country_code text,
  add column if not exists language text,
  add column if not exists currency text,
  add column if not exists timezone text,
  add column if not exists default_vat_percent numeric(7, 2),
  add column if not exists week_starts_on text,
  add column if not exists target_gp_percent numeric(7, 2);

create unique index if not exists companies_incomplete_onboarding_owner_idx
  on public.companies(onboarding_owner_id)
  where onboarding_owner_id is not null
    and onboarding_status in ('not_started', 'in_progress');
create index if not exists companies_onboarding_status_idx
  on public.companies(onboarding_status);

create or replace function public.is_customer_onboarding_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and exists (
      select 1
      from public.companies company
      join public.company_members member on member.company_id = company.id
      where company.id = target_company_id
        and company.onboarding_status in ('not_started', 'in_progress')
        and company.onboarding_owner_id = auth.uid()
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(trim(member.role_label)) = 'owner'
    );
$$;

create or replace function public.validate_customer_onboarding_values(
  p_company_name text,
  p_country_code text,
  p_country_name text,
  p_language text,
  p_currency text,
  p_timezone text,
  p_default_vat numeric,
  p_week_starts_on text,
  p_target_gp numeric
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if nullif(trim(p_company_name), '') is null
    or lower(trim(p_company_name)) = 'my company' then
    raise exception 'A company name is required.';
  end if;

  if coalesce(trim(p_country_code), '') !~ '^[A-Z]{2}$'
    or nullif(trim(p_country_name), '') is null then
    raise exception 'A valid country is required.';
  end if;

  if coalesce(trim(p_language), '') not in ('en', 'pt') then
    raise exception 'Choose a supported language.';
  end if;

  if coalesce(trim(p_currency), '') !~ '^[A-Z]{3}$' then
    raise exception 'Choose a valid ISO currency.';
  end if;

  if not exists (select 1 from pg_timezone_names where name = trim(p_timezone)) then
    raise exception 'Choose a valid IANA timezone.';
  end if;

  if p_default_vat is null or p_default_vat < 0 or p_default_vat > 100 then
    raise exception 'Default VAT must be between 0 and 100.';
  end if;

  if trim(p_week_starts_on) not in ('Monday', 'Sunday') then
    raise exception 'Week start must be Monday or Sunday.';
  end if;

  if p_target_gp is null or p_target_gp <= 0 or p_target_gp > 100 then
    raise exception 'Default target GP must be greater than 0 and no more than 100.';
  end if;
end;
$$;

create or replace function public.begin_customer_onboarding(
  p_company_name text,
  p_country_code text,
  p_country_name text,
  p_language text,
  p_currency text,
  p_timezone text,
  p_default_vat numeric,
  p_week_starts_on text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_name text;
  existing_company_id uuid;
  existing_location_id uuid;
  new_company_id uuid;
  new_location_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to start onboarding.';
  end if;

  if public.is_internal_staff() then
    raise exception 'Internal staff accounts do not use customer onboarding.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(current_user_id::text, 0));

  perform public.validate_customer_onboarding_values(
    p_company_name,
    p_country_code,
    p_country_name,
    p_language,
    p_currency,
    p_timezone,
    p_default_vat,
    p_week_starts_on,
    75
  );

  select company.id, member.location_id
  into existing_company_id, existing_location_id
  from public.companies company
  join public.company_members member on member.company_id = company.id
  where company.onboarding_owner_id = current_user_id
    and company.onboarding_status in ('not_started', 'in_progress')
    and member.user_id = current_user_id
    and member.status = 'active'
    and lower(trim(member.role_label)) = 'owner'
  order by company.created_at asc
  limit 1
  for update of company;

  if existing_company_id is not null then
    return jsonb_build_object(
      'company_id', existing_company_id,
      'location_id', existing_location_id,
      'created', false
    );
  end if;

  if exists (
    select 1
    from public.company_members member
    join public.companies company on company.id = member.company_id
    where member.user_id = current_user_id
      and member.status = 'active'
      and company.onboarding_status = 'complete'
  ) then
    raise exception 'This account already belongs to an operational company.';
  end if;

  select
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name', auth_user.email)
  into current_email, current_name
  from auth.users auth_user
  where auth_user.id = current_user_id;

  insert into public.profiles (id, full_name, email, created_by, updated_by)
  values (current_user_id, current_name, current_email, current_user_id, current_user_id)
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    updated_by = current_user_id,
    updated_at = now();

  insert into public.companies (
    name,
    trading_name,
    status,
    country_code,
    timezone,
    currency,
    onboarding_status,
    onboarding_step,
    onboarding_owner_id,
    created_by,
    updated_by
  ) values (
    trim(p_company_name),
    trim(p_company_name),
    'active',
    trim(p_country_code),
    trim(p_timezone),
    trim(p_currency),
    'in_progress',
    'regional',
    current_user_id,
    current_user_id,
    current_user_id
  ) returning id into new_company_id;

  insert into public.locations (
    company_id,
    name,
    country,
    timezone,
    created_by,
    updated_by
  ) values (
    new_company_id,
    'Main Location',
    trim(p_country_name),
    trim(p_timezone),
    current_user_id,
    current_user_id
  ) returning id into new_location_id;

  insert into public.company_members (
    company_id,
    location_id,
    user_id,
    role_label,
    status,
    joined_at,
    created_by,
    updated_by
  ) values (
    new_company_id,
    new_location_id,
    current_user_id,
    'Owner',
    'active',
    now(),
    current_user_id,
    current_user_id
  );

  insert into public.company_settings (
    company_id,
    location_id,
    company_name,
    trading_name,
    country,
    country_code,
    language,
    currency,
    timezone,
    default_vat_percent,
    week_starts_on,
    target_gp_percent,
    settings,
    created_by,
    updated_by
  ) values (
    new_company_id,
    new_location_id,
    trim(p_company_name),
    trim(p_company_name),
    trim(p_country_name),
    trim(p_country_code),
    trim(p_language),
    trim(p_currency),
    trim(p_timezone),
    p_default_vat,
    trim(p_week_starts_on),
    75,
    jsonb_build_object('onboarding_regional_overrides', '{}'::jsonb),
    current_user_id,
    current_user_id
  );

  insert into public.labour_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id);
  insert into public.ai_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id);

  return jsonb_build_object(
    'company_id', new_company_id,
    'location_id', new_location_id,
    'created', true
  );
end;
$$;

create or replace function public.save_customer_onboarding_progress(
  p_company_id uuid,
  p_onboarding_step text,
  p_company_name text,
  p_country_code text,
  p_country_name text,
  p_language text,
  p_currency text,
  p_timezone text,
  p_default_vat numeric,
  p_week_starts_on text,
  p_target_gp numeric,
  p_regional_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  onboarding_location_id uuid;
begin
  if not public.is_customer_onboarding_owner(p_company_id) then
    raise exception 'Only the onboarding owner can update this workspace.';
  end if;

  if trim(coalesce(p_onboarding_step, '')) not in ('business', 'regional', 'financial', 'departments', 'review') then
    raise exception 'Invalid onboarding step.';
  end if;

  perform public.validate_customer_onboarding_values(
    p_company_name,
    p_country_code,
    p_country_name,
    p_language,
    p_currency,
    p_timezone,
    p_default_vat,
    p_week_starts_on,
    p_target_gp
  );

  select member.location_id into onboarding_location_id
  from public.company_members member
  where member.company_id = p_company_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  update public.companies
  set name = coalesce(nullif(trim(p_company_name), ''), name),
      trading_name = coalesce(nullif(trim(p_company_name), ''), trading_name),
      country_code = coalesce(nullif(trim(p_country_code), ''), country_code),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      currency = coalesce(nullif(trim(p_currency), ''), currency),
      onboarding_step = trim(p_onboarding_step),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_company_id;

  update public.locations
  set country = coalesce(nullif(trim(p_country_name), ''), country),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      updated_by = auth.uid(),
      updated_at = now()
  where id = onboarding_location_id;

  update public.company_settings
  set company_name = coalesce(nullif(trim(p_company_name), ''), company_name),
      trading_name = coalesce(nullif(trim(p_company_name), ''), trading_name),
      country = coalesce(nullif(trim(p_country_name), ''), country),
      country_code = coalesce(nullif(trim(p_country_code), ''), country_code),
      language = coalesce(nullif(trim(p_language), ''), language),
      currency = coalesce(nullif(trim(p_currency), ''), currency),
      timezone = coalesce(nullif(trim(p_timezone), ''), timezone),
      default_vat_percent = coalesce(p_default_vat, default_vat_percent),
      week_starts_on = coalesce(nullif(trim(p_week_starts_on), ''), week_starts_on),
      target_gp_percent = coalesce(p_target_gp, target_gp_percent),
      settings = jsonb_set(
        coalesce(settings, '{}'::jsonb),
        '{onboarding_regional_overrides}',
        coalesce(p_regional_overrides, '{}'::jsonb),
        true
      ),
      updated_by = auth.uid(),
      updated_at = now()
  where company_id = p_company_id
    and location_id is not distinct from onboarding_location_id;

  return public.get_customer_onboarding_state(p_company_id);
end;
$$;

create or replace function public.save_customer_onboarding_departments(
  p_company_id uuid,
  p_departments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  onboarding_location_id uuid;
  default_target_gp numeric;
  department_record record;
  department_count integer;
  distinct_department_count integer;
begin
  if not public.is_customer_onboarding_owner(p_company_id) then
    raise exception 'Only the onboarding owner can update departments.';
  end if;

  if jsonb_typeof(p_departments) <> 'array' then
    raise exception 'Departments must be an array.';
  end if;

  select count(*), count(distinct lower(trim(value->>'name')))
  into department_count, distinct_department_count
  from jsonb_array_elements(p_departments);

  if department_count < 1 then
    raise exception 'At least one department is required.';
  end if;

  if department_count <> distinct_department_count
    or exists (
      select 1
      from jsonb_array_elements(p_departments) department
      where nullif(trim(department.value->>'name'), '') is null
    ) then
    raise exception 'Department names must be non-empty and unique.';
  end if;

  select member.location_id into onboarding_location_id
  from public.company_members member
  where member.company_id = p_company_id
    and member.user_id = auth.uid()
    and member.status = 'active'
  limit 1;

  select target_gp_percent into default_target_gp
  from public.company_settings
  where company_id = p_company_id
    and location_id is not distinct from onboarding_location_id
  limit 1;

  delete from public.departments
  where company_id = p_company_id
    and location_id is not distinct from onboarding_location_id;

  for department_record in
    select trim(value->>'name') as name, ordinality
    from jsonb_array_elements(p_departments) with ordinality
  loop
    insert into public.departments (
      company_id,
      location_id,
      name,
      department_type,
      target_gp_percent,
      sort_order,
      created_by,
      updated_by
    ) values (
      p_company_id,
      onboarding_location_id,
      department_record.name,
      'Food',
      coalesce(default_target_gp, 75),
      department_record.ordinality * 10,
      auth.uid(),
      auth.uid()
    );
  end loop;

  update public.companies
  set onboarding_step = 'review',
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_company_id;

  return public.get_customer_onboarding_state(p_company_id);
end;
$$;

create or replace function public.get_customer_onboarding_state(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  state jsonb;
begin
  if not public.is_active_company_member(p_company_id) then
    raise exception 'Company membership is required.';
  end if;

  select jsonb_build_object(
    'company', jsonb_build_object(
      'id', company.id,
      'name', company.name,
      'trading_name', company.trading_name,
      'country_code', company.country_code,
      'timezone', company.timezone,
      'currency', company.currency,
      'onboarding_status', company.onboarding_status,
      'onboarding_step', company.onboarding_step,
      'onboarding_completed_at', company.onboarding_completed_at
    ),
    'settings', jsonb_build_object(
      'company_name', settings.company_name,
      'trading_name', settings.trading_name,
      'country', settings.country,
      'country_code', settings.country_code,
      'language', settings.language,
      'currency', settings.currency,
      'timezone', settings.timezone,
      'default_vat_percent', settings.default_vat_percent,
      'week_starts_on', settings.week_starts_on,
      'target_gp_percent', settings.target_gp_percent,
      'regional_overrides', coalesce(settings.settings->'onboarding_regional_overrides', '{}'::jsonb)
    ),
    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', department.id,
        'name', department.name,
        'sort_order', department.sort_order
      ) order by department.sort_order, department.name)
      from public.departments department
      where department.company_id = company.id
        and department.location_id is not distinct from member.location_id
        and department.active = true
    ), '[]'::jsonb)
  ) into state
  from public.companies company
  join public.company_members member
    on member.company_id = company.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  left join public.company_settings settings
    on settings.company_id = company.id
   and settings.location_id is not distinct from member.location_id
  where company.id = p_company_id
  limit 1;

  return state;
end;
$$;

create or replace function public.complete_customer_onboarding(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  onboarding_location_id uuid;
  workspace record;
  subscription record;
  department_total integer;
  trial_started timestamptz;
  trial_ends timestamptz;
begin
  select company.*, member.location_id
  into workspace
  from public.companies company
  join public.company_members member
    on member.company_id = company.id
   and member.user_id = auth.uid()
   and member.status = 'active'
  where company.id = p_company_id
  limit 1
  for update of company;

  if workspace.id is null then
    raise exception 'Company membership is required.';
  end if;

  onboarding_location_id := workspace.location_id;

  if workspace.onboarding_status = 'complete' then
    select * into subscription
    from public.subscriptions
    where company_id = p_company_id
    order by created_at desc
    limit 1;

    return jsonb_build_object(
      'company_id', p_company_id,
      'location_id', onboarding_location_id,
      'onboarding_complete', true,
      'trial_started_at', subscription.trial_started_at,
      'trial_ends_at', subscription.trial_ends_at,
      'subscription_status', subscription.status
    );
  end if;

  if not public.is_customer_onboarding_owner(p_company_id) then
    raise exception 'Only the onboarding owner can complete this workspace.';
  end if;

  select * into workspace
  from public.company_settings settings
  where settings.company_id = p_company_id
    and settings.location_id is not distinct from onboarding_location_id
  limit 1
  for update;

  if workspace.id is null then
    raise exception 'Onboarding settings are missing.';
  end if;

  perform public.validate_customer_onboarding_values(
    workspace.company_name,
    workspace.country_code,
    workspace.country,
    workspace.language,
    workspace.currency,
    workspace.timezone,
    workspace.default_vat_percent,
    workspace.week_starts_on,
    workspace.target_gp_percent
  );

  select count(*) into department_total
  from public.departments department
  where department.company_id = p_company_id
    and department.location_id is not distinct from onboarding_location_id
    and department.active = true;

  if department_total < 1 then
    raise exception 'At least one department is required before starting MarginFlow.';
  end if;

  select * into subscription
  from public.subscriptions
  where company_id = p_company_id
  order by created_at desc
  limit 1
  for update;

  if subscription.id is null then
    raise exception 'Subscription provisioning is missing.';
  end if;

  trial_started := coalesce(subscription.trial_started_at, now());
  trial_ends := coalesce(
    subscription.trial_ends_at,
    trial_started + make_interval(days => subscription.trial_length_days)
  );

  update public.subscriptions
  set status = 'trialing',
      trial_started_at = trial_started,
      trial_ends_at = trial_ends,
      cancelled_at = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = subscription.id;

  update public.companies
  set onboarding_status = 'complete',
      onboarding_step = 'complete',
      onboarding_completed_at = now(),
      onboarding_owner_id = null,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_company_id;

  return jsonb_build_object(
    'company_id', p_company_id,
    'location_id', onboarding_location_id,
    'onboarding_complete', true,
    'trial_started_at', trial_started,
    'trial_ends_at', trial_ends,
    'subscription_status', 'trialing'
  );
end;
$$;

-- The older bootstrap RPC remains callable for compatibility, but can no
-- longer create an operational workspace or fixed departments. It starts the
-- same incomplete customer-onboarding workflow with United Kingdom defaults.
create or replace function public.create_company_with_owner(company_name text, location_name text default 'Main Location')
returns table(company_id uuid, location_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  onboarding jsonb;
  new_member_id uuid;
begin
  select public.begin_customer_onboarding(
    company_name,
    'GB',
    'United Kingdom',
    'en',
    'GBP',
    'Europe/London',
    20,
    'Monday'
  ) into onboarding;

  select id into new_member_id
  from public.company_members
  where company_id = (onboarding->>'company_id')::uuid
    and user_id = auth.uid()
  limit 1;

  return query select
    (onboarding->>'company_id')::uuid,
    (onboarding->>'location_id')::uuid,
    new_member_id;
end;
$$;

-- Company identity and onboarding state are now changed only by the guarded
-- RPCs above. Existing application settings continue to sync through their
-- current cloud-state path.
revoke insert, update, delete on table public.companies from authenticated;
drop policy if exists companies_insert_authenticated on public.companies;

revoke all on function public.is_customer_onboarding_owner(uuid) from public;
revoke all on function public.validate_customer_onboarding_values(text, text, text, text, text, text, numeric, text, numeric) from public;
revoke all on function public.begin_customer_onboarding(text, text, text, text, text, text, numeric, text) from public;
revoke all on function public.save_customer_onboarding_progress(uuid, text, text, text, text, text, text, text, numeric, text, numeric, jsonb) from public;
revoke all on function public.save_customer_onboarding_departments(uuid, jsonb) from public;
revoke all on function public.get_customer_onboarding_state(uuid) from public;
revoke all on function public.complete_customer_onboarding(uuid) from public;
revoke all on function public.create_company_with_owner(text, text) from public;
grant execute on function public.is_customer_onboarding_owner(uuid) to authenticated;
grant execute on function public.begin_customer_onboarding(text, text, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.save_customer_onboarding_progress(uuid, text, text, text, text, text, text, text, numeric, text, numeric, jsonb) to authenticated;
grant execute on function public.save_customer_onboarding_departments(uuid, jsonb) to authenticated;
grant execute on function public.get_customer_onboarding_state(uuid) to authenticated;
grant execute on function public.complete_customer_onboarding(uuid) to authenticated;
grant execute on function public.create_company_with_owner(text, text) to authenticated;

comment on column public.companies.onboarding_status is
  'Authoritative customer workspace onboarding state. Existing companies remain complete; new workspaces become operational only through complete_customer_onboarding.';
comment on function public.complete_customer_onboarding(uuid) is
  'Idempotent server-side onboarding finalization. Validates real settings and departments, then starts the 14-day Pro trial atomically.';
