-- Staging-reviewed additive fix. Existing migration history is immutable.
-- No bulk recovery, snapshot replacement, financial repricing, or data deletion.
begin;

-- Stop if another deployment changed a function since the read-only review.
-- Checks cover function bodies, not just the migration file count.
do $$ declare r record; actual text; begin
 for r in select * from (values
  ('persist_supplier_product_learning','5490ae55718310fa1fda80ef309125cb'),
  ('persist_supplier_product_learning_v2','d7a44c519cdc38053ada5971fb03d084'),
  ('persist_invoice_document_v3','7064d1c9f248c7e77c92e80596370b58'),
  ('forget_supplier_product_learning','173710ca5e1b7c61372ecb0edaf2c9ae')
 ) expected(name,hash) loop
  select md5(p.prosrc) into strict actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=r.name;
  if actual<>r.hash then raise exception 'RPC drift detected for %, review before applying',r.name; end if;
 end loop;
end $$;

create or replace function public.can_read_purchasing_scope(p_company_id uuid, p_location_id uuid)
returns boolean language sql stable security definer set search_path = public, auth, pg_temp
as $$
  select auth.uid() is not null and exists (
    select 1 from public.company_members m
    where m.company_id = p_company_id and m.user_id = auth.uid() and m.status = 'active'
      and (m.location_id is null or p_location_id is null or m.location_id = p_location_id)
  );
$$;
revoke all on function public.can_read_purchasing_scope(uuid,uuid) from public, anon;
grant execute on function public.can_read_purchasing_scope(uuid,uuid) to authenticated;

create or replace function public.assert_purchasing_write_scope(p_company_id uuid, p_location_id uuid)
returns void language plpgsql security definer set search_path = public, auth, pg_temp
as $$ begin
  if auth.uid() is null or not exists (
    select 1 from public.company_members m
    where m.company_id=p_company_id and m.user_id=auth.uid() and m.status='active'
      and (m.location_id is null or m.location_id=p_location_id)
  ) then raise exception 'Not authorised for this purchasing scope' using errcode='42501'; end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id=p_location_id and company_id=p_company_id
  ) then raise exception 'Location does not belong to this company' using errcode='42501'; end if;
end; $$;
revoke all on function public.assert_purchasing_write_scope(uuid,uuid) from public, anon, authenticated;

-- Existing permissive company policies remain. These restrictions also apply
-- when another permissive policy matches; no public/anonymous read is added.
grant select on public.supplier_product_split_rules, public.supplier_product_split_rule_lines to authenticated;
create policy purchasing_mapping_read_scope on public.supplier_product_mappings
  as restrictive for select to authenticated
  using (public.can_read_purchasing_scope(company_id,location_id));
create policy purchasing_split_rule_read_scope on public.supplier_product_split_rules
  as restrictive for select to authenticated
  using (public.can_read_purchasing_scope(company_id,location_id) and exists (
    select 1 from public.supplier_product_mappings m where m.id=supplier_product_mapping_id
      and m.company_id=supplier_product_split_rules.company_id
      and m.location_id is not distinct from supplier_product_split_rules.location_id
  ));
create policy purchasing_split_line_read_scope on public.supplier_product_split_rule_lines
  as restrictive for select to authenticated
  using (public.can_read_purchasing_scope(company_id,location_id) and exists (
    select 1 from public.supplier_product_split_rules r where r.id=split_rule_id
      and r.company_id=supplier_product_split_rule_lines.company_id
      and r.location_id is not distinct from supplier_product_split_rule_lines.location_id
  ));

-- Materialise ONLY the explicitly referenced, already saved catalogue record.
-- Snapshot modules are still the current catalogue source. They are never used
-- here as an invoice/stock/sales ledger. Existing relational records win.
create or replace function public.ensure_purchasing_catalogue_reference(
  p_company_id uuid, p_location_id uuid, p_kind text, p_id uuid
) returns void language plpgsql security definer set search_path=public,auth,pg_temp
as $$
declare
  v_row jsonb;
  v_count integer;
  v_supplier_id uuid;
  v_department_id uuid;
  v_existing_company uuid;
  v_existing_location uuid;
  v_active boolean;
