-- Invoice Control Centre schedules and daily status overrides.

do $$
begin
  create type marginflow.supplier_schedule_mode as enum ('manual', 'automatic');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type marginflow.invoice_day_status_override as enum ('not_ordered', 'expected');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.supplier_delivery_schedules (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  delivery_days text[] not null default '{}'::text[],
  schedule_mode marginflow.supplier_schedule_mode not null default 'manual',
  default_expected boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, supplier_id)
);

create table if not exists public.invoice_day_status_overrides (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  date date not null,
  status_override marginflow.invoice_day_status_override not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, location_id, supplier_id, date)
);

create index if not exists supplier_delivery_schedules_company_id_idx on public.supplier_delivery_schedules(company_id);
create index if not exists supplier_delivery_schedules_location_id_idx on public.supplier_delivery_schedules(location_id);
create index if not exists supplier_delivery_schedules_supplier_id_idx on public.supplier_delivery_schedules(supplier_id);
create unique index if not exists supplier_delivery_schedules_scope_supplier_idx
  on public.supplier_delivery_schedules(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id);
create index if not exists invoice_day_status_overrides_company_id_idx on public.invoice_day_status_overrides(company_id);
create index if not exists invoice_day_status_overrides_location_id_idx on public.invoice_day_status_overrides(location_id);
create index if not exists invoice_day_status_overrides_supplier_id_idx on public.invoice_day_status_overrides(supplier_id);
create index if not exists invoice_day_status_overrides_date_idx on public.invoice_day_status_overrides(date);
create unique index if not exists invoice_day_status_overrides_scope_supplier_date_idx
  on public.invoice_day_status_overrides(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), supplier_id, date);

alter table public.supplier_delivery_schedules enable row level security;
alter table public.invoice_day_status_overrides enable row level security;

drop policy if exists supplier_delivery_schedules_select_member on public.supplier_delivery_schedules;
create policy supplier_delivery_schedules_select_member
  on public.supplier_delivery_schedules for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists supplier_delivery_schedules_insert_member on public.supplier_delivery_schedules;
create policy supplier_delivery_schedules_insert_member
  on public.supplier_delivery_schedules for insert to authenticated
  with check (public.is_active_company_member(company_id));

drop policy if exists supplier_delivery_schedules_update_member on public.supplier_delivery_schedules;
create policy supplier_delivery_schedules_update_member
  on public.supplier_delivery_schedules for update to authenticated
  using (public.is_active_company_member(company_id))
  with check (public.is_active_company_member(company_id));

drop policy if exists supplier_delivery_schedules_delete_owner on public.supplier_delivery_schedules;
create policy supplier_delivery_schedules_delete_owner
  on public.supplier_delivery_schedules for delete to authenticated
  using (public.is_company_owner(company_id));

drop policy if exists invoice_day_status_overrides_select_member on public.invoice_day_status_overrides;
create policy invoice_day_status_overrides_select_member
  on public.invoice_day_status_overrides for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists invoice_day_status_overrides_insert_member on public.invoice_day_status_overrides;
create policy invoice_day_status_overrides_insert_member
  on public.invoice_day_status_overrides for insert to authenticated
  with check (public.is_active_company_member(company_id));

drop policy if exists invoice_day_status_overrides_update_member on public.invoice_day_status_overrides;
create policy invoice_day_status_overrides_update_member
  on public.invoice_day_status_overrides for update to authenticated
  using (public.is_active_company_member(company_id))
  with check (public.is_active_company_member(company_id));

drop policy if exists invoice_day_status_overrides_delete_owner on public.invoice_day_status_overrides;
create policy invoice_day_status_overrides_delete_owner
  on public.invoice_day_status_overrides for delete to authenticated
  using (public.is_company_owner(company_id));

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at'
      and tgrelid = 'public.supplier_delivery_schedules'::regclass
  ) then
    create trigger set_updated_at
      before update on public.supplier_delivery_schedules
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger where tgname = 'set_updated_at'
      and tgrelid = 'public.invoice_day_status_overrides'::regclass
  ) then
    create trigger set_updated_at
      before update on public.invoice_day_status_overrides
      for each row execute function public.set_updated_at();
  end if;
end
$$;
