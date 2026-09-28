BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT 'invoices' AS dataset, count(*) AS rows, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) AS fingerprint FROM public.invoices t
UNION ALL SELECT 'invoice_lines', count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM public.invoice_lines t
UNION ALL SELECT 'splits', count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM public.invoice_line_department_splits t
UNION ALL SELECT 'sales', count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM public.sales_entries t
UNION ALL SELECT 'sales_lines', count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM public.sales_department_lines t
UNION ALL SELECT 'stocktakes', count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM public.stocktakes t
UNION ALL SELECT 'stocktake_lines', count(*), md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) FROM public.stocktake_lines t
UNION ALL SELECT 'stock_snapshots', count(*), md5(coalesce(string_agg(md5(payload::text), '' ORDER BY id), '')) FROM public.marginflow_cloud_state t WHERE module_key = 'stocktakes'
ORDER BY dataset;
COMMIT;