begin
  perform public.assert_purchasing_write_scope(p_company_id,p_location_id);
  if p_id is null or p_kind not in ('suppliers','products') then
    raise exception 'A saved catalogue reference is required';
  end if;
  -- Serialise first creation and same-identity learning within this scope.
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || coalesce(p_location_id::text,'company'),0));
  if p_kind='suppliers' then
    select company_id,location_id,active into v_existing_company,v_existing_location,v_active
      from public.suppliers where id=p_id;
  else
    select company_id,location_id,active into v_existing_company,v_existing_location,v_active
      from public.products where id=p_id;
  end if;
  if found then
    if v_existing_company<>p_company_id or (v_existing_location is not null and v_existing_location is distinct from p_location_id) or not v_active then
      raise exception 'Catalogue reference is inactive or belongs to another scope' using errcode='42501';
    end if;
    return;
  end if;
  select count(*), (jsonb_agg(entry)->0) into v_count,v_row
    from public.marginflow_cloud_state s cross join lateral
      jsonb_array_elements(case when jsonb_typeof(s.payload)='array' then s.payload else '[]'::jsonb end) entry
    where s.company_id=p_company_id and s.location_id is not distinct from p_location_id
      and s.module_key=p_kind and entry->>'id'=p_id::text;
  if v_count<>1 or nullif(btrim(v_row->>'name'),'') is null or coalesce(v_row->>'active','true')='false' then
    raise exception 'Save the catalogue record to this company/location before confirming; missing or ambiguous reference';
  end if;
  if p_kind='suppliers' then
    insert into public.suppliers(id,company_id,location_id,name,category,metadata)
      values(p_id,p_company_id,p_location_id,v_row->>'name',v_row->>'category',jsonb_build_object('marginflow_snapshot',v_row,'catalogue_reference_sync',true));
  else
    if nullif(v_row->>'supplier','') is not null then
      select count(*), (array_agg(public.marginflow_try_uuid(entry->>'id')))[1] into v_count,v_supplier_id
        from public.marginflow_cloud_state s cross join lateral
          jsonb_array_elements(case when jsonb_typeof(s.payload)='array' then s.payload else '[]'::jsonb end) entry
        where s.company_id=p_company_id and s.location_id is not distinct from p_location_id and s.module_key='suppliers'
          and lower(btrim(entry->>'name'))=lower(btrim(v_row->>'supplier')) and coalesce(entry->>'active','true')<>'false';
      if v_count<>1 or v_supplier_id is null then raise exception 'Product supplier needs explicit catalogue review'; end if;
      perform public.ensure_purchasing_catalogue_reference(p_company_id,p_location_id,'suppliers',v_supplier_id);
    end if;
    select case when count(*)=1 then (array_agg(id))[1] end into v_department_id
      from public.departments where company_id=p_company_id and active
        and (location_id is null or location_id=p_location_id) and lower(btrim(name))=lower(btrim(v_row->>'department'));
    if nullif(v_row->>'unitCost','') is null then raise exception 'Product catalogue cost is missing; review before confirming'; end if;
    insert into public.products(id,company_id,location_id,supplier_id,department_id,name,pack_size,quantity,unit_cost,aliases,metadata)
      values(p_id,p_company_id,p_location_id,v_supplier_id,v_department_id,v_row->>'name',v_row->>'packSize',
        coalesce(nullif(v_row->>'quantity','')::numeric,1),(v_row->>'unitCost')::numeric,
        array(select jsonb_array_elements_text(case when jsonb_typeof(v_row->'aliases')='array' then v_row->'aliases' else '[]'::jsonb end)),
        jsonb_build_object('marginflow_snapshot',v_row,'catalogue_reference_sync',true));
  end if;
end; $$;
revoke all on function public.ensure_purchasing_catalogue_reference(uuid,uuid,text,uuid) from public,anon,authenticated;

