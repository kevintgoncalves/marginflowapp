\set ON_ERROR_STOP on
begin;
do $$ begin if current_database() !~ '^mf_learning_test_[0-9]+$' then raise exception 'Local fixture only'; end if; end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ declare v_id uuid; v_again uuid; begin
 begin
  perform * from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'department',p_department_id=>'50000000-0000-4000-8000-000000000099',p_split_lines=>'[]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
  raise exception 'TEST: invalid department was accepted';
 exception when others then
  if sqlerrm like 'TEST:%' then raise; end if;
  if sqlerrm not like 'Department does not belong%' then raise; end if;
 end;
 if exists(select 1 from public.suppliers) or exists(select 1 from public.products) then raise exception 'Failed match committed catalogue records'; end if;
 select mapping_id into v_id from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'department',p_department_id=>'50000000-0000-4000-8000-000000000001',p_split_lines=>'[]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
 select mapping_id into v_again from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'department',p_department_id=>'50000000-0000-4000-8000-000000000001',p_split_lines=>'[]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
 if v_id is null or v_id<>v_again then raise exception 'Missing acknowledgement or duplicate rule'; end if;
 if (select count(*) from public.supplier_product_mappings where active)<>1 then raise exception 'Duplicate active rule'; end if;
 select mapping_id into v_id from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'split',p_department_id=>null,p_split_lines=>'[{"department_id":"50000000-0000-4000-8000-000000000001","percentage":60},{"department_id":"50000000-0000-4000-8000-000000000002","percentage":40}]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
 if v_id=v_again then raise exception 'Changed allocation did not preserve history'; end if;
 if (select count(*) from public.supplier_product_mappings)<>2 or (select count(*) from public.supplier_product_mappings where active)<>1 then raise exception 'Supersession history incorrect'; end if;
 if (select count(*) from public.supplier_product_split_rules)<>1 or (select count(*) from public.supplier_product_split_rule_lines)<>2 then raise exception 'Owner cannot read split rule'; end if;
 select mapping_id into v_again from public.persist_supplier_product_learning_v2(
 p_company_id=>'20000000-0000-4000-8000-000000000001',p_location_id=>'30000000-0000-4000-8000-000000000001',
 p_supplier_id=>'40000000-0000-4000-8000-000000000001',p_supplier_product_code=>'',p_normalized_supplier_product_code=>'',
 p_supplier_description=>'Test potato',p_normalized_supplier_description=>'testpotato',p_unit_of_measure=>'bag',p_normalized_unit_of_measure=>'bag',
 p_pack_size=>'3kg',p_normalized_pack_size=>'3kg',p_product_id=>'60000000-0000-4000-8000-000000000001',
 p_allocation_mode=>'split',p_department_id=>null,p_split_lines=>'[{"department_id":"50000000-0000-4000-8000-000000000001","percentage":60},{"department_id":"50000000-0000-4000-8000-000000000002","percentage":40}]'::jsonb,p_auto_apply=>true,
 p_source_invoice_external_id=>'70000000-0000-4000-8000-000000000001',p_supplier_name=>'Test Produce',p_product_name=>'Test Potato',
 p_department_name=>'Food',p_mapping_key=>'synthetic-match',p_confirmed_at=>now(),p_match_source=>'manual_selection');
 if v_id<>v_again then raise exception 'Repeated split created duplicate'; end if;
end $$;
commit;
-- Commit acknowledgement must also survive a new connection (separate verify file).
