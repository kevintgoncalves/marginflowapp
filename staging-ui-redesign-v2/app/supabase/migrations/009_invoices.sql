-- Invoices, invoice lines, files and credit notes schema for MarginFlow.

create table if not exists public.invoices (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_number text,
  invoice_date date not null default current_date,
  status text not null default 'Draft',
  subtotal numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  discount_percent numeric(7, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.invoice_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  product_name text not null,
  pack_size text,
  quantity numeric(12, 4) not null default 0,
  unit_cost numeric(12, 4) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  discount_percent numeric(7, 2) not null default 0,
  status text not null default 'Received',
  net_line_total numeric(12, 2) not null default 0,
  match_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.invoice_line_department_splits (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  invoice_line_id uuid not null references public.invoice_lines(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete restrict,
  percentage numeric(7, 2) not null default 100,
  amount numeric(12, 2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.invoice_files (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete cascade,
  storage_path text not null,
  original_name text,
  mime_type text,
  file_size_bytes bigint,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.credit_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  invoice_line_id uuid references public.invoice_lines(id) on delete set null,
  status text not null default 'Open',
  reason text,
  amount numeric(12, 2) not null default 0,
  credit_note_number text,
  raised_date date not null default current_date,
  resolved_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

alter table public.product_price_history
  add constraint product_price_history_invoice_id_fkey
  foreign key (invoice_id) references public.invoices(id) on delete set null;

create index if not exists invoices_company_id_idx on public.invoices(company_id);
create index if not exists invoices_location_id_idx on public.invoices(location_id);
create index if not exists invoices_supplier_id_idx on public.invoices(supplier_id);
create index if not exists invoices_invoice_date_idx on public.invoices(invoice_date);
create index if not exists invoice_lines_company_id_idx on public.invoice_lines(company_id);
create index if not exists invoice_lines_location_id_idx on public.invoice_lines(location_id);
create index if not exists invoice_lines_invoice_id_idx on public.invoice_lines(invoice_id);
create index if not exists invoice_lines_supplier_id_idx on public.invoice_lines(supplier_id);
create index if not exists invoice_lines_product_id_idx on public.invoice_lines(product_id);
create index if not exists invoice_lines_department_id_idx on public.invoice_lines(department_id);
create index if not exists invoice_line_department_splits_company_id_idx on public.invoice_line_department_splits(company_id);
create index if not exists invoice_line_department_splits_location_id_idx on public.invoice_line_department_splits(location_id);
create index if not exists invoice_line_department_splits_line_id_idx on public.invoice_line_department_splits(invoice_line_id);
create index if not exists invoice_line_department_splits_department_id_idx on public.invoice_line_department_splits(department_id);
create index if not exists invoice_files_company_id_idx on public.invoice_files(company_id);
create index if not exists invoice_files_location_id_idx on public.invoice_files(location_id);
create index if not exists invoice_files_invoice_id_idx on public.invoice_files(invoice_id);
create index if not exists credit_notes_company_id_idx on public.credit_notes(company_id);
create index if not exists credit_notes_location_id_idx on public.credit_notes(location_id);
create index if not exists credit_notes_supplier_id_idx on public.credit_notes(supplier_id);
create index if not exists credit_notes_invoice_id_idx on public.credit_notes(invoice_id);
create index if not exists credit_notes_invoice_line_id_idx on public.credit_notes(invoice_line_id);
create index if not exists credit_notes_raised_date_idx on public.credit_notes(raised_date);
