-- Atomic, company-scoped persistence for confirmed invoice learning decisions.

alter table public.supplier_product_mappings
  add column if not exists unit_of_measure text,
  add column if not exists normalized_unit_of_measure text not null default '',
  add column if not exists pack_size text,
  add column if not exists normalized_pack_size text not null default '';

drop index if exists public.supplier_product_mappings_active_description_idx;
create unique index if not exists supplier_product_mappings_active_description_format_idx
  on public.supplier_product_mappings(
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    supplier_id,
    normalized_supplier_description,
    normalized_unit_of_measure,
    normalized_pack_size
  )
  where active and normalized_supplier_product_code = '' and normalized_supplier_description <> '';

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
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and company_id = p_company_id and active) then
    raise exception 'Supplier does not belong to this company';
  end if;
  if not exists (select 1 from public.products where id = p_product_id and company_id = p_company_id and active) then
    raise exception 'Product does not belong to this company';
  end if;
  if v_code = '' and v_description = '' then
    raise exception 'A supplier code or raw supplier description is required';
  end if;

  if v_mode = 'department' then
    if p_department_id is null or not exists (
      select 1 from public.departments where id = p_department_id and company_id = p_company_id and active
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
        where id = (v_split->>'department_id')::uuid and company_id = p_company_id and active
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

revoke all on function public.persist_supplier_product_learning(uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, uuid, jsonb, boolean, text, text, text, text, text, timestamptz) from public;
grant execute on function public.persist_supplier_product_learning(uuid, uuid, uuid, text, text, text, text, text, text, text, text, uuid, text, uuid, jsonb, boolean, text, text, text, text, text, timestamptz) to authenticated;
revoke all on function public.forget_supplier_product_learning(uuid, uuid, uuid, uuid, text, text, text, text) from public;
grant execute on function public.forget_supplier_product_learning(uuid, uuid, uuid, uuid, text, text, text, text) to authenticated;