create or replace function public.persist_supplier_product_learning(
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
  p_confirmed_at timestamptz
)
returns table(mapping_id uuid)
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_code text := upper(regexp_replace(coalesce(nullif(p_normalized_supplier_product_code, ''), p_supplier_product_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_description text := lower(trim(regexp_replace(coalesce(nullif(p_normalized_supplier_description, ''), p_supplier_description, ''), '\s+', ' ', 'g')));
  v_unit text := lower(regexp_replace(coalesce(nullif(p_normalized_unit_of_measure, ''), p_unit_of_measure, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_pack text := lower(regexp_replace(coalesce(nullif(p_normalized_pack_size, ''), p_pack_size, ''), '[^a-zA-Z0-9]', '', 'g'));
  v_mode text := case when lower(coalesce(p_allocation_mode, 'department')) = 'split' then 'split' else 'department' end;
  v_existing public.supplier_product_mappings%rowtype;
  v_new_id uuid;
  v_split_rule_id uuid;
  v_existing_splits jsonb := '[]'::jsonb;
  v_requested_splits jsonb := '[]'::jsonb;
  v_same_decision boolean := false;
  v_split jsonb;
  v_split_total numeric := 0;
  v_split_count integer := 0;
  v_split_department_count integer := 0;
  v_now timestamptz := coalesce(p_confirmed_at, now());
begin
  perform public.assert_purchasing_write_scope(p_company_id,p_location_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || coalesce(p_location_id::text,'company'),0));
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id and (location_id is null or location_id=p_location_id) and active) then
    raise exception 'Supplier does not belong to this company';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and company_id = p_company_id and (location_id is null or location_id=p_location_id) and active) then
    raise exception 'Product does not belong to this company';
  end if;
  if v_code = '' and v_description = '' then
    raise exception 'A supplier code or raw supplier description is required';
  end if;

  if v_mode = 'department' then
    if p_department_id is null or not exists (
      select 1 from public.departments where id = p_department_id and company_id = p_company_id and (location_id is null or location_id=p_location_id) and active
    ) then
      raise exception 'Department does not belong to this company';
    end if;
  else
    if jsonb_typeof(coalesce(p_split_lines, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_split_lines, '[]'::jsonb)) < 2 then
      raise exception 'Split learning needs at least two departments';
    end if;
    select count(*), count(distinct entry->>'department_id')
    into v_split_count, v_split_department_count
    from jsonb_array_elements(p_split_lines) entry;
    if v_split_count <> v_split_department_count then
      raise exception 'Split learning cannot repeat a department';
    end if;
    for v_split in select value from jsonb_array_elements(p_split_lines)
    loop
      if not exists (
        select 1 from public.departments
        where id = (v_split->>'department_id')::uuid and company_id = p_company_id and (location_id is null or location_id=p_location_id) and active
      ) then
        raise exception 'Split department does not belong to this company';
      end if;
      if coalesce((v_split->>'percentage')::numeric, 0) <= 0 then
        raise exception 'Split percentages must be positive';
      end if;
      v_split_total := v_split_total + (v_split->>'percentage')::numeric;
    end loop;
    if abs(v_split_total - 100) >= 0.01 then
      raise exception 'Split percentages must total 100';
    end if;
  end if;

  select * into v_existing
  from public.supplier_product_mappings mapping
  where mapping.company_id = p_company_id
    and mapping.location_id is not distinct from p_location_id
    and mapping.supplier_id = p_supplier_id
    and mapping.active
    and (
      (v_code <> '' and mapping.normalized_supplier_product_code = v_code)
      or (
        v_code = ''
        and mapping.normalized_supplier_product_code = ''
        and mapping.normalized_supplier_description = v_description
        and mapping.normalized_unit_of_measure = v_unit
        and mapping.normalized_pack_size = v_pack
      )
    )
  order by mapping.updated_at desc
  limit 1
  for update;

  if v_mode = 'split' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'department_id', split_line.department_id,
      'percentage', round(split_line.percentage, 4)
    ) order by split_line.sort_order, split_line.department_id), '[]'::jsonb)
    into v_existing_splits
    from public.supplier_product_split_rules split_rule
    join public.supplier_product_split_rule_lines split_line on split_line.split_rule_id = split_rule.id
    where split_rule.supplier_product_mapping_id = v_existing.id and split_rule.active;

    select coalesce(jsonb_agg(jsonb_build_object(
      'department_id', (entry->>'department_id')::uuid,
      'percentage', round((entry->>'percentage')::numeric, 4)
    ) order by coalesce((entry->>'sort_order')::integer, 0), (entry->>'department_id')::uuid), '[]'::jsonb)
    into v_requested_splits
    from jsonb_array_elements(coalesce(p_split_lines, '[]'::jsonb)) entry;
  end if;

  v_same_decision := v_existing.id is not null
    and v_existing.product_id = p_product_id
    and lower(v_existing.allocation_mode) = v_mode
    and (
      (v_mode = 'department' and v_existing.department_id = p_department_id)
      or (v_mode = 'split' and v_existing_splits = v_requested_splits)
    );

  if v_same_decision then
    update public.supplier_product_mappings
    set supplier_product_code = coalesce(nullif(p_supplier_product_code, ''), supplier_product_code),
        supplier_description = coalesce(nullif(p_supplier_description, ''), supplier_description),
        unit_of_measure = coalesce(nullif(p_unit_of_measure, ''), unit_of_measure),
        pack_size = coalesce(nullif(p_pack_size, ''), pack_size),
        auto_apply = p_auto_apply,
        confirmation_count = confirmation_count + 1,
        last_confirmed_at = v_now,
        metadata = metadata || jsonb_build_object(
          'last_confirmed_invoice_external_id', coalesce(p_source_invoice_external_id, ''),
          'supplier_name', coalesce(p_supplier_name, ''),
          'product_name', coalesce(p_product_name, ''),
          'department_name', coalesce(p_department_name, ''),
          'mapping_key', coalesce(p_mapping_key, '')
        ),
        updated_at = v_now,
        updated_by = auth.uid()
    where id = v_existing.id;
    mapping_id := v_existing.id;
    return next;
    return;
  end if;

  if v_existing.id is not null then
    update public.supplier_product_mappings
    set active = false, auto_apply = false, updated_at = v_now, updated_by = auth.uid()
    where id = v_existing.id;
    update public.supplier_product_split_rules
    set active = false, updated_at = v_now, updated_by = auth.uid()
    where supplier_product_mapping_id = v_existing.id and active;
  end if;

  insert into public.supplier_product_mappings (
    company_id, location_id, supplier_id, supplier_product_code, normalized_supplier_product_code,
    supplier_description, normalized_supplier_description, unit_of_measure, normalized_unit_of_measure,
    pack_size, normalized_pack_size, product_id, allocation_mode, department_id, auto_apply,
    confirmation_count, active, last_confirmed_at, metadata, created_at, updated_at, created_by, updated_by
  ) values (
    p_company_id, p_location_id, p_supplier_id, nullif(p_supplier_product_code, ''), v_code,
    nullif(p_supplier_description, ''), v_description, nullif(p_unit_of_measure, ''), v_unit,
    nullif(p_pack_size, ''), v_pack, p_product_id, v_mode,
    case when v_mode = 'department' then p_department_id else null end,
    p_auto_apply, 1, true, v_now,
    jsonb_build_object(
      'first_confirmed_invoice_external_id', coalesce(p_source_invoice_external_id, ''),
      'last_confirmed_invoice_external_id', coalesce(p_source_invoice_external_id, ''),
      'supplier_name', coalesce(p_supplier_name, ''),
      'product_name', coalesce(p_product_name, ''),
      'department_name', coalesce(p_department_name, ''),
      'mapping_key', coalesce(p_mapping_key, '')
    ),
    v_now, v_now, auth.uid(), auth.uid()
  ) returning id into v_new_id;

  if v_existing.id is not null then
    update public.supplier_product_mappings
    set superseded_by_mapping_id = v_new_id, updated_at = v_now
    where id = v_existing.id;
  end if;

  if v_mode = 'split' then
    insert into public.supplier_product_split_rules (
      company_id, location_id, supplier_product_mapping_id, split_mode, active, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, v_new_id, 'percentage', true, v_now, v_now, auth.uid(), auth.uid()
    ) returning id into v_split_rule_id;

    insert into public.supplier_product_split_rule_lines (
      company_id, location_id, split_rule_id, department_id, percentage, sort_order, metadata, created_at, updated_at, created_by, updated_by
    )
    select p_company_id, p_location_id, v_split_rule_id, (entry->>'department_id')::uuid,
      (entry->>'percentage')::numeric, coalesce((entry->>'sort_order')::integer, 0),
      jsonb_build_object('department_name', coalesce(entry->>'department_name', '')),
      v_now, v_now, auth.uid(), auth.uid()
    from jsonb_array_elements(p_split_lines) entry;
  end if;

  mapping_id := v_new_id;
  return next;
