-- READ ONLY. Run only after verifying the staging project identity.
-- Does not read business/customer records, mutate data, create objects or run migrations.
-- Target verified privately on 2026-09-29; do not run against an unverified target.
-- Pre-fix contract observations follow. See RESULTS.md for the subsequent migration.
-- All ten tables have RLS; authenticated SELECT is absent on both split-rule tables
-- despite member SELECT policies. All five RPCs exist with authenticated EXECUTE.
-- Required columns exist. The remote migration ledger relation is absent.
-- Missing grants require a reviewed additive correction; never disable RLS or
-- replay migrations blindly. See RESULTS.md for evidence and acceptance failures.
BEGIN TRANSACTION READ ONLY;

WITH required(name) AS (VALUES
 ('supplier_product_mappings'),('supplier_product_split_rules'),
 ('supplier_product_split_rule_lines'),('invoices'),('invoice_lines'),
 ('invoice_line_department_splits'),('products'),('suppliers'),('departments'),('profiles'))
SELECT r.name, c.oid IS NOT NULL AS exists,
       c.relrowsecurity AS rls_enabled,
       CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('authenticated', c.oid, 'SELECT') END AS authenticated_select
FROM required r LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||r.name)
ORDER BY r.name;

WITH required(table_name,column_name) AS (VALUES
 ('supplier_product_mappings','source'),('supplier_product_mappings','company_id'),
 ('supplier_product_mappings','location_id'),('supplier_product_mappings','supplier_id'),
 ('supplier_product_mappings','product_id'),('supplier_product_mappings','auto_apply'),
 ('supplier_product_mappings','active'),('supplier_product_mappings','metadata'),
 ('supplier_product_mappings','unit_of_measure'),('supplier_product_mappings','pack_size'),
 ('supplier_product_mappings','normalized_supplier_product_code'),
 ('supplier_product_mappings','normalized_supplier_description'),
 ('supplier_product_mappings','normalized_unit_of_measure'),
 ('supplier_product_mappings','normalized_pack_size'),
 ('supplier_product_mappings','allocation_mode'),('supplier_product_mappings','department_id'),
 ('supplier_product_mappings','confirmation_count'),('supplier_product_mappings','updated_at'),
 ('supplier_product_mappings','last_confirmed_at'),
 ('supplier_product_split_rules','supplier_product_mapping_id'),
 ('supplier_product_split_rule_lines','split_rule_id'),
 ('invoices','metadata'),('invoice_lines','metadata'),('invoice_lines','product_id'),
 ('invoice_lines','pack_size'),('invoice_lines','quantity'),('invoice_lines','unit_cost'),
 ('invoice_lines','net_line_total'),('profiles','full_name'))
SELECT r.table_name,r.column_name,c.data_type,c.column_name IS NOT NULL AS exists
FROM required r LEFT JOIN information_schema.columns c
 ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
ORDER BY r.table_name,r.column_name;

WITH required(name) AS (VALUES
 ('persist_supplier_product_learning_v2'),('persist_supplier_product_learning'),
 ('forget_supplier_product_learning'),('persist_invoice_document_v3'),
 ('get_effective_company_access'))
SELECT r.name,p.oid IS NOT NULL AS exists,
       pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       p.proargnames AS argument_names,
       pg_get_function_result(p.oid) AS returns,
       p.prosecdef AS security_definer,
       CASE WHEN p.oid IS NOT NULL THEN has_function_privilege('authenticated',p.oid,'EXECUTE') END AS authenticated_execute,
       CASE WHEN p.oid IS NOT NULL THEN md5(pg_get_functiondef(p.oid)) END AS definition_fingerprint
FROM required r LEFT JOIN pg_proc p ON p.proname=r.name
 AND p.pronamespace='public'::regnamespace
ORDER BY r.name,p.oid;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='public' AND tablename IN
 ('supplier_product_mappings','supplier_product_split_rules','supplier_product_split_rule_lines','invoices','invoice_lines','products','profiles')
ORDER BY tablename,policyname;

-- Ledger presence only. Read ledger separately if present; ledger entries alone
-- do not establish that functions, columns and grants match the application.
SELECT to_regclass('supabase_migrations.schema_migrations') AS migration_ledger;
ROLLBACK;
