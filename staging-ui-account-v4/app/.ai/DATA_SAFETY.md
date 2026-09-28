# Data safety — 12 September 2026

User-authorized engineering requirement for all future work. Applies to every
customer and every module, not just invoices.

## Data ownership and persistence

Production data belongs to customers. Software updates must preserve record
identity, links, values, dates, allocations, original attachments and audit history.
No routine update may import a demo dataset, reset storage, purge a table, run
recovery automatically or copy one customer's state into another customer's scope.

Invoices and sales use relational tables as their official source. Snapshots and
browser storage must not become replacement financial ledgers. Pending invoices
remain in the working collection; only confirmed invoice versions drive official
invoice totals. Other snapshot-backed modules still require further hardening.

Never treat an error, timeout, row cap or missing response as a successful empty
load. Read every page, verify counts and preserve previous state on failure.
Concurrent versions require explicit reconciliation. Do not discard user edits
just because a newer cloud version exists.

Never claim “saved locally” or “saved to cloud” without the corresponding
durability confirmation. Browser storage can fail or be cleared. A visible
warning and a recovery path are required; local storage is not the backup policy.

## Before each change

1. Identify the exact source version and environment. Work separately.
2. Record changed files and preserve originals. Do not overwrite newer work.
3. Identify effects on reading, writing, reports, permissions and all customers.
4. Use synthetic data in tests. Preserve the supplied source archive unchanged.

## Before production

1. Confirm the actual production version and project ID; do not infer them from a ZIP.
2. Take/confirm a fresh database backup and separately protect stored attachments.
3. Restore to an isolated project, verify counts, values, links and files, and
   record the backup identity, restoration result and recovery duration.
4. Run the build and integration tests in staging, including two devices,
   two companies, concurrent writes, interrupted reads/writes and old-client compatibility.
5. For database changes, use reviewed additive migrations and expand/contract
   compatibility. Never edit migration history or bundle destructive cleanup with
   a UI update. Re-run affected authorization and data-reconciliation tests.
6. Record a deployment decision, monitoring owner and rollback route. An application
   rollback must remain compatible with the data. A database restore is a separate
   incident operation, never an automatic undo: it can remove later customer work.

The local check and CI workflow detect some violations. They do not create
backups, prove restoration, enforce GitHub branch protection or configure Vercel.
Those production controls must be verified in the actual services before launch.

## Current scope

Phase 1 adds complete invoice/sales reads, confirmed invoice financial inputs,
pending-edit preservation, visible local-write failure warnings and release checks.
No migration or production mutation is included. Remaining audit issues include
AI endpoint authorization/quotas, fine-grained backend permissions, cross-account
browser storage isolation, server-side invoice deletion and stronger durability
for pending operations. These are launch blockers, not silently solved here.
