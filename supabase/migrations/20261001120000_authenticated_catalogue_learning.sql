begin;
-- Exact signature only. The existing SECURITY DEFINER body still verifies
-- authenticated membership, location and all catalogue references.
revoke all on function public.resolve_invoice_catalogue_v1(uuid, uuid, jsonb) from public, anon;
grant execute on function public.resolve_invoice_catalogue_v1(uuid, uuid, jsonb) to authenticated;

-- Keep department aliases with the confirmed, already tenant-scoped rule.
create or replace function public.persist_supplier_department_alias_v1(
  p_company_id uuid, p_location_id uuid, p_mapping_id uuid,
  p_department_id uuid, p_original_department text
) returns uuid language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare v_alias text := lower(regexp_replace(btrim(coalesce(p_original_department,'')), '\s+', ' ', 'g'));
begin
  perform public.assert_purchasing_write_scope(p_company_id,p_location_id);
  if auth.uid() is null or not public.is_active_company_member(p_company_id) then
    raise exception 'Not authorised for this company' using errcode='42501';
  end if;
  if v_alias = '' then return p_mapping_id; end if;
  update public.supplier_product_mappings m
  set metadata = jsonb_set(coalesce(m.metadata,'{}'::jsonb),'{department_aliases}',
    (select jsonb_agg(distinct value) from jsonb_array_elements_text(
      coalesce(m.metadata->'department_aliases','[]'::jsonb) || jsonb_build_array(v_alias))))
  where m.id=p_mapping_id and m.company_id=p_company_id
    and m.location_id is not distinct from p_location_id and m.active
    and m.allocation_mode='department' and m.department_id=p_department_id
    and exists (select 1 from public.departments d where d.id=p_department_id and d.company_id=p_company_id and d.active);
  if not found then raise exception 'Confirmed department rule not found in this scope' using errcode='42501'; end if;
  return p_mapping_id;
end;
$$;
revoke all on function public.persist_supplier_department_alias_v1(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.persist_supplier_department_alias_v1(uuid,uuid,uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
