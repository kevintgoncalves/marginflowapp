# Review: 20261016190000_product_merge_batch.sql

Date: 16 Oct 2026. Requested by Kevin (faster product merge for the catalogue import, approved 16/10).

## What it does
- Adds `public.merge_products_batch(company, location, groups, snapshot, revisions)`: up to 100 merge
  groups in one transaction. Each group goes through the existing `merge_duplicate_products`, so the
  checks, relinking of invoice/stocktake/recipe/menu/waste lines, format archives and `product_merges`
  audit rows are the same as for a single merge.
- Sets `statement_timeout = 120s` on the batch function and on `merge_product_v2` (the one-group
  merge, still used as fallback). Previously proposed in `safety/proposals/product-merge-timeout.sql`
  after a timeout on the phase 2 test copy (13/10).

## Data preservation
- No table, column, row, policy or existing function body changes.
- All groups commit together or none do; a refused group leaves the database unchanged.
- Snapshot revisions are checked before and raised once after, as in `merge_product_v2`.
- Intermediate snapshot writes inside the transaction keep later duplicates active only so the existing
  per-group checks pass; the last group writes exactly the snapshot the client sent.

## Access
- Signed-in active company members only (`auth.uid()` + `is_active_company_member`); `execute` revoked
  from public and granted to `authenticated` only.

## Tests
- `supabase/tests/product_merge_batch_test.sql` on a throwaway local Postgres 16 with the schema
  baseline and later migrations: outsider refused, stale revision refused, product in two groups
  refused, bad later group rolls back earlier groups, three groups merged in one call (lines relinked,
  4 products archived, 3 audit rows, final snapshot stored, revisions +1).
- `scripts/product-merge-batch.test.mjs` (static, in `npm test`) and `src/domain/productMergeBatch.test.js`
  (client payload, refusal before any request, fallback detection).

## Not verified yet
- Run on the phase 2 test copy with the real catalogue import (timing with ~240 groups).
- Production: needs the release checklist (backup, restore test, evidence, rollback plan).

## Rollback
`drop function public.merge_products_batch(uuid, uuid, jsonb, jsonb, jsonb);`
`alter function public.merge_product_v2(uuid, uuid, uuid, uuid[], jsonb, jsonb) reset statement_timeout;`
The app falls back to one merge per request when the batch function is missing.
Merges already made stay, as with any merge.