end;
$$;


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
  perform public.ensure_purchasing_catalogue_reference(p_company_id,p_location_id,'suppliers',p_supplier_id);
  perform public.ensure_purchasing_catalogue_reference(p_company_id,p_location_id,'products',p_product_id);
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
  where id = v_mapping_id and company_id=p_company_id and location_id is not distinct from p_location_id and active;
  if not found or v_mapping_id is null then
    raise exception 'Reusable rule was not persisted in the requested scope';
  end if;

  mapping_id := v_mapping_id;
  return next;
end;
$$;

revoke all on function public.persist_supplier_product_learning_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, uuid, jsonb, boolean, text, text, text, text, text, timestamptz, text) from public;
grant execute on function public.persist_supplier_product_learning_v2(uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, uuid, jsonb, boolean, text, text, text, text, text, timestamptz, text) to authenticated;


create or replace function public.persist_invoice_document_v3(
  p_company_id uuid,
  p_location_id uuid,
  p_invoice jsonb,
  p_duplicate_action text default null,
  p_existing_invoice_id uuid default null,
  p_expected_revision bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invoice jsonb := public.normalize_invoice_payload_v1(p_invoice);
  v_requested_id uuid := public.marginflow_try_uuid(v_invoice->>'id');
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(v_invoice->>'supplierId', v_invoice->>'supplier_id'));
  v_document_type text := lower(coalesce(nullif(v_invoice->>'documentType', ''), nullif(v_invoice->>'document_type', ''), 'invoice'));
  v_document_number text := coalesce(nullif(v_invoice->>'documentNumber', ''), nullif(v_invoice->>'document_number', ''), nullif(v_invoice->>'invoiceNumber', ''), nullif(v_invoice->>'invoice_number', ''));
  v_invoice_date date := coalesce(nullif(coalesce(v_invoice->>'date', v_invoice->>'invoiceDate', v_invoice->>'invoice_date'), '')::date, current_date);
  v_business_fingerprint text := public.invoice_business_fingerprint_v1(v_invoice);
  v_requested public.invoices%rowtype;
  v_target public.invoices%rowtype;
  v_candidate_ids uuid[] := array[]::uuid[];
  v_equivalent_ids uuid[] := array[]::uuid[];
  v_result jsonb;
  v_item jsonb;
  v_product_id uuid;
