-- Final Recovery reads these company-scoped tables directly through PostgREST.
-- Their existing RLS policies continue to restrict rows to active company members.

grant select on table public.supplier_product_mappings to authenticated;
grant select on table public.invoice_line_corrections to authenticated;
grant select on table public.marginflow_recovery_resolutions to authenticated;

notify pgrst, 'reload schema';
