# Products v6 — local validation (28 September 2026)

## Scope and preserved source

Implementation: `staging-products-v6/app`, copied from `staging-import-products-v5/app`.
All 346 recorded source hashes of v5 were verified unchanged after implementation.
See `original-hashes.json` and `changed-files.json`. No database or attachment backup is claimed.
All 44 existing migrations remain immutable; no schema change or deployment was made.

## Result

- One Product database table, preserving catalogue fields and edit actions, with cheapest supplier, normalized price difference and View comparison.
- Side drawer shows all associated supplier articles, current/cheapest badges, source invoice links, dates, pack and normalized prices, equivalence/conversion states. Comparable articles sort by price; review items are separate.
- Comparison selects the latest confirmed invoice price per article, not the cheapest historical promotion. A supplier code identifies the article across pack changes; code-less articles use description, pack and billing unit conservatively. Conflicting latest same-day records require review.
- Pending/unconfirmed invoice inputs do not become financial comparison prices. Missing prices remain null, with explicit states. Supplier mappings without confirmed purchases remain visible as missing-price articles.
- Download Products Excel contains Products and Supplier comparison. Numeric prices/deltas have separate unit/currency columns. Product filters select products; all associated articles are exported without opening drawers.
- Selected-product request-for-quotation CSV remains available in English; prices and competing suppliers are excluded by default.
- Comparison is read-only and does not update chosen suppliers, recipe costs or stock. Existing v5 match persistence work is retained.

## Checks completed locally

- `npm test`: 336 passed, zero failures/skips, including existing match persistence tests.
- `npm run safety:check`: passed; 44 original migrations, no new migrations.
- `npm run build -- --mode staging`: passed (prebuild reruns safety and tests). Existing large-chunk warning remains. Log: `validation/build.log`.
- `node --test src/utils/exportProductsExcel.test.js`: one additional test passed.
- `node validation/render-panel-test.mjs` from the v6 directory: actual drawer component rendered against synthetic data and compared with shared list/export values; passed. Workbook generated and separately covered by ExcelJS round-trip tests.
- Cases: 3 kg vs 5 kg packs, old promotion superseded by newer invoice, current supplier already cheapest, only one supplier, invalid conversion, pending equivalence, missing associated prices, ambiguous same-day prices, pack changes under the same code, per-kg billing without double conversion, input immutability.
- Synthetic consistency example: current 3 kg at £9 = £3/kg; latest alternative 5 kg at £13.25 = £2.65/kg; saving £0.35/kg (11.7%). Same values in list model, actual drawer render and numeric Excel cells. Older promotional price excluded.
- Browser: verified one main table, actual comparison drawer opening, missing-price state, search filtering and Download Products Excel success for one filtered product. RFQ include-prices checkbox defaults off. Preview: http://127.0.0.1:5204/?demo=true&page=products
- Synthetic artifacts: `validation/synthetic-products.xlsx`, `validation/panel-render.html`. They contain synthetic data only. The temporary fixture page was removed from application source after visual inspection.

## Database validation and remaining work

This v6 change made no database writes and did not use production credentials or customer data. Its tests are local synthetic/unit/component/export tests. The demo browser preview does not establish remote persistence.

Previous v5 local PostgreSQL validation is documented in the v5 validation report (isolated synthetic database, match RPC persistence/reload and outsider denial). Those results are not a staging-remote test and were not rerun as part of this read-only presentation change.

Remote staging remains unvalidated: https://staging.marginflow.co.uk is protected by Vercel, and its associated Supabase test project has not been verified. The missing item is a verifiable deployment-to-Supabase test-project association/configuration. Do not infer it from an unrelated environment file.

Before production, the existing release requirements remain: verified target project, fresh database and attachment backups, restoration/reconciliation evidence, multi-device/multi-company concurrency and interrupted-I/O testing, permissions/audit review and a rollback plan preserving later records. Existing audit findings in `.ai/DATA_SAFETY.md` remain unresolved/unverified by this UI change. Nothing was published to production.
