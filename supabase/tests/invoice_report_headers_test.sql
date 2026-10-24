-- Synthetic test for the public.invoice_report_headers view. Self-contained: creates minimal stand-ins
-- for the roles, auth.uid() and an invoices table with company row-level security, so it runs on any
-- throwaway Postgres 15+ (psql -X -v ON_ERROR_STOP=1). Never run against staging or production.
\set ON_ERROR_STOP 1
begin;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
create table public.company_members (company_id uuid, user_id uuid, status text);
create table public.invoices (
  id uuid primary key, company_id uuid not null, location_id uuid, supplier_id uuid,
  invoice_number text, document_number text, document_type text, invoice_date date, status text,
  subtotal numeric, tax_amount numeric, total_amount numeric, sync_revision integer, content_fingerprint text,
  metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table public.invoices enable row level security;
create policy invoices_member_read on public.invoices for select to authenticated
  using (exists (select 1 from public.company_members m where m.company_id = invoices.company_id and m.user_id = auth.uid() and m.status = 'active'));
create policy invoices_member_write on public.invoices for all to authenticated
  using (exists (select 1 from public.company_members m where m.company_id = invoices.company_id and m.user_id = auth.uid() and m.status = 'active'));
grant select, insert, update, delete on public.invoices to authenticated;
grant select on public.company_members to authenticated;
-- Supabase gives new relations in public every privilege by default; reproduce that.
alter default privileges in schema public grant all on tables to anon, authenticated;

\i supabase/migrations/20261024200000_invoice_report_headers.sql

insert into public.company_members values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'active');
insert into public.invoices (id, company_id, invoice_date, document_type, subtotal, metadata) values
  -- normal snapshot with three lines (one without an id) and other keys that must stay as they are
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1', '2026-06-01', 'invoice', 120,
   '{"supplier_name":"Fresh Ltd","last_financial_header_repair":{"at":"2026-08-10"},"marginflow_snapshot":{"supplier":"Fresh Ltd","absoluteNetTotal":120,"additionalCharges":4.5,"lines":[{"id":"x"}],"items":[{"id":"l2","productName":"Milk","lineTotal":20,"departmentId":"d1"},{"productName":"No id","lineTotal":1},{"id":"l1","productName":"Eggs","lineTotal":99,"departmentSplits":[{"departmentId":"d2","amount":99}]}]}}'),
  -- snapshot without items, items that is not an array, no snapshot, no metadata
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000c1', '2026-06-02', 'credit_note', -5, '{"marginflow_snapshot":{"supplier":"Bakery","total":-5}}'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000c1', '2026-06-03', 'invoice', 7, '{"marginflow_snapshot":{"items":{"id":"odd"}}}'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000c1', '2026-06-04', 'invoice', 8, '{"supplier_name":"Butcher"}'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000c1', '2026-06-05', 'invoice', 9, null),
  -- another company's invoice must stay invisible
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000c9', '2026-06-01', 'invoice', 50, '{"marginflow_snapshot":{"items":[{"id":"secret"}]}}');

set local role authenticated;
set local test.uid = '00000000-0000-4000-8000-0000000000a1';

-- same rows as the table, other company excluded by the table's own row-level security
do $$ begin
  if (select count(*) from public.invoice_report_headers) <> 5 then raise exception 'expected the 5 visible invoices'; end if;
  if exists (select 1 from public.invoice_report_headers where company_id = '00000000-0000-4000-8000-0000000000c9') then raise exception 'other company visible'; end if;
end $$;

-- every column except metadata is identical; metadata differs only in snapshot.items
do $$ begin
  if exists (
    select 1 from public.invoices i join public.invoice_report_headers v using (id)
    where (i.company_id, i.location_id, i.supplier_id, i.invoice_number, i.document_number, i.document_type, i.invoice_date, i.status, i.subtotal, i.tax_amount, i.total_amount, i.sync_revision, i.content_fingerprint, i.created_at, i.updated_at)
      is distinct from (v.company_id, v.location_id, v.supplier_id, v.invoice_number, v.document_number, v.document_type, v.invoice_date, v.status, v.subtotal, v.tax_amount, v.total_amount, v.sync_revision, v.content_fingerprint, v.created_at, v.updated_at)
       or (i.metadata #- '{marginflow_snapshot,items}') is distinct from (v.metadata #- '{marginflow_snapshot,items}')
  ) then raise exception 'a column or metadata key other than snapshot.items changed'; end if;
end $$;

-- items keep only ids, in the original order; an element without an id becomes {}
do $$ begin
  if (select metadata -> 'marginflow_snapshot' -> 'items' from public.invoice_report_headers where id = '00000000-0000-4000-8000-0000000000f1')
     <> '[{"id":"l2"},{},{"id":"l1"}]'::jsonb then raise exception 'items not reduced to ordered ids'; end if;
  if (select metadata -> 'marginflow_snapshot' -> 'lines' from public.invoice_report_headers where id = '00000000-0000-4000-8000-0000000000f1')
     <> '[{"id":"x"}]'::jsonb then raise exception 'other snapshot keys must be kept'; end if;
end $$;

-- rows without an items array are returned exactly as stored
do $$ begin
  if exists (
    select 1 from public.invoices i join public.invoice_report_headers v using (id)
    where i.id in ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-0000000000f5')
      and i.metadata is distinct from v.metadata
  ) then raise exception 'metadata without an items array changed'; end if;
end $$;

-- nothing can be written through the view, even by a member who may write invoices
do $$ begin
  begin
    update public.invoice_report_headers set subtotal = 0 where id = '00000000-0000-4000-8000-0000000000f1';
    raise exception 'update through the view was allowed';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.invoice_report_headers where id = '00000000-0000-4000-8000-0000000000f2';
    raise exception 'delete through the view was allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.invoice_report_headers (id, company_id) values ('00000000-0000-4000-8000-0000000000fa', '00000000-0000-4000-8000-0000000000c1');
    raise exception 'insert through the view was allowed';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
-- anon cannot read it
set local role anon;
do $$ begin
  begin
    perform 1 from public.invoice_report_headers;
    raise exception 'anon could read the view';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

do $$ begin
  if (select count(*) from public.invoices) <> 6 or (select subtotal from public.invoices where id = '00000000-0000-4000-8000-0000000000f1') <> 120 then
    raise exception 'invoices changed during the test';
  end if;
end $$;
\echo 'invoice_report_headers_test: all checks passed'
rollback;
