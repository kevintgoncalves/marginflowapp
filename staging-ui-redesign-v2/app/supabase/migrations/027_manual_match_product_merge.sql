-- Persist user-confirmed invoice product matches and merge duplicate products atomically.

alter table public.supplier_product_mappings
  add column if not exists source text not null default 'confirmed_invoice';

create index if not exists supplier_product_mappings_source_idx
  on public.supplier_product_mappings(company_id, source);

create or replace function public.persist_supplier_product_learning_v2(
  p_company_id uuid,
  p_location_id uuid,
  p_supplier_id uuid,
  p_supplier_product_code text,
  p_normalized_supplier_product_code text,
  p_supplier_description text,
  p_normalized_supplier_description text,
  p_unit_of_measure text,
  p_normalized_unit_of_measure text,
  p_pack_size text,
  p_normalized_pack_size text,
  p_product_id uuid,
  p_allocation_mode text,
  p_department_id uuid,
  p_split_lines jsonb,
  p_auto_apply boolean,
  p_source_invoice_external_id text,
  p_supplier_name text,
  p_product_name text,
  p_department_name text,
  p_mapping_key text,
  p_confirmed_at timestamptz,
  p_match_source text
)
returns table(mapping_id uuid)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_mapping_id uuid;
  v_source text := case when p_match_source = 'manual_selection' then 'manual_selection' else 'confirmed_invoice' end;
begin
  select persisted.mapping_id into v_mapping_id
  from public.persist_supplier_product_learning(
    p_company_id,
    p_location_id,
    p_supplier_id,
    p_supplier_product_code,
    p_normalized_supplier_product_code,
    p_supplier_description,
    p_normalized_supplier_description,
    p_unit_of_measure,
    p_normalized_unit_of_measure,
    p_pack_size,
    p_normalized_pack_size,
    p_product_id,
    p_allocation_mode,
    p_department_id,
    p_split_lines,
    p_auto_apply,
    p_source_invoice_external_id,
    p_supplier_name,
    p_product_name,
    p_department_name,
    p_mapping_key,
    p_confirmed_at
  ) persisted;

  update public.supplier_product_mappings
  set source = v_source,
      auto_apply = case when v_source = 'manual_selection' then true else auto_apply end,
      metadata = metadata || jsonb_build_object(
        'mapping_source', v_source,
        'user_confirmed', v_source = 'manual_selection'
      ),
      updated_at = coalesce(p_confirmed_at, now()),
      updated_by = auth.uid()
  where id = v_mapping_id;

  mapping_id := v_mapping_id;
  return next;
end;
$$;

revoke all on function public.persist_supplier_product_learning_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, uuid, jsonb, boolean, text, text, text, text, text, timestamptz, text) from public;
grant execute on function public.persist_supplier_product_learning_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, uuid, jsonb, boolean, text, text, text, text, text, timestamptz, text) to authenticated;

alter table public.products
  add column if not exists archived_at timestamptz,
  add column if not exists merged_into_product_id uuid references public.products(id) on delete set null,
  add column if not exists merged_at timestamptz,
  add column if not exists merge_metadata jsonb not null default '{}'::jsonb;

create index if not exists products_merged_into_product_id_idx on public.products(merged_into_product_id);
create index if not exists products_archived_at_idx on public.products(archived_at);

create table if not exists public.product_merges (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  canonical_product_id uuid not null,
  merged_product_ids uuid[] not null,
  aliases_added text[] not null default '{}'::text[],
  affected_counts jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint product_merges_sources_check check (cardinality(merged_product_ids) > 0)
);

create index if not exists product_merges_company_id_idx on public.product_merges(company_id);
create index if not exists product_merges_canonical_product_id_idx on public.product_merges(canonical_product_id);
alter table public.product_merges enable row level security;

drop policy if exists product_merges_select_member on public.product_merges;
create policy product_merges_select_member
  on public.product_merges for select to authenticated
  using (public.is_active_company_member(company_id));

