-- Sales schema for MarginFlow.

create table if not exists public.sales_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  sales_date date not null default current_date,
  gross_sales numeric(12, 2) not null default 0,
  net_sales numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  service_charge numeric(12, 2) not null default 0,
  discounts numeric(12, 2) not null default 0,
  refunds numeric(12, 2) not null default 0,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.sales_department_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  sales_entry_id uuid not null references public.sales_entries(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  gross_sales numeric(12, 2) not null default 0,
  net_sales numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  service_charge numeric(12, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists sales_entries_company_id_idx on public.sales_entries(company_id);
create index if not exists sales_entries_location_id_idx on public.sales_entries(location_id);
create index if not exists sales_entries_sales_date_idx on public.sales_entries(sales_date);
create index if not exists sales_department_lines_company_id_idx on public.sales_department_lines(company_id);
create index if not exists sales_department_lines_location_id_idx on public.sales_department_lines(location_id);
create index if not exists sales_department_lines_sales_entry_id_idx on public.sales_department_lines(sales_entry_id);
create index if not exists sales_department_lines_department_id_idx on public.sales_department_lines(department_id);
