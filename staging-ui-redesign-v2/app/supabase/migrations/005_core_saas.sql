-- Core SaaS schema for MarginFlow.

do $$
begin
  create type marginflow.member_status as enum ('active', 'disabled', 'invited');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type marginflow.subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'paused');
exception
  when duplicate_object then null;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.updated_by = coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;

create table if not exists public.companies (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  trading_name text,
  status marginflow.company_status not null default 'active',
  timezone text not null default 'Europe/London',
  currency text not null default 'GBP',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.locations (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text,
  postcode text,
  country text not null default 'United Kingdom',
  timezone text not null default 'Europe/London',
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, name)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.company_members (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_label text not null default 'Custom',
  status marginflow.member_status not null default 'active',
  invited_email text,
  joined_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (company_id, user_id)
);

create table if not exists public.plans (
  id uuid primary key default extensions.gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  monthly_price numeric(12, 2) not null default 0,
  yearly_price numeric(12, 2) not null default 0,
  currency text not null default 'GBP',
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  plan_id uuid not null references public.plans(id),
  status marginflow.subscription_status not null default 'trialing',
  provider text,
  provider_subscription_id text,
  current_period_start date,
  current_period_end date,
  trial_ends_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text not null,
  entity_id uuid,
  old_record jsonb,
  new_record jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists locations_company_id_idx on public.locations(company_id);
create index if not exists company_members_company_id_idx on public.company_members(company_id);
create index if not exists company_members_location_id_idx on public.company_members(location_id);
create index if not exists company_members_user_id_idx on public.company_members(user_id);
create index if not exists subscriptions_company_id_idx on public.subscriptions(company_id);
create index if not exists subscriptions_location_id_idx on public.subscriptions(location_id);
create index if not exists subscriptions_plan_id_idx on public.subscriptions(plan_id);
create index if not exists subscriptions_period_idx on public.subscriptions(current_period_start, current_period_end);
create index if not exists audit_log_company_id_idx on public.audit_log(company_id);
create index if not exists audit_log_location_id_idx on public.audit_log(location_id);
create index if not exists audit_log_actor_id_idx on public.audit_log(actor_id);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at);
