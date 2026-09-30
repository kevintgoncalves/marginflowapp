# Preview validation — 30 September 2026

## Target and decision

Branch `codex/integrate-approved-interface`; Vercel project `marginflowapp`,
repository root, Preview only. **NO-GO for main while the fresh-file reuse and
remote multi-supplier acceptance cases remain incomplete.**

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
| Remote invoice confirmation after migration | Passed: QA-20260929-MATCH-B is independently readable as Approved, £9.00, signed gross £9.00; tracker total is £9.00 |
| Pending draft preservation | Passed: QA-20260929-MATCH-A remains Pending / save failed in the client and is absent from `invoices`; confirmed reports keep the last usable state |
| Reload and duplicate-rule check | Passed: authenticated app reloaded; one active rule with one distinct ID remained; `confirmation_count = 2` |
| Fresh PDF import and automatic reuse | **Blocked** before upload: Chrome extension rejected `fileChooser.setFiles` because file-URL access is disabled. The synthetic PDF was rendered and visually checked locally; no upload occurred |
| Invoice-only override | Local PostgreSQL and application logic tests pass; the final remote UI override sequence remains coupled to the blocked fresh import |
| Supplier comparison after confirmed price | Passed for the available remote case: list and panel show Staging Produce Ltd, £3.00/kg, 3 kg pack, price date 2026-09-29 and source invoice; state is `Only one supplier` |
| Products Excel after confirmed price | Passed: Products and Supplier comparison contain the same product/date/£3.00 per kg; monetary comparison cells are numeric and missing metadata is labelled |
| RFQ after confirmed price | Passed: exactly one canonical product, 3 kg purchased in Last 4 weeks, no duplicate, recorded prices and supplier identity omitted by default; selection survived export and page reload |
| Remote restaurant isolation | Passed with transient fixtures inside an explicit transaction: owner scope readable; foreign restaurant/company hidden; cross-scope RPC rejected; transaction rolled back |
| Supabase health | Healthy on 30 September; nano compute, 99.7% gateway success in the displayed last hour. Original Unhealthy cause remains unidentified and must not be attributed to this migration |

## Post-fix export evidence

Authenticated Products workbook `marginflow-products-2026-09-30.xlsx`:

- `Products`: one canonical product, current and cheapest recorded price both
  numeric `3`, unit `kg`, dates `2026-09-29`, status `Only one supplier`.
- `Supplier comparison`: one associated article, numeric pack price `9` and
  normalized price `3`; same canonical reference and invoice source; missing
  article code and brand/specification are explicitly listed.
- SHA-256: `821407eab794923178867f18de4a103679a5286ed7a915827096170bf36ce963`.

Authenticated RFQ `marginflow-request-for-quotation-2026-09-30.csv` contains one
canonical reference once, purchased volume `3`, unit `kg`, period 2026-09-03 to
2026-09-30. Proposed price, supplier-product code and competitor identity are
blank by default. SHA-256:
`bf8b468a4bd0395929a7638cf22c5bed86b99e45958127b033c50ad25be030aa`.

The 350-product pagination, cross-page selection, exception removal and exact
export set remain locally covered by the synthetic integration suite. The remote
tenant contains one product, so it cannot prove the >300-product volume case.

## Earlier pre-fix export evidence

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

Enable file access for the ChatGPT Chrome extension and repeat the synthetic PDF
import. Confirm automatic learned-rule application after extraction, an
invoice-only override that leaves the reusable rule unchanged, and a second
reload/import with rule count still one. Add a second synthetic supplier with a
different comparable pack to prove the remote £/kg ordering and difference; the
local test already covers 3 kg at £9 versus 5 kg at £13.25.

No merge or production promotion is authorized. Backup/restoration, attachment
protection, reconciliation, concurrent writers and remaining safety audit findings
are not certified by these results.
