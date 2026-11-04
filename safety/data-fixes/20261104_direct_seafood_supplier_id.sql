-- One-off data correction, 4 Nov 2026 — Direct Seafood supplier id.
-- NOT a migration. Kevin runs it by hand in the Supabase SQL editor, one part at a time.
--
-- Problem: in the cloud supplier list Direct Seafood has id 0cfa3be4-… and
-- relationalId 1d4b5b7e-…; the suppliers table, its 7 invoices and all their links use
-- 1d4b5b7e-…. Its delivery schedule also points at 0cfa3be4-….
-- Fix: set the supplier's id and the schedule's supplierId to 1d4b5b7e-…. The old id is
-- kept in legacyIds / legacySupplierIds. No other record, field or module changes.
-- Since the 4 Nov app release, the app already accepts both ids, so this is a clean-up.
--
-- Before Part 2: close MarginFlow in every other tab/device.

-- =====================================================================================
-- PART 1 — READ ONLY. Run it, then use "Export → CSV" and keep the file (before-state).
-- =====================================================================================
select id, company_id, location_id, module_key, revision, updated_at,
       jsonb_array_length(case when jsonb_typeof(payload) = 'array' then payload else '[]'::jsonb end) as items,
       payload
from public.marginflow_cloud_state
where payload::text like '%0cfa3be4-d62e-4f55-a09f-3236c8ba5acb%'
order by module_key;

-- =====================================================================================
-- PART 2 — CORRECTION. Run the whole block at once. It stops and changes nothing if the
-- data is not exactly as expected.
-- =====================================================================================
begin;

do $$
declare
  v_old constant text := '0cfa3be4-d62e-4f55-a09f-3236c8ba5acb';
  v_new constant text := '1d4b5b7e-59ad-4ce1-ba4a-ff02476ea1c4';
  v_count integer;
begin
  if not exists (select 1 from public.suppliers where id = v_new::uuid) then
    raise exception 'stopped: supplier % is not in the suppliers table', v_new;
  end if;

  select count(*) into v_count
  from public.marginflow_cloud_state s, jsonb_array_elements(s.payload) e
  where s.module_key = 'suppliers' and jsonb_typeof(s.payload) = 'array'
    and e->>'id' = v_old and e->>'relationalId' = v_new;
  if v_count <> 1 then
    raise exception 'stopped: expected 1 Direct Seafood entry with id % and relationalId %, found %', v_old, v_new, v_count;
  end if;

  select count(*) into v_count
  from public.marginflow_cloud_state s, jsonb_array_elements(s.payload) e
  where s.module_key = 'suppliers' and jsonb_typeof(s.payload) = 'array' and e->>'id' = v_new;
  if v_count <> 0 then
    raise exception 'stopped: a supplier entry already uses id % (would create a duplicate)', v_new;
  end if;

  select count(*) into v_count
  from public.marginflow_cloud_state s, jsonb_array_elements(s.payload) e
  where s.module_key = 'supplierDeliverySchedules' and jsonb_typeof(s.payload) = 'array'
    and e->>'supplierId' = v_old;
  if v_count > 1 then
    raise exception 'stopped: expected at most 1 delivery schedule for %, found %', v_old, v_count;
  end if;

  -- Supplier list: only the Direct Seafood element changes; order and every other element are kept.
  update public.marginflow_cloud_state s
  set payload = (
        select jsonb_agg(
                 case when t.e->>'id' = v_old
                   then t.e || jsonb_build_object(
                          'id', v_new,
                          'legacyIds', coalesce(case when jsonb_typeof(t.e->'legacyIds') = 'array' then t.e->'legacyIds' end, '[]'::jsonb) || to_jsonb(v_old))
                   else t.e end
                 order by t.ord)
        from jsonb_array_elements(s.payload) with ordinality as t(e, ord)),
      revision = s.revision + 1,
      updated_at = now()
  where s.module_key = 'suppliers' and jsonb_typeof(s.payload) = 'array'
    and s.payload @> jsonb_build_array(jsonb_build_object('id', v_old));
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'stopped: supplier list update touched % rows', v_count; end if;

  -- Delivery schedule: only the entry for the old id changes.
  update public.marginflow_cloud_state s
  set payload = (
        select jsonb_agg(
                 case when t.e->>'supplierId' = v_old
                   then t.e || jsonb_build_object(
                          'supplierId', v_new,
                          'legacySupplierIds', coalesce(case when jsonb_typeof(t.e->'legacySupplierIds') = 'array' then t.e->'legacySupplierIds' end, '[]'::jsonb) || to_jsonb(v_old))
                   else t.e end
                 order by t.ord)
        from jsonb_array_elements(s.payload) with ordinality as t(e, ord)),
      revision = s.revision + 1,
      updated_at = now()
  where s.module_key = 'supplierDeliverySchedules' and jsonb_typeof(s.payload) = 'array'
    and s.payload @> jsonb_build_array(jsonb_build_object('supplierId', v_old));
  get diagnostics v_count = row_count;
  if v_count > 1 then raise exception 'stopped: schedule update touched % rows', v_count; end if;
end $$;

commit;

-- =====================================================================================
-- PART 3 — READ ONLY verification. Expected: suppliers → 1 row with id 1d4b5b7e-… and
-- legacyIds ["0cfa3be4-…"]; schedule → supplierId 1d4b5b7e-…; item counts as in Part 1.
-- =====================================================================================
select s.module_key, s.revision,
       jsonb_array_length(s.payload) as items,
       e->>'name' as name, e->>'supplierName' as supplier_name,
       e->>'id' as id, e->>'relationalId' as relational_id, e->>'supplierId' as supplier_id,
       e->'legacyIds' as legacy_ids, e->'legacySupplierIds' as legacy_supplier_ids
from public.marginflow_cloud_state s, jsonb_array_elements(s.payload) e
where s.module_key in ('suppliers', 'supplierDeliverySchedules') and jsonb_typeof(s.payload) = 'array'
  and (e->>'id' = '1d4b5b7e-59ad-4ce1-ba4a-ff02476ea1c4'
       or e->>'supplierId' = '1d4b5b7e-59ad-4ce1-ba4a-ff02476ea1c4'
       or e::text like '%0cfa3be4-d62e-4f55-a09f-3236c8ba5acb%');
