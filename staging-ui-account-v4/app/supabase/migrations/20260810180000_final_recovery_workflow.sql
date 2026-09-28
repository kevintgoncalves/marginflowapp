-- Final recovery controls. This migration creates guarded capabilities only; it performs no data backfill.

create or replace function public.marginflow_first_numeric(
  p_payload jsonb,
  p_keys text[],
  p_nonzero_only boolean default false
)
returns numeric
language plpgsql
immutable
parallel safe
as $$
declare
  v_key text;
  v_value numeric;
begin
  foreach v_key in array p_keys loop
    if not (coalesce(p_payload, '{}'::jsonb) ? v_key) or p_payload->>v_key is null or btrim(p_payload->>v_key) = '' then
      continue;
    end if;
    begin
      v_value := (p_payload->>v_key)::numeric;
      if not p_nonzero_only or abs(v_value) > 0.005 then return v_value; end if;
    exception when invalid_text_representation then
      continue;
    end;
  end loop;
  return null;
end;
$$;

create or replace function public.normalize_invoice_payload_v1(p_invoice jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_items jsonb := coalesce(p_invoice->'items', p_invoice->'lines', '[]'::jsonb);
  v_line jsonb;
  v_quantity numeric;
  v_unit_cost numeric;
  v_line_subtotal numeric;
  v_line_net numeric;
  v_subtotal_sum numeric := 0;
  v_net_sum numeric := 0;
  v_line_vat_sum numeric := 0;
  v_complete boolean := true;
  v_subtotal numeric;
  v_vat numeric;
  v_discount numeric;
  v_charges numeric;
  v_total numeric;
  v_canonical_total numeric;
  v_gross_alias numeric;
  v_net_alias numeric;
  v_document_type text := lower(coalesce(nullif(p_invoice->>'documentType', ''), nullif(p_invoice->>'document_type', ''), 'invoice'));
begin
  if jsonb_typeof(v_items) <> 'array' then return p_invoice; end if;

  for v_line in select value from jsonb_array_elements(v_items)
  loop
    v_quantity := public.marginflow_first_numeric(v_line, array['quantity']);
    v_unit_cost := public.marginflow_first_numeric(v_line, array['unitCost', 'unit_cost']);
    v_line_subtotal := public.marginflow_first_numeric(v_line, array['originalLineTotal', 'sourceLineTotal', 'source_line_total']);
    v_line_net := public.marginflow_first_numeric(v_line, array['netLineTotal', 'net_line_total', 'lineTotal']);
    if v_line_subtotal is null and v_quantity is not null and v_unit_cost is not null then
      v_line_subtotal := v_quantity * v_unit_cost;
    end if;
    if v_line_net is null and v_quantity is not null and v_unit_cost is not null then
      v_line_net := v_quantity * v_unit_cost;
    end if;
    if v_line_subtotal is null or v_line_net is null then
      v_complete := false;
    else
      v_subtotal_sum := v_subtotal_sum + v_line_subtotal;
      v_net_sum := v_net_sum + v_line_net;
    end if;
    v_line_vat_sum := v_line_vat_sum + coalesce(public.marginflow_first_numeric(v_line, array['vat', 'vatAmount', 'vat_amount']), 0);
  end loop;

  v_vat := coalesce(
    public.marginflow_first_numeric(p_invoice, array['vatTotal', 'vat_total', 'taxAmount', 'tax_amount'], true),
    public.marginflow_first_numeric(p_invoice, array['vatTotal', 'vat_total', 'taxAmount', 'tax_amount']),
    v_line_vat_sum,
    0
  );
  v_discount := coalesce(public.marginflow_first_numeric(p_invoice, array['discountAmount', 'discount_amount']), 0);
  v_charges := public.marginflow_first_numeric(p_invoice, array['additionalCharges', 'additional_charges']);
  if v_charges is null then
    v_charges := coalesce(public.marginflow_first_numeric(p_invoice, array['handlingCharge', 'handling_charge']), 0)
      + coalesce(public.marginflow_first_numeric(p_invoice, array['deliveryCharge', 'delivery_charge']), 0);
  end if;

  v_subtotal := coalesce(
    public.marginflow_first_numeric(p_invoice, array['sourceInvoiceSubtotal', 'subtotal'], true),
    public.marginflow_first_numeric(p_invoice, array['subtotalBeforeDiscount', 'subtotal_before_discount'], true),
    case when v_complete then round(v_subtotal_sum, 2) end,
    public.marginflow_first_numeric(p_invoice, array['sourceInvoiceSubtotal', 'subtotal', 'subtotalBeforeDiscount', 'subtotal_before_discount'])
  );
  if v_subtotal is null then raise exception 'invoice_subtotal_requires_complete_financial_data'; end if;

  v_canonical_total := public.marginflow_first_numeric(p_invoice, array['sourceInvoiceTotal', 'total', 'totalAmount', 'total_amount'], true);
  v_gross_alias := public.marginflow_first_numeric(p_invoice, array['invoiceTotal', 'grossTotal', 'gross_total', 'absoluteGrossTotal', 'absolute_gross_total'], true);
  v_net_alias := public.marginflow_first_numeric(p_invoice, array['finalInvoiceTotal', 'final_invoice_total', 'absoluteNetTotal', 'absolute_net_total'], true);
  v_total := coalesce(
    v_canonical_total,
    v_gross_alias,
    case when v_net_alias is not null then v_net_alias + v_vat end
  );
  if v_total is null
    and public.marginflow_first_numeric(
      p_invoice,
      array['sourceInvoiceTotal', 'total', 'totalAmount', 'total_amount', 'invoiceTotal', 'grossTotal', 'gross_total', 'finalInvoiceTotal', 'final_invoice_total']
    ) is not null
    and (
      not v_complete
      or abs(v_net_sum + v_charges + v_vat) <= 0.005
      or abs(v_subtotal_sum - v_discount + v_charges + v_vat) <= 0.005
    ) then
    v_total := 0;
  end if;
  if v_total is null and v_complete then
    v_total := round(v_net_sum + v_charges + v_vat, 2);
  end if;
  if v_total is null then
    v_total := public.marginflow_first_numeric(
      p_invoice,
      array['sourceInvoiceTotal', 'total', 'totalAmount', 'total_amount', 'invoiceTotal', 'grossTotal', 'gross_total', 'finalInvoiceTotal', 'final_invoice_total']
    );
  end if;
  if v_total is null then raise exception 'invoice_total_requires_complete_financial_data'; end if;

  if v_document_type = 'credit_note' then
    v_subtotal := abs(v_subtotal);
    v_vat := abs(v_vat);
    v_discount := abs(v_discount);
    v_charges := abs(v_charges);
    v_total := abs(v_total);
  end if;

  return p_invoice || jsonb_build_object(
    'sourceInvoiceSubtotal', round(v_subtotal, 2),
    'subtotal', round(v_subtotal, 2),
    'vatTotal', round(v_vat, 2),
    'taxAmount', round(v_vat, 2),
    'discountAmount', round(v_discount, 2),
    'additionalCharges', round(v_charges, 2),
    'sourceInvoiceTotal', round(v_total, 2),
    'total', round(v_total, 2),
    'totalAmount', round(v_total, 2),
    'financialNormalization', jsonb_build_object('version', 1, 'serverApplied', true)
  );
end;
$$;

do $$
begin
  if to_regprocedure('public.persist_invoice_document_v2_legacy(uuid,uuid,jsonb)') is null then
    alter function public.persist_invoice_document_v2(uuid, uuid, jsonb) rename to persist_invoice_document_v2_legacy;
  end if;
end
$$;

revoke all on function public.persist_invoice_document_v2_legacy(uuid, uuid, jsonb) from public;
revoke all on function public.persist_invoice_document_v2_legacy(uuid, uuid, jsonb) from authenticated;

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
  return public.persist_invoice_document_v2_legacy(
    p_company_id,
    p_location_id,
    public.normalize_invoice_payload_v1(p_invoice)
  );
end;
$$;

revoke all on function public.persist_invoice_document_v2(uuid, uuid, jsonb) from public;
grant execute on function public.persist_invoice_document_v2(uuid, uuid, jsonb) to authenticated;

create table if not exists public.marginflow_recovery_resolutions (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  resolution_type text not null,
  source_key text not null,
  decision text not null,
  target_id uuid,
  value jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid()
);

create unique index if not exists marginflow_recovery_resolutions_scope_idx
  on public.marginflow_recovery_resolutions(
    company_id,
    coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
    resolution_type,
    source_key
  );
create index if not exists marginflow_recovery_resolutions_target_idx on public.marginflow_recovery_resolutions(target_id);
alter table public.marginflow_recovery_resolutions enable row level security;
drop policy if exists marginflow_recovery_resolutions_select_member on public.marginflow_recovery_resolutions;
create policy marginflow_recovery_resolutions_select_member
  on public.marginflow_recovery_resolutions for select to authenticated
  using (public.is_active_company_member(company_id));

create or replace function public.save_recovery_resolution_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_resolution_type text,
  p_source_key text,
  p_decision text,
  p_target_id uuid,
  p_value jsonb,
  p_metadata jsonb,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_existing public.marginflow_recovery_resolutions%rowtype;
  v_result public.marginflow_recovery_resolutions%rowtype;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if p_location_id is not null and not exists (select 1 from public.locations where id = p_location_id and company_id = p_company_id) then
    raise exception 'Location does not belong to this company';
  end if;
  if coalesce(btrim(p_resolution_type), '') = '' or coalesce(btrim(p_source_key), '') = '' or coalesce(btrim(p_decision), '') = '' then
    raise exception 'Resolution type, source key and decision are required';
  end if;
  if p_resolution_type = 'product_mapping' and p_decision in ('map_existing', 'merged_into') and not exists (
    select 1 from public.products where id = p_target_id and company_id = p_company_id and active
  ) then raise exception 'The selected product is not active in this company'; end if;
  if p_resolution_type = 'department_mapping' and p_decision = 'map_existing' and not exists (
    select 1 from public.departments where id = p_target_id and company_id = p_company_id and active
  ) then raise exception 'The selected department is not active in this company'; end if;

  select * into v_existing
  from public.marginflow_recovery_resolutions
  where company_id = p_company_id
    and location_id is not distinct from p_location_id
    and resolution_type = p_resolution_type
    and source_key = p_source_key
  for update;

  if v_existing.id is null then
    if coalesce(p_expected_revision, 0) <> 0 then raise exception 'recovery_resolution_revision_conflict:expected_%:actual_0', p_expected_revision; end if;
    insert into public.marginflow_recovery_resolutions (
      company_id, location_id, resolution_type, source_key, decision, target_id, value, metadata,
      revision, active, created_at, updated_at, created_by, updated_by
    ) values (
      p_company_id, p_location_id, p_resolution_type, p_source_key, p_decision, p_target_id,
      coalesce(p_value, '{}'::jsonb), coalesce(p_metadata, '{}'::jsonb), 1, true, now(), now(), auth.uid(), auth.uid()
    ) returning * into v_result;
  else
    if v_existing.revision <> coalesce(p_expected_revision, 0) then
      raise exception 'recovery_resolution_revision_conflict:expected_%:actual_%', p_expected_revision, v_existing.revision;
    end if;
    update public.marginflow_recovery_resolutions
    set decision = p_decision,
        target_id = p_target_id,
        value = coalesce(p_value, '{}'::jsonb),
        metadata = metadata || coalesce(p_metadata, '{}'::jsonb),
        revision = revision + 1,
        active = true,
        updated_at = now(),
        updated_by = auth.uid()
    where id = v_existing.id
    returning * into v_result;
  end if;
  return jsonb_build_object('id', v_result.id, 'revision', v_result.revision, 'decision', v_result.decision, 'saved_at', v_result.updated_at);
end;
$$;

revoke all on function public.save_recovery_resolution_v1(uuid, uuid, text, text, text, uuid, jsonb, jsonb, bigint) from public;
grant execute on function public.save_recovery_resolution_v1(uuid, uuid, text, text, text, uuid, jsonb, jsonb, bigint) to authenticated;

create table if not exists public.invoice_financial_repairs (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  repair_key text not null,
  previous_values jsonb not null,
  repaired_values jsonb not null,
  proof jsonb not null,
  previous_revision bigint not null,
  resulting_revision bigint not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique(company_id, repair_key)
);
create index if not exists invoice_financial_repairs_invoice_idx on public.invoice_financial_repairs(invoice_id);
alter table public.invoice_financial_repairs enable row level security;
drop policy if exists invoice_financial_repairs_select_member on public.invoice_financial_repairs;
create policy invoice_financial_repairs_select_member
  on public.invoice_financial_repairs for select to authenticated
  using (public.is_active_company_member(company_id));

create or replace function public.repair_invoice_financial_headers_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_invoice_id uuid,
  p_expected_revision bigint,
  p_expected_content_fingerprint text,
  p_expected_subtotal numeric,
  p_expected_vat numeric,
  p_expected_discount numeric,
  p_expected_total numeric,
  p_proposed_subtotal numeric,
  p_proposed_vat numeric,
  p_proposed_discount numeric,
  p_proposed_total numeric,
  p_proof jsonb,
  p_repair_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_existing_repair public.invoice_financial_repairs%rowtype;
  v_snapshot jsonb;
  v_new_fingerprint text;
  v_new_revision bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  select * into v_existing_repair from public.invoice_financial_repairs where company_id = p_company_id and repair_key = p_repair_key;
  if v_existing_repair.id is not null then
    return jsonb_build_object('status', 'already_repaired', 'invoice_id', v_existing_repair.invoice_id, 'sync_revision', v_existing_repair.resulting_revision, 'repair_id', v_existing_repair.id);
  end if;
  select * into v_invoice from public.invoices
  where id = p_invoice_id and company_id = p_company_id and location_id is not distinct from p_location_id
  for update;
  if v_invoice.id is null then raise exception 'Invoice is outside the authorised recovery scope'; end if;
  if v_invoice.sync_revision <> p_expected_revision then raise exception 'invoice_revision_conflict:%:expected_%:actual_%', p_invoice_id, p_expected_revision, v_invoice.sync_revision; end if;
  if p_expected_content_fingerprint is null or v_invoice.content_fingerprint is distinct from p_expected_content_fingerprint then
    raise exception 'invoice_content_fingerprint_conflict:%', p_invoice_id;
  end if;
  if v_invoice.subtotal is distinct from p_expected_subtotal
    or v_invoice.tax_amount is distinct from p_expected_vat
    or v_invoice.discount_amount is distinct from p_expected_discount
    or v_invoice.total_amount is distinct from p_expected_total then
    raise exception 'invoice_financial_header_conflict:%', p_invoice_id;
  end if;
  if coalesce(p_proof->>'type', '') <> 'same_uuid_equivalent_business_content' then raise exception 'A proven same-UUID repair source is required'; end if;
  if not exists (select 1 from public.invoice_lines where invoice_id = p_invoice_id and active) then raise exception 'Invoice has no active lines'; end if;
  if p_proposed_subtotal < 0 or p_proposed_vat < 0 or p_proposed_discount < 0 or p_proposed_total < 0 then raise exception 'Repair values must use absolute purchasing amounts'; end if;

  v_snapshot := coalesce(v_invoice.metadata->'marginflow_snapshot', '{}'::jsonb) || jsonb_build_object(
    'sourceInvoiceSubtotal', round(p_proposed_subtotal, 2),
    'subtotal', round(p_proposed_subtotal, 2),
    'vatTotal', round(p_proposed_vat, 2),
    'taxAmount', round(p_proposed_vat, 2),
    'discountAmount', round(p_proposed_discount, 2),
    'sourceInvoiceTotal', round(p_proposed_total, 2),
    'total', round(p_proposed_total, 2),
    'totalAmount', round(p_proposed_total, 2)
  );
  v_new_fingerprint := md5((v_snapshot - 'syncStatus' - 'syncError' - 'syncedAt' - 'pendingSince' - 'relationalId' - 'persistenceSource' - 'syncRevision' - 'sync_revision' - 'recoveryConflictVersions')::text);
  update public.invoices
  set subtotal = round(p_proposed_subtotal, 2),
      tax_amount = round(p_proposed_vat, 2),
      discount_amount = round(p_proposed_discount, 2),
      total_amount = round(p_proposed_total, 2),
      content_fingerprint = v_new_fingerprint,
      sync_revision = sync_revision + 1,
      metadata = metadata || jsonb_build_object(
        'marginflow_snapshot', v_snapshot,
        'last_financial_header_repair', jsonb_build_object('repair_key', p_repair_key, 'repaired_at', now(), 'proof', p_proof)
      ),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning sync_revision into v_new_revision;

  insert into public.invoice_financial_repairs (
    company_id, location_id, invoice_id, repair_key, previous_values, repaired_values, proof,
    previous_revision, resulting_revision, created_at, created_by
  ) values (
    p_company_id, p_location_id, p_invoice_id, p_repair_key,
    jsonb_build_object('subtotal', p_expected_subtotal, 'vat', p_expected_vat, 'discount', p_expected_discount, 'total', p_expected_total, 'content_fingerprint', p_expected_content_fingerprint),
    jsonb_build_object('subtotal', p_proposed_subtotal, 'vat', p_proposed_vat, 'discount', p_proposed_discount, 'total', p_proposed_total, 'content_fingerprint', v_new_fingerprint),
    p_proof, p_expected_revision, v_new_revision, now(), auth.uid()
  ) returning id into v_existing_repair.id;
  return jsonb_build_object('status', 'repaired', 'invoice_id', p_invoice_id, 'sync_revision', v_new_revision, 'content_fingerprint', v_new_fingerprint, 'repair_id', v_existing_repair.id);
end;
$$;

revoke all on function public.repair_invoice_financial_headers_v1(uuid, uuid, uuid, bigint, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text) from public;
grant execute on function public.repair_invoice_financial_headers_v1(uuid, uuid, uuid, bigint, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, text) to authenticated;

create or replace function public.resolve_recovery_invoice_date_v1(
  p_company_id uuid,
  p_location_id uuid,
  p_legacy_invoice_id text,
  p_invoice_id uuid,
  p_expected_revision bigint,
  p_expected_content_fingerprint text,
  p_invoice_date date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_invoice public.invoices%rowtype;
  v_snapshot jsonb;
  v_fingerprint text;
  v_revision bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  select * into v_invoice from public.invoices
  where id = p_invoice_id and company_id = p_company_id and location_id is not distinct from p_location_id
  for update;
  if v_invoice.id is null then raise exception 'Invoice is outside the authorised recovery scope'; end if;
  if v_invoice.sync_revision <> p_expected_revision then raise exception 'invoice_revision_conflict:%:expected_%:actual_%', p_invoice_id, p_expected_revision, v_invoice.sync_revision; end if;
  if p_expected_content_fingerprint is null or v_invoice.content_fingerprint is distinct from p_expected_content_fingerprint then raise exception 'invoice_content_fingerprint_conflict:%', p_invoice_id; end if;
  v_snapshot := coalesce(v_invoice.metadata->'marginflow_snapshot', '{}'::jsonb) || jsonb_build_object('date', p_invoice_date, 'invoiceDate', p_invoice_date);
  v_fingerprint := md5((v_snapshot - 'syncStatus' - 'syncError' - 'syncedAt' - 'pendingSince' - 'relationalId' - 'persistenceSource' - 'syncRevision' - 'sync_revision' - 'recoveryConflictVersions')::text);
  update public.invoices
  set invoice_date = p_invoice_date,
      content_fingerprint = v_fingerprint,
      sync_revision = sync_revision + 1,
      metadata = metadata || jsonb_build_object('marginflow_snapshot', v_snapshot, 'recovery_date_resolution', jsonb_build_object('legacy_invoice_id', p_legacy_invoice_id, 'resolved_at', now())),
      updated_at = now(),
      updated_by = auth.uid()
  where id = p_invoice_id
  returning sync_revision into v_revision;
  insert into public.marginflow_recovery_resolutions (company_id, location_id, resolution_type, source_key, decision, target_id, value, metadata, revision, active, created_at, updated_at, created_by, updated_by)
  values (p_company_id, p_location_id, 'invoice_date', p_legacy_invoice_id, 'use_device', p_invoice_id, jsonb_build_object('date', p_invoice_date), jsonb_build_object('previous_date', v_invoice.invoice_date), 1, true, now(), now(), auth.uid(), auth.uid())
  on conflict (company_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), resolution_type, source_key) do update
  set decision = excluded.decision, target_id = excluded.target_id, value = excluded.value,
      metadata = public.marginflow_recovery_resolutions.metadata || excluded.metadata,
      revision = public.marginflow_recovery_resolutions.revision + 1, active = true, updated_at = now(), updated_by = auth.uid();
  return jsonb_build_object('status', 'resolved', 'invoice_id', p_invoice_id, 'invoice_date', p_invoice_date, 'sync_revision', v_revision, 'content_fingerprint', v_fingerprint);
end;
$$;

revoke all on function public.resolve_recovery_invoice_date_v1(uuid, uuid, text, uuid, bigint, text, date) from public;
grant execute on function public.resolve_recovery_invoice_date_v1(uuid, uuid, text, uuid, bigint, text, date) to authenticated;

create or replace function public.verify_recovery_integrity_v1(p_company_id uuid, p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_orphan_lines bigint;
  v_orphan_splits bigint;
  v_invalid_suppliers bigint;
  v_invalid_products bigint;
  v_invalid_departments bigint;
  v_half_written bigint;
  v_duplicate_identities bigint;
  v_simple_total_mismatches bigint;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  select count(*) into v_orphan_lines from public.invoice_lines line left join public.invoices invoice on invoice.id = line.invoice_id where line.company_id = p_company_id and invoice.id is null;
  select count(*) into v_orphan_splits from public.invoice_line_department_splits split left join public.invoice_lines line on line.id = split.invoice_line_id where split.company_id = p_company_id and line.id is null;
  select count(*) into v_invalid_suppliers from public.invoices invoice left join public.suppliers supplier on supplier.id = invoice.supplier_id and supplier.company_id = invoice.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and invoice.supplier_id is not null and supplier.id is null;
  select count(*) into v_invalid_products from public.invoice_lines line join public.invoices invoice on invoice.id = line.invoice_id left join public.products product on product.id = line.product_id and product.company_id = line.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and line.active and line.product_id is not null and product.id is null;
  select count(*) into v_invalid_departments from (
    select line.id from public.invoice_lines line join public.invoices invoice on invoice.id = line.invoice_id left join public.departments department on department.id = line.department_id and department.company_id = line.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and line.active and line.department_id is not null and department.id is null
    union all
    select split.id from public.invoice_line_department_splits split join public.invoice_lines line on line.id = split.invoice_line_id join public.invoices invoice on invoice.id = line.invoice_id left join public.departments department on department.id = split.department_id and department.company_id = split.company_id where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and line.active and split.active and department.id is null
  ) invalid;
  select count(*) into v_half_written from public.invoices invoice where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id and not exists (select 1 from public.invoice_lines line where line.invoice_id = invoice.id and line.active);
  select count(*) into v_duplicate_identities from (
    select supplier_id, document_type, lower(document_number) from public.invoices where company_id = p_company_id and location_id is not distinct from p_location_id and document_number is not null and lower(document_number) not in ('unit', 'invoice', 'unknown', 'n/a', 'na', 'receipt') group by supplier_id, document_type, lower(document_number) having count(*) > 1
  ) duplicates;
  select count(*) into v_simple_total_mismatches from (
    select invoice.id
    from public.invoices invoice
    join public.invoice_lines line on line.invoice_id = invoice.id and line.active
    where invoice.company_id = p_company_id and invoice.location_id is not distinct from p_location_id
      and invoice.discount_amount = 0
      and coalesce(
        public.marginflow_first_numeric(
          invoice.metadata->'marginflow_snapshot',
          array['additionalCharges', 'additional_charges']
        ),
        0
      ) = 0
    group by invoice.id, invoice.total_amount, invoice.tax_amount
    having abs(invoice.total_amount - (sum(line.net_line_total) + invoice.tax_amount)) > 0.02
  ) mismatches;
  return jsonb_build_object(
    'generated_at', now(),
    'checks', jsonb_build_array(
      jsonb_build_object('key', 'orphan_invoice_lines', 'count', v_orphan_lines, 'pass', v_orphan_lines = 0),
      jsonb_build_object('key', 'orphan_splits', 'count', v_orphan_splits, 'pass', v_orphan_splits = 0),
      jsonb_build_object('key', 'invalid_supplier_references', 'count', v_invalid_suppliers, 'pass', v_invalid_suppliers = 0),
      jsonb_build_object('key', 'invalid_product_references', 'count', v_invalid_products, 'pass', v_invalid_products = 0),
      jsonb_build_object('key', 'invalid_department_references', 'count', v_invalid_departments, 'pass', v_invalid_departments = 0),
      jsonb_build_object('key', 'half_written_invoices', 'count', v_half_written, 'pass', v_half_written = 0),
      jsonb_build_object('key', 'duplicate_strong_identities', 'count', v_duplicate_identities, 'pass', v_duplicate_identities = 0),
      jsonb_build_object('key', 'simple_financial_mismatches', 'count', v_simple_total_mismatches, 'pass', v_simple_total_mismatches = 0)
    ),
    'pass', v_orphan_lines + v_orphan_splits + v_invalid_suppliers + v_invalid_products + v_invalid_departments + v_half_written + v_duplicate_identities + v_simple_total_mismatches = 0
  );
end;
$$;

revoke all on function public.verify_recovery_integrity_v1(uuid, uuid) from public;
grant execute on function public.verify_recovery_integrity_v1(uuid, uuid) to authenticated;

create table if not exists public.product_merge_format_archives (
  id uuid primary key default extensions.gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  merge_id uuid references public.product_merges(id) on delete set null,
  operation_key uuid not null,
  source_format_id uuid not null,
  source_row jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique(operation_key, source_format_id)
);
alter table public.product_merge_format_archives enable row level security;
drop policy if exists product_merge_format_archives_select_member on public.product_merge_format_archives;
create policy product_merge_format_archives_select_member
  on public.product_merge_format_archives for select to authenticated
  using (public.is_active_company_member(company_id));

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
  if current_setting('marginflow.product_merge_v2', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and new.revision <> old.revision + 1 then
    raise exception 'direct_snapshot_write_blocked:%:use_revision_rpc', new.module_key;
  end if;
  return new;
end;
$$;

create or replace function public.merge_product_v2(
  p_company_id uuid,
  p_location_id uuid,
  p_keep_product_id uuid,
  p_merge_product_ids uuid[],
  p_snapshot_modules jsonb,
  p_expected_module_revisions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_modules text[] := array['products', 'supplierProductMappings', 'invoiceLineCorrections', 'stocktakes', 'recipes', 'menus', 'wasteItems'];
  v_module text;
  v_scope_key text := coalesce(p_location_id::text, 'company');
  v_expected bigint;
  v_actual bigint;
  v_result jsonb;
  v_operation_key uuid := extensions.gen_random_uuid();
  v_merge_id uuid;
begin
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then raise exception 'Not authorised for this company'; end if;
  if jsonb_typeof(p_expected_module_revisions) <> 'object' then raise exception 'Expected module revisions are required'; end if;
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
  where format_row.company_id = p_company_id
    and format_row.product_id = any(array_prepend(p_keep_product_id, p_merge_product_ids));

  perform set_config('marginflow.product_merge_v2', 'on', true);
  v_result := public.merge_duplicate_products(p_company_id, p_location_id, p_keep_product_id, p_merge_product_ids, p_snapshot_modules);
  v_merge_id := (v_result->>'merge_id')::uuid;
  update public.product_merge_format_archives set merge_id = v_merge_id where operation_key = v_operation_key;

  foreach v_module in array v_modules loop
    v_expected := (p_expected_module_revisions->>v_module)::bigint;
    update public.marginflow_cloud_state
    set revision = v_expected + 1,
        updated_at = now(),
        updated_by = auth.uid()
    where company_id = p_company_id and scope_key = v_scope_key and module_key = v_module;
  end loop;
  perform set_config('marginflow.product_merge_v2', 'off', true);
  return v_result || jsonb_build_object(
    'module_revisions', (select jsonb_object_agg(module_key, revision) from public.marginflow_cloud_state where company_id = p_company_id and scope_key = v_scope_key and module_key = any(v_modules)),
    'format_archive_operation', v_operation_key
  );
end;
$$;

revoke all on function public.merge_product_v2(uuid, uuid, uuid, uuid[], jsonb, jsonb) from public;
grant execute on function public.merge_product_v2(uuid, uuid, uuid, uuid[], jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
