\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() !~ '^mf_learning_test_[0-9]+$' then raise exception 'Local fixture only'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin
 if (select count(*) from public.supplier_product_mappings where active)<>1
 or (select count(*) from public.supplier_product_split_rule_lines)<>2 then raise exception 'Committed learning did not survive connection reload'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.supplier_product_mappings) or exists(select 1 from public.supplier_product_split_rules) or exists(select 1 from public.supplier_product_split_rule_lines) then raise exception 'Another restaurant can read learning'; end if;
 begin
  perform * from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'department',p_department_id=>'50000000-0000-4000-8000-000000000001',p_split_lines=>'[]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
  raise exception 'TEST: another restaurant can write learning';
 exception when insufficient_privilege then null;
 end;
end $$;
-- A user with no membership in this company also cannot read or write.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
do $$ begin
 if exists(select 1 from public.supplier_product_mappings) or exists(select 1 from public.supplier_product_split_rules) or exists(select 1 from public.supplier_product_split_rule_lines) then raise exception 'Non-member can read learning'; end if;
 begin
  perform * from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'department',p_department_id=>'50000000-0000-4000-8000-000000000001',p_split_lines=>'[]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
  raise exception 'TEST: non-member can write learning';
 exception when insufficient_privilege then null;
 end;
end $$;
rollback;
