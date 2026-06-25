-- Stocktake schema for MarginFlow.

create table if not exists public.stocktakes (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  stocktake_date date not null default current_date,
  stocktake_type text not null default 'Stocktake',
  entry_mode text not null default 'Product List',
  opening_stock_value numeric(12, 2) not null default 0,
  closing_stock_value numeric(12, 2) not null default 0,
  total_value numeric(12, 2) not null default 0,
  status text not null default 'Saved',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.stocktake_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_name text not null,
  pack_size text,
  quantity numeric(12, 4) not null default 0,
  unit_cost numeric(12, 4) not null default 0,
  stock_value numeric(12, 2) not null default 0,
  match_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists stocktakes_company_id_idx on public.stocktakes(company_id);
create index if not exists stocktakes_location_id_idx on public.stocktakes(location_id);
create index if not exists stocktakes_department_id_idx on public.stocktakes(department_id);
create index if not exists stocktakes_stocktake_date_idx on public.stocktakes(stocktake_date);
create index if not exists stocktake_lines_company_id_idx on public.stocktake_lines(company_id);
create index if not exists stocktake_lines_location_id_idx on public.stocktake_lines(location_id);
create index if not exists stocktake_lines_stocktake_id_idx on public.stocktake_lines(stocktake_id);
create index if not exists stocktake_lines_product_id_idx on public.stocktake_lines(product_id);
create index if not exists stocktake_lines_supplier_id_idx on public.stocktake_lines(supplier_id);
