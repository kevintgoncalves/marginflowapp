-- Synthetic test for public.merge_products_batch. Run on a throwaway local database that has the
-- schema baseline and migrations applied. Never run against staging or production.
\set ON_ERROR_STOP 1
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000a1', 'owner@example.test'), ('00000000-0000-4000-8000-0000000000a2', 'outsider@example.test');
insert into public.profiles (id) values ('00000000-0000-4000-8000-0000000000a1'), ('00000000-0000-4000-8000-0000000000a2');
insert into public.plans (slug, name, active) select 'pro', 'Pro', true where not exists (select 1 from public.plans where slug = 'pro');
insert into public.companies (id, name) values ('00000000-0000-4000-8000-0000000000c1', 'Test Kitchen');
insert into public.company_members (company_id, user_id, status) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'active');
insert into public.products (id, company_id, name)
select ('00000000-0000-4000-8000-0000000001' || n)::uuid, '00000000-0000-4000-8000-0000000000c1', 'Product ' || n
from unnest(array['a1','a2','b1','b2','b3','c1','c2','d1']) n;
insert into public.invoices (id, company_id) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000c1');
insert into public.invoice_lines (company_id, invoice_id, product_name, product_id)
select '00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000f1', 'Line ' || n, ('00000000-0000-4000-8000-0000000001' || n)::uuid
from unnest(array['a2','b2','b3','c2','d1']) n;
create temp table t_ids as select n, ('00000000-0000-4000-8000-0000000001' || n) as id from unnest(array['a1','a2','b1','b2','b3','c1','c2','d1']) n;
create temp table t_snap as select
  (select jsonb_agg(jsonb_build_object('id', id, 'name', 'Product ' || n, 'active', true) order by n) from t_ids) as before,
  (select jsonb_agg(case
      when n in ('a2') then jsonb_build_object('id', id, 'name', 'Product ' || n, 'active', false, 'mergedIntoProductId', '00000000-0000-4000-8000-0000000001a1')
      when n in ('b2','b3') then jsonb_build_object('id', id, 'name', 'Product ' || n, 'active', false, 'mergedIntoProductId', '00000000-0000-4000-8000-0000000001b1')
      when n in ('c2') then jsonb_build_object('id', id, 'name', 'Product ' || n, 'active', false, 'mergedIntoProductId', '00000000-0000-4000-8000-0000000001c1')
      else jsonb_build_object('id', id, 'name', 'Product ' || n, 'active', true) end order by n) from t_ids) as after;
set local marginflow.product_merge_v2 = 'on';
insert into public.marginflow_cloud_state (company_id, scope_key, module_key, payload, revision)
select '00000000-0000-4000-8000-0000000000c1', 'company', m, case when m = 'products' then (select before from t_snap) else '[]'::jsonb end, 5
from unnest(array['products','supplierProductMappings','invoiceLineCorrections','invoices','stocktakes','recipes','menus','wasteItems']) m;
set local marginflow.product_merge_v2 = 'off';
grant select on t_snap, t_ids to authenticated;
create temp table t_args as select
  '[{"keep":"00000000-0000-4000-8000-0000000001a1","sources":["00000000-0000-4000-8000-0000000001a2"]},
    {"keep":"00000000-0000-4000-8000-0000000001b1","sources":["00000000-0000-4000-8000-0000000001b2","00000000-0000-4000-8000-0000000001b3"]},
    {"keep":"00000000-0000-4000-8000-0000000001c1","sources":["00000000-0000-4000-8000-0000000001c2"]}]'::jsonb as groups,
  jsonb_build_object('products', (select after from t_snap), 'supplierProductMappings', '[]'::jsonb, 'invoiceLineCorrections', '[]'::jsonb,
    'invoices', '[]'::jsonb, 'stocktakes', '[]'::jsonb, 'recipes', '[]'::jsonb, 'menus', '[]'::jsonb, 'wasteItems', '[]'::jsonb) as modules,
  '{"products":5,"supplierProductMappings":5,"invoiceLineCorrections":5,"stocktakes":5,"recipes":5,"menus":5,"wasteItems":5}'::jsonb as revisions;
grant select on t_args to authenticated;

set local role authenticated;

-- 1. Outsider is refused.
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a2';
do $$ begin
  perform public.merge_products_batch('00000000-0000-4000-8000-0000000000c1', null, groups, modules, revisions) from t_args;
  raise exception 'FAIL outsider accepted';
exception when others then if sqlerrm not like 'Not authorised%' then raise; end if; end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
-- 2. Stale revisions are refused.
do $$ begin
  perform public.merge_products_batch('00000000-0000-4000-8000-0000000000c1', null, groups, modules, jsonb_set(revisions, '{products}', '4')) from t_args;
  raise exception 'FAIL stale revision accepted';
exception when others then if sqlerrm not like 'cloud_revision_conflict%' then raise; end if; end $$;
-- 3. A product in two groups is refused.
do $$ begin
  perform public.merge_products_batch('00000000-0000-4000-8000-0000000000c1', null,
    groups || '[{"keep":"00000000-0000-4000-8000-0000000001d1","sources":["00000000-0000-4000-8000-0000000001a2"]}]'::jsonb, modules, revisions) from t_args;
  raise exception 'FAIL duplicate accepted';
exception when others then if sqlerrm not like 'A product appears in more than one%' then raise; end if; end $$;
-- 4. A bad later group rolls back the earlier groups too (c2 not archived in the snapshot).
do $$ begin
  perform public.merge_products_batch('00000000-0000-4000-8000-0000000000c1', null, groups,
    jsonb_set(modules, '{products}', (select jsonb_agg(case when e->>'id' like '%1c2' then e - 'mergedIntoProductId' || '{"active":true}' else e end) from jsonb_array_elements(modules->'products') e)), revisions) from t_args;
  raise exception 'FAIL bad group accepted';
exception when others then if sqlerrm not like 'Every duplicate must be archived%' then raise; end if; end $$;
do $$ begin
  if exists (select 1 from public.products where active = false) then raise exception 'FAIL partial merge kept'; end if;
  if (select count(*) from public.invoice_lines where product_id::text like '%1a1') <> 0 then raise exception 'FAIL partial relink kept'; end if;
end $$;

-- 5. The batch merges all three groups in one call.
select public.merge_products_batch('00000000-0000-4000-8000-0000000000c1', null, groups, modules, revisions) is not null as merged from t_args;
reset role;
do $$ begin
  if (select count(*) from public.products where active = false) <> 4 then raise exception 'FAIL archived count'; end if;
  if exists (select 1 from public.invoice_lines where product_id::text ~ '1(a2|b2|b3|c2)$') then raise exception 'FAIL lines not relinked'; end if;
  if (select count(*) from public.invoice_lines where product_id::text like '%1b1') <> 2 then raise exception 'FAIL b lines'; end if;
  if (select count(*) from public.invoice_lines where product_id::text like '%1d1') <> 1 then raise exception 'FAIL untouched product changed'; end if;
  if (select count(*) from public.product_merges) <> 3 then raise exception 'FAIL merge audit rows'; end if;
  if (select payload from public.marginflow_cloud_state where module_key = 'products') <> (select after from t_snap) then raise exception 'FAIL final snapshot'; end if;
  if exists (select 1 from public.marginflow_cloud_state where module_key <> 'invoices' and revision <> 6) then raise exception 'FAIL revisions'; end if;
end $$;
select 'PASS merge_products_batch: outsider, stale revision, duplicate group, all-or-nothing rollback, 3 groups merged in one call' as result;
rollback;
