-- Reconcile Workforce private-beta feature access after installations where
-- company_features was created manually or the original RPC definition is stale.
-- This migration is intentionally idempotent and does not enable the feature for
-- any company. Existing company_features rows remain unchanged.

create table if not exists public.company_features (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  beta_access boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, feature_key)
);

-- Repair columns that are present in the repository schema but may be absent
-- when company_features was created manually in production.
alter table public.company_features
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists created_by uuid references auth.users(id) on delete set null default auth.uid(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null default auth.uid();

create index if not exists company_features_company_id_idx
  on public.company_features(company_id);
create index if not exists company_features_feature_key_idx
  on public.company_features(feature_key);

-- Keep the membership helper aligned with the authenticated company model.
create or replace function public.is_active_company_member(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and exists (
      select 1
      from public.company_members member
      where member.company_id = target_company_id
        and member.user_id = auth.uid()
        and member.status = 'active'
    );
$$;

-- The feature gate is company-scoped. Private-beta access is restricted to
-- privileged active company members. Once beta_access is false, any active
-- company member may pass the feature gate; page/action permissions remain
-- controlled separately by has_workforce_permission and table RLS.
create or replace function public.can_access_feature(
  target_company_id uuid,
  target_feature_key text
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select target_company_id is not null
    and nullif(trim(target_feature_key), '') is not null
    and public.is_active_company_member(target_company_id)
    and exists (
      select 1
      from public.company_features feature
      where feature.company_id = target_company_id
        and feature.feature_key = target_feature_key
        and feature.enabled = true
        and (
          feature.beta_access = false
          or exists (
            select 1
            from public.company_members member
            where member.company_id = target_company_id
              and member.user_id = auth.uid()
              and member.status = 'active'
              and trim(lower(member.role_label)) in (
                'owner',
                'company administrator',
                'company admin',
                'platform owner',
                'developer'
              )
          )
        )
    );
$$;

revoke all on function public.is_active_company_member(uuid) from public;
revoke all on function public.can_access_feature(uuid, text) from public;
grant execute on function public.is_active_company_member(uuid) to authenticated;
grant execute on function public.can_access_feature(uuid, text) to authenticated;

grant usage on schema public to authenticated;
grant select on table public.company_features to authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.company_features from authenticated;
revoke all on table public.company_features from anon;

alter table public.company_features enable row level security;

drop policy if exists "Company members can read company features"
  on public.company_features;
drop policy if exists company_features_select_member
  on public.company_features;
create policy company_features_select_member
  on public.company_features
  for select
  to authenticated
  using (public.is_active_company_member(company_id));

comment on function public.can_access_feature(uuid, text) is
  'Company-scoped feature gate. Private beta requires an active privileged company membership.';
