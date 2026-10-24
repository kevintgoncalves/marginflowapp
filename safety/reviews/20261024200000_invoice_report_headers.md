# Review: 20261024200000_invoice_report_headers.sql

Date: 24 Oct 2026. Requested by Kevin: the app took ~14 s to open; 10.7 s was the reporting-period
invoice read, 37 MB of `metadata.marginflow_snapshot` for 1,041 invoices (docs/BRIEF-PERFORMANCE.md).

## Why
- `loadRelationalInvoiceReportRange` read `invoices.metadata` whole. The snapshot holds the full
  invoice, including an `items` copy of every line. `invoiceFromRelationalRow` rebuilds every line
  from `invoice_lines` (and splits) and used the snapshot `items` only for the line order.

## What it does
- Adds the view `public.invoice_report_headers`: the same rows and columns as `public.invoices`;
  `metadata.marginflow_snapshot.items` becomes `[{ "id": … }, …]` in the same order (an element
  without an id becomes `{}`, which orders the same in the app). Every other metadata key, every
  other snapshot key and every column is returned unchanged. Rows whose snapshot has no `items`
  array are returned exactly as stored.
- The app reads the reporting period from the view and falls back to `invoices` when the view is
  missing (before this SQL is applied) or not readable. Other errors are reported, not hidden.

## Data preservation
- Read-only. No table, column, row, policy or function is created, changed or removed.
- `security_invoker = true`: the row-level security of `public.invoices` applies to whoever reads
  the view. `security_barrier = true`.
- A simple view is auto-updatable and Supabase grants every privilege on new relations by default,
  so all privileges are revoked from `public`, `anon` and `authenticated`, and only `select` is
  granted to `authenticated`. Nothing can be written through the view.
- Dropping it (`drop view public.invoice_report_headers;`) is a complete rollback; the app then
  falls back to the full headers by itself.

## Same figures
- The invoice objects built from the view and from the full headers are identical (all fields,
  line order included), so every Dashboard, GP, Reports and Suppliers figure is unchanged.
- Production check, read-only, in the app: Settings → Data & recovery → Backup & recovery →
  "Compare report loading" reads a period both ways and compares every invoice and every
  Dashboard figure (net sales, purchases, GP per department and per day).

## Tests
- `supabase/tests/invoice_report_headers_test.sql` (self-contained, throwaway Postgres 17):
  same visible rows as the table and other company hidden; every column and every metadata key
  other than `snapshot.items` identical; items reduced to ordered ids; rows without an items array
  unchanged; insert, update and delete through the view refused for a member who may write
  invoices; anon cannot read; invoices unchanged. Passed locally 24/10. Also checked that it fails
  when the write revoke is removed and when the order is reversed.
- `src/domain/reportLoading.test.js`: 1,205 invoices read through a fake view (same transformation)
  and through the full headers give identical invoices; auto falls back when the view is missing;
  other light-read errors are reported.
