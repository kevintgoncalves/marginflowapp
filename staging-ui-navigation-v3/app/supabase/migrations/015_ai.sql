-- AI run and usage tracking schema for MarginFlow.

create table if not exists public.ai_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  run_type text not null,
  provider text,
  model text,
  status text not null default 'pending',
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_amount numeric(12, 6) not null default 0,
  request_payload jsonb not null default '{}'::jsonb,
  response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table if not exists public.ai_usage (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  ai_run_id uuid references public.ai_runs(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  usage_date date not null default current_date,
  provider text,
  model text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer generated always as (input_tokens + output_tokens) stored,
  cost_amount numeric(12, 6) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index if not exists ai_runs_company_id_idx on public.ai_runs(company_id);
create index if not exists ai_runs_location_id_idx on public.ai_runs(location_id);
create index if not exists ai_runs_user_id_idx on public.ai_runs(user_id);
create index if not exists ai_runs_started_at_idx on public.ai_runs(started_at);
create index if not exists ai_usage_company_id_idx on public.ai_usage(company_id);
create index if not exists ai_usage_location_id_idx on public.ai_usage(location_id);
create index if not exists ai_usage_ai_run_id_idx on public.ai_usage(ai_run_id);
create index if not exists ai_usage_user_id_idx on public.ai_usage(user_id);
create index if not exists ai_usage_usage_date_idx on public.ai_usage(usage_date);