begin
  perform public.assert_purchasing_write_scope(p_company_id,p_location_id);
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id = p_location_id and company_id = p_company_id) then
    raise exception 'Location does not belong to this company';
  end if;
  if v_requested_id is null then raise exception 'Invoice needs a stable UUID before persistence'; end if;
  if p_duplicate_action is not null and p_duplicate_action not in ('save_new', 'update_existing') then
    raise exception 'Unsupported duplicate action';
  end if;

  if v_supplier_id is null then
    select supplier.id into v_supplier_id from public.suppliers supplier
    where supplier.company_id = p_company_id and supplier.active
      and lower(btrim(supplier.name)) = lower(btrim(coalesce(v_invoice->>'supplier', v_invoice->>'supplierName', '')))
    order by supplier.updated_at desc limit 1;
  end if;

  if v_supplier_id is null then raise exception 'Select a saved supplier before confirming'; end if;
  perform public.ensure_purchasing_catalogue_reference(p_company_id,p_location_id,'suppliers',v_supplier_id);
  for v_item in select value from jsonb_array_elements(coalesce(v_invoice->'items','[]'::jsonb)) loop
    v_product_id := public.marginflow_try_uuid(coalesce(v_item->>'matchedProductId',v_item->>'productId',v_item->>'product_id'));
    if v_product_id is not null then
      perform public.ensure_purchasing_catalogue_reference(p_company_id,p_location_id,'products',v_product_id);
    end if;
  end loop;

  select * into v_requested from public.invoices where id = v_requested_id for update;
  if v_requested.id is not null then
    if v_requested.company_id <> p_company_id or v_requested.location_id is distinct from p_location_id then
      raise exception 'Invoice identifier belongs to another scope';
    end if;
    if public.invoice_business_fingerprint_v1(v_requested.metadata->'marginflow_snapshot') = v_business_fingerprint then
      return jsonb_build_object(
        'invoice_id', v_requested.id, 'status', 'already_exists',
        'line_count', (select count(*) from public.invoice_lines where invoice_id = v_requested.id and active),
        'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_requested.id and line.active and split.active),
        'sync_revision', v_requested.sync_revision, 'saved_at', v_requested.updated_at
      );
    end if;
    if p_duplicate_action is distinct from 'update_existing' then
      raise exception 'invoice_update_confirmation_required:%:revision_%', v_requested.id, v_requested.sync_revision;
    end if;
    if p_existing_invoice_id is not null and p_existing_invoice_id <> v_requested.id then raise exception 'Duplicate update target does not match the invoice UUID'; end if;
    if p_expected_revision is null or p_expected_revision <> v_requested.sync_revision then
      raise exception 'invoice_revision_conflict:%:expected_%:actual_%', v_requested.id, p_expected_revision, v_requested.sync_revision;
    end if;
    v_invoice := jsonb_set(v_invoice, '{syncRevision}', to_jsonb(p_expected_revision), true);
    return public.persist_invoice_document_v2_legacy(p_company_id, p_location_id, v_invoice);
  end if;

  if not public.marginflow_is_generic_document_number(v_document_number) then
    select coalesce(array_agg(invoice.id order by invoice.updated_at desc), array[]::uuid[])
    into v_candidate_ids
    from public.invoices invoice
    where invoice.company_id = p_company_id
      and invoice.location_id is not distinct from p_location_id
      and invoice.supplier_id is not distinct from v_supplier_id
      and invoice.document_type = v_document_type
      and lower(btrim(invoice.document_number)) = lower(btrim(v_document_number));
  else
    select coalesce(array_agg(invoice.id order by invoice.updated_at desc), array[]::uuid[])
    into v_candidate_ids
    from public.invoices invoice
    where invoice.company_id = p_company_id
      and invoice.location_id is not distinct from p_location_id
      and invoice.supplier_id is not distinct from v_supplier_id
      and invoice.document_type = v_document_type
      and invoice.invoice_date = v_invoice_date
      and public.marginflow_is_generic_document_number(invoice.document_number);
  end if;

  select coalesce(array_agg(invoice.id order by invoice.updated_at desc), array[]::uuid[])
  into v_equivalent_ids
  from public.invoices invoice
  where invoice.id = any(v_candidate_ids)
    and public.invoice_business_fingerprint_v1(invoice.metadata->'marginflow_snapshot') = v_business_fingerprint;

  if cardinality(v_equivalent_ids) = 1 then
    select * into v_target from public.invoices where id = v_equivalent_ids[1];
    return jsonb_build_object(
      'invoice_id', v_target.id, 'status', 'already_exists',
      'line_count', (select count(*) from public.invoice_lines where invoice_id = v_target.id and active),
      'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_target.id and line.active and split.active),
      'sync_revision', v_target.sync_revision, 'saved_at', v_target.updated_at
    );
  end if;
  if cardinality(v_equivalent_ids) > 1 then raise exception 'multiple_equivalent_invoice_candidates'; end if;

  if not public.marginflow_is_generic_document_number(v_document_number) and cardinality(v_candidate_ids) > 0 then
    if p_duplicate_action is null then raise exception 'possible_invoice_duplicate:%', v_candidate_ids[1]; end if;
    if p_duplicate_action = 'update_existing' then
      if p_existing_invoice_id is null or not (p_existing_invoice_id = any(v_candidate_ids)) then
        raise exception 'A matching duplicate candidate must be selected for update';
      end if;
      select * into v_target from public.invoices where id = p_existing_invoice_id for update;
      if p_expected_revision is null or p_expected_revision <> v_target.sync_revision then
        raise exception 'invoice_revision_conflict:%:expected_%:actual_%', v_target.id, p_expected_revision, v_target.sync_revision;
      end if;
      v_invoice := jsonb_set(v_invoice, '{id}', to_jsonb(v_target.id::text), true);
      v_invoice := jsonb_set(v_invoice, '{syncRevision}', to_jsonb(p_expected_revision), true);
      v_result := public.persist_invoice_document_v2_legacy(p_company_id, p_location_id, v_invoice);
      insert into public.audit_log (company_id, location_id, actor_id, action, entity_table, entity_id, new_record, metadata)
      values (p_company_id, p_location_id, auth.uid(), 'invoice_duplicate_update', 'invoices', v_target.id, v_invoice, jsonb_build_object('requested_invoice_id', v_requested_id, 'previous_revision', p_expected_revision));
      return v_result;
    end if;
  end if;

  insert into public.invoices (
    id, company_id, location_id, supplier_id, invoice_number, invoice_date, status,
    subtotal, tax_amount, total_amount, source, document_type, document_number,
    currency, content_fingerprint, sync_revision, metadata, created_at, updated_at,
    created_by, updated_by
  ) values (
    v_requested_id, p_company_id, p_location_id, v_supplier_id, null, v_invoice_date,
    'Draft', 0, 0, 0, 'MarginFlow persistence reservation', v_document_type, null,
    coalesce(nullif(v_invoice->>'currency', ''), 'GBP'), null, 0,
    jsonb_build_object('persistence_reservation', true), now(), now(), auth.uid(), auth.uid()
  );

  v_invoice := jsonb_set(v_invoice, '{syncRevision}', '0'::jsonb, true);
  v_result := public.persist_invoice_document_v2_legacy(p_company_id, p_location_id, v_invoice);
  if p_duplicate_action = 'save_new' and cardinality(v_candidate_ids) > 0 then
    insert into public.audit_log (company_id, location_id, actor_id, action, entity_table, entity_id, new_record, metadata)
    values (p_company_id, p_location_id, auth.uid(), 'invoice_duplicate_save_new', 'invoices', v_requested_id, v_invoice, jsonb_build_object('candidate_invoice_ids', to_jsonb(v_candidate_ids)));
  end if;
  return v_result;
