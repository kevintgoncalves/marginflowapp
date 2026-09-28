-- Learned invoice product mappings, supplier AI profiles, split rules and correction audit history.

create table if not exists public.supplier_ai_profiles (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  layout_notes text,
  default_department_id uuid references public.departments(id) on delete set null,
  example_invoice_text text,
  example_corrected_json jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.supplier_product_mappings (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  supplier_product_code text,
  normalized_supplier_product_code text not null default '',
  supplier_description text,
  normalized_supplier_description text not null default '',
  product_id uuid not null references public.products(id) on delete restrict,
  allocation_mode text not null default 'Single',
  department_id uuid references public.departments(id) on delete set null,
  auto_apply boolean not null default false,
  confirmation_count integer not null default 0,
  active boolean not null default true,
  first_confirmed_invoice_id uuid references public.invoices(id) on delete set null,
  last_confirmed_invoice_id uuid references public.invoices(id) on delete set null,
  last_confirmed_at timestamptz,
  superseded_by_mapping_id uuid references public.supplier_product_mappings(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint supplier_product_mappings_allocation_mode_check
    check (allocation_mode in ('department', 'split', 'Single', 'Split', 'Kitchen', 'Bar', 'Bought In', 'Non-food', 'Excluded')),
  constraint supplier_product_mappings_confirmations_check
    check (confirmation_count >= 0),
  constraint supplier_product_mappings_identifier_check
    check (normalized_supplier_product_code <> '' or normalized_supplier_description <> '')
);

create table if not exists public.supplier_product_split_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_product_mapping_id uuid not null references public.supplier_product_mappings(id) on delete cascade,
  split_mode text not null default 'percentage',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint supplier_product_split_rules_split_mode_check
    check (split_mode in ('percentage', 'quantity_ratio', 'fixed_value'))
);

create table if not exists public.supplier_product_split_rule_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  split_rule_id uuid not null references public.supplier_product_split_rules(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  percentage numeric(7, 4),
  quantity_ratio numeric(12, 6),
  fixed_value numeric(12, 4),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint supplier_product_split_rule_lines_non_negative_check
    check (
      coalesce(percentage, 0) >= 0
      and coalesce(quantity_ratio, 0) >= 0
      and coalesce(fixed_value, 0) >= 0
    )
);

create table if not exists public.invoice_line_corrections (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete cascade,
  invoice_line_id uuid references public.invoice_lines(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  supplier_product_code text,
  product_name text,
  field_name text not null,
  original_value jsonb,
  corrected_value jsonb,
  correction_hash text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint invoice_line_corrections_field_name_check
    check (field_name in (
      'product',
      'productName',
      'productId',
      'matchedProductId',
      'quantity',
      'unitCost',
      'lineTotal',
      'department',
      'destination',
      'allocationMode',
      'departmentMode',
      'departmentSplits',
      'split',
      'supplierProductCode',
      'packSize',
      'unitOfMeasure',
      'rawDescription'
    ))
);

create unique index if not exists supplier_ai_profiles_scope_supplier_idx
  on public.supplier_ai_profiles(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id);
create index if not exists supplier_ai_profiles_company_id_idx on public.supplier_ai_profiles(company_id);
create index if not exists supplier_ai_profiles_location_id_idx on public.supplier_ai_profiles(location_id);
create index if not exists supplier_ai_profiles_supplier_id_idx on public.supplier_ai_profiles(supplier_id);

create index if not exists supplier_product_mappings_company_id_idx on public.supplier_product_mappings(company_id);
create index if not exists supplier_product_mappings_location_id_idx on public.supplier_product_mappings(location_id);
create index if not exists supplier_product_mappings_supplier_id_idx on public.supplier_product_mappings(supplier_id);
create index if not exists supplier_product_mappings_product_id_idx on public.supplier_product_mappings(product_id);
create index if not exists supplier_product_mappings_code_idx on public.supplier_product_mappings(normalized_supplier_product_code);
create index if not exists supplier_product_mappings_description_idx on public.supplier_product_mappings(normalized_supplier_description);
create unique index if not exists supplier_product_mappings_active_code_idx
  on public.supplier_product_mappings(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id, normalized_supplier_product_code)
  where active and normalized_supplier_product_code <> '';
create unique index if not exists supplier_product_mappings_active_description_idx
  on public.supplier_product_mappings(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id, normalized_supplier_description)
  where active and normalized_supplier_product_code = '' and normalized_supplier_description <> '';

create index if not exists supplier_product_split_rules_company_id_idx on public.supplier_product_split_rules(company_id);
create index if not exists supplier_product_split_rules_location_id_idx on public.supplier_product_split_rules(location_id);
create index if not exists supplier_product_split_rules_mapping_id_idx on public.supplier_product_split_rules(supplier_product_mapping_id);
create unique index if not exists supplier_product_split_rules_active_mapping_idx
  on public.supplier_product_split_rules(supplier_product_mapping_id)
  where active;

create index if not exists supplier_product_split_rule_lines_company_id_idx on public.supplier_product_split_rule_lines(company_id);
create index if not exists supplier_product_split_rule_lines_location_id_idx on public.supplier_product_split_rule_lines(location_id);
create index if not exists supplier_product_split_rule_lines_rule_id_idx on public.supplier_product_split_rule_lines(split_rule_id);
create index if not exists supplier_product_split_rule_lines_department_id_idx on public.supplier_product_split_rule_lines(department_id);

create index if not exists invoice_line_corrections_company_id_idx on public.invoice_line_corrections(company_id);
create index if not exists invoice_line_corrections_location_id_idx on public.invoice_line_corrections(location_id);
create index if not exists invoice_line_corrections_supplier_id_idx on public.invoice_line_corrections(supplier_id);
create index if not exists invoice_line_corrections_invoice_id_idx on public.invoice_line_corrections(invoice_id);
create index if not exists invoice_line_corrections_invoice_line_id_idx on public.invoice_line_corrections(invoice_line_id);
create index if not exists invoice_line_corrections_product_id_idx on public.invoice_line_corrections(product_id);
create unique index if not exists invoice_line_corrections_hash_idx
  on public.invoice_line_corrections(company_id, correction_hash);

alter table public.supplier_ai_profiles enable row level security;
alter table public.supplier_product_mappings enable row level security;
alter table public.supplier_product_split_rules enable row level security;
alter table public.supplier_product_split_rule_lines enable row level security;
alter table public.invoice_line_corrections enable row level security;

do $$
declare
  table_name text;
  company_scoped_tables text[] := array[
    'supplier_ai_profiles',
    'supplier_product_mappings',
    'supplier_product_split_rules',
    'supplier_product_split_rule_lines',
    'invoice_line_corrections'
  ];
begin
  foreach table_name in array company_scoped_tables loop
    execute format('drop policy if exists %I on public.%I', table_name || '_select_member', table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_active_company_member(company_id))',
      table_name || '_select_member',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_insert_member', table_name);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_active_company_member(company_id))',
      table_name || '_insert_member',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_update_member', table_name);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_active_company_member(company_id)) with check (public.is_active_company_member(company_id))',
      table_name || '_update_member',
      table_name
    );

    execute format('drop policy if exists %I on public.%I', table_name || '_delete_owner', table_name);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_company_owner(company_id))',
      table_name || '_delete_owner',
      table_name
    );

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
