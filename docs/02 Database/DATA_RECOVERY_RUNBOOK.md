# MarginFlow Divergent Device Recovery Runbook

This procedure is deliberately non-destructive. Do not clear browser storage, sign out, reset a module, import with replace semantics, or remove duplicate-looking records while recovery is in progress.

## What the audit found

- Each browser immediately stores invoices and their nested lines/splits in `localStorage` under `marginflow.invoices`. The other `marginflow.*` keys hold settings, products, suppliers, supplier schedules, invoice learning snapshots, credit notes, sales, labour, recipes, menus, Stock Takes, waste and UI module settings.
- No IndexedDB use exists in the application.
- Draft invoice/editor state, date ranges, filters, open dialogs and transient status values exist only in React memory until converted into a saved record.
- Before this change, every state change scheduled one batch `upsert` of every module into `marginflow_cloud_state` after 900 ms. The invoices module was one whole JSONB array. There was no revision predicate, so a stale device could overwrite a newer invoice array.
- Relational invoice, line and department-split tables existed, but the application did not write or load confirmed invoices through them. Supplier-product learning already used relational mappings and split-rule tables.
- The reported PostgreSQL error surfaced from the old batch `marginflow_cloud_state` upsert path. That operation serialized and rewrote all modules, including the growing invoice JSONB payload. Production statement logs were not available in this workspace, so the database-internal stage (conflict update, trigger, RLS, lock wait or JSONB write) cannot be truthfully separated further from repository evidence alone.

## Current data locations before recovery

For both laptop and mobile, any invoice that still appears on that device should be treated as present in that device's `marginflow.invoices` localStorage. It may also be in the legacy `marginflow_cloud_state` invoices payload if a snapshot write succeeded. It should not be assumed to be in relational `invoices` unless the recovery diagnostic confirms it. The repository cannot inspect a remote phone or laptop browser profile, so the emergency exports are the authoritative evidence for each device.

## Recovery order

1. Stop entering or editing invoices temporarily. Keep both devices signed in and do not clear site data, uninstall the app, reset modules or log out.
2. Deploy the frontend containing `Download Emergency Backup`. Deploying the frontend before migration is safe for existing local data: failed relational calls remain `Pending sync` or `Sync failed` locally.
3. On the laptop, open Settings and select `Download Emergency Backup`. Record its invoice count and keep the JSON file unchanged.
4. On the mobile, repeat the same action. Store the two files with distinct names.
5. Before applying migration 028, create a Supabase project/database backup. Separately export `marginflow_cloud_state`, `invoices`, `invoice_lines`, `invoice_line_department_splits`, `products`, `suppliers`, `supplier_product_mappings`, `supplier_product_split_rules`, `supplier_product_split_rule_lines` and `invoice_line_corrections`.
6. Apply `supabase/migrations/028_invoice_recovery_sync.sql` in the normal migration pipeline. It adds columns, functions and guards; it does not delete existing rows.
7. On one controlled device, reload MarginFlow and open Settings. Select `Compare Device With Cloud`. Save the device/relational/legacy counts before importing anything.
8. Select `Inspect Emergency Backup` for the laptop file. Review company/location, date range, invoice numbers, existing records, missing records, ambiguous matches and conflicts. Do not import while a company mismatch is shown.
9. If the preview is correct, select `Import Missing Invoices Only`. This sends only `onlyLocal` records to the atomic relational invoice RPC. Existing and conflicting identities are not selected.
10. Repeat inspection and missing-only import for the mobile file. A record imported from the first file should now show as existing when the second file is inspected.
11. Resolve every conflict manually by comparing both complete versions. Do not remove either version until supplier, document type, document number, date, lines, splits and totals have been checked.
12. Run `Compare Device With Cloud` again. Verify relational invoice counts, date coverage, document numbers, line counts, split allocations and purchasing totals against both backup files and the database export.
13. Retry any row marked `Pending sync` or `Retry sync`. Confirm it becomes `Saved to cloud` and that retrying does not add another invoice.
14. Open a fresh second browser/device for the same company/location. Confirm the relational invoices load there, then create one controlled test invoice and verify it appears on the other device.
15. Keep both emergency JSON files and the Supabase backup until financial reconciliation is complete. The legacy invoice snapshot remains read-only after migration and should only be retired in a later, separately verified change.

## Stop conditions

Stop importing and investigate if the preview reports the wrong company/location, unexpected date ranges, missing invoice numbers, ambiguous matches, content conflicts, or a relational write error. A failed import does not alter the backup and does not remove the device copy.
