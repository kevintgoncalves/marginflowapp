-- invoice_report_headers: drop the security_barrier option.
-- With it, Postgres had to build the light metadata of every invoice in the period before sorting
-- and cutting each 500-row page (production: "external merge Disk: 17488kB", 425 ms per page).
-- Without it the view is merged into the query: rows are sorted on their narrow columns and the
-- light metadata is built afterwards. The view has no filter of its own; access control comes from
-- the row-level security of public.invoices (security_invoker stays on), so the barrier protected
-- nothing. Read-only: privileges, rows and every other definition are unchanged.

alter view public.invoice_report_headers reset (security_barrier);

notify pgrst, 'reload schema';
