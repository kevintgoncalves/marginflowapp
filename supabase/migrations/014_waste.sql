-- Waste schema for MarginFlow.

create table if not exists public.waste_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  waste_date date not null default current_date,
  product_name text not null,
  quantity numeric(12, 4) not null default 0,
  unit_cost numeric(12, 4) not null default 0,
  waste_cost numeric(12, 2) not null default 0,
  reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.waste_photos (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  waste_entry_id uuid not null references public.waste_entries(id) on delete cascade,
  storage_path text not null,
  original_name text,
  mime_type text,
  file_size_bytes bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists waste_entries_company_id_idx on public.waste_entries(company_id);
create index if not exists waste_entries_location_id_idx on public.waste_entries(location_id);
create index if not exists waste_entries_department_id_idx on public.waste_entries(department_id);
create index if not exists waste_entries_product_id_idx on public.waste_entries(product_id);
create index if not exists waste_entries_supplier_id_idx on public.waste_entries(supplier_id);
create index if not exists waste_entries_waste_date_idx on public.waste_entries(waste_date);
create index if not exists waste_photos_company_id_idx on public.waste_photos(company_id);
create index if not exists waste_photos_location_id_idx on public.waste_photos(location_id);
create index if not exists waste_photos_waste_entry_id_idx on public.waste_photos(waste_entry_id);
