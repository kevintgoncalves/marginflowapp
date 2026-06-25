-- Fix first company bootstrap permissions.
-- This keeps RLS enabled and allows an authenticated user to create their first company,
-- first location and Owner membership safely.

-- Supabase API roles still need table privileges; RLS policies decide which rows are allowed.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.plans to anon;

-- Helper: true only when a company has no members yet.
create or replace function public.company_has_no_members(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and not exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
    );
$$;

grant execute on function public.company_has_no_members(uuid) to authenticated;

-- Replace the impossible first-owner insert policy.
-- Old policy required the user to already be owner before the first owner row existed.
drop policy if exists company_members_insert_owner on public.company_members;
drop policy if exists company_members_insert_owner_or_self_bootstrap on public.company_members;

create policy company_members_insert_owner_or_self_bootstrap
  on public.company_members
  for insert
  to authenticated
  with check (
    public.is_company_owner(company_id)
    or (
      user_id = auth.uid()
      and lower(role_label) = 'owner'
      and status = 'active'
      and public.company_has_no_members(company_id)
    )
  );

-- Allow the first location to be inserted before the Owner membership exists.
drop policy if exists locations_bootstrap_insert on public.locations;
create policy locations_bootstrap_insert
  on public.locations
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and public.company_has_no_members(company_id)
  );

-- Recreate the bootstrap RPC so the frontend only needs one safe call.
create or replace function public.create_company_with_owner(
  company_name text,
  location_name text default 'Main Location'
)
returns table(company_id uuid, location_id uuid, member_id uuid)
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  current_user_id uuid := auth.uid();
  current_email text;
  current_name text;
  new_company_id uuid;
  new_location_id uuid;
  new_member_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required to create a company.';
  end if;

  if nullif(trim(company_name), '') is null then
    raise exception 'Company name is required.';
  end if;

  -- If the user already belongs to an active company, return the first one instead of duplicating.
  select member.company_id, member.location_id, member.id
    into new_company_id, new_location_id, new_member_id
  from public.company_members member
  where member.user_id = current_user_id
    and member.status = 'active'
  order by member.created_at asc
  limit 1;

  if new_company_id is not null then
    return query select new_company_id, new_location_id, new_member_id;
    return;
  end if;

  select
    auth_user.email,
    coalesce(auth_user.raw_user_meta_data->>'full_name', auth_user.raw_user_meta_data->>'name', auth_user.email)
  into current_email, current_name
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  insert into public.profiles (id, full_name, email, created_by, updated_by)
  values (current_user_id, current_name, current_email, current_user_id, current_user_id)
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    email = coalesce(excluded.email, public.profiles.email),
    updated_by = current_user_id,
    updated_at = now();

  insert into public.companies (name, trading_name, status, created_by, updated_by)
  values (trim(company_name), trim(company_name), 'active', current_user_id, current_user_id)
  returning id into new_company_id;

  insert into public.locations (company_id, name, status, created_by, updated_by)
  values (
    new_company_id,
    coalesce(nullif(trim(location_name), ''), 'Main Location'),
    'active',
    current_user_id,
    current_user_id
  )
  returning id into new_location_id;

  insert into public.company_members (
    company_id,
    location_id,
    user_id,
    role_label,
    status,
    joined_at,
    created_by,
    updated_by
  )
  values (
    new_company_id,
    new_location_id,
    current_user_id,
    'Owner',
    'active',
    now(),
    current_user_id,
    current_user_id
  )
  returning id into new_member_id;

  insert into public.departments (
    company_id,
    location_id,
    name,
    department_type,
    target_gp_percent,
    sort_order,
    created_by,
    updated_by
  )
  values
    (new_company_id, new_location_id, 'Kitchen Made', 'Food', 73, 10, current_user_id, current_user_id),
    (new_company_id, new_location_id, 'Bought In', 'Bought In', 72, 20, current_user_id, current_user_id),
    (new_company_id, new_location_id, 'Bar', 'Bar', 75, 30, current_user_id, current_user_id),
    (new_company_id, new_location_id, 'Non-food', 'Non-food', 0, 40, current_user_id, current_user_id)
  on conflict do nothing;

  insert into public.company_settings (company_id, location_id, company_name, trading_name, created_by, updated_by)
  values (new_company_id, new_location_id, trim(company_name), trim(company_name), current_user_id, current_user_id)
  on conflict do nothing;

  insert into public.labour_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id)
  on conflict do nothing;

  insert into public.ai_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id)
  on conflict do nothing;

  return query select new_company_id, new_location_id, new_member_id;
end;
$$;

grant execute on function public.create_company_with_owner(text, text) to authenticated;
