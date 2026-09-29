\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() !~ '^mf_learning_test_[0-9]+$' then raise exception 'Local fixture only'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare payload jsonb := '{
    "id":"70000000-0000-4000-8000-000000000001",
    "supplierId":"40000000-0000-4000-8000-000000000001",
    "supplier":"Test Produce",
    "documentType":"invoice",
    "documentNumber":"QA-LOCAL-CONFIRMED",
    "date":"2026-08-10",
    "status":"Approved",
    "sourceInvoiceSubtotal":20,
    "sourceInvoiceTotal":20,
    "currency":"GBP",
    "items":[{
      "id":"80000000-0000-4000-8000-000000000001",
      "matchedProductId":"60000000-0000-4000-8000-000000000001",
      "productId":"60000000-0000-4000-8000-000000000001",
      "productName":"Test Potato",
      "quantity":2,
      "unitCost":10,
      "lineTotal":20,
      "netLineTotal":20,
      "unit":"each",
      "packSize":"each",
      "departmentId":"50000000-0000-4000-8000-000000000001",
      "department":"Food",
      "departmentSplits":[]
    }]
  }'::jsonb; result jsonb; again jsonb; begin
 result:=public.persist_invoice_document_v3('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',payload);
 if result->>'invoice_id'<>payload->>'id' or (result->>'line_count')::int<>1 then raise exception 'Invoice acknowledgement incorrect'; end if;
 again:=public.persist_invoice_document_v3('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',payload);
 if again->>'status'<>'already_exists' then raise exception 'Retry not idempotent'; end if;
end $$;
commit;
