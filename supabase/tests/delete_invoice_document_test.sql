-- Synthetic test for public.delete_invoice_document_v1. Self-contained: creates minimal stand-ins for
-- the tables and helpers it touches, so it runs on any throwaway Postgres 16 (psql -X -v ON_ERROR_STOP=1).
-- Never run against staging or production.
\set ON_ERROR_STOP 1
begin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
create table public.company_members (company_id uuid, user_id uuid, status text, role_label text);
create or replace function public.is_company_owner(target_company_id uuid) returns boolean language sql stable security definer set search_path = public, auth as $$
  select target_company_id is not null and exists (select 1 from public.company_members m where m.company_id = target_company_id and m.user_id = auth.uid() and m.status = 'active' and lower(m.role_label) = 'owner') $$;
create table public.invoices (id uuid primary key, company_id uuid not null);
create table public.invoice_lines (id uuid primary key default gen_random_uuid(), company_id uuid, invoice_id uuid not null references public.invoices(id) on delete cascade);
create table public.product_price_history (id uuid primary key default gen_random_uuid(), company_id uuid, invoice_id uuid);
create table public.invoice_financial_repairs (id uuid primary key default gen_random_uuid(), company_id uuid, invoice_id uuid not null references public.invoices(id) on delete restrict);
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;

\i supabase/migrations/20261024120000_delete_invoice_document.sql

insert into public.company_members values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'active', 'Owner'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'active', 'Manager');
insert into public.invoices values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c1'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000c9');
insert into public.invoice_lines (company_id, invoice_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1');
insert into public.product_price_history (company_id, invoice_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1');
insert into public.invoice_financial_repairs (company_id, invoice_id) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1');

-- a manager (not owner) is refused and nothing changes
set local test.uid = '00000000-0000-4000-8000-0000000000a2';
do $$ begin
  perform public.delete_invoice_document_v1('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1');
  raise exception 'expected refusal';
exception when insufficient_privilege then null; end $$;
do $$ begin if (select count(*) from public.invoices) <> 3 then raise exception 'manager deleted something'; end if; end $$;

-- the owner deletes a recovered document with a repair audit row; lines, history and repair go too
set local test.uid = '00000000-0000-4000-8000-0000000000a1';
do $$ begin
  if public.delete_invoice_document_v1('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1') <> 1 then raise exception 'expected 1 deleted'; end if;
  if exists (select 1 from public.invoices where id = '00000000-0000-4000-8000-0000000000f1') then raise exception 'invoice left'; end if;
  if exists (select 1 from public.invoice_lines) then raise exception 'lines left'; end if;
  if exists (select 1 from public.product_price_history) then raise exception 'history left'; end if;
  if exists (select 1 from public.invoice_financial_repairs) then raise exception 'repair left'; end if;
  if (select count(*) from public.invoices) <> 2 then raise exception 'other invoices touched'; end if;
end $$;

-- another company's document is not reachable through this company
do $$ begin
  if public.delete_invoice_document_v1('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f3') <> 0 then raise exception 'cross-company delete'; end if;
  if not exists (select 1 from public.invoices where id = '00000000-0000-4000-8000-0000000000f3') then raise exception 'cross-company row removed'; end if;
end $$;
select 'delete_invoice_document_v1 test passed';
rollback;
