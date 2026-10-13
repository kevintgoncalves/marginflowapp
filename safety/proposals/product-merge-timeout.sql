-- PROPOSAL (not a migration yet). Gives the atomic product merge enough time on large
-- workspaces. Same pattern as 20260910123000_invoice_batch_sync_resilience.sql.
-- Changes only the function configuration: no table, row or data is modified.
-- Observed on the phase 2 test copy (2026-10-13): merge_product_v2 failed with
-- "canceling statement due to statement timeout" (default 8s for authenticated)
-- while importing the product catalogue.
-- Rollback: alter function ... reset statement_timeout;
alter function public.merge_product_v2(uuid, uuid, uuid, uuid[], jsonb, jsonb) set statement_timeout = '120s';
notify pgrst, 'reload schema';
