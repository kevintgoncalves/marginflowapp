-- Dependency-aware, explicit recovery of current-device legacy purchasing data.
-- Installation performs no data migration. Authenticated users must preview and
-- explicitly invoke the RPCs from the recovery UI.

create or replace function public.marginflow_recovery_supplier_key(value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(string_agg(word, '' order by position), '')
  from regexp_split_to_table(
    trim(regexp_replace(lower(replace(coalesce(value, ''), '&', ' and ')), '[^a-z0-9]+', ' ', 'g')),
    '\s+'
  ) with ordinality as words(word, position)
  where word <> ''
    and word not in ('ltd', 'limited', 'plc', 'llp', 'llc', 'co', 'company', 'the');
$$;

create or replace function public.recover_legacy_catalog_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_suppliers jsonb,
  p_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_supplier jsonb;
  v_product jsonb;
  v_requested_id uuid;
  v_existing_id uuid;
  v_matching_ids uuid[];
  v_supplier_id uuid;
  v_department_id uuid;
  v_legacy_id text;
  v_aliases text[];
  v_suppliers_inserted integer := 0;
  v_suppliers_existing integer := 0;
  v_products_inserted integer := 0;
  v_products_existing integer := 0;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id and active
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if jsonb_typeof(coalesce(p_suppliers, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array' then
    raise exception 'Recovery catalog payloads must be JSON arrays';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'marginflow_legacy_catalog|' || p_company_id::text || '|' || coalesce(p_location_id::text, 'company'),
    0
  ));

  for v_supplier in select value from jsonb_array_elements(coalesce(p_suppliers, '[]'::jsonb))
  loop
    v_requested_id := public.marginflow_try_uuid(v_supplier->>'id');
    if v_requested_id is null or nullif(trim(v_supplier->>'name'), '') is null then
      raise exception 'Every recovered supplier needs a stable UUID and name';
    end if;
    if jsonb_typeof(coalesce(v_supplier->'metadata', '{}'::jsonb)) <> 'object' then
      raise exception 'Recovered supplier metadata must be a JSON object';
    end if;

    select supplier.id into v_existing_id
    from public.suppliers supplier
    where supplier.id = v_requested_id
    for update;
    if v_existing_id is not null then
      if not exists (
        select 1 from public.suppliers supplier
        where supplier.id = v_existing_id
          and supplier.company_id = p_company_id
          and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
      ) then
        raise exception 'Recovered supplier identifier belongs to another scope';
      end if;
      if not exists (
        select 1 from public.suppliers supplier
        where supplier.id = v_existing_id
          and public.marginflow_recovery_supplier_key(supplier.name)
            = public.marginflow_recovery_supplier_key(v_supplier->>'name')
      ) then
        raise exception 'Recovered supplier identifier belongs to a different supplier identity';
      end if;
      v_suppliers_existing := v_suppliers_existing + 1;
      continue;
    end if;

    select array_agg(supplier.id order by supplier.id) into v_matching_ids
    from public.suppliers supplier
    where supplier.company_id = p_company_id
      and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
      and supplier.deleted_at is null
      and public.marginflow_recovery_supplier_key(supplier.name)
        = public.marginflow_recovery_supplier_key(v_supplier->>'name');
    if coalesce(cardinality(v_matching_ids), 0) > 1 then
      raise exception 'recovery_supplier_identity_conflict:%', v_supplier->>'name';
    end if;
    if coalesce(cardinality(v_matching_ids), 0) = 1 then
      raise exception 'recovery_preview_stale:supplier:%', v_supplier->>'name';
    end if;

    insert into public.suppliers (
      id, company_id, location_id, name, category, contact_name, email, phone,
      active, parser_key, metadata, created_at, updated_at, created_by, updated_by
    ) values (
      v_requested_id,
      p_company_id,
      p_location_id,
      trim(v_supplier->>'name'),
      nullif(trim(v_supplier->>'category'), ''),
      nullif(trim(v_supplier->>'contactName'), ''),
      nullif(trim(v_supplier->>'email'), ''),
      nullif(trim(v_supplier->>'phone'), ''),
      coalesce((v_supplier->>'active')::boolean, true),
      nullif(trim(v_supplier->>'parserKey'), ''),
      coalesce(v_supplier->'metadata', '{}'::jsonb),
      now(), now(), auth.uid(), auth.uid()
    );
    v_suppliers_inserted := v_suppliers_inserted + 1;
  end loop;

  for v_product in select value from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_requested_id := public.marginflow_try_uuid(v_product->>'id');
    v_legacy_id := nullif(trim(v_product->>'legacyId'), '');
    v_supplier_id := public.marginflow_try_uuid(v_product->>'supplierId');
    v_department_id := public.marginflow_try_uuid(v_product->>'departmentId');
    if v_requested_id is null or nullif(trim(v_product->>'name'), '') is null then
      raise exception 'Every recovered product needs a stable UUID and name';
    end if;
    if jsonb_typeof(coalesce(v_product->'metadata', '{}'::jsonb)) <> 'object'
       or jsonb_typeof(coalesce(v_product->'aliases', '[]'::jsonb)) <> 'array' then
      raise exception 'Recovered product metadata and aliases have invalid JSON types';
    end if;
    if v_supplier_id is not null and not exists (
      select 1 from public.suppliers supplier
      where supplier.id = v_supplier_id
        and supplier.company_id = p_company_id
        and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
    ) then
      raise exception 'Recovered product supplier dependency is missing:%', v_product->>'name';
    end if;
    if v_department_id is not null and not exists (
      select 1 from public.departments department
      where department.id = v_department_id
        and department.company_id = p_company_id
        and (department.location_id is null or department.location_id is not distinct from p_location_id)
    ) then
      raise exception 'Recovered product department dependency is missing:%', v_product->>'name';
    end if;

    select product.id into v_existing_id
    from public.products product
    where product.id = v_requested_id
    for update;
    if v_existing_id is not null then
      if not exists (
        select 1 from public.products product
        where product.id = v_existing_id
          and product.company_id = p_company_id
          and (product.location_id is null or product.location_id is not distinct from p_location_id)
      ) then
        raise exception 'Recovered product identifier belongs to another scope';
      end if;
      if not exists (
        select 1 from public.products product
        where product.id = v_existing_id
          and lower(trim(product.name)) = lower(trim(v_product->>'name'))
          and (v_supplier_id is null or product.supplier_id is null or product.supplier_id = v_supplier_id)
      ) then
        raise exception 'Recovered product identifier belongs to a different product identity';
      end if;
      v_products_existing := v_products_existing + 1;
      continue;
    end if;
    select array_agg(product.id order by product.id) into v_matching_ids
    from public.products product
    where v_legacy_id is not null
      and product.company_id = p_company_id
      and (product.location_id is null or product.location_id is not distinct from p_location_id)
      and product.metadata #>> '{legacyRecovery,legacyId}' = v_legacy_id;
    if coalesce(cardinality(v_matching_ids), 0) > 1 then
      raise exception 'recovery_product_legacy_identity_conflict:%', v_legacy_id;
    end if;
    if coalesce(cardinality(v_matching_ids), 0) = 1 then
      raise exception 'recovery_preview_stale:product:%', v_legacy_id;
    end if;
    if exists (
      select 1 from public.products product
      where product.company_id = p_company_id
        and (product.location_id is null or product.location_id is not distinct from p_location_id)
        and lower(trim(product.name)) = lower(trim(v_product->>'name'))
    ) then
      raise exception 'recovery_product_identity_conflict:%', v_product->>'name';
    end if;

    select coalesce(array_agg(alias_value), '{}'::text[]) into v_aliases
    from jsonb_array_elements_text(coalesce(v_product->'aliases', '[]'::jsonb)) as aliases(alias_value);

    insert into public.products (
      id, company_id, location_id, supplier_id, department_id, name, pack_size,
      quantity, unit_cost, aliases, active, metadata,
      created_at, updated_at, created_by, updated_by
    ) values (
      v_requested_id,
      p_company_id,
      p_location_id,
      v_supplier_id,
      v_department_id,
      trim(v_product->>'name'),
      nullif(trim(v_product->>'packSize'), ''),
      coalesce(nullif(v_product->>'quantity', '')::numeric, 1),
      coalesce(nullif(v_product->>'unitCost', '')::numeric, 0),
      v_aliases,
      coalesce((v_product->>'active')::boolean, true),
      coalesce(v_product->'metadata', '{}'::jsonb),
      now(), now(), auth.uid(), auth.uid()
    );
    v_products_inserted := v_products_inserted + 1;
  end loop;

  return jsonb_build_object(
    'suppliers_inserted', v_suppliers_inserted,
    'suppliers_existing', v_suppliers_existing,
    'products_inserted', v_products_inserted,
    'products_existing', v_products_existing,
    'saved_at', now()
  );
end;
$$;

revoke all on function public.recover_legacy_catalog_v1(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.recover_legacy_catalog_v1(uuid, uuid, jsonb, jsonb) to authenticated;

create or replace function public.recover_legacy_invoice_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_invoice jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(p_invoice->>'supplierId', p_invoice->>'supplier_id'));
  v_items jsonb := coalesce(p_invoice->'items', p_invoice->'lines', '[]'::jsonb);
  v_line jsonb;
  v_split jsonb;
  v_splits jsonb;
  v_product_id uuid;
  v_department_id uuid;
  v_split_total numeric;
  v_expected_lines integer;
  v_expected_splits integer := 0;
  v_actual_lines integer;
  v_actual_splits integer;
  v_invoice_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id and active
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if v_supplier_id is null or not exists (
    select 1 from public.suppliers supplier
    where supplier.id = v_supplier_id
      and supplier.company_id = p_company_id
      and supplier.active
      and (supplier.location_id is null or supplier.location_id is not distinct from p_location_id)
  ) then
    raise exception 'Recovery requires a canonical active supplier';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    raise exception 'Recovery invoice needs at least one line';
  end if;

  v_expected_lines := jsonb_array_length(v_items);
  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_product_id := public.marginflow_try_uuid(coalesce(v_line->>'matchedProductId', v_line->>'productId', v_line->>'product_id'));
    if v_product_id is null or not exists (
      select 1 from public.products product
      where product.id = v_product_id
        and product.company_id = p_company_id
        and (product.location_id is null or product.location_id is not distinct from p_location_id)
    ) then
      raise exception 'Recovery product dependency is missing:%', coalesce(v_line->>'productName', 'unnamed line');
    end if;

    v_splits := coalesce(v_line->'departmentSplits', v_line->'department_splits', '[]'::jsonb);
    if jsonb_typeof(v_splits) <> 'array' then
      raise exception 'Recovery department splits must be a JSON array';
    end if;
    if jsonb_array_length(v_splits) > 0 then
      v_split_total := 0;
      for v_split in select value from jsonb_array_elements(v_splits)
      loop
        v_department_id := public.marginflow_try_uuid(coalesce(v_split->>'departmentId', v_split->>'department_id'));
        if v_department_id is null or not exists (
          select 1 from public.departments department
          where department.id = v_department_id
            and department.company_id = p_company_id
            and (department.location_id is null or department.location_id is not distinct from p_location_id)
        ) then
          raise exception 'Recovery split department dependency is missing';
        end if;
        if coalesce((v_split->>'percentage')::numeric, 0) <= 0 then
          raise exception 'Recovery split percentages must be positive';
        end if;
        v_split_total := v_split_total + (v_split->>'percentage')::numeric;
        v_expected_splits := v_expected_splits + 1;
      end loop;
      if abs(v_split_total - 100) >= 0.01 then
        raise exception 'Recovery department splits must total 100';
      end if;
    else
      v_department_id := public.marginflow_try_uuid(coalesce(v_line->>'departmentId', v_line->>'department_id'));
      if v_department_id is null or not exists (
        select 1 from public.departments department
        where department.id = v_department_id
          and department.company_id = p_company_id
          and (department.location_id is null or department.location_id is not distinct from p_location_id)
      ) then
        raise exception 'Recovery line department dependency is missing:%', coalesce(v_line->>'productName', 'unnamed line');
      end if;
    end if;
  end loop;

  v_result := public.persist_invoice_document_v2(p_company_id, p_location_id, p_invoice);
  v_invoice_id := public.marginflow_try_uuid(v_result->>'invoice_id');
  if v_invoice_id is null then
    raise exception 'Recovery invoice persistence did not return an invoice identifier';
  end if;

  select count(*) into v_actual_lines
  from public.invoice_lines line
  where line.invoice_id = v_invoice_id and line.active;
  select count(*) into v_actual_splits
  from public.invoice_line_department_splits split
  join public.invoice_lines line on line.id = split.invoice_line_id
  where line.invoice_id = v_invoice_id and line.active and split.active;
  if v_actual_lines <> v_expected_lines or v_actual_splits <> v_expected_splits then
    raise exception 'Recovery verification failed:expected_%_lines_%_splits:actual_%_lines_%_splits',
      v_expected_lines, v_expected_splits, v_actual_lines, v_actual_splits;
  end if;

  return v_result || jsonb_build_object(
    'recovery_verified', true,
    'verified_line_count', v_actual_lines,
    'verified_split_count', v_actual_splits
  );
end;
$$;

revoke all on function public.recover_legacy_invoice_v1(uuid, uuid, jsonb) from public;
grant execute on function public.recover_legacy_invoice_v1(uuid, uuid, jsonb) to authenticated;

comment on function public.recover_legacy_catalog_v1(uuid, uuid, jsonb, jsonb) is
  'Explicit, idempotent catalog preparation for reviewed current-device legacy recovery.';
comment on function public.recover_legacy_invoice_v1(uuid, uuid, jsonb) is
  'Strict recovery wrapper around persist_invoice_document_v2; rejects unresolved dependencies and verifies the transaction.';

notify pgrst, 'reload schema';
