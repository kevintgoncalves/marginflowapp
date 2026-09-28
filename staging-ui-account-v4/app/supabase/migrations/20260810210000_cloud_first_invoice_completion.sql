-- Cloud-first invoice completion: explicit duplicate choices and immutable legacy archives.

-- Product identity is supplier-scoped. The former constraint incorrectly treated the
-- same canonical product name from different suppliers as one catalog record.
alter table public.products
  drop constraint if exists products_company_id_location_id_name_key;

create unique index if not exists products_supplier_canonical_name_idx
  on public.products (
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  )
  where active;

-- A printed document number is duplicate evidence, not relational identity. UUID is
-- the durable identity and the application/RPC requires an explicit duplicate choice.
drop index if exists public.invoices_supplier_document_type_number_idx;

create index if not exists invoices_duplicate_candidate_idx
  on public.invoices (
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid),
    document_type,
    lower(btrim(document_number))
  )
  where document_number is not null and btrim(document_number) <> '';

create table if not exists public.legacy_product_archive (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  source_product_id text not null,
  product_name text,
  supplier_name text,
  archive_reason text not null,
  payload jsonb not null,
  source_key text not null default 'current_laptop',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create unique index if not exists legacy_product_archive_source_idx
  on public.legacy_product_archive (
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_key,
    source_product_id
  );

create table if not exists public.legacy_invoice_archive (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  source_invoice_id text not null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  supplier_name text,
  document_type text not null default 'invoice',
  document_number text,
  invoice_date date,
  subtotal numeric(12, 2) not null default 0,
  vat_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  additional_charges numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'GBP',
  financial_header_reliable boolean not null default false,
  archive_reason text not null,
  classification text not null default 'archive_only',
  payload jsonb not null,
  source_key text not null default 'current_laptop',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create unique index if not exists legacy_invoice_archive_source_idx
  on public.legacy_invoice_archive (
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    source_key,
    source_invoice_id
  );
create index if not exists legacy_invoice_archive_supplier_date_idx
  on public.legacy_invoice_archive(company_id, supplier_id, invoice_date);

alter table public.legacy_product_archive enable row level security;
alter table public.legacy_invoice_archive enable row level security;

drop policy if exists legacy_product_archive_select_member on public.legacy_product_archive;
create policy legacy_product_archive_select_member
  on public.legacy_product_archive for select to authenticated
  using (public.is_active_company_member(company_id));

drop policy if exists legacy_invoice_archive_select_member on public.legacy_invoice_archive;
create policy legacy_invoice_archive_select_member
  on public.legacy_invoice_archive for select to authenticated
  using (public.is_active_company_member(company_id));

grant select on table public.legacy_product_archive to authenticated;
grant select on table public.legacy_invoice_archive to authenticated;

create or replace function public.archive_legacy_recovery_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_products jsonb,
  p_invoices jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_entry jsonb;
  v_payload jsonb;
  v_source_id text;
  v_supplier_id uuid;
  v_products_inserted integer := 0;
  v_invoices_inserted integer := 0;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company';
  end if;
  if p_location_id is not null and not exists (
    select 1 from public.locations where id = p_location_id and company_id = p_company_id
  ) then
    raise exception 'Location does not belong to this company';
  end if;
  if jsonb_typeof(coalesce(p_products, '[]'::jsonb)) <> 'array'
     or jsonb_typeof(coalesce(p_invoices, '[]'::jsonb)) <> 'array' then
    raise exception 'Recovery archive payloads must be arrays';
  end if;

  for v_entry in select value from jsonb_array_elements(coalesce(p_products, '[]'::jsonb))
  loop
    v_payload := coalesce(v_entry->'legacy', v_entry->'payload', '{}'::jsonb);
    v_source_id := coalesce(nullif(v_entry->>'id', ''), nullif(v_payload->>'id', ''), md5(v_payload::text));
    insert into public.legacy_product_archive (
      company_id, location_id, source_product_id, product_name, supplier_name,
      archive_reason, payload, source_key, created_at, created_by
    ) values (
      p_company_id, p_location_id, v_source_id,
      coalesce(v_entry->>'name', v_payload->>'name', v_payload->>'productName'),
      coalesce(v_payload->>'supplier', v_payload->>'supplierName'),
      coalesce(nullif(v_entry->>'reason', ''), 'Legacy product is not safe for the canonical catalog.'),
      v_payload, 'current_laptop', now(), auth.uid()
    ) on conflict do nothing;
    if found then v_products_inserted := v_products_inserted + 1; end if;
  end loop;

  for v_entry in select value from jsonb_array_elements(coalesce(p_invoices, '[]'::jsonb))
  loop
    v_payload := coalesce(v_entry->'legacy', v_entry->'payload', '{}'::jsonb);
    v_source_id := coalesce(nullif(v_entry->>'id', ''), nullif(v_payload->>'id', ''), md5(v_payload::text));
    v_supplier_id := public.marginflow_try_uuid(coalesce(v_entry->'canonical'->>'supplierId', v_payload->>'supplierId', v_payload->>'supplier_id'));
    if v_supplier_id is not null and not exists (
      select 1 from public.suppliers where id = v_supplier_id and company_id = p_company_id
    ) then v_supplier_id := null; end if;
    if v_supplier_id is null then
      select supplier.id into v_supplier_id
      from public.suppliers supplier
      where supplier.company_id = p_company_id
        and supplier.active
        and lower(btrim(supplier.name)) = lower(btrim(coalesce(v_payload->>'supplier', v_payload->>'supplierName', '')))
      order by supplier.updated_at desc
      limit 1;
    end if;

    insert into public.legacy_invoice_archive (
      company_id, location_id, source_invoice_id, supplier_id, supplier_name,
      document_type, document_number, invoice_date, subtotal, vat_amount,
      discount_amount, additional_charges, total_amount, currency,
      financial_header_reliable, archive_reason, classification, payload,
      source_key, created_at, created_by
    ) values (
      p_company_id, p_location_id, v_source_id, v_supplier_id,
      coalesce(v_payload->>'supplier', v_payload->>'supplierName'),
      lower(coalesce(nullif(v_payload->>'documentType', ''), nullif(v_payload->>'document_type', ''), 'invoice')),
      coalesce(v_payload->>'documentNumber', v_payload->>'document_number', v_payload->>'invoiceNumber', v_payload->>'invoice_number'),
      nullif(coalesce(v_payload->>'date', v_payload->>'invoiceDate', v_payload->>'invoice_date'), '')::date,
      coalesce(nullif(coalesce(v_payload->>'sourceInvoiceSubtotal', v_payload->>'invoiceSubtotal', v_payload->>'subtotal'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'vatTotal', v_payload->>'taxAmount', v_payload->>'tax_amount'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'discountAmount', v_payload->>'discount_amount'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'additionalCharges', v_payload->>'additional_charges'), '')::numeric, 0),
      coalesce(nullif(coalesce(v_payload->>'sourceInvoiceTotal', v_payload->>'invoiceTotal', v_payload->>'totalAmount', v_payload->>'total'), '')::numeric, 0),
      coalesce(nullif(v_payload->>'currency', ''), 'GBP'),
      coalesce((v_entry->>'financialHeaderReliable')::boolean, false),
      coalesce(nullif(v_entry->>'reason', ''), 'Legacy invoice is not safe for canonical product analytics.'),
      coalesce(nullif(v_entry->>'classification', ''), 'archive_only'),
      v_payload, 'current_laptop', now(), auth.uid()
    ) on conflict do nothing;
    if found then v_invoices_inserted := v_invoices_inserted + 1; end if;
  end loop;

  return jsonb_build_object(
    'products_inserted', v_products_inserted,
    'invoices_inserted', v_invoices_inserted,
    'products_existing', jsonb_array_length(coalesce(p_products, '[]'::jsonb)) - v_products_inserted,
    'invoices_existing', jsonb_array_length(coalesce(p_invoices, '[]'::jsonb)) - v_invoices_inserted,
    'archived_at', now()
  );
end;
$$;

revoke all on function public.archive_legacy_recovery_v1(uuid, uuid, jsonb, jsonb) from public;
grant execute on function public.archive_legacy_recovery_v1(uuid, uuid, jsonb, jsonb) to authenticated;

create or replace function public.marginflow_is_generic_document_number(value text)
returns boolean
language sql
immutable
parallel safe
as $$
  select lower(btrim(coalesce(value, ''))) in (
    '', 'date', 'document', 'inv', 'invoice', 'invoice number', 'n/a', 'na',
    'receipt', 'total', 'unit', 'unknown'
  );
$$;

create or replace function public.invoice_business_fingerprint_v1(p_invoice jsonb)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  with normalized as (
    select public.normalize_invoice_payload_v1(coalesce(p_invoice, '{}'::jsonb)) as invoice
  ), canonical_lines as (
    select jsonb_agg(line_shape order by line_shape::text) as lines
    from normalized,
    lateral jsonb_array_elements(coalesce(invoice->'items', invoice->'lines', '[]'::jsonb)) source_line,
    lateral (
      select jsonb_build_object(
        'product', coalesce(nullif(source_line->>'matchedProductId', ''), nullif(source_line->>'productId', ''), lower(btrim(coalesce(source_line->>'productName', source_line->>'product_name', '')))),
        'packSize', lower(btrim(coalesce(source_line->>'packSize', source_line->>'pack_size', ''))),
        'quantity', coalesce(nullif(source_line->>'quantity', '')::numeric, 0),
        'unitCost', coalesce(nullif(coalesce(source_line->>'unitCost', source_line->>'unit_cost'), '')::numeric, 0),
        'lineTotal', coalesce(nullif(coalesce(source_line->>'netLineTotal', source_line->>'lineTotal', source_line->>'net_line_total'), '')::numeric, 0),
        'discountAmount', coalesce(nullif(source_line->>'discountAmount', '')::numeric, 0),
        'discountPercent', coalesce(nullif(source_line->>'discountPercent', '')::numeric, 0),
        'vat', coalesce(nullif(coalesce(source_line->>'vat', source_line->>'vatAmount'), '')::numeric, 0),
        'department', coalesce(nullif(source_line->>'departmentId', ''), lower(btrim(coalesce(source_line->>'department', '')))),
        'splits', coalesce((
          select jsonb_agg(split_shape order by split_shape::text)
          from jsonb_array_elements(coalesce(source_line->'departmentSplits', source_line->'department_splits', '[]'::jsonb)) source_split,
          lateral (
            select jsonb_build_object(
              'department', coalesce(nullif(source_split->>'departmentId', ''), lower(btrim(coalesce(source_split->>'department', '')))),
              'percentage', coalesce(nullif(source_split->>'percentage', '')::numeric, 0),
              'amount', coalesce(nullif(source_split->>'amount', '')::numeric, 0)
            ) as split_shape
          ) split_rows
        ), '[]'::jsonb)
      ) as line_shape
    ) line_rows
  )
  select md5(jsonb_build_object(
    'supplier', coalesce(nullif(invoice->>'supplierId', ''), lower(btrim(coalesce(invoice->>'supplier', invoice->>'supplierName', '')))),
    'documentType', lower(coalesce(nullif(invoice->>'documentType', ''), nullif(invoice->>'document_type', ''), 'invoice')),
    'documentNumber', case
      when public.marginflow_is_generic_document_number(coalesce(invoice->>'documentNumber', invoice->>'document_number', invoice->>'invoiceNumber', invoice->>'invoice_number')) then ''
      else lower(btrim(coalesce(invoice->>'documentNumber', invoice->>'document_number', invoice->>'invoiceNumber', invoice->>'invoice_number', '')))
    end,
    'date', coalesce(invoice->>'date', invoice->>'invoiceDate', invoice->>'invoice_date', ''),
    'subtotal', coalesce(nullif(invoice->>'sourceInvoiceSubtotal', '')::numeric, 0),
    'vat', coalesce(nullif(invoice->>'vatTotal', '')::numeric, 0),
    'discount', coalesce(nullif(invoice->>'discountAmount', '')::numeric, 0),
    'charges', coalesce(nullif(invoice->>'additionalCharges', '')::numeric, 0),
    'total', coalesce(nullif(invoice->>'sourceInvoiceTotal', '')::numeric, 0),
    'currency', upper(coalesce(nullif(invoice->>'currency', ''), 'GBP')),
    'creditReason', coalesce(invoice->>'creditReason', invoice->>'credit_reason', ''),
    'inventoryEffect', coalesce(invoice->>'inventoryEffect', invoice->>'inventory_effect', ''),
    'lines', coalesce(canonical_lines.lines, '[]'::jsonb)
  )::text)
  from normalized cross join canonical_lines;
$$;

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
begin
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

revoke all on function public.persist_invoice_document_v3(uuid, uuid, jsonb, text, uuid, bigint) from public;
grant execute on function public.persist_invoice_document_v3(uuid, uuid, jsonb, text, uuid, bigint) to authenticated;

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
begin
  return public.persist_invoice_document_v3(p_company_id, p_location_id, p_invoice, null, null, null);
end;
$$;

revoke all on function public.persist_invoice_document_v2(uuid, uuid, jsonb) from public;
grant execute on function public.persist_invoice_document_v2(uuid, uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