end;
$$;

create or replace function public.forget_supplier_product_learning(
  p_company_id uuid,
  p_location_id uuid,
  p_supplier_id uuid,
  p_mapping_id uuid,
  p_normalized_supplier_product_code text,
  p_normalized_supplier_description text,
  p_normalized_unit_of_measure text,
  p_normalized_pack_size text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_mapping_id uuid;
  v_code text := upper(regexp_replace(coalesce(p_normalized_supplier_product_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  perform public.assert_purchasing_write_scope(p_company_id,p_location_id);
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':' || coalesce(p_location_id::text,'company'),0));
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id) then
    raise exception 'Supplier does not belong to this company';
  end if;

  select mapping.id into v_mapping_id
  from public.supplier_product_mappings mapping
  where mapping.company_id = p_company_id
    and mapping.location_id is not distinct from p_location_id
    and mapping.supplier_id = p_supplier_id
    and mapping.active
    and (
      (p_mapping_id is not null and mapping.id = p_mapping_id)
      or (p_mapping_id is null and v_code <> '' and mapping.normalized_supplier_product_code = v_code)
      or (
        p_mapping_id is null and v_code = ''
        and mapping.normalized_supplier_description = coalesce(p_normalized_supplier_description, '')
        and mapping.normalized_unit_of_measure = coalesce(p_normalized_unit_of_measure, '')
        and mapping.normalized_pack_size = coalesce(p_normalized_pack_size, '')
      )
    )
  order by mapping.updated_at desc
  limit 1
  for update;

  if v_mapping_id is null then return false; end if;

  update public.supplier_product_mappings
  set active = false, auto_apply = false, updated_at = now(), updated_by = auth.uid()
  where id = v_mapping_id;
  update public.supplier_product_split_rules
  set active = false, updated_at = now(), updated_by = auth.uid()
  where supplier_product_mapping_id = v_mapping_id and active;
  return true;
end;
$$;

notify pgrst, 'reload schema';
commit;
