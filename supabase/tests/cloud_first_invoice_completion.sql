\set ON_ERROR_STOP on

begin;

insert into auth.users (id, aud, role, email, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'member@example.test', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'outsider@example.test', now(), now());

insert into public.profiles (id, full_name, email)
values
  ('10000000-0000-4000-8000-000000000001', 'Member', 'member@example.test'),
  ('10000000-0000-4000-8000-000000000002', 'Outsider', 'outsider@example.test');

insert into public.companies (id, name)
values ('20000000-0000-4000-8000-000000000001', 'Cloud First Test');

insert into public.locations (id, company_id, name)
values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'Test Location');

insert into public.company_members (company_id, location_id, user_id, role_label, status)
values (
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Owner',
  'active'
);

insert into public.departments (id, company_id, location_id, name)
values (
  '50000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Kitchen'
);

insert into public.suppliers (id, company_id, location_id, name)
values
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Supplier One'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Supplier Two');

-- The same canonical product name is valid for different suppliers.
insert into public.products (id, company_id, location_id, supplier_id, department_id, name)
values
  ('60000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'Milk'),
  ('60000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'Milk');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);

do $$
declare
  v_base jsonb := '{
    "id":"70000000-0000-4000-8000-000000000001",
    "supplierId":"40000000-0000-4000-8000-000000000001",
    "supplier":"Supplier One",
    "documentType":"invoice",
    "documentNumber":"INV-CLOUD-1",
    "date":"2026-08-10",
    "status":"Approved",
    "sourceInvoiceSubtotal":20,
    "sourceInvoiceTotal":20,
    "currency":"GBP",
    "items":[{
      "id":"80000000-0000-4000-8000-000000000001",
      "matchedProductId":"60000000-0000-4000-8000-000000000001",
      "productId":"60000000-0000-4000-8000-000000000001",
      "productName":"Milk",
      "quantity":2,
      "unitCost":10,
      "lineTotal":20,
      "netLineTotal":20,
      "unit":"each",
      "packSize":"each",
      "departmentId":"50000000-0000-4000-8000-000000000001",
      "department":"Kitchen",
      "departmentSplits":[]
    }]
  }'::jsonb;
  v_equivalent jsonb;
  v_changed jsonb;
  v_result jsonb;
  v_count integer;
begin
  if not has_function_privilege('authenticated', 'public.persist_invoice_document_v3(uuid,uuid,jsonb,text,uuid,bigint)', 'execute') then
    raise exception 'authenticated lacks persist_invoice_document_v3 execute';
  end if;

  v_result := public.persist_invoice_document_v3(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    v_base,
    null,
    null,
    null
  );
  if v_result->>'invoice_id' <> '70000000-0000-4000-8000-000000000001'
     or (v_result->>'sync_revision')::integer <> 1
     or (v_result->>'line_count')::integer <> 1 then
    raise exception 'initial persistence result is invalid: %', v_result;
  end if;

  v_equivalent := jsonb_set(v_base, '{id}', '"70000000-0000-4000-8000-000000000002"'::jsonb);
  v_equivalent := jsonb_set(v_equivalent, '{items,0,id}', '"80000000-0000-4000-8000-000000000002"'::jsonb);
  v_result := public.persist_invoice_document_v3(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    v_equivalent,
    null,
    null,
    null
  );
  if v_result->>'invoice_id' <> '70000000-0000-4000-8000-000000000001'
     or v_result->>'status' <> 'already_exists' then
    raise exception 'equivalent upload did not reuse the existing invoice: %', v_result;
  end if;

  v_changed := jsonb_set(v_equivalent, '{sourceInvoiceSubtotal}', '30'::jsonb);
  v_changed := jsonb_set(v_changed, '{sourceInvoiceTotal}', '30'::jsonb);
  v_changed := jsonb_set(v_changed, '{items,0,quantity}', '3'::jsonb);
  v_changed := jsonb_set(v_changed, '{items,0,lineTotal}', '30'::jsonb);
  v_changed := jsonb_set(v_changed, '{items,0,netLineTotal}', '30'::jsonb);

  begin
    perform public.persist_invoice_document_v3(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      v_changed,
      null,
      null,
      null
    );
    raise exception 'expected possible duplicate rejection';
  exception when others then
    if position('possible_invoice_duplicate:' in sqlerrm) = 0 then raise; end if;
  end;

  v_result := public.persist_invoice_document_v3(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    v_changed,
    'save_new',
    null,
    null
  );
  if v_result->>'invoice_id' <> '70000000-0000-4000-8000-000000000002' then
    raise exception 'explicit save-new did not preserve the new UUID: %', v_result;
  end if;

  v_changed := jsonb_set(v_base, '{sourceInvoiceSubtotal}', '30'::jsonb);
  v_changed := jsonb_set(v_changed, '{sourceInvoiceTotal}', '30'::jsonb);
  v_changed := jsonb_set(v_changed, '{items,0,quantity}', '3'::jsonb);
  v_changed := jsonb_set(v_changed, '{items,0,lineTotal}', '30'::jsonb);
  v_changed := jsonb_set(v_changed, '{items,0,netLineTotal}', '30'::jsonb);

  begin
    perform public.persist_invoice_document_v3(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      v_changed,
      null,
      null,
      null
    );
    raise exception 'expected update confirmation rejection';
  exception when others then
    if position('invoice_update_confirmation_required:' in sqlerrm) = 0 then raise; end if;
  end;

  v_result := public.persist_invoice_document_v3(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    v_changed,
    'update_existing',
    '70000000-0000-4000-8000-000000000001',
    1
  );
  if (v_result->>'sync_revision')::integer <> 2 then
    raise exception 'explicit update did not advance the revision: %', v_result;
  end if;

  select count(*) into v_count
  from public.invoice_lines
  where invoice_id = '70000000-0000-4000-8000-000000000001' and active;
  if v_count <> 1 then raise exception 'update merged lines instead of replacing them'; end if;

  begin
    perform public.persist_invoice_document_v3(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      jsonb_set(v_changed, '{sourceInvoiceTotal}', '40'::jsonb),
      'update_existing',
      '70000000-0000-4000-8000-000000000001',
      1
    );
    raise exception 'expected stale revision rejection';
  exception when others then
    if position('invoice_revision_conflict:' in sqlerrm) = 0 then raise; end if;
  end;

  select count(*) into v_count from public.invoices
  where company_id = '20000000-0000-4000-8000-000000000001';
  if v_count <> 2 then raise exception 'duplicate flow created an unexpected invoice count: %', v_count; end if;
end;
$$;

do $$
declare
  v_result jsonb;
  v_count integer;
begin
  v_result := public.archive_legacy_recovery_v1(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '[{"id":"legacy-product-1","name":"Unit","reason":"Generic label","legacy":{"id":"legacy-product-1","name":"Unit"}}]'::jsonb,
    '[{"id":"legacy-invoice-1","reason":"Unsafe product dependency","financialHeaderReliable":true,"legacy":{"id":"legacy-invoice-1","supplierId":"40000000-0000-4000-8000-000000000001","supplier":"Supplier One","documentType":"invoice","documentNumber":"Unit","date":"2026-08-09","sourceInvoiceSubtotal":12,"sourceInvoiceTotal":12}}]'::jsonb
  );
  if (v_result->>'products_inserted')::integer <> 1 or (v_result->>'invoices_inserted')::integer <> 1 then
    raise exception 'archive insert result is invalid: %', v_result;
  end if;

  v_result := public.archive_legacy_recovery_v1(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '[{"id":"legacy-product-1","name":"Unit","reason":"Generic label","legacy":{"id":"legacy-product-1","name":"Unit"}}]'::jsonb,
    '[{"id":"legacy-invoice-1","reason":"Unsafe product dependency","financialHeaderReliable":true,"legacy":{"id":"legacy-invoice-1","supplier":"Supplier One","date":"2026-08-09","sourceInvoiceTotal":12}}]'::jsonb
  );
  if (v_result->>'products_existing')::integer <> 1 or (v_result->>'invoices_existing')::integer <> 1 then
    raise exception 'archive retry is not idempotent: %', v_result;
  end if;

  select count(*) into v_count from public.legacy_invoice_archive;
  if v_count <> 1 then raise exception 'company member cannot read its archive'; end if;
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.legacy_invoice_archive;
  if v_count <> 0 then raise exception 'non-member can read another company archive'; end if;

  begin
    perform public.archive_legacy_recovery_v1(
      '20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '[]'::jsonb,
      '[]'::jsonb
    );
    raise exception 'expected archive authorization rejection';
  exception when others then
    if position('Not authorised for this company' in sqlerrm) = 0 then raise; end if;
  end;
end;
$$;

rollback;
