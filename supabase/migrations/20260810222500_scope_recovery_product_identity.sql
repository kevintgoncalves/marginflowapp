-- Align legacy catalog recovery with MarginFlow's supplier-scoped product identity.
-- The active product uniqueness contract already permits the same product name for
-- different suppliers. This changes only the stale-preview guard and performs no DML.

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
        and product.supplier_id is not distinct from v_supplier_id
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

notify pgrst, 'reload schema';
