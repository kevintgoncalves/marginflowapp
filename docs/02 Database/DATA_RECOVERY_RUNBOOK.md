# MarginFlow Divergent Device Recovery Runbook

This procedure is deliberately non-destructive. Do not clear browser storage, sign out, reset a module, import with replace semantics, or remove duplicate-looking records while recovery is in progress.

## What the audit found

- Each browser immediately stores invoices and their nested lines/splits in `localStorage` under `marginflow.invoices`. The other `marginflow.*` keys hold settings, products, suppliers, supplier schedules, invoice learning snapshots, credit notes, sales, labour, recipes, menus, Stock Takes, waste and UI module settings.
- No IndexedDB use exists in the application.
- Draft invoice/editor state, date ranges, filters, open dialogs and transient status values exist only in React memory until converted into a saved record.
- Before this change, every state change scheduled one batch `upsert` of every module into `marginflow_cloud_state` after 900 ms. The invoices module was one whole JSONB array. There was no revision predicate, so a stale device could overwrite a newer invoice array.
- Relational invoice, line and department-split tables existed. Migration `028_invoice_recovery_sync.sql` added atomic invoice persistence, but legacy invoices were not submitted automatically and unknown supplier/product IDs were deliberately left null by the normal persistence RPC.
- The reported PostgreSQL error surfaced from the old batch `marginflow_cloud_state` upsert path. That operation serialized and rewrote all modules, including the growing invoice JSONB payload. Production statement logs were not available in this workspace, so the database-internal stage (conflict update, trigger, RLS, lock wait or JSONB write) cannot be truthfully separated further from repository evidence alone.

## Current data locations before recovery

For both laptop and mobile, any invoice that still appears on that device should be treated as present in that device's `marginflow.invoices` localStorage. It may also be in the legacy `marginflow_cloud_state` invoices payload if a snapshot write succeeded. It is `Saved to cloud` only after the canonical relational invoice and its active lines/splits are verified. Module snapshot success is displayed separately as `Cloud modules synced`.

## Recovery order

1. Stop entering or editing invoices temporarily. Do not use the mobile device during laptop recovery. Do not clear site data, reset modules or sign out on either device.
2. On the laptop, open Settings and select `Download Emergency Backup`. Record its invoice/product/supplier counts and keep the JSON unchanged.
3. Create a Supabase logical backup and record counts/checksums for `marginflow_cloud_state`, `suppliers`, `products`, `invoices`, `invoice_lines` and `invoice_line_department_splits`.
4. Deploy `20260808120000_legacy_relational_recovery.sql` through the normal migration pipeline. Installation creates functions only and performs no recovery DML.
5. Deploy the frontend containing `Preview laptop migration`. Backup-file import remains preview-only during this phase.
6. On the laptop, open Settings and select `Preview laptop migration`. This reads the current in-memory/device snapshot and relational tables without writing.
7. Review supplier/product/invoice totals, exact department mappings, eligible line/split counts and every conflict. Missing departments, ambiguous suppliers/products, existing content differences and non-approved documents are excluded from submission.
8. If the preview is correct, select `Migrate legacy data to cloud`. The application rebuilds the preview immediately, migrates the reviewed supplier/product catalog atomically, then sends each eligible invoice through `recover_legacy_invoice_v1`.
9. Each invoice wrapper validates supplier, product and department ownership, calls the existing `persist_invoice_document_v2` transaction, and verifies active line/split counts before the device row becomes `Saved to cloud`.
10. If the browser closes, run the preview again. Stable UUIDs, exact identity checks and existing-row detection make retry idempotent.
11. Run the SQL checks below. Compare totals, document numbers, dates, line counts and split allocations with the laptop backup.
12. Open a fresh browser profile for the same company/location and confirm recovered relational invoices load. Do not process mobile yet.
13. Keep the laptop emergency JSON and database backup until financial reconciliation is complete. Do not delete legacy or conflict records.

## Verification SQL

```sql
select count(*) from public.suppliers;
select count(*) from public.products;
select count(*) from public.invoices;
select count(*) from public.invoice_lines;
select count(*) from public.invoice_line_department_splits;

select id from public.invoices where company_id is null;
select id, invoice_number from public.invoices where supplier_id is null;

select line.id
from public.invoice_lines line
left join public.invoices invoice on invoice.id = line.invoice_id
where invoice.id is null;

select line.id
from public.invoice_lines line
left join public.products product on product.id = line.product_id
where line.active and product.id is null;

select split.id
from public.invoice_line_department_splits split
left join public.invoice_lines line on line.id = split.invoice_line_id
left join public.departments department on department.id = split.department_id
where split.active and (line.id is null or department.id is null);

select invoice.id, invoice.document_number,
  count(distinct line.id) filter (where line.active) as active_lines,
  count(distinct split.id) filter (where line.active and split.active) as active_splits
from public.invoices invoice
left join public.invoice_lines line on line.invoice_id = invoice.id
left join public.invoice_line_department_splits split on split.invoice_line_id = line.id
group by invoice.id, invoice.document_number
order by invoice.invoice_date, invoice.document_number;
```

## Stop conditions

Stop recovery and investigate if the preview reports the wrong company/location, unexpected counts, missing invoice numbers, unresolved departments, ambiguous identities, content conflicts or a relational write error. A failed invoice transaction does not remove or mark the device copy as saved. Do not continue with mobile until laptop reconciliation is complete.
