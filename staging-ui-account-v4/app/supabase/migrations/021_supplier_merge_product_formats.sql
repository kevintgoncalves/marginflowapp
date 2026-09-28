-- Supplier merge protection and supplier-specific product purchase formats.

alter table public.suppliers
  add column if not exists normalized_name text,
  add column if not exists deleted_at timestamptz,
  add column if not exists merged_into_supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merge_metadata jsonb not null default '{}'::jsonb;

update public.suppliers
set normalized_name = lower(regexp_replace(regexp_replace(name, '\y(ltd|limited|plc|llp|llc|co|company|the)\y', '', 'gi'), '[^a-z0-9]+', '', 'gi'))
where normalized_name is null;

create unique index if not exists suppliers_active_normalized_name_idx
  on public.suppliers(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), normalized_name)
  where deleted_at is null and merged_into_supplier_id is null;

create index if not exists suppliers_deleted_at_idx on public.suppliers(deleted_at);
create index if not exists suppliers_merged_into_supplier_id_idx on public.suppliers(merged_into_supplier_id);

create or replace function public.set_supplier_normalized_name()
returns trigger
language plpgsql
as $$
begin
  new.normalized_name := lower(regexp_replace(regexp_replace(coalesce(new.name, ''), '\y(ltd|limited|plc|llp|llc|co|company|the)\y', '', 'gi'), '[^a-z0-9]+', '', 'gi'));
  return new;
end;
$$;

drop trigger if exists set_supplier_normalized_name on public.suppliers;
create trigger set_supplier_normalized_name
  before insert or update of name on public.suppliers
  for each row execute function public.set_supplier_normalized_name();

alter table public.product_supplier_prices
  add column if not exists base_quantity numeric(12, 4),
  add column if not exists base_unit text,
  add column if not exists normalized_cost numeric(12, 4),
  add column if not exists conversion_confidence text,
  add column if not exists conversion_review_required boolean not null default false;

alter table public.product_price_history
  add column if not exists base_quantity numeric(12, 4),
  add column if not exists base_unit text,
  add column if not exists normalized_cost numeric(12, 4),
  add column if not exists conversion_confidence text,
  add column if not exists conversion_review_required boolean not null default false;

create table if not exists public.product_supplier_formats (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  pack_size text not null default '',
  purchase_unit text,
  purchase_unit_cost numeric(12, 4) not null default 0,
  base_quantity numeric(12, 4),
  base_unit text,
  normalized_cost numeric(12, 4),
  conversion_confidence text,
  conversion_review_required boolean not null default false,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.supplier_merges (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  source_supplier_id uuid references public.suppliers(id) on delete set null,
  target_supplier_id uuid references public.suppliers(id) on delete set null,
  source_supplier_name text not null,
  target_supplier_name text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists product_supplier_formats_company_id_idx on public.product_supplier_formats(company_id);
create index if not exists product_supplier_formats_location_id_idx on public.product_supplier_formats(location_id);
create index if not exists product_supplier_formats_product_id_idx on public.product_supplier_formats(product_id);
create index if not exists product_supplier_formats_supplier_id_idx on public.product_supplier_formats(supplier_id);
create index if not exists product_supplier_formats_base_unit_idx on public.product_supplier_formats(base_unit);
create unique index if not exists product_supplier_formats_scope_unique_idx
  on public.product_supplier_formats(company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), product_id, supplier_id, pack_size);

create index if not exists supplier_merges_company_id_idx on public.supplier_merges(company_id);
create index if not exists supplier_merges_location_id_idx on public.supplier_merges(location_id);
create index if not exists supplier_merges_source_supplier_id_idx on public.supplier_merges(source_supplier_id);
create index if not exists supplier_merges_target_supplier_id_idx on public.supplier_merges(target_supplier_id);

alter table public.product_supplier_formats enable row level security;
alter table public.supplier_merges enable row level security;

drop policy if exists product_supplier_formats_select_member on public.product_supplier_formats;
create policy product_supplier_formats_select_member
  on public.product_supplier_formats for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists product_supplier_formats_insert_member on public.product_supplier_formats;
create policy product_supplier_formats_insert_member
  on public.product_supplier_formats for insert to authenticated
  with check (public.is_active_company_member(company_id));

drop policy if exists product_supplier_formats_update_member on public.product_supplier_formats;
create policy product_supplier_formats_update_member
  on public.product_supplier_formats for update to authenticated
  using (public.is_active_company_member(company_id))
  with check (public.is_active_company_member(company_id));

drop policy if exists product_supplier_formats_delete_owner on public.product_supplier_formats;
create policy product_supplier_formats_delete_owner
  on public.product_supplier_formats for delete to authenticated
  using (public.is_company_owner(company_id));

drop policy if exists supplier_merges_select_member on public.supplier_merges;
create policy supplier_merges_select_member
  on public.supplier_merges for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists supplier_merges_insert_member on public.supplier_merges;
create policy supplier_merges_insert_member
  on public.supplier_merges for insert to authenticated
  with check (public.is_active_company_member(company_id));

drop policy if exists supplier_merges_update_member on public.supplier_merges;
create policy supplier_merges_update_member
  on public.supplier_merges for update to authenticated
  using (public.is_active_company_member(company_id))
  with check (public.is_active_company_member(company_id));

drop policy if exists supplier_merges_delete_owner on public.supplier_merges;
create policy supplier_merges_delete_owner
  on public.supplier_merges for delete to authenticated
  using (public.is_company_owner(company_id));

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at'
      and tgrelid = 'public.product_supplier_formats'::regclass
  ) then
    create trigger set_updated_at
      before update on public.product_supplier_formats
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'set_updated_at'
      and tgrelid = 'public.supplier_merges'::regclass
  ) then
    create trigger set_updated_at
      before update on public.supplier_merges
      for each row execute function public.set_updated_at();
  end if;
end
$$;
