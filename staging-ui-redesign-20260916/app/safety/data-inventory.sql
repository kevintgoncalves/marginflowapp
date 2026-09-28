-- Read-only inventory, not a migration. Validate on an isolated restored database first.
-- Includes snapshot payloads used by stock and other modules; never run a reset to compare.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
SELECT 'invoices'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.invoices t GROUP BY company_id
UNION ALL
SELECT 'invoice_lines'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.invoice_lines t GROUP BY company_id
UNION ALL
SELECT 'invoice_line_department_splits'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.invoice_line_department_splits t GROUP BY company_id
UNION ALL
SELECT 'sales_entries'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.sales_entries t GROUP BY company_id
UNION ALL
SELECT 'sales_department_lines'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.sales_department_lines t GROUP BY company_id
UNION ALL
SELECT 'stocktakes'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.stocktakes t GROUP BY company_id
UNION ALL
SELECT 'stocktake_lines'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.stocktake_lines t GROUP BY company_id
UNION ALL
SELECT 'products'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.products t GROUP BY company_id
UNION ALL
SELECT 'suppliers'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.suppliers t GROUP BY company_id
UNION ALL
SELECT 'recipes'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.recipes t GROUP BY company_id
UNION ALL
SELECT 'recipe_ingredients'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.recipe_ingredients t GROUP BY company_id
UNION ALL
SELECT 'menu_items'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.menu_items t GROUP BY company_id
UNION ALL
SELECT 'waste_entries'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.waste_entries t GROUP BY company_id
UNION ALL
SELECT 'labour_entries'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.labour_entries t GROUP BY company_id
UNION ALL
SELECT 'marginflow_cloud_state'::text AS table_name, company_id::text AS company_id, count(*) AS row_count, md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id::text), '')) AS content_hash FROM public.marginflow_cloud_state t GROUP BY company_id
ORDER BY table_name, company_id;
COMMIT;
