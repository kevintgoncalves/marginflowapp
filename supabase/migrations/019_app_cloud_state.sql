-- App-level cloud sync state for the current MarginFlow frontend.
-- This keeps the existing UI data shapes synced by module while the app
-- continues moving toward fully relational reads and writes.

create table if not exists public.marginflow_cloud_state (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  scope_key text not null default 'company',
  module_key text not null,
  payload jsonb not null default '{}'::jsonb,
  migrated_from_local_storage boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, scope_key, module_key)
);

create index if not exists marginflow_cloud_state_company_id_idx on public.marginflow_cloud_state(company_id);
create index if not exists marginflow_cloud_state_location_id_idx on public.marginflow_cloud_state(location_id);
create index if not exists marginflow_cloud_state_module_key_idx on public.marginflow_cloud_state(module_key);
create index if not exists marginflow_cloud_state_synced_at_idx on public.marginflow_cloud_state(synced_at);

alter table public.marginflow_cloud_state enable row level security;

drop policy if exists marginflow_cloud_state_select_member on public.marginflow_cloud_state;
create policy marginflow_cloud_state_select_member
  on public.marginflow_cloud_state for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists marginflow_cloud_state_insert_member on public.marginflow_cloud_state;
create policy marginflow_cloud_state_insert_member
  on public.marginflow_cloud_state for insert to authenticated
  with check (public.is_active_company_member(company_id));

drop policy if exists marginflow_cloud_state_update_member on public.marginflow_cloud_state;
create policy marginflow_cloud_state_update_member
  on public.marginflow_cloud_state for update to authenticated
  using (public.is_active_company_member(company_id))
  with check (public.is_active_company_member(company_id));

drop policy if exists marginflow_cloud_state_delete_owner on public.marginflow_cloud_state;
create policy marginflow_cloud_state_delete_owner
  on public.marginflow_cloud_state for delete to authenticated
  using (public.is_company_owner(company_id));

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at'
      and tgrelid = 'public.marginflow_cloud_state'::regclass
  ) then
    create trigger set_updated_at
      before update on public.marginflow_cloud_state
      for each row execute function public.set_updated_at();
  end if;
end
$$;
