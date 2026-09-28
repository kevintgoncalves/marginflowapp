-- Manual permissions schema for MarginFlow.

do $$
begin
  create type marginflow.access_level as enum ('no_access', 'view', 'edit', 'full');
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.user_page_permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  page_key text not null,
  access_level marginflow.access_level not null default 'no_access',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.user_department_permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  department_id uuid not null references public.departments(id) on delete cascade,
  access_level marginflow.access_level not null default 'no_access',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.user_action_permissions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  action_key marginflow.action_permission_key not null,
  allowed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create unique index if not exists user_page_permissions_unique_idx on public.user_page_permissions(company_id, location_id, user_id, page_key);
create index if not exists user_page_permissions_company_id_idx on public.user_page_permissions(company_id);
create index if not exists user_page_permissions_location_id_idx on public.user_page_permissions(location_id);
create index if not exists user_page_permissions_user_id_idx on public.user_page_permissions(user_id);
create unique index if not exists user_department_permissions_unique_idx on public.user_department_permissions(company_id, location_id, user_id, department_id);
create index if not exists user_department_permissions_company_id_idx on public.user_department_permissions(company_id);
create index if not exists user_department_permissions_location_id_idx on public.user_department_permissions(location_id);
create index if not exists user_department_permissions_user_id_idx on public.user_department_permissions(user_id);
create index if not exists user_department_permissions_department_id_idx on public.user_department_permissions(department_id);
create unique index if not exists user_action_permissions_unique_idx on public.user_action_permissions(company_id, location_id, user_id, action_key);
create index if not exists user_action_permissions_company_id_idx on public.user_action_permissions(company_id);
create index if not exists user_action_permissions_location_id_idx on public.user_action_permissions(location_id);
create index if not exists user_action_permissions_user_id_idx on public.user_action_permissions(user_id);
