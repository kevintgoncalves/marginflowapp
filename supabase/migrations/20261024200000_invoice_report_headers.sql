-- Light invoice headers for the reporting period (Dashboard, Reports, GP, Suppliers).
-- Same rows and columns as public.invoices, except that metadata.marginflow_snapshot.items keeps only
-- each line's id. The app rebuilds every line from public.invoice_lines and used the snapshot copy
-- only for the line order, but that copy was ~97% of a 37 MB read when the app opened.
-- Read-only: no table, row, policy or function is changed. security_invoker keeps the row-level
-- security of public.invoices for whoever reads the view.

create or replace view public.invoice_report_headers
with (security_invoker = true, security_barrier = true) as
select
  i.id,
  i.company_id,
  i.location_id,
  i.supplier_id,
  i.invoice_number,
  i.document_number,
  i.document_type,
  i.invoice_date,
  i.status,
  i.subtotal,
  i.tax_amount,
  i.total_amount,
  i.sync_revision,
  i.content_fingerprint,
  case
    when jsonb_typeof(i.metadata -> 'marginflow_snapshot') = 'object'
      and jsonb_typeof(i.metadata -> 'marginflow_snapshot' -> 'items') = 'array'
    then jsonb_set(
      i.metadata,
      '{marginflow_snapshot,items}',
      coalesce((
        select jsonb_agg(
          case when jsonb_typeof(item.value) = 'object' and item.value ? 'id'
            then jsonb_build_object('id', item.value -> 'id')
            else '{}'::jsonb
          end
          order by item.ordinality)
        from jsonb_array_elements(i.metadata -> 'marginflow_snapshot' -> 'items') with ordinality as item(value, ordinality)
      ), '[]'::jsonb)
    )
    else i.metadata
  end as metadata,
  i.created_at,
  i.updated_at
from public.invoices i;

comment on view public.invoice_report_headers is
  'Read-only light invoice headers for reporting: metadata.marginflow_snapshot.items reduced to line ids. Row-level security of public.invoices applies (security_invoker).';

-- A simple view is auto-updatable and Supabase's default privileges grant writes on new relations,
-- so every privilege is removed first and only select is given back: nothing can write through it.
revoke all on public.invoice_report_headers from public;
revoke all on public.invoice_report_headers from anon;
revoke all on public.invoice_report_headers from authenticated;
grant select on public.invoice_report_headers to authenticated;

notify pgrst, 'reload schema';
