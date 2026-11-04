# Data fix review — Direct Seafood supplier id (4 Nov 2026)

Not a migration: no schema change. Approved by Kevin on 4 Nov 2026; Kevin runs it by hand.

- **Scope:** `marginflow_cloud_state` modules `suppliers` (1 element) and
  `supplierDeliverySchedules` (at most 1 element). Old id `0cfa3be4-d62e-4f55-a09f-3236c8ba5acb`
  becomes the database id `1d4b5b7e-59ad-4ce1-ba4a-ff02476ea1c4`. The old id is kept in
  `legacyIds` / `legacySupplierIds`.
- **Not changed:** relational tables, other suppliers, other modules, and the element order.
- **Guards:** stops if the supplier row is missing, if the number of entries is not the
  expected one, if the new id is already used, or if more rows than expected would be
  updated. The revision goes up by 1, so open clients detect the change. A second run stops.
- **Backup:** Part 1 is read-only. Its CSV export is the before-state. It is not a database
  backup.
- **App compatibility:** since commit d5db7a9 the app matches both ids, and since the
  release with this file it also matches `legacyIds`. An app rollback stays compatible.
- **Tested:** on a throwaway local Postgres with synthetic data and the write-protection
  trigger: only the target elements changed, the other module was untouched and a
  second run was refused. Not tested against production data.
- **Rollback:** use the Part 1 CSV to restore the two elements by hand. Restore only
  `id`/`supplierId`, so any other changes made since are kept.
