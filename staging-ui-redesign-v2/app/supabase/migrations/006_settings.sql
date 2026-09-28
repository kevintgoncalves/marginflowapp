-- Settings schema for MarginFlow.

create table if not exists public.departments (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  name text not null,
  department_type text not null default 'Food',
  target_gp_percent numeric(7, 2) not null default 0,
  active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.company_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  app_mode text not null default 'Work Edition: Non-AI',
  company_name text,
  trading_name text,
  address text,
  postcode text,
  country text not null default 'United Kingdom',
  vat_number text,
  email text,
  phone text,
  website text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.labour_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  target_labour_percent numeric(7, 2) not null default 32,
  weekly_view boolean not null default true,
  boh_service_charge_percent numeric(7, 2) not null default 40,
  foh_service_charge_percent numeric(7, 2) not null default 60,
  include_service_charge_in_labour_cost boolean not null default false,
  exclude_freelance_from_tronc boolean not null default false,
  default_holiday_entitlement_days numeric(7, 2) not null default 28,
  holiday_year_start_month text not null default 'January',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.ai_settings (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  enable_ai_invoice_reading boolean not null default true,
  enable_ai_product_matching boolean not null default true,
  auto_match_confidence_threshold numeric(5, 2) not null default 85,
  require_manual_approval_below_threshold boolean not null default true,
  product_matching_sensitivity text not null default 'Medium',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create unique index if not exists departments_company_location_name_idx on public.departments(company_id, location_id, name);
create index if not exists departments_company_id_idx on public.departments(company_id);
create index if not exists departments_location_id_idx on public.departments(location_id);
create unique index if not exists company_settings_company_idx on public.company_settings(company_id) where location_id is null;
create unique index if not exists company_settings_location_idx on public.company_settings(company_id, location_id) where location_id is not null;
create index if not exists company_settings_company_id_idx on public.company_settings(company_id);
create index if not exists company_settings_location_id_idx on public.company_settings(location_id);
create unique index if not exists labour_settings_company_idx on public.labour_settings(company_id) where location_id is null;
create unique index if not exists labour_settings_location_idx on public.labour_settings(company_id, location_id) where location_id is not null;
create index if not exists labour_settings_company_id_idx on public.labour_settings(company_id);
create index if not exists labour_settings_location_id_idx on public.labour_settings(location_id);
create unique index if not exists ai_settings_company_idx on public.ai_settings(company_id) where location_id is null;
create unique index if not exists ai_settings_location_idx on public.ai_settings(company_id, location_id) where location_id is not null;
create index if not exists ai_settings_company_id_idx on public.ai_settings(company_id);
create index if not exists ai_settings_location_id_idx on public.ai_settings(location_id);
