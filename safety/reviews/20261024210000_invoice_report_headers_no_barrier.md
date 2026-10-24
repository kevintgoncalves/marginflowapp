# Review: 20261024210000_invoice_report_headers_no_barrier.sql

Date: 24 Oct 2026. After 20261024200000 was applied, "Compare report loading" failed with
"Light read failed: canceling statement due to statement timeout".

## Evidence (production, read-only, run by Kevin in the SQL editor as `authenticated`)
- 1,049 invoices 01/06–23/10; metadata 9.6 MB stored (compressed); `snapshot.items` 25 MB.
- One 500-row page through the view: 425 ms, `Seq Scan` then `Sort … external merge Disk: 17488kB`:
  with `security_barrier` the light metadata of every row in the period is built before the sort.
- The same page from `invoices`: 24 ms in EXPLAIN (EXPLAIN does not serialise the 37 MB output).
- Local Postgres 17, 1,100 synthetic invoices: with the barrier the sort holds the built metadata
  (2,040 kB); without it the sort is on the narrow row (283 kB) and the metadata is built after it.

## What it does
- `alter view public.invoice_report_headers reset (security_barrier);` and a PostgREST schema reload.

## Data preservation and access
- Read-only change to a read-only view. No table, row, policy, function or privilege changes.
- The view has no filter of its own, so the barrier protected nothing: access is the row-level
  security of `public.invoices`, applied through `security_invoker = true`, which stays on.
- Rollback: `alter view public.invoice_report_headers set (security_barrier = true);`

## Tests
- `supabase/tests/invoice_report_headers_no_barrier_test.sql` (throwaway Postgres 17): every check
  of the original view test (same rows, other company hidden, only `snapshot.items` reduced, no
  writes through the view, anon refused, invoices unchanged) plus barrier off and invoker on.
  Passed locally 24/10; fails when this migration is left out.
