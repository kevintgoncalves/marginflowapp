-- Product merge in batches (catalogue import).
--
-- Additive: one new function, no table, column or row changes, existing functions untouched.
-- Why: the catalogue import merged duplicates one group per request, and every request carried
-- the whole workspace snapshot. With ~240 groups that is ~240 large requests. This function
-- runs several groups in ONE transaction, reusing public.merge_duplicate_products for each
-- group (same checks, same relinking of invoice/stocktake/recipe lines, same audit rows).
--
-- p_groups: [{"keep": "<uuid>", "sources": ["<uuid>", ...]}, ...] in the order the client merged.
-- p_snapshot_modules: the snapshot after ALL groups are merged (as merge_product_v2 expects for one).
-- All groups commit together or none do. Revisions are checked once and raised once.
--
-- merge_duplicate_products validates each group against the snapshot already stored, which
-- rejects products that are archived there. So for group i the stored products are the final
-- products with the duplicates of LATER groups still shown as active; the last group writes the
-- final snapshot exactly as sent.
--
-- Rollback: drop function public.merge_products_batch(uuid, uuid, jsonb, jsonb, jsonb);
--           alter function public.merge_product_v2(uuid, uuid, uuid, uuid[], jsonb, jsonb) reset statement_timeout;
-- (merges already made stay, as with merge_product_v2).

create or replace function public.merge_products_batch(
  p_company_id uuid,
  p_location_id uuid,
  p_groups jsonb,
  p_snapshot_modules jsonb,
  p_expected_module_revisions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
set statement_timeout = '120s'
as $$
declare
  v_modules text[] := array['products', 'supplierProductMappings', 'invoiceLineCorrections', 'stocktakes', 'recipes', 'menus', 'wasteItems'];
  v_module text;
  v_scope_key text := coalesce(p_location_id::text, 'company');
  v_expected bigint;
  v_actual bigint;
  v_count integer;
  v_index integer;
  v_group jsonb;
  v_keep uuid;
  v_sources uuid[];
  v_later text[];
  v_all_ids uuid[] := '{}'::uuid[];
  v_step_modules jsonb;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_operation_key uuid := extensions.gen_random_uuid();
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if jsonb_typeof(p_groups) <> 'array' then raise exception 'Merge groups must be an array'; end if;
  v_count := jsonb_array_length(p_groups);
  if v_count < 1 or v_count > 100 then raise exception 'Send between 1 and 100 merge groups per batch'; end if;
  if jsonb_typeof(p_expected_module_revisions) <> 'object' then raise exception 'Expected module revisions are required'; end if;
  if jsonb_typeof(p_snapshot_modules) <> 'object' or jsonb_typeof(p_snapshot_modules->'products') <> 'array' then
    raise exception 'Snapshot merge payload must be an object with products';
  end if;

  -- Every product appears in one group only.
  for v_index in 0 .. v_count - 1 loop
    v_group := p_groups->v_index;
    if jsonb_typeof(v_group->'sources') <> 'array' or coalesce(v_group->>'keep', '') = '' then
      raise exception 'Merge group % is invalid', v_index + 1;
    end if;
    v_all_ids := v_all_ids || (v_group->>'keep')::uuid
      || array(select value::uuid from jsonb_array_elements_text(v_group->'sources'));
  end loop;
  if cardinality(v_all_ids) <> (select count(distinct id) from unnest(v_all_ids) id) then
    raise exception 'A product appears in more than one merge group';
  end if;

  perform 1 from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_modules) for update;
  foreach v_module in array v_modules loop
    if not (p_expected_module_revisions ? v_module) then raise exception 'Missing expected module revision for %', v_module; end if;
    v_expected := (p_expected_module_revisions->>v_module)::bigint;
    select revision into v_actual from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = v_module;
    if coalesce(v_actual, 0) <> v_expected then raise exception 'cloud_revision_conflict:%:expected_%:actual_%', v_module, v_expected, coalesce(v_actual, 0); end if;
  end loop;

  insert into public.product_merge_format_archives (company_id, operation_key, source_format_id, source_row, created_at, created_by)
  select p_company_id, v_operation_key, format_row.id, to_jsonb(format_row), now(), auth.uid()
  from public.product_supplier_formats format_row
  where format_row.company_id = p_company_id and format_row.product_id = any(v_all_ids);

  perform set_config('marginflow.product_merge_v2', 'on', true);
  for v_index in 0 .. v_count - 1 loop
    v_group := p_groups->v_index;
    v_keep := (v_group->>'keep')::uuid;
    v_sources := array(select value::uuid from jsonb_array_elements_text(v_group->'sources'));
    -- Duplicates of the groups still to come stay active in this step's stored products.
    select coalesce(array_agg(value), '{}'::text[]) into v_later
    from jsonb_array_elements(p_groups) with ordinality later(item, position),
         jsonb_array_elements_text(later.item->'sources') value
    where later.position > v_index + 1;
    if cardinality(v_later) = 0 then
      v_step_modules := p_snapshot_modules;
    else
      v_step_modules := jsonb_set(p_snapshot_modules, '{products}', (
        select coalesce(jsonb_agg(case when entry->>'id' = any(v_later)
          then (entry - 'mergedIntoProductId') || '{"active": true}'::jsonb else entry end order by position), '[]'::jsonb)
        from jsonb_array_elements(p_snapshot_modules->'products') with ordinality product(entry, position)
      ));
    end if;
    v_result := public.merge_duplicate_products(p_company_id, p_location_id, v_keep, v_sources, v_step_modules);
    v_results := v_results || jsonb_build_array(jsonb_build_object('keep', v_keep, 'merge_id', v_result->>'merge_id'));
  end loop;
  update public.product_merge_format_archives set merge_id = (v_results->0->>'merge_id')::uuid
  where operation_key = v_operation_key and merge_id is null;

  foreach v_module in array v_modules loop
    v_expected := (p_expected_module_revisions->>v_module)::bigint;
    update public.marginflow_cloud_state
    set revision = v_expected + 1, updated_at = now(), updated_by = auth.uid()
    where company_id = p_company_id and scope_key = v_scope_key and module_key = v_module;
  end loop;
  perform set_config('marginflow.product_merge_v2', 'off', true);
  return jsonb_build_object(
    'merged', v_results,
    'module_revisions', (select jsonb_object_agg(module_key, revision) from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_modules)),
    'format_archive_operation', v_operation_key
  );
end;
$$;

-- The one-group merge stays as the fallback; it gets the same time limit (was safety/proposals/
-- product-merge-timeout.sql). Function configuration only. Rollback: alter function ... reset statement_timeout;
alter function public.merge_product_v2(uuid, uuid, uuid, uuid[], jsonb, jsonb) set statement_timeout = '120s';

revoke all on function public.merge_products_batch(uuid, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.merge_products_batch(uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
