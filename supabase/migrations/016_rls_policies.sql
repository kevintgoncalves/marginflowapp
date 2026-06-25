-- RLS helpers, triggers and baseline company-scoped policies.

create or replace function public.is_active_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    );
$$;

create or replace function public.is_company_owner(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and lower(member.role_label) = 'owner'
    );
$$;

create or replace function public.can_access_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_user_id = auth.uid()
    or exists (
      select 1
      from public.company_members current_member
      join public.company_members target_member
        on target_member.company_id = current_member.company_id
      where current_member.user_id = auth.uid()
        and current_member.status = 'active'
        and target_member.user_id = target_user_id
        and target_member.status = 'active'
    );
$$;

do $$
declare
  table_name text;
  trigger_tables text[] := array[
    'companies',
    'locations',
    'profiles',
    'company_members',
    'plans',
    'subscriptions',
    'audit_log',
    'departments',
    'company_settings',
    'labour_settings',
    'ai_settings',
    'user_page_permissions',
    'user_department_permissions',
    'user_action_permissions',
    'suppliers',
    'products',
    'product_supplier_prices',
    'product_price_history',
    'invoices',
    'invoice_lines',
    'invoice_line_department_splits',
    'invoice_files',
    'credit_notes',
    'sales_entries',
    'sales_department_lines',
    'employees',
    'employee_rate_history',
    'labour_entries',
    'labour_imports',
    'holiday_bookings',
    'holiday_balances',
    'stocktakes',
    'stocktake_lines',
    'recipes',
    'recipe_ingredients',
    'menu_items',
    'menu_item_components',
    'waste_entries',
    'waste_photos',
    'ai_runs',
    'ai_usage'
  ];
begin
  foreach table_name in array trigger_tables loop
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

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_members enable row level security;
alter table public.plans enable row level security;

create policy companies_select_member
  on public.companies for select to authenticated
  using (public.is_active_company_member(id));

create policy companies_insert_authenticated
  on public.companies for insert to authenticated
  with check (auth.uid() is not null);

create policy companies_update_owner
  on public.companies for update to authenticated
  using (public.is_company_owner(id))
  with check (public.is_company_owner(id));

create policy companies_delete_owner
  on public.companies for delete to authenticated
  using (public.is_company_owner(id));

create policy profiles_select_company_member
  on public.profiles for select to authenticated
  using (public.can_access_profile(id));

create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_delete_self
  on public.profiles for delete to authenticated
  using (id = auth.uid());

create policy company_members_select_member
  on public.company_members for select to authenticated
  using (public.is_active_company_member(company_id));

create policy company_members_insert_owner
  on public.company_members for insert to authenticated
  with check (public.is_company_owner(company_id));

create policy company_members_update_owner
  on public.company_members for update to authenticated
  using (public.is_company_owner(company_id))
  with check (public.is_company_owner(company_id));

create policy company_members_delete_owner
  on public.company_members for delete to authenticated
  using (public.is_company_owner(company_id));

create policy plans_select_authenticated
  on public.plans for select to authenticated
  using (true);

do $$
declare
  table_name text;
  company_scoped_tables text[] := array[
    'locations',
    'subscriptions',
    'audit_log',
    'departments',
    'company_settings',
    'labour_settings',
    'ai_settings',
    'user_page_permissions',
    'user_department_permissions',
    'user_action_permissions',
    'suppliers',
    'products',
    'product_supplier_prices',
    'product_price_history',
    'invoices',
    'invoice_lines',
    'invoice_line_department_splits',
    'invoice_files',
    'credit_notes',
    'sales_entries',
    'sales_department_lines',
    'employees',
    'employee_rate_history',
    'labour_entries',
    'labour_imports',
    'holiday_bookings',
    'holiday_balances',
    'stocktakes',
    'stocktake_lines',
    'recipes',
    'recipe_ingredients',
    'menu_items',
    'menu_item_components',
    'waste_entries',
    'waste_photos',
    'ai_runs',
    'ai_usage'
  ];
begin
  foreach table_name in array company_scoped_tables loop
    execute format('alter table public.%I enable row level security', table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_company_member(company_id))',
      table_name || '_select_member',
      table_name
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_active_company_member(company_id))',
      table_name || '_insert_member',
      table_name
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_active_company_member(company_id)) with check (public.is_active_company_member(company_id))',
      table_name || '_update_member',
      table_name
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_company_owner(company_id))',
      table_name || '_delete_owner',
      table_name
    );
  end loop;
end
$$;
