-- Bootstrap the first company and Owner membership for a newly authenticated user.

create or replace function public.create_company_with_owner(company_name text, location_name text default 'Main Location')
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

  insert into public.locations (company_id, name, created_by, updated_by)
  values (new_company_id, coalesce(nullif(trim(location_name), ''), 'Main Location'), current_user_id, current_user_id)
  returning id into new_location_id;

  insert into public.company_members (company_id, location_id, user_id, role_label, status, joined_at, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, 'Owner', 'active', now(), current_user_id, current_user_id)
  returning id into new_member_id;

  insert into public.departments (company_id, location_id, name, department_type, target_gp_percent, sort_order, created_by, updated_by)
  values
    (new_company_id, new_location_id, 'Kitchen Made', 'Food', 73, 10, current_user_id, current_user_id),
    (new_company_id, new_location_id, 'Bought In', 'Bought In', 72, 20, current_user_id, current_user_id),
    (new_company_id, new_location_id, 'Bar', 'Bar', 75, 30, current_user_id, current_user_id),
    (new_company_id, new_location_id, 'Non-food', 'Non-food', 0, 40, current_user_id, current_user_id);

  insert into public.company_settings (company_id, location_id, company_name, trading_name, created_by, updated_by)
  values (new_company_id, new_location_id, trim(company_name), trim(company_name), current_user_id, current_user_id);

  insert into public.labour_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id);

  insert into public.ai_settings (company_id, location_id, created_by, updated_by)
  values (new_company_id, new_location_id, current_user_id, current_user_id);

  return query select new_company_id, new_location_id, new_member_id;
end;
$$;

grant execute on function public.create_company_with_owner(text, text) to authenticated;
