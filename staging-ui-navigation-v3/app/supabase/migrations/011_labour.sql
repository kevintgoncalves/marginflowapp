-- Labour schema for MarginFlow.

create table if not exists public.employees (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  name text not null,
  email text,
  employment_type text not null default 'Hourly',
  hourly_rate numeric(12, 4) not null default 0,
  annual_salary numeric(12, 2) not null default 0,
  contracted_hours numeric(8, 2) not null default 0,
  service_charge_points numeric(8, 4) not null default 1,
  exclude_from_service_charge boolean not null default false,
  start_date date,
  end_date date,
  status text not null default 'active',
  holiday_type text not null default 'zero-hours',
  holiday_entitlement_days numeric(8, 2) not null default 28,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.employee_rate_history (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  effective_date date not null default current_date,
  employment_type text,
  old_hourly_rate numeric(12, 4),
  new_hourly_rate numeric(12, 4),
  old_annual_salary numeric(12, 2),
  new_annual_salary numeric(12, 2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.labour_imports (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  import_type text not null default 'labour',
  source text,
  file_name text,
  week_start date,
  status text not null default 'pending',
  row_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.labour_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  department_id uuid references public.departments(id) on delete set null,
  labour_import_id uuid references public.labour_imports(id) on delete set null,
  work_date date not null default current_date,
  week_start date,
  hours_worked numeric(8, 2) not null default 0,
  base_pay numeric(12, 2) not null default 0,
  service_charge_points numeric(8, 4) not null default 1,
  service_charge_hours numeric(10, 2) not null default 0,
  service_charge_amount numeric(12, 2) not null default 0,
  total_earned numeric(12, 2) not null default 0,
  source text not null default 'manual',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.holiday_bookings (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  days numeric(8, 2) not null default 0,
  hours numeric(8, 2) not null default 0,
  status text not null default 'Booked',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.holiday_balances (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  holiday_year integer not null,
  entitlement_days numeric(8, 2) not null default 0,
  accrued_days numeric(8, 2) not null default 0,
  used_days numeric(8, 2) not null default 0,
  remaining_days numeric(8, 2) not null default 0,
  liability_amount numeric(12, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, employee_id, holiday_year)
);

create index if not exists employees_company_id_idx on public.employees(company_id);
create index if not exists employees_location_id_idx on public.employees(location_id);
create index if not exists employees_department_id_idx on public.employees(department_id);
create index if not exists employee_rate_history_company_id_idx on public.employee_rate_history(company_id);
create index if not exists employee_rate_history_location_id_idx on public.employee_rate_history(location_id);
create index if not exists employee_rate_history_employee_id_idx on public.employee_rate_history(employee_id);
create index if not exists employee_rate_history_effective_date_idx on public.employee_rate_history(effective_date);
create index if not exists labour_imports_company_id_idx on public.labour_imports(company_id);
create index if not exists labour_imports_location_id_idx on public.labour_imports(location_id);
create index if not exists labour_imports_week_start_idx on public.labour_imports(week_start);
create index if not exists labour_entries_company_id_idx on public.labour_entries(company_id);
create index if not exists labour_entries_location_id_idx on public.labour_entries(location_id);
create index if not exists labour_entries_employee_id_idx on public.labour_entries(employee_id);
create index if not exists labour_entries_department_id_idx on public.labour_entries(department_id);
create index if not exists labour_entries_work_date_idx on public.labour_entries(work_date);
create index if not exists labour_entries_week_start_idx on public.labour_entries(week_start);
create index if not exists holiday_bookings_company_id_idx on public.holiday_bookings(company_id);
create index if not exists holiday_bookings_location_id_idx on public.holiday_bookings(location_id);
create index if not exists holiday_bookings_employee_id_idx on public.holiday_bookings(employee_id);
create index if not exists holiday_bookings_date_from_idx on public.holiday_bookings(date_from);
create index if not exists holiday_balances_company_id_idx on public.holiday_balances(company_id);
create index if not exists holiday_balances_location_id_idx on public.holiday_balances(location_id);
create index if not exists holiday_balances_employee_id_idx on public.holiday_balances(employee_id);