create or replace function public.normalize_product_alias(value text)
returns text
language sql
immutable
parallel safe
as $$
  select trim(regexp_replace(lower(regexp_replace(coalesce(value, ''), '&', ' and ', 'g')), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.merge_duplicate_products(
  p_company_id uuid,
  p_location_id uuid,
  p_keep_product_id uuid,
  p_merge_product_ids uuid[],
  p_snapshot_modules jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_all_ids uuid[];
  v_all_id_text text[];
  v_source_ids uuid[];
  v_source_id_text text[];
  v_required_modules text[] := array[
    'products',
    'supplierProductMappings',
    'invoiceLineCorrections',
    'invoices',
    'stocktakes',
    'recipes',
    'menus',
    'wasteItems'
  ];
  v_known_reference_tables text[] := array[
    'products',
    'product_supplier_prices',
    'product_price_history',
    'product_supplier_formats',
    'invoice_lines',
    'stocktake_lines',
    'recipe_ingredients',
    'menu_item_components',
    'waste_entries',
    'supplier_product_mappings',
    'invoice_line_corrections'
  ];
  v_unknown_reference_tables text[];
  v_existing_products jsonb := '[]'::jsonb;
  v_existing_stocktakes jsonb := '[]'::jsonb;
  v_existing_recipes jsonb := '[]'::jsonb;
  v_existing_menus jsonb := '[]'::jsonb;
  v_scope_key text := coalesce(p_location_id::text, 'company');
  v_module_key text;
  v_now timestamptz := now();
  v_safe_aliases text[] := '{}'::text[];
  v_affected_counts jsonb;
  v_merge_id uuid;
  v_expected_count integer;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if p_keep_product_id is null or coalesce(cardinality(p_merge_product_ids), 0) < 1 then
    raise exception 'Choose one canonical product and at least one duplicate';
  end if;

  select array_agg(distinct source_id) into v_source_ids
  from unnest(p_merge_product_ids) source_id
  where source_id is not null and source_id <> p_keep_product_id;
  if coalesce(cardinality(v_source_ids), 0) < 1 then
    raise exception 'Duplicate product selection is invalid';
  end if;
  v_all_ids := array_prepend(p_keep_product_id, v_source_ids);
  select array_agg(product_id::text) into v_all_id_text from unnest(v_all_ids) product_id;
  select array_agg(product_id::text) into v_source_id_text from unnest(v_source_ids) product_id;
  v_expected_count := cardinality(v_all_ids);

  if jsonb_typeof(p_snapshot_modules) <> 'object' then
    raise exception 'Snapshot merge payload must be an object';
  end if;
  foreach v_module_key in array v_required_modules loop
    if not (p_snapshot_modules ? v_module_key) or jsonb_typeof(p_snapshot_modules->v_module_key) <> 'array' then
      raise exception 'Snapshot merge payload is missing module %', v_module_key;
    end if;
  end loop;
  if exists (
    select 1 from jsonb_object_keys(p_snapshot_modules) module_key
    where not (module_key = any(v_required_modules))
  ) then
    raise exception 'Snapshot merge payload contains an unsupported module';
  end if;

  perform 1
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_required_modules)
  for update;

  select coalesce(payload, '[]'::jsonb) into v_existing_products
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'products';
  select coalesce(payload, '[]'::jsonb) into v_existing_stocktakes
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'stocktakes';
  select coalesce(payload, '[]'::jsonb) into v_existing_recipes
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'recipes';
  select coalesce(payload, '[]'::jsonb) into v_existing_menus
  from public.marginflow_cloud_state
  where company_id = p_company_id and scope_key = v_scope_key and module_key = 'menus';

  perform id from public.products where id = any(v_all_ids) for update;
  if exists (select 1 from public.products where id = any(v_all_ids) and company_id <> p_company_id) then
    raise exception 'Products from another company cannot be merged';
  end if;
  if exists (select 1 from public.products where id = any(v_all_ids) and active = false) then
    raise exception 'Archived products cannot be merged again';
  end if;

  if (
    select count(distinct product_id)
    from (
      select id as product_id from public.products where id = any(v_all_ids) and company_id = p_company_id
      union all
      select (entry->>'id')::uuid
      from jsonb_array_elements(coalesce(v_existing_products, '[]'::jsonb)) entry
      where entry->>'id' = any(v_all_id_text)
    ) owned_products
  ) <> v_expected_count then
    raise exception 'Every selected product must belong to the current company state';
  end if;

  if exists (
    select 1 from jsonb_array_elements(coalesce(v_existing_products, '[]'::jsonb)) entry
    where entry->>'id' = any(v_all_id_text)
      and coalesce((entry->>'active')::boolean, true) = false
  ) then
    raise exception 'Archived products cannot be merged again';
  end if;

  if not exists (
    select 1 from jsonb_array_elements(p_snapshot_modules->'products') entry
    where entry->>'id' = p_keep_product_id::text and coalesce((entry->>'active')::boolean, true)
  ) then
    raise exception 'Canonical product must remain active in the merged snapshot';
  end if;
  if (
    select count(*) from jsonb_array_elements(p_snapshot_modules->'products') entry
    where entry->>'id' = any(v_source_id_text)
      and coalesce((entry->>'active')::boolean, true) = false
      and entry->>'mergedIntoProductId' = p_keep_product_id::text
  ) <> cardinality(v_source_ids) then
    raise exception 'Every duplicate must be archived into the canonical product';
  end if;

  select array_agg(child.relname order by child.relname) into v_unknown_reference_tables
  from pg_constraint constraint_row
  join pg_class child on child.oid = constraint_row.conrelid
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = 'public.products'::regclass
    and not (child.relname = any(v_known_reference_tables));
  if coalesce(cardinality(v_unknown_reference_tables), 0) > 0 then
    raise exception 'Product merge schema audit required for tables: %', array_to_string(v_unknown_reference_tables, ', ');
  end if;

  if exists (
    select 1
    from public.recipe_ingredients ingredient
    where ingredient.company_id = p_company_id and ingredient.product_id = any(v_all_ids)
    group by ingredient.recipe_id
    having count(distinct ingredient.product_id) > 1
  ) then
    raise exception 'A recipe contains multiple selected products; resolve its quantities before merging';
  end if;
  if exists (
    select 1
    from public.menu_item_components component
    where component.company_id = p_company_id and component.product_id = any(v_all_ids)
    group by component.menu_item_id
    having count(distinct component.product_id) > 1
  ) then
    raise exception 'A menu item contains multiple selected products; resolve its quantities before merging';
  end if;
  if exists (
    select 1
    from public.stocktake_lines line
    join public.stocktakes stocktake on stocktake.id = line.stocktake_id
    where line.company_id = p_company_id
      and line.product_id = any(v_all_ids)
      and lower(stocktake.status) in ('active', 'draft', 'in progress', 'open')
    group by line.stocktake_id
    having count(distinct line.product_id) > 1
  ) then
    raise exception 'An active Stock Take contains counts for multiple selected products';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_recipes, '[]'::jsonb)) recipe
    cross join lateral jsonb_array_elements(coalesce(recipe->'ingredients', '[]'::jsonb)) ingredient
    where coalesce(ingredient->>'productId', ingredient->>'product_id') = any(v_all_id_text)
    group by recipe->>'id'
    having count(distinct coalesce(ingredient->>'productId', ingredient->>'product_id')) > 1
  ) then
    raise exception 'A snapshot recipe contains multiple selected products';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_stocktakes, '[]'::jsonb)) stocktake
    cross join lateral jsonb_array_elements(coalesce(stocktake->'lines', '[]'::jsonb) || coalesce(stocktake->'openingLines', '[]'::jsonb)) line
    where lower(coalesce(stocktake->>'status', '')) in ('active', 'draft', 'in progress', 'open')
      and coalesce(line->>'matchedProductId', line->>'productId') = any(v_all_id_text)
    group by stocktake->>'id'
    having count(distinct coalesce(line->>'matchedProductId', line->>'productId')) > 1
  ) then
    raise exception 'A snapshot active Stock Take contains counts for multiple selected products';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_menus, '[]'::jsonb)) menu
    cross join lateral jsonb_array_elements(coalesce(menu->'subcategories', '[]'::jsonb)) subcategory
    cross join lateral jsonb_array_elements(coalesce(subcategory->'dishes', '[]'::jsonb)) dish
    cross join lateral jsonb_array_elements(coalesce(dish->'ingredients', '[]'::jsonb)) ingredient
    where lower(coalesce(ingredient->>'type', 'product')) = 'product'
      and coalesce(ingredient->>'sourceId', ingredient->>'productId') = any(v_all_id_text)
    group by dish->>'id'
    having count(distinct coalesce(ingredient->>'sourceId', ingredient->>'productId')) > 1
  ) then
    raise exception 'A snapshot menu item contains multiple selected products';
  end if;

  select jsonb_build_object(
    'invoice_lines', (select count(*) from public.invoice_lines where company_id = p_company_id and product_id = any(v_source_ids)),
    'supplier_mappings', (select count(*) from public.supplier_product_mappings where company_id = p_company_id and product_id = any(v_source_ids)),
    'stocktake_lines', (select count(*) from public.stocktake_lines where company_id = p_company_id and product_id = any(v_source_ids)),
    'recipe_ingredients', (select count(*) from public.recipe_ingredients where company_id = p_company_id and product_id = any(v_source_ids)),
    'menu_components', (select count(*) from public.menu_item_components where company_id = p_company_id and product_id = any(v_source_ids)),
    'waste_entries', (select count(*) from public.waste_entries where company_id = p_company_id and product_id = any(v_source_ids)),
    'price_history', (select count(*) from public.product_price_history where company_id = p_company_id and product_id = any(v_source_ids)),
    'supplier_prices', (select count(*) from public.product_supplier_prices where company_id = p_company_id and product_id = any(v_source_ids)),
    'supplier_formats', (select count(*) from public.product_supplier_formats where company_id = p_company_id and product_id = any(v_source_ids)),
    'invoice_corrections', (select count(*) from public.invoice_line_corrections where company_id = p_company_id and product_id = any(v_source_ids))
  ) into v_affected_counts;

  select coalesce(array_agg(candidate.alias_value order by candidate.alias_value), '{}'::text[])
  into v_safe_aliases
  from (
    select distinct alias_value
    from (
      select source_product.name as alias_value
      from public.products source_product
      where source_product.id = any(v_source_ids) and source_product.company_id = p_company_id
      union all
      select source_alias
      from public.products source_product
      cross join lateral unnest(source_product.aliases) source_alias
      where source_product.id = any(v_source_ids) and source_product.company_id = p_company_id
    ) source_names
    where public.normalize_product_alias(alias_value) <> ''
      and not exists (
        select 1
        from public.products other_product
        where other_product.company_id = p_company_id
          and other_product.active
          and not (other_product.id = any(v_all_ids))
          and (
            public.normalize_product_alias(other_product.name) = public.normalize_product_alias(alias_value)
            or exists (
              select 1 from unnest(other_product.aliases) other_alias
              where public.normalize_product_alias(other_alias) = public.normalize_product_alias(alias_value)
            )
          )
      )
  ) candidate;

  update public.products canonical
  set aliases = (
        select coalesce(array_agg(alias_value order by alias_value), '{}'::text[])
        from (
          select distinct on (public.normalize_product_alias(alias_value)) alias_value
          from unnest(coalesce(canonical.aliases, '{}'::text[]) || v_safe_aliases) alias_value
          where public.normalize_product_alias(alias_value) <> ''
            and public.normalize_product_alias(alias_value) <> public.normalize_product_alias(canonical.name)
          order by public.normalize_product_alias(alias_value), alias_value
        ) aliases
      ),
      merge_metadata = canonical.merge_metadata || jsonb_build_object(
        'last_merged_at', v_now,
        'merged_product_ids', to_jsonb(v_source_ids)
      ),
      updated_at = v_now,
      updated_by = auth.uid()
  where canonical.id = p_keep_product_id and canonical.company_id = p_company_id;

  update public.invoice_lines set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.stocktake_lines set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.recipe_ingredients set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.menu_item_components set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.waste_entries set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.product_supplier_prices set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.product_price_history set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.supplier_product_mappings
    set product_id = p_keep_product_id,
        metadata = metadata || jsonb_build_object('product_merge_at', v_now, 'previous_product_id', product_id),
        updated_at = v_now,
        updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);
  update public.invoice_line_corrections set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);

  with ranked as materialized (
    select format_row.id,
      first_value(format_row.id) over (
        partition by format_row.company_id, format_row.location_id, format_row.supplier_id, format_row.pack_size
        order by (format_row.product_id = p_keep_product_id) desc, format_row.active desc, format_row.updated_at desc, format_row.id
      ) as winner_id,
      row_number() over (
        partition by format_row.company_id, format_row.location_id, format_row.supplier_id, format_row.pack_size
        order by (format_row.product_id = p_keep_product_id) desc, format_row.active desc, format_row.updated_at desc, format_row.id
      ) as position
    from public.product_supplier_formats format_row
    where format_row.company_id = p_company_id and format_row.product_id = any(v_all_ids)
  ), merged_ids as (
    select winner_id, jsonb_agg(id order by id) filter (where position > 1) as source_ids
    from ranked
    group by winner_id
  ), updated_winners as (
    update public.product_supplier_formats winner
    set metadata = winner.metadata || jsonb_build_object('merged_format_ids', coalesce(merged_ids.source_ids, '[]'::jsonb)),
        updated_at = v_now,
        updated_by = auth.uid()
    from merged_ids
    where winner.id = merged_ids.winner_id
    returning winner.id
  )
  delete from public.product_supplier_formats loser
  using ranked
  where loser.id = ranked.id and ranked.position > 1;

  update public.product_supplier_formats set product_id = p_keep_product_id, updated_at = v_now, updated_by = auth.uid()
    where company_id = p_company_id and product_id = any(v_source_ids);

  update public.products duplicate
  set active = false,
      archived_at = coalesce(duplicate.archived_at, v_now),
      merged_into_product_id = p_keep_product_id,
      merged_at = v_now,
      merge_metadata = duplicate.merge_metadata || jsonb_build_object(
        'canonical_product_id', p_keep_product_id,
        'merged_at', v_now,
        'merged_by', auth.uid()
      ),
      updated_at = v_now,
      updated_by = auth.uid()
  where duplicate.company_id = p_company_id and duplicate.id = any(v_source_ids);

  foreach v_module_key in array v_required_modules loop
    insert into public.marginflow_cloud_state (
      company_id, location_id, scope_key, module_key, payload, synced_at, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, v_scope_key, v_module_key, p_snapshot_modules->v_module_key,
      v_now, v_now, v_now, auth.uid(), auth.uid()
    )
    on conflict (company_id, scope_key, module_key) do update
    set payload = excluded.payload,
        location_id = excluded.location_id,
        synced_at = excluded.synced_at,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  end loop;

  insert into public.product_merges (
    company_id, location_id, canonical_product_id, merged_product_ids, aliases_added,
    affected_counts, metadata, created_at, created_by
  ) values (
    p_company_id, p_location_id, p_keep_product_id, v_source_ids, v_safe_aliases,
    v_affected_counts,
    jsonb_build_object(
      'scope_key', v_scope_key,
      'reference_tables_checked', to_jsonb(v_known_reference_tables),
      'snapshot_modules_updated', to_jsonb(v_required_modules)
    ),
    v_now, auth.uid()
  ) returning id into v_merge_id;

  return jsonb_build_object(
    'merge_id', v_merge_id,
    'canonical_product_id', p_keep_product_id,
    'merged_product_ids', to_jsonb(v_source_ids),
    'aliases_added', to_jsonb(v_safe_aliases),
    'affected_counts', v_affected_counts,
    'merged_at', v_now
  );
end;
$$;

revoke all on function public.merge_duplicate_products(uuid, uuid, uuid, uuid[], jsonb) from public;
grant execute on function public.merge_duplicate_products(uuid, uuid, uuid, uuid[], jsonb) to authenticated;
