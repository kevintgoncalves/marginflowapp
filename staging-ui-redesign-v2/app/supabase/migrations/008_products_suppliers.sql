-- Products and suppliers schema for MarginFlow.

create table if not exists public.suppliers (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  name text not null,
  category text,
  contact_name text,
  email text,
  phone text,
  active boolean not null default true,
  parser_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, name)
);

create table if not exists public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  pack_size text,
  quantity numeric(12, 4) not null default 1,
  unit_cost numeric(12, 4) not null default 0,
  aliases text[] not null default '{}'::text[],
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, name)
);

create table if not exists public.product_supplier_prices (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  pack_size text,
  quantity numeric(12, 4) not null default 1,
  unit_cost numeric(12, 4) not null default 0,
  effective_date date not null default current_date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.product_price_history (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_id uuid,
  price_date date not null default current_date,
  unit_cost numeric(12, 4) not null default 0,
  pack_size text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists suppliers_company_id_idx on public.suppliers(company_id);
create index if not exists suppliers_location_id_idx on public.suppliers(location_id);
create index if not exists products_company_id_idx on public.products(company_id);
create index if not exists products_location_id_idx on public.products(location_id);
create index if not exists products_supplier_id_idx on public.products(supplier_id);
create index if not exists products_department_id_idx on public.products(department_id);
create index if not exists product_supplier_prices_company_id_idx on public.product_supplier_prices(company_id);
create index if not exists product_supplier_prices_location_id_idx on public.product_supplier_prices(location_id);
create index if not exists product_supplier_prices_product_id_idx on public.product_supplier_prices(product_id);
create index if not exists product_supplier_prices_supplier_id_idx on public.product_supplier_prices(supplier_id);
create index if not exists product_supplier_prices_effective_date_idx on public.product_supplier_prices(effective_date);
create index if not exists product_price_history_company_id_idx on public.product_price_history(company_id);
create index if not exists product_price_history_location_id_idx on public.product_price_history(location_id);
create index if not exists product_price_history_product_id_idx on public.product_price_history(product_id);
create index if not exists product_price_history_supplier_id_idx on public.product_price_history(supplier_id);
create index if not exists product_price_history_price_date_idx on public.product_price_history(price_date);
