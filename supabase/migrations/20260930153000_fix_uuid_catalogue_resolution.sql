begin;

create or replace function public.resolve_invoice_catalogue_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_invoice jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_invoice jsonb := public.normalize_invoice_payload_v1(p_invoice);
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(v_invoice->>'supplierId', v_invoice->>'supplier_id'));
  v_supplier_name text := nullif(btrim(coalesce(v_invoice->>'supplier', v_invoice->>'supplierName', '')), '');
  v_supplier_key text;
  v_supplier_count integer;
  v_items jsonb := coalesce(v_invoice->'items', v_invoice->'lines', '[]'::jsonb);
  v_resolved_items jsonb := '[]'::jsonb;
  v_item jsonb;
  v_requested_product_id uuid;
  v_product_id uuid;
  v_product_name text;
  v_product_key text;
  v_product_count integer;
  v_department_id uuid;
  v_department_count integer;
  v_pack_size text;
  v_unit_cost numeric;
begin
  perform public.assert_purchasing_write_scope(p_company_id, p_location_id);
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company' using errcode = '42501';
  end if;
  if p_location_id is null or not exists (
    select 1 from public.locations location
    where location.id = p_location_id and location.company_id = p_company_id
  ) then
    raise exception 'A verified company location is required' using errcode = '42501';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    raise exception 'Invoice needs at least one line';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_company_id::text || ':' || p_location_id::text || ':invoice-catalogue', 0
  ));

  if v_supplier_id is not null and exists (
    select 1 from public.suppliers supplier
    where supplier.id = v_supplier_id
      and (
        supplier.company_id <> p_company_id
        or supplier.location_id is distinct from p_location_id
        or not supplier.active
        or supplier.deleted_at is not null
        or supplier.merged_into_supplier_id is not null
      )
  ) then
    raise exception 'Supplier identifier belongs to another scope or is inactive' using errcode = '42501';
  end if;

  if v_supplier_id is not null and not exists (
    select 1 from public.suppliers where id = v_supplier_id
  ) then
    v_supplier_id := null;
  end if;

  if v_supplier_id is null then
    if v_supplier_name is null then raise exception 'Supplier name is required'; end if;
    v_supplier_key := lower(regexp_replace(regexp_replace(
      v_supplier_name,
      '\y(ltd|limited|plc|llp|llc|co|company|the)\y',
      '',
      'gi'
    ), '[^a-z0-9]+', '', 'gi'));
    if v_supplier_key = '' then raise exception 'Supplier name is not usable'; end if;

    select count(*)
    into v_supplier_count
    from public.suppliers supplier
    where supplier.company_id = p_company_id
      and supplier.location_id is not distinct from p_location_id
      and supplier.active
      and supplier.deleted_at is null
      and supplier.merged_into_supplier_id is null
      and supplier.normalized_name = v_supplier_key;

    if v_supplier_count > 1 then
      raise exception 'Supplier match is ambiguous; review the supplier before confirming';
    end if;
    if v_supplier_count = 1 then
      select supplier.id
      into v_supplier_id
      from public.suppliers supplier
      where supplier.company_id = p_company_id
        and supplier.location_id is not distinct from p_location_id
        and supplier.active
        and supplier.deleted_at is null
        and supplier.merged_into_supplier_id is null
        and supplier.normalized_name = v_supplier_key
      order by supplier.created_at, supplier.id
      limit 1;
    end if;
    if v_supplier_count = 0 then
      insert into public.suppliers (
        id, company_id, location_id, name, category, active, metadata,
        created_by, updated_by
      ) values (
        extensions.gen_random_uuid(), p_company_id, p_location_id,
        v_supplier_name, 'Supplier', true,
        jsonb_build_object('created_from_invoice', true), auth.uid(), auth.uid()
      )
      returning id into v_supplier_id;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_requested_product_id := public.marginflow_try_uuid(coalesce(
      v_item->>'matchedProductId', v_item->>'productId', v_item->>'product_id'
    ));
    v_product_id := null;
    v_product_name := nullif(btrim(coalesce(
      v_item->>'productName', v_item->>'rawDescription', v_item->>'description', ''
    )), '');
    if v_product_name is null then raise exception 'Every invoice line needs a product name'; end if;
    v_product_key := public.marginflow_catalogue_key(v_product_name);
    if v_product_key = '' then raise exception 'Product name is not usable'; end if;

    if v_requested_product_id is not null then
      if exists (
        select 1 from public.products product
        where product.id = v_requested_product_id
          and (
            product.company_id <> p_company_id
            or (product.location_id is not null and product.location_id <> p_location_id)
            or not product.active
          )
      ) then
        raise exception 'Product identifier belongs to another scope or is inactive' using errcode = '42501';
      end if;
      select product.id into v_product_id
      from public.products product
      where product.id = v_requested_product_id
        and product.company_id = p_company_id
        and product.active;
    end if;

    if v_product_id is null then
      select count(*)
      into v_product_count
      from public.products product
      where product.company_id = p_company_id
        and (product.location_id is null or product.location_id = p_location_id)
        and product.supplier_id is not distinct from v_supplier_id
        and product.active
        and (
          product.normalized_name = v_product_key
          or exists (
            select 1 from unnest(product.aliases) alias
            where public.marginflow_catalogue_key(alias) = v_product_key
          )
        );
      if v_product_count > 1 then
        raise exception 'Product match is ambiguous; review the product before confirming';
      end if;
      if v_product_count = 1 then
        select product.id
        into v_product_id
        from public.products product
        where product.company_id = p_company_id
          and (product.location_id is null or product.location_id = p_location_id)
          and product.supplier_id is not distinct from v_supplier_id
          and product.active
          and (
            product.normalized_name = v_product_key
            or exists (
              select 1 from unnest(product.aliases) alias
              where public.marginflow_catalogue_key(alias) = v_product_key
            )
          )
        order by product.created_at, product.id
        limit 1;
      end if;
    end if;

    v_department_id := public.marginflow_try_uuid(coalesce(v_item->>'departmentId', v_item->>'department_id'));
    if v_department_id is not null and not exists (
      select 1 from public.departments department
      where department.id = v_department_id
        and department.company_id = p_company_id
        and (department.location_id is null or department.location_id = p_location_id)
        and department.active
    ) then
      raise exception 'Department identifier belongs to another scope or is inactive' using errcode = '42501';
    end if;
    if v_department_id is null then
      select count(*)
      into v_department_count
      from public.departments department
      where department.company_id = p_company_id
        and (department.location_id is null or department.location_id = p_location_id)
        and department.active
        and public.marginflow_catalogue_key(department.name) = public.marginflow_catalogue_key(coalesce(v_item->>'department', ''));
      if v_department_count <> 1 then
        raise exception 'Select one active company department for every invoice line';
      end if;
      select department.id
      into v_department_id
      from public.departments department
      where department.company_id = p_company_id
        and (department.location_id is null or department.location_id = p_location_id)
        and department.active
        and public.marginflow_catalogue_key(department.name) = public.marginflow_catalogue_key(coalesce(v_item->>'department', ''))
      order by department.created_at, department.id
      limit 1;
    end if;

    v_pack_size := nullif(btrim(coalesce(v_item->>'packSize', v_item->>'pack_size', '')), '');
    v_unit_cost := coalesce(nullif(coalesce(v_item->>'unitCost', v_item->>'unit_cost'), '')::numeric, 0);
    if v_product_id is null then
      v_product_id := coalesce(v_requested_product_id, extensions.gen_random_uuid());
      insert into public.products (
        id, company_id, location_id, supplier_id, department_id, name,
        pack_size, quantity, unit_cost, aliases, active, metadata,
        created_by, updated_by
      ) values (
        v_product_id, p_company_id, p_location_id, v_supplier_id, v_department_id,
        v_product_name, v_pack_size,
        coalesce(nullif(v_item->>'packQuantity', '')::numeric, 1),
        v_unit_cost, array[]::text[], true,
        jsonb_build_object('created_from_invoice', true), auth.uid(), auth.uid()
      );
    end if;

    insert into public.product_supplier_formats (
      company_id, location_id, product_id, supplier_id, pack_size,
      purchase_unit, purchase_unit_cost, base_quantity, base_unit,
      normalized_cost, conversion_confidence, conversion_review_required,
      active, metadata, created_by, updated_by
    ) values (
      p_company_id, p_location_id, v_product_id, v_supplier_id,
      coalesce(v_pack_size, ''),
      nullif(coalesce(v_item->>'unitOfMeasure', v_item->>'billingUnit', ''), ''),
      v_unit_cost,
      nullif(coalesce(v_item->>'baseQuantity', v_item->>'normalizationQuantity', ''), '')::numeric,
      nullif(coalesce(v_item->>'baseUnit', v_item->>'normalizedUnit', ''), ''),
      nullif(coalesce(v_item->>'normalizedCost', ''), '')::numeric,
      nullif(coalesce(v_item->>'conversionConfidence', ''), ''),
      coalesce(nullif(v_item->>'conversionReviewRequired', '')::boolean, false),
      true,
      jsonb_build_object('created_from_invoice', true), auth.uid(), auth.uid()
    ) on conflict do nothing;

    v_item := jsonb_set(v_item, '{matchedProductId}', to_jsonb(v_product_id::text), true);
    v_item := jsonb_set(v_item, '{productId}', to_jsonb(v_product_id::text), true);
    v_item := jsonb_set(v_item, '{supplierId}', to_jsonb(v_supplier_id::text), true);
    v_item := jsonb_set(v_item, '{departmentId}', to_jsonb(v_department_id::text), true);
    v_resolved_items := v_resolved_items || jsonb_build_array(v_item);
  end loop;

  v_invoice := jsonb_set(v_invoice, '{supplierId}', to_jsonb(v_supplier_id::text), true);
  v_invoice := jsonb_set(v_invoice, '{items}', v_resolved_items, true);
  return v_invoice;
end;
$$;

notify pgrst, 'reload schema';
commit;
