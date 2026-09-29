# Preview validation — 29 September 2026 (in progress)

## Target and decision

Branch `codex/integrate-approved-interface`; Vercel project `marginflowapp`,
repository root, Preview only. **NO-GO for main pending completion of remote tests.**

- Preview alias: [Preview URL retained in private evidence]
- Previously rebuilt deployment (13a5f84): [Preview URL retained in private evidence]
- Supabase staging: `[staging project ID retained privately]`, **verified staging project**.
- Test account: synthetic test account; synthetic company: synthetic test company.
- Company `[synthetic record ID retained privately]`;
  location `[synthetic record ID retained privately]`.

Preview variables were copied from `ui/unified-invoices` into exact candidate-branch
Preview scopes. Credential values are deliberately omitted. Production settings,
main and the existing staging domain association were not changed.

## Diagnosis and applied correction

See [PERSISTENCE_FIX.md](PERSISTENCE_FIX.md) for exact error, transaction evidence,
scope model and preservation review. Missing split SELECT grants were real but
were not the only fault: an absent relational supplier caused SQLSTATE 23503 and
rolled back the invoice; an invalid default department caused learning to be
skipped before calling its RPC.

After explicit user approval, migration
`20260929230000_scoped_learning_confirmation.sql` was applied through the SQL Editor
of the verified staging project. Editor content exactly matched local SHA-256
`8558304a81cc04ad51f439532b793ae22f15757c5b7838ffddeb90f603951723`.
The editor returned `Success. No rows returned`. A separate read-only request
verified all seven resulting function-body hashes against the file, both SELECT
grants and all three restrictive read policies. No existing migration was edited.
The remote migration ledger was absent at the expected relation; application is
recorded here by file hash and post-application function/policy evidence.

## Results so far

| Check | Result |
| --- | --- |
| Local automated suite | 344 passed, 0 failed |
| Local safety check | 44 original hashes unchanged; 1 reviewed additive migration matches |
| Local staging compilation | Passed; bundle-size warning remains; no deployment by build |
| Synthetic integration and export tests | 3 passed |
| Local real PostgreSQL | Rollback, acknowledgement, repeat ID, split supersession, reconnect, restaurant/non-member isolation and invoice idempotency passed |
| Authenticated non-demo login and data load | Passed in Chrome |
| Remote schema contract | 10 tables with RLS, required columns and RPC signatures present; deficiencies diagnosed and migration applied |
| Remote manual match save after migration | Passed: UI database acknowledgement and separate SQL row read |
| Remote rule ID | `[synthetic record ID retained privately]`, active, manual_selection, Food UUID |
| Remote invoice confirmation after migration | QA-20260929-MATCH-B confirmed; £9 entered confirmed tracker total; independent invoice query still to record |
| Pending draft preservation | QA-20260929-MATCH-A retained separately, still pending |
| Pending invoice reuse, reload, fresh import, no duplicates, override | Post-fix acceptance sequence still in progress |
| Supplier comparison / Excel / RFQ after confirmed price | Post-fix verification still in progress |
| Remote restaurant isolation | Pending post-fix authenticated-role checks |
| Supabase health | Changed to Healthy without restart/configuration by the agent; original Unhealthy cause not established |

## Earlier pre-fix export evidence (not post-fix validation)

The authentic workbook `marginflow-products-2026-09-29.xlsx` had one product in
Products and one associated article in Supplier comparison. Comparable price and
difference cells were blank, with `No confirmed prices`; pending £9 catalogue cost
was not substituted for a confirmed price. SHA-256:
`422e16c651a8a88743f1c04463b1fdf608baa08134eb96a10ea36675c3ef9ed0`.

RFQ CSV `marginflow-request-for-quotation-2026-09-29.csv` had exactly one selected
product, blank unconfirmed volume, no recorded prices or competitor identity.
Selection survived search, removal/re-addition, export and reload. SHA-256:
`1d99a89b8817a967df9a3cb21dc74cd12778751d5ea8be4a1f96a165fdd8a020`.

The 350-product pagination/selection case is locally tested; it is not a remote
300-product test. Demo mode is not persistence evidence.

## Remaining gates

Complete the authenticated post-fix sequence on the rebuilt Preview and update
this report before deciding main integration. No merge/production promotion is
authorized. Backup/restoration, attachment protection, reconciliation, concurrent
writers and remaining safety audit findings are not certified by these results.
