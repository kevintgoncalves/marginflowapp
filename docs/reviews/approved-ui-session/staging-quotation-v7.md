# Quotation preparation v7 — 28 September 2026

## Implementation

Isolated working copy: `staging-quotation-v7/app`, based on v6. All 348 v6 source hashes were verified unchanged. File changes/hashes are recorded in `changed-files.json`; baseline in `original-hashes.json`. No migration, database write, deployment or production credential use.

One Product database remains. Products paginate at 50 rows. The header selects the current page; the explicit matching-products action adds all eligible filtered results across pages. Selection IDs are independent of search, sort and filters. Clear/removal actions are explicit. Automatic selection excludes inactive products and internal preparations, including recipe-linked products.

Request quotation opens with zero selections. It offers existing selection, current filtered products, or one/more purchase sources. Sources are distinct from the eventual recipient. Selection additions merge canonical product IDs without duplicates. The panel has a searchable selected-product preview and catalogue browsing for exceptions.

Last 4 weeks, Last 12 weeks and All time use confirmed relational purchases. Period/source changes affect displayed purchase totals but do not silently change selection; a separate button explicitly limits an existing selection to purchases in that period. Associated articles without purchase history require an explicit fallback option. Incomplete conversions/equivalence leave volume blank with review text rather than a partial total. Unavailable or subsequently inactive selected products remain identified for review, not silently dropped.

The quotation CSV exports precisely the full selected preview collection, regardless of preview search. It includes volume/unit/period where known and review information where incomplete. Prices and purchase-source suppliers are excluded by default. Export does not clear selection. The Products analysis Excel is retained unchanged.

## Draft persistence boundary

Draft IDs, period and selected sources autosave to browser local storage under a versioned user-and-company key. Read/write errors show a visible warning and preserve in-memory selection; unreadable saved data is not overwritten. The write path compares the last observed saved version; detected other-tab changes block overwrites and offer draft download. JSON backup download and additive selection restoration are available.

This is persistence in the same browser/profile/origin, not server synchronization or a database/attachment backup. Clearing browser storage loses its saved draft unless a downloaded copy is retained. Cross-device synchronization is not implemented. General cross-tab storage writes are not a server transaction; detected conflicts are preserved rather than reconciled automatically.

## Local validation

- `npm test` (via staging prebuild): 342 passed; zero failures/skips. Existing matching/persistence tests retained.
- `npm run safety:check` (prebuild): passed; 44 original migrations immutable, no new migrations.
- `npm run build -- --mode staging`: passed. Existing large-bundle warning remains. See `validation/build.log`.
- Separate Products Excel regression test: 1 passed.
- New domain tests cover 350 products, deduplication, exceptions, exact exported IDs, source/period filtering, different pack sizes, litres and units, inactive/prep exclusion, unavailable volumes, pending/credit/future exclusion, draft reload, separate user/company keys, storage errors and conflict preservation.

### Browser integration with synthetic data

1. Actual application: Request quotation opened with zero selections. Selecting a purchase source without confirmed history displayed the explanatory message. Explicit associated-item fallback added five products; volume remained unavailable. Header showed partial selection.
2. A temporary fixture mounted the actual DataTable, QuotationPanel and draft hook with 350 synthetic products and confirmed synthetic invoices. Header selection selected 50 rows; Next page showed page 2 of 7 with the selection retained.
3. Select all selected 350. Search narrowed to QA product 022. Removing it left 349. Source filtering to Alpha displayed 175 products while keeping 349 selected. Sorting retained selection. Reload restored the 349 IDs and the excluded exception.
4. Searching inside the panel for product 349 showed one preview match, but Download quotation still exported the full 349 selections. The UI reported that selection was retained.
5. The actual browser-downloaded CSV was parsed independently: exactly IDs qa-0 through qa-349 except qa-22; 349 unique records; all volumes 6 kg; price and purchase-source columns absent. Retained as `validation/browser-export-349.csv`.

Fixture source is retained in `validation/quotation-qa.html` and `validation/quotation-qa.jsx`; temporary files were removed from application source after QA. To reproduce, copy them to the app root as `.quotation-qa.html` and `.quotation-qa.jsx` and open the fixture locally. Use the synthetic QA identity only. Main preview: http://127.0.0.1:5205/?demo=true&page=products

## Not validated remotely

Remote staging remains pending a verified association between staging.marginflow.co.uk's Vercel deployment and its Supabase test project. Browser demo and synthetic integration do not validate remote match persistence. Existing v5 local PostgreSQL results remain documented in v5; no database integration was rerun for this UI/draft change.

Production backup/restore evidence, target verification, multi-device/customer authorization and concurrency controls, data reconciliation, remaining audit findings and rollback safeguards remain subject to the existing release checklist. This change does not resolve all safety findings. Nothing was published to production.
