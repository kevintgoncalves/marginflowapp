begin;
-- Existing company-member policies remain in force. No anonymous grant.
grant select, insert, update on public.product_supplier_formats to authenticated;
-- A restrictive policy ANDs with existing policies; references cannot cross tenants.
create policy supplier_formats_verified_scope on public.product_supplier_formats
as restrictive for all to authenticated
using (public.can_read_purchasing_scope(company_id, location_id))
with check (
  public.can_read_purchasing_scope(company_id, location_id)
  and exists (select 1 from public.suppliers s where s.id = supplier_id
    and s.company_id = product_supplier_formats.company_id
    and (s.location_id is null or s.location_id is not distinct from product_supplier_formats.location_id))
  and exists (select 1 from public.products p where p.id = product_id
    and p.company_id = product_supplier_formats.company_id
    and (p.location_id is null or p.location_id is not distinct from product_supplier_formats.location_id))
  and (location_id is null or exists (select 1 from public.locations l
    where l.id = location_id and l.company_id = product_supplier_formats.company_id))
);
notify pgrst, 'reload schema';
commit;
