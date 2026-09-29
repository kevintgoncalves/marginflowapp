> Update 29 September: the scoped persistence migration has been applied only to
> staging with explicit approval. First post-fix rule/invoice save succeeded.
> Full acceptance is still in progress; NO-GO remains until RESULTS.md is complete.

# Main integration and recovery plan — not executed

## Historical decision before the correction — 29 September 2026

**NO-GO for main integration.** The synthetic invoice remained pending after
confirmation and retry. Saving its reusable match explicitly reported no database
confirmation. Remote save/reload/reuse acceptance has therefore failed.

Read-only catalog checks found missing authenticated SELECT grants on
`supplier_product_split_rules` and `supplier_product_split_rule_lines` despite
member-scoped SELECT policies. The mapping loader reads these tables when mappings
exist. A reviewed additive permissions correction is needed on staging; keep
existing migrations immutable. No schema or permission change was applied.
This does not establish the cause of the separate invoice save failure.

Before reopening the gate, diagnose both save failures, review the correction,
and repeat authenticated persistence/reuse and confirmed comparison/export cases.
Keep synthetic invoice `QA-20260929-MATCH-A` and open draft
`QA-20260929-MATCH-B` for diagnosis; the draft is not claimed as remotely durable.
No reset, migration, merge or production deployment occurred.

## Candidate and deployment boundaries

Candidate source commit: `13a5f84e0a7b5793d52d31f13ec87ae2ed44f773` on `codex/integrate-approved-interface`.
Base before integration: `a9fdf57668b7dbc2a7694955789af4232e9e8caa` on `staging/schema-baseline`.
Main reference last checked: `9a801ca3f01a9664e2e7d3138b52f213ca2a7b7a`.

No merge, promotion or production deployment is authorized yet. Pushing main requests Production on Vercel; keep this candidate on its Preview branch. Existing `existing staging domain` remains assigned to `ui/unified-invoices`. Configure only branch-specific Preview Supabase variables, retain existing protections and never copy production secrets.

## Gates before preparing the final merge

1. Confirm Preview is built from the candidate commit and reads the verified staging Supabase project. Confirm a synthetic test tenant/account; do not use real customer records.
2. Execute `backend-contract.sql` read-only against staging. Inspect the actual RPC argument names/types, `mapping_id` return, grants and RLS; compare with `022_invoice_learning.sql`, `027_manual_match_product_merge.sql` and the invoice/entitlement migrations. Check migration ledger separately. Missing contracts require a reviewed additive migration plan; do not replay all migrations or run recovery functions blindly.
3. Authenticated acceptance: login and data load; save a uniquely tagged synthetic supplier/product match and record acknowledgement; reload and confirm relational persisted mapping; import/review another synthetic invoice from the same supplier/code/pack and verify reuse. Invoice-only exception must not become a reusable rule. Retain test fixture IDs for audit.
4. Compare confirmed purchases with different packs: 3 kg at £9 and 5 kg at £13.25 must produce £3/kg and £2.65/kg, saving £0.35/kg. Confirm latest invoice date supersedes an older cheap promotion. Incompatible/unknown conversions remain for review.
5. Download Products Excel and RFQ in the authenticated Preview. Confirm exact selected canonical IDs/no duplicates, numeric normalized prices/units/dates and matching panel values. RFQ omits prices/competitor names by default. Confirm browser draft reload; do not claim cross-device storage.
6. Re-run CI, safety check and staging build for the exact final candidate. Confirm no unwanted archives/copies/secrets in the commit. Reconcile all preserved local-copy hashes. Re-check fresh main head and test the combined history without changing main. Resolve any divergence in an isolated branch and repeat affected tests.
7. Only after acceptance, prepare a draft PR describing final behavior, backend compatibility evidence, deployment mapping, known limits and this recovery plan. Do not merge it or enable auto-merge. Production remains explicitly gated by fresh backup/restoration and release evidence.

## Data-preserving recovery

Before an eventual authorized production release, the operator must record:
- Exact production application deployment/commit and Supabase project IDs.
- Fresh database backup/PITR identity and time, plus separate attachment protection, with access-controlled storage.
- Successful restoration to an isolated project: row counts, financial totals, referential links, representative attachments and recovery duration.
- Counts/totals/IDs at the release boundary, pending operations exported separately from confirmed records, and monitoring/rollback owner.
- The tested old-client/new-data compatibility result and a source fingerprint tied to the release-evidence gate.

If the UI release fails, stop rollout and return the application deployment to the recorded compatible code version. **Keep the live database and attachments in place.** Do not reset/reseed, clear user storage, delete pending drafts, run a recovery migration or restore an old database over newer records. New reusable mappings and confirmed invoices created after release must remain intact; compare counts, monetary totals, IDs and attachments before/after code rollback.

If an old client cannot safely understand new records, restrict the affected workflow and deploy a forward fix instead of forcing an incompatible rollback. Preserve both conflict versions for review. Database restoration is a separately authorized incident operation: first retain the current database/attachments and all post-backup changes, restore into isolation, reconcile/replay later records, validate, then approve a cutover. Never treat an old backup as an automatic undo of a UI deployment.

## Status recorded before authenticated validation (28 September)

Source changes introduce no new migration in the repository, but remote schema/API compatibility is **not yet proven**. A successful build or unchanged migration count is not evidence that the target database has the required objects/permissions. Both Supabase browser variables were copied from the existing `ui/unified-invoices` Preview configuration into a separate `codex/integrate-approved-interface` Preview scope. Their values are intentionally omitted from this report. An uncached rebuild of candidate `13a5f84` was requested in Preview; production and the existing staging domain association were not changed. Authenticated tests still require a signed-in synthetic test tenant, and catalog verification requires staging administration access. Production controls and existing `.ai/DATA_SAFETY.md` audit findings remain unverified.
