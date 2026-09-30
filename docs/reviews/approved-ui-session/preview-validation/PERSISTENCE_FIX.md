# Staging persistence correction — 29 September 2026

## Decision and target

Work branch: `codex/integrate-approved-interface`. No main merge or production release.
Remote staging project verified in the dashboard: `[staging project ID retained privately]`,
**verified staging project**, organisation the verified staging organisation.
The existing staging domain remains associated with `ui/unified-invoices`.

The user explicitly requested a new versioned staging migration for this fault.
This is a scoped exception to the earlier no-schema-change phase, not permission
for recovery, resets, bulk snapshot replay, deletion, or production changes.

## Root causes observed remotely before correction

- PostgreSQL at 2026-09-29 08:24:57.022 UTC, transaction 11021, SQLSTATE 23503:
  `invoices_supplier_id_fkey` rejected supplier
  `[synthetic record ID retained privately]` at line 113 of
  `persist_invoice_document_v3`. Gateway event
  `[synthetic record ID retained privately]` returned HTTP 409.
- The supplier existed in the test company's saved catalogue module, but not
  `suppliers`. The invoice reservation therefore failed before legacy persistence.
  Read-only counts found zero relational suppliers, zero mapping rules, and zero
  QA-20260929 invoices. This was a database transaction failure, not a display error.
- The saved mapping draft had department `Kitchen Made` and no department UUID.
  The company has `Food` and `Drinks`. The stale default looked like the first
  HTML select option, but the underlying value remained invalid. Client validation
  skipped learning before RPC dispatch; no learning-v2 request was found in the
  inspected gateway window. Local catalogue matching did not prove reusable persistence.
- Authenticated lacked SELECT on both split tables even though company RLS policies
  existed. This independently prevents loading relational split learning.
- Dashboard changed from Unhealthy to Healthy without an agent restart or config
  change. The original service-health cause is not established; do not credit the
  code fix with restoring service health.

## Changes and preservation

`20260929230000_scoped_learning_confirmation.sql` is additive and transactional.
The original 44 migrations and their original hash manifest remain unchanged.
A separate additive-review manifest records the new file hash and this review.

- Grant only authenticated SELECT on `supplier_product_split_rules` and
  `supplier_product_split_rule_lines`. Existing company policies remain; new
  restrictive policies enforce active membership and assigned restaurant, including
  matching parent scope. Company-wide rows remain readable within the company.
- Scope-check the learning, forgetting and invoice RPCs; serialise learning by
  company/location to prevent competing first inserts.
- Materialise only a selected supplier/product missing from relational storage,
  by its stable UUID from the already saved catalogue in the exact same scope.
  Existing records are validated and preserved, never overwritten. Missing,
  ambiguous, inactive and foreign references fail. No snapshot invoices, sales or
  stock are replayed. No catalogue cost is invented when absent.
- Reference materialisation and learning/invoice persistence run in the same
  transaction. A later validation failure rolls back all of its new reference rows.
- Learning-v2 confirms a non-null persisted rule ID in the requested scope before
  returning. Existing supersession history is preserved.
- New-line department defaults use the configured active department list. Existing
  invalid labels remain visible for explicit review. The match UI retains the
  draft and shows the rejected persistence reason; it does not report success
  without a valid database acknowledgement.

The migration refuses RPC drift. Before application, remote `md5(prosrc)` matched:

| Function | Body hash |
| --- | --- |
| persist_supplier_product_learning | 5490ae55718310fa1fda80ef309125cb |
| persist_supplier_product_learning_v2 | d7a44c519cdc38053ada5971fb03d084 |
| persist_invoice_document_v3 | 7064d1c9f248c7e77c92e80596370b58 |
| forget_supplier_product_learning | 173710ca5e1b7c61372ecb0edaf2c9ae |

## Local evidence

`python3 scripts/test-learning-postgres.py` creates a fresh database in the
verified local Docker Supabase container, copying schema only, then inserts
synthetic fixtures. No existing database is reset or populated from business rows.
The test database is retained. The schema baseline does not prove all historical
migrations can bootstrap from scratch.

Passed in `mf_learning_test_20260929225433`:

- New migration including RPC drift guards applied and committed.
- Invalid department rolls back newly materialised catalogue references.
- Manual learning returns a UUID; identical retry returns the same UUID.
- Changed allocation preserves the previous rule as inactive history.
- A repeated split decision does not duplicate the active rule.
- Authenticated owner reads the split rule and its two lines.
- New PostgreSQL connection reads the committed rule.
- Another restaurant in the same company reads zero rules and cannot save a rule
  in the first restaurant. A non-member also reads zero and cannot write.
- Invoice persistence returns the invoice ID and line count; retry returns
  `already_exists`.

Logs: `.local-review/mf_learning_test_20260929225433/` (excluded from commit).
Original changed source copies and hashes:
`.local-review/2026-09-29-persistence/original/` and `original-hashes.txt`.

## Main integration decision

The migration application, database acknowledgement, confirmed invoice, reload,
duplicate-rule count, single-supplier comparison, Excel/RFQ and transactional
tenant-isolation checks passed remotely. A read-only query found exactly one active
mapping and one distinct ID after two confirmations. The confirmed invoice is
independently readable in `invoices`; the older pending draft is absent there and
remains separate in the client.

The fresh-file reuse and invoice-only override sequence is still blocked before
upload because the Chrome extension cannot access the synthetic PDF until file-URL
access is enabled. Remote multi-supplier pack comparison also remains unproven in
the one-product tenant. This is therefore still a NO-GO for main. A local SQL
result or a manual selection does not substitute for that acceptance path.

Production backup/attachment protection, tested restoration, reconciliation,
concurrency and deployment controls remain separate unverified release gates.
Do not merge to main based on this report alone. Do not reverse the fix by deleting
new records; rollback must preserve records created after deployment.

## Remote application update

The user explicitly approved applying this exact file to staging. It has now been
applied there (not production), with editor content SHA-256
`8558304a81cc04ad51f439532b793ae22f15757c5b7838ffddeb90f603951723`.
A separate read-only query verified all seven function bodies, the two authenticated
SELECT grants and three restrictive policies. The first post-fix manual match
returned a persisted rule and QA-20260929-MATCH-B was confirmed in the application.
The project overview reported Healthy on 30 September. The earlier Unhealthy root
cause remains unknown; no code or configuration change is credited for the health
transition. See RESULTS.md for the completed checks and remaining acceptance gates.
