-- Non-destructive invoice recovery, relational persistence and stale snapshot protection.

alter table public.invoices
  add column if not exists content_fingerprint text,
  add column if not exists sync_revision bigint not null default 1;

alter table public.invoice_lines
  add column if not exists active boolean not null default true;

alter table public.invoice_line_department_splits
  add column if not exists active boolean not null default true;

create index if not exists invoices_content_fingerprint_idx
  on public.invoices(company_id, content_fingerprint);

alter table public.marginflow_cloud_state
  add column if not exists revision bigint not null default 1;

create or replace function public.protect_marginflow_cloud_state_writes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.module_key = 'invoices' then
    if tg_op = 'UPDATE' then return old; end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'direct_snapshot_write_blocked:%:use_revision_rpc', new.module_key;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_marginflow_cloud_state_writes on public.marginflow_cloud_state;
create trigger protect_marginflow_cloud_state_writes
  before insert or update on public.marginflow_cloud_state
  for each row execute function public.protect_marginflow_cloud_state_writes();

create or replace function public.marginflow_try_uuid(value text)
returns uuid
language plpgsql
immutable
parallel safe
as $$
begin
  if value is null or value = '' then return null; end if;
  return value::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function public.save_cloud_state_module_v2(
  p_company_id uuid,
  p_location_id uuid,
  p_scope_key text,
  p_module_key text,
  p_payload jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_existing public.marginflow_cloud_state%rowtype;
  v_revision bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if p_module_key = 'invoices' then
    raise exception 'Confirmed invoices are relational and cannot be saved as a mutable snapshot';
  end if;
  if p_module_key is null or p_module_key = '' or jsonb_typeof(p_payload) is null then
    raise exception 'A module key and JSON payload are required';
  end if;

  select * into v_existing
  from public.marginflow_cloud_state
  where company_id = p_company_id
    and scope_key = coalesce(nullif(p_scope_key, ''), coalesce(p_location_id::text, 'company'))
    and module_key = p_module_key
  for update;

  if v_existing.id is null then
    if coalesce(p_expected_revision, 0) <> 0 then
      raise exception 'cloud_revision_conflict:%:expected_%:actual_0', p_module_key, p_expected_revision;
    end if;
    insert into public.marginflow_cloud_state (
      company_id, location_id, scope_key, module_key, payload, revision,
      migrated_from_local_storage, synced_at, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id,
      coalesce(nullif(p_scope_key, ''), coalesce(p_location_id::text, 'company')),
      p_module_key, p_payload, 1, false, now(), now(), now(), auth.uid(), auth.uid()
    ) returning revision into v_revision;
  else
    if v_existing.revision <> coalesce(p_expected_revision, 0) then
      raise exception 'cloud_revision_conflict:%:expected_%:actual_%', p_module_key, p_expected_revision, v_existing.revision;
    end if;
    update public.marginflow_cloud_state
    set payload = p_payload,
        location_id = p_location_id,
        revision = revision + 1,
        synced_at = now(),
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_existing.id
    returning revision into v_revision;
  end if;

  return jsonb_build_object(
    'module_key', p_module_key,
    'revision', v_revision,
    'saved_at', now(),
    'payload_bytes', pg_column_size(p_payload)
  );
end;
$$;

revoke all on function public.save_cloud_state_module_v2(uuid, uuid, text, text, jsonb, bigint) from public;
grant execute on function public.save_cloud_state_module_v2(uuid, uuid, text, text, jsonb, bigint) to authenticated;

create or replace function public.persist_invoice_document_v2(
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
  v_requested_id uuid := public.marginflow_try_uuid(p_invoice->>'id');
  v_expected_revision bigint := nullif(coalesce(p_invoice->>'syncRevision', p_invoice->>'sync_revision'), '')::bigint;
  v_invoice_id uuid;
  v_existing public.invoices%rowtype;
  v_supplier_id uuid := public.marginflow_try_uuid(coalesce(p_invoice->>'supplierId', p_invoice->>'supplier_id'));
  v_document_type text := lower(coalesce(nullif(p_invoice->>'documentType', ''), nullif(p_invoice->>'document_type', ''), 'invoice'));
  v_document_number text := coalesce(nullif(p_invoice->>'documentNumber', ''), nullif(p_invoice->>'document_number', ''), nullif(p_invoice->>'invoiceNumber', ''), nullif(p_invoice->>'invoice_number', ''));
  v_invoice_date date := coalesce(nullif(coalesce(p_invoice->>'date', p_invoice->>'invoiceDate', p_invoice->>'invoice_date'), '')::date, current_date);
  v_fingerprint_payload jsonb := p_invoice - 'syncStatus' - 'syncError' - 'syncedAt' - 'pendingSince' - 'relationalId' - 'persistenceSource' - 'syncRevision' - 'sync_revision' - 'recoveryConflictVersions';
  v_fingerprint text;
  v_items jsonb := coalesce(p_invoice->'items', p_invoice->'lines', '[]'::jsonb);
  v_line jsonb;
  v_line_id uuid;
  v_product_id uuid;
  v_department_id uuid;
  v_line_total numeric;
  v_split jsonb;
  v_split_id uuid;
  v_split_department_id uuid;
  v_line_count integer := 0;
  v_split_count integer := 0;
  v_line_ids uuid[] := array[]::uuid[];
  v_split_ids uuid[] := array[]::uuid[];
  v_now timestamptz := now();
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if v_requested_id is null then
    raise exception 'Invoice needs a stable UUID before persistence';
  end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) < 1 then
    raise exception 'Invoice needs at least one line';
  end if;
  if v_document_type not in ('invoice', 'credit_note') then
    raise exception 'Unsupported purchasing document type';
  end if;

  if v_supplier_id is not null and not exists (
    select 1 from public.suppliers where id = v_supplier_id and company_id = p_company_id and active
  ) then
    v_supplier_id := null;
  end if;
  if v_supplier_id is null then
    select supplier.id into v_supplier_id
    from public.suppliers supplier
    where supplier.company_id = p_company_id
      and supplier.active
      and lower(trim(supplier.name)) = lower(trim(coalesce(p_invoice->>'supplier', p_invoice->>'supplierName', '')))
    order by supplier.updated_at desc
    limit 1;
  end if;

  v_fingerprint := md5(v_fingerprint_payload::text);

  select * into v_existing
  from public.invoices invoice
  where invoice.id = v_requested_id
  for update;
  if v_existing.id is not null and v_existing.company_id <> p_company_id then
    raise exception 'Invoice identifier belongs to another company';
  end if;

  if v_existing.id is null and v_document_number is not null then
    select * into v_existing
    from public.invoices invoice
    where invoice.company_id = p_company_id
      and invoice.location_id is not distinct from p_location_id
      and invoice.supplier_id is not distinct from v_supplier_id
      and invoice.document_type = v_document_type
      and lower(invoice.document_number) = lower(v_document_number)
    order by invoice.updated_at desc
    limit 1
    for update;
  end if;

  if v_existing.id is not null and v_existing.id <> v_requested_id then
    if v_existing.content_fingerprint = v_fingerprint then
      return jsonb_build_object(
        'invoice_id', v_existing.id,
        'status', 'already_exists',
        'line_count', (select count(*) from public.invoice_lines where invoice_id = v_existing.id and active),
        'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_existing.id and line.active and split.active),
        'sync_revision', v_existing.sync_revision,
        'saved_at', v_existing.updated_at
      );
    end if;
    raise exception 'invoice_identity_conflict:%', v_existing.id;
  end if;

  if v_existing.id = v_requested_id then
    if v_existing.content_fingerprint = v_fingerprint then
      return jsonb_build_object(
        'invoice_id', v_existing.id,
        'status', 'already_exists',
        'line_count', (select count(*) from public.invoice_lines where invoice_id = v_existing.id and active),
        'split_count', (select count(*) from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id where line.invoice_id = v_existing.id and line.active and split.active),
        'sync_revision', v_existing.sync_revision,
        'saved_at', v_existing.updated_at
      );
    end if;
    if v_expected_revision is null then
      raise exception 'invoice_revision_required:%:actual_%', v_existing.id, v_existing.sync_revision;
    end if;
    if v_expected_revision <> v_existing.sync_revision then
      raise exception 'invoice_revision_conflict:%:expected_%:actual_%', v_existing.id, v_expected_revision, v_existing.sync_revision;
    end if;
  end if;

  v_invoice_id := coalesce(v_existing.id, v_requested_id);
  insert into public.invoices (
    id, company_id, location_id, supplier_id, invoice_number, invoice_date, status,
    subtotal, discount_amount, discount_percent, tax_amount, total_amount, source,
    document_type, document_number, original_invoice_id, original_invoice_number,
    credit_reason, inventory_effect, currency, content_fingerprint, sync_revision,
    metadata, created_at, updated_at, created_by, updated_by
  ) values (
    v_invoice_id, p_company_id, p_location_id, v_supplier_id, v_document_number, v_invoice_date,
    coalesce(nullif(p_invoice->>'status', ''), 'Approved'),
    coalesce(nullif(coalesce(p_invoice->>'sourceInvoiceSubtotal', p_invoice->>'subtotal'), '')::numeric, 0),
    coalesce(nullif(p_invoice->>'discountAmount', '')::numeric, 0),
    coalesce(nullif(p_invoice->>'discountPercent', '')::numeric, 0),
    coalesce(nullif(coalesce(p_invoice->>'vatTotal', p_invoice->>'taxAmount'), '')::numeric, 0),
    coalesce(nullif(coalesce(p_invoice->>'sourceInvoiceTotal', p_invoice->>'total', p_invoice->>'totalAmount'), '')::numeric, 0),
    coalesce(p_invoice->>'source', 'MarginFlow application'),
    v_document_type, v_document_number,
    public.marginflow_try_uuid(coalesce(p_invoice->>'originalInvoiceId', p_invoice->>'original_invoice_id')),
    coalesce(p_invoice->>'originalInvoiceNumber', p_invoice->>'original_invoice_number'),
    nullif(coalesce(p_invoice->>'creditReason', p_invoice->>'credit_reason'), ''),
    nullif(coalesce(p_invoice->>'inventoryEffect', p_invoice->>'inventory_effect'), ''),
    coalesce(nullif(p_invoice->>'currency', ''), 'GBP'),
    v_fingerprint, coalesce(v_existing.sync_revision, 0) + 1,
    coalesce(v_existing.metadata, '{}'::jsonb) || jsonb_build_object(
      'marginflow_snapshot', v_fingerprint_payload,
      'supplier_name', coalesce(p_invoice->>'supplier', ''),
      'last_device_save_at', v_now
    ),
    coalesce(v_existing.created_at, v_now), v_now,
    coalesce(v_existing.created_by, auth.uid()), auth.uid()
  )
  on conflict (id) do update
  set supplier_id = excluded.supplier_id,
      invoice_number = excluded.invoice_number,
      invoice_date = excluded.invoice_date,
      status = excluded.status,
      subtotal = excluded.subtotal,
      discount_amount = excluded.discount_amount,
      discount_percent = excluded.discount_percent,
      tax_amount = excluded.tax_amount,
      total_amount = excluded.total_amount,
      source = excluded.source,
      document_type = excluded.document_type,
      document_number = excluded.document_number,
      original_invoice_id = excluded.original_invoice_id,
      original_invoice_number = excluded.original_invoice_number,
      credit_reason = excluded.credit_reason,
      inventory_effect = excluded.inventory_effect,
      currency = excluded.currency,
      content_fingerprint = excluded.content_fingerprint,
      sync_revision = public.invoices.sync_revision + 1,
      metadata = public.invoices.metadata || excluded.metadata,
      updated_at = v_now,
      updated_by = auth.uid();

  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_line_id := public.marginflow_try_uuid(v_line->>'id');
    if v_line_id is null then
      raise exception 'Every invoice line needs a stable UUID';
    end if;
    v_line_ids := array_append(v_line_ids, v_line_id);
    if exists (
      select 1 from public.invoice_lines where id = v_line_id and (company_id <> p_company_id or invoice_id <> v_invoice_id)
    ) then
      raise exception 'Invoice line identifier belongs to another document';
    end if;

    v_product_id := public.marginflow_try_uuid(coalesce(v_line->>'matchedProductId', v_line->>'productId', v_line->>'product_id'));
    if v_product_id is not null and not exists (
      select 1 from public.products where id = v_product_id and company_id = p_company_id
    ) then
      v_product_id := null;
    end if;

    v_department_id := public.marginflow_try_uuid(coalesce(v_line->>'departmentId', v_line->>'department_id'));
    if v_department_id is not null and not exists (
      select 1 from public.departments where id = v_department_id and company_id = p_company_id
    ) then
      v_department_id := null;
    end if;
    if v_department_id is null then
      select department.id into v_department_id
      from public.departments department
      where department.company_id = p_company_id
        and department.active
        and lower(trim(department.name)) = lower(trim(coalesce(v_line->>'department', '')))
      order by department.updated_at desc
      limit 1;
    end if;

    v_line_total := coalesce(
      nullif(coalesce(v_line->>'netLineTotal', v_line->>'lineTotal', v_line->>'net_line_total'), '')::numeric,
      coalesce(nullif(v_line->>'quantity', '')::numeric, 0) * coalesce(nullif(coalesce(v_line->>'unitCost', v_line->>'unit_cost'), '')::numeric, 0)
    );

    insert into public.invoice_lines (
      id, company_id, location_id, invoice_id, supplier_id, product_id, department_id,
      product_name, pack_size, quantity, unit_cost, discount_amount, discount_percent,
      status, net_line_total, match_status, vat_amount, active, metadata,
      created_at, updated_at, created_by, updated_by
    ) values (
      v_line_id, p_company_id, p_location_id, v_invoice_id, v_supplier_id, v_product_id, v_department_id,
      coalesce(nullif(v_line->>'productName', ''), 'Invoice line'),
      nullif(v_line->>'packSize', ''),
      coalesce(nullif(v_line->>'quantity', '')::numeric, 0),
      coalesce(nullif(coalesce(v_line->>'unitCost', v_line->>'unit_cost'), '')::numeric, 0),
      coalesce(nullif(v_line->>'discountAmount', '')::numeric, 0),
      coalesce(nullif(v_line->>'discountPercent', '')::numeric, 0),
      coalesce(nullif(coalesce(v_line->>'lineStatus', v_line->>'status'), ''), 'Received'),
      v_line_total,
      coalesce(v_line->>'matchStatus', v_line->>'productMatchSource'),
      coalesce(nullif(coalesce(v_line->>'vat', v_line->>'vatAmount'), '')::numeric, 0),
      true,
      jsonb_build_object('marginflow_snapshot', v_line, 'last_device_save_at', v_now),
      v_now, v_now, auth.uid(), auth.uid()
    )
    on conflict (id) do update
    set supplier_id = excluded.supplier_id,
        product_id = excluded.product_id,
        department_id = excluded.department_id,
        product_name = excluded.product_name,
        pack_size = excluded.pack_size,
        quantity = excluded.quantity,
        unit_cost = excluded.unit_cost,
        discount_amount = excluded.discount_amount,
        discount_percent = excluded.discount_percent,
        status = excluded.status,
        net_line_total = excluded.net_line_total,
        match_status = excluded.match_status,
        vat_amount = excluded.vat_amount,
        active = true,
        metadata = public.invoice_lines.metadata || excluded.metadata,
        updated_at = v_now,
        updated_by = auth.uid();
    v_line_count := v_line_count + 1;

    for v_split in select value from jsonb_array_elements(coalesce(v_line->'departmentSplits', '[]'::jsonb))
    loop
      v_split_department_id := public.marginflow_try_uuid(coalesce(v_split->>'departmentId', v_split->>'department_id'));
      if v_split_department_id is not null and not exists (
        select 1 from public.departments where id = v_split_department_id and company_id = p_company_id
      ) then
        v_split_department_id := null;
      end if;
      if v_split_department_id is null then
        select department.id into v_split_department_id
        from public.departments department
        where department.company_id = p_company_id
          and department.active
          and lower(trim(department.name)) = lower(trim(coalesce(v_split->>'department', '')))
        order by department.updated_at desc
        limit 1;
      end if;
      if v_split_department_id is null then
        raise exception 'Department split cannot be mapped to a company department';
      end if;

      v_split_id := public.marginflow_try_uuid(v_split->>'id');
      if v_split_id is null then
        raise exception 'Every department split needs a stable UUID';
      end if;
      v_split_ids := array_append(v_split_ids, v_split_id);
      if exists (
        select 1 from public.invoice_line_department_splits where id = v_split_id and (company_id <> p_company_id or invoice_line_id <> v_line_id)
      ) then
        raise exception 'Department split identifier belongs to another invoice line';
      end if;

      insert into public.invoice_line_department_splits (
        id, company_id, location_id, invoice_line_id, department_id, percentage, amount,
        active, metadata, created_at, updated_at, created_by, updated_by
      ) values (
        v_split_id, p_company_id, p_location_id, v_line_id, v_split_department_id,
        coalesce(nullif(v_split->>'percentage', '')::numeric, 0),
        coalesce(nullif(v_split->>'amount', '')::numeric, v_line_total * coalesce(nullif(v_split->>'percentage', '')::numeric, 0) / 100),
        true,
        jsonb_build_object('marginflow_snapshot', v_split, 'last_device_save_at', v_now),
        v_now, v_now, auth.uid(), auth.uid()
      )
      on conflict (id) do update
      set department_id = excluded.department_id,
          percentage = excluded.percentage,
          amount = excluded.amount,
          active = true,
          metadata = public.invoice_line_department_splits.metadata || excluded.metadata,
          updated_at = v_now,
          updated_by = auth.uid();
      v_split_count := v_split_count + 1;
    end loop;
  end loop;

  update public.invoice_line_department_splits split
  set active = false,
      updated_at = v_now,
      updated_by = auth.uid()
  where split.active
    and exists (
      select 1 from public.invoice_lines line
      where line.id = split.invoice_line_id and line.invoice_id = v_invoice_id
    )
    and not (split.id = any(v_split_ids));

  update public.invoice_lines line
  set active = false,
      updated_at = v_now,
      updated_by = auth.uid()
  where line.invoice_id = v_invoice_id
    and line.active
    and not (line.id = any(v_line_ids));

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'status', case when v_existing.id is null then 'created' else 'updated' end,
    'line_count', v_line_count,
    'split_count', v_split_count,
    'content_fingerprint', v_fingerprint,
    'sync_revision', coalesce(v_existing.sync_revision, 0) + 1,
    'saved_at', v_now
  );
end;
$$;

revoke all on function public.persist_invoice_document_v2(uuid, uuid, jsonb) from public;
grant execute on function public.persist_invoice_document_v2(uuid, uuid, jsonb) to authenticated;
