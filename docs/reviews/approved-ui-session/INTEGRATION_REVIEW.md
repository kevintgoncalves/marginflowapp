# Approved interface changes — integration and commit review

Reviewed 28 September 2026. **No commit, push, deployment or remote configuration change performed.**

## Repository and deployment identity

| Item | Verified value |
| --- | --- |
| Local repository root | `/Users/kevin/Documents/Kevin Tech/MarginFlow work edition` |
| Remote | `https://github.com/kevintgoncalves/marginflowapp.git` |
| Starting branch / HEAD | `staging/schema-baseline` / `a9fdf57668b7dbc2a7694955789af4232e9e8caa` |
| Prepared integration branch | `codex/integrate-approved-interface` (local, no upstream yet) |
| Vercel team / project | `margin-flow-s-projects` / `marginflowapp` |
| Vercel project ID | `prj_7xVcyyv3Wbh5HY06pJdySoQ3vBJv` |
| Vercel Root Directory | Empty: repository root, **not** a `staging-*/app` folder |
| Framework / build / output | Vite / `npm run build` / `dist` |
| Production branch | `main` |
| Preview branch tracking | Enabled for all unassigned branches |
| Staging domain assignment | `staging.marginflow.co.uk` → Preview branch **`ui/unified-invoices`** |
| Preview Supabase variable scope shown in Vercel | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` restricted to **`ui/unified-invoices`** |

Read directly in authenticated Vercel settings:
- [Build and Deployment](https://vercel.com/margin-flow-s-projects/marginflowapp/settings/build-and-deployment)
- [Connected Git repository](https://vercel.com/margin-flow-s-projects/marginflowapp/settings/git)
- [Production branch](https://vercel.com/margin-flow-s-projects/marginflowapp/settings/environments/production)
- [Preview branches and staging domain](https://vercel.com/margin-flow-s-projects/marginflowapp/settings/environments/preview)

No secrets were revealed. Vercel's dashboard install field says `npm install --legacy-peer-deps`; the existing repository `vercel.json` specifies `npm ci`. The dashboard reports production overrides differing from project settings. Repository build configuration is retained unchanged. Vercel's Node version is 24.x; local checks and the existing GitHub workflow use Node 22 (local 22.14.0).

### What a future push would do

Publishing **this integration branch** to origin will trigger the repository's GitHub test-and-build workflow and Vercel **Preview** for `marginflowapp`, built from the root. It will not target the `main` Production environment or the branch-bound `staging.marginflow.co.uk` domain. The current Preview Supabase variables do not apply to this branch, so its preview must not be described as a connected staging validation.

To update the existing staging domain later, the reviewed commit must be integrated into `ui/unified-invoices`, or the staging domain/Preview variable branch assignments must be deliberately changed after test-project verification. Neither operation has been performed or implicitly approved by this review. A push to `main` would request a Production deployment for `app.marginflow.co.uk`; the existing production evidence gate is retained.

GitHub's latest baseline deployment was a successful Preview for a9fdf57. Historical GitHub records also mention `marginflowapp-qcod`; the current inspected team project list contains only `marginflowapp` linked to this repository, and the latest commit has only its Vercel status. No claim is made about inaccessible projects under other teams.

## Cause of the 1,076-file selection

The 1,076 new files were three complete local review copies:

| Local folder | Initially untracked files | Disposition |
| --- | ---: | --- |
| `staging-import-products-v5/` | 361 | Keep on disk; ignore in Git and Vercel uploads |
| `staging-products-v6/` | 355 | Keep on disk; ignore in Git and Vercel uploads |
| `staging-quotation-v7/` | 360 | Keep on disk; integrate necessary source differences into root |

The previous a9fdf57 commit had already added **1,368 files** in four earlier review-copy folders. Those folders are now removed **from the Git index only**, with every local file preserved. Root `Archive.zip` adds one more index-only removal: it is a package of `.ai`, `.templates` and Markdown documentation (plus macOS metadata), not a runtime dependency, database backup or attachment backup. No application/build scripts reference the archive or the copy folders.

Git will therefore show **1,369 removal entries** for cleanup, not 1,369 deleted local files or unique application files. Copied migration files inside those folders are redundant copies; all 44 authoritative root migrations remain unchanged. Existing Git history is retained; no reset, history rewrite or file purge was performed.

## Integrated approved work

The root application matched the original e64b223 baseline manifest before integration. There were no root-source conflicts with later independent edits. The final v7 source was compared file by file, and only **32 changed/new code and test files** were copied into their actual root paths. Root originals were separately preserved before replacement.

Included work spans all approved revisions:
- v1/v2: dashboard, interactive graph types, filters, drawer/full-screen workflows and product details.
- v3/v4: navigation and Settings organization, account drawer, own-profile/security flows and subscription information.
- v5: reusable supplier-product matching, explicit invoice-only scope, acknowledgement checks, full paginated reads and pending-invoice refresh, with synthetic integration tests.
- v6: one Products table, normalized supplier comparison drawer and the two-sheet analysis Excel.
- v7: quotation preparation, paginated/bulk selection, purchase periods, browser-scoped draft preservation, private-by-default quotation export and 350-product tests.

The 32 files are individually listed with source path and before/after SHA-256 in `integrated-files.json`. Source files preserve the reviewed v7 implementation; only a trailing blank line in DataTable.jsx was removed after the index whitespace check. All other integrated files are byte-identical. No dependency, lockfile, API endpoint, production configuration, permission policy or authoritative migration was changed during integration.

### Commit selection

- **32 code/test files:** 31 under `src/`, one synthetic integration test under `scripts/`.
- **2 exclusion files:** `.gitignore` and `.vercelignore` prevent review copies, archives, dependencies, build output and environment credentials being uploaded as application source.
- **9 documentation files:** this review, the integration hash manifest and seven historical revision validation reports. Historical reports retain their original dates/limitations and reference preserved local artifacts; this document supersedes their deployment-configuration uncertainty.
- **1,369 index-only removals:** four previously committed redundant copy directories plus root `Archive.zip`. They remain on disk and in previous commits. Git may display some documentation/code as renames by similarity; counts above use renames disabled.

Not included: new v5/v6/v7 full copies, ZIP/TAR archives, local validation output/downloads/screenshots, temporary QA pages, `node_modules`, `dist`, `.vercel`, real `.env*` files or credentials. `.env.example` remains the unchanged empty template. Existing root `staging/schema-baseline`, `safety`, primary migrations and unrelated documentation/assets are retained because they are separate pre-existing schema/safety/audit work, not these redundant application copies.

## Preservation evidence

Ignored local audit location: `.local-review/2026-09-28-integration/`.
- Hashes of all **1,699 originally tracked files** and **1,076 originally untracked files** recorded before changes.
- Original working/index diffs recorded; both were empty before this integration.
- Replaced root source files preserved under `root-original/`.
- All 1,369 index-removed files and all 1,076 original untracked files verified present and byte-identical after preparation.
- Original source commit a9fdf57 and the previous branch remain intact.

These are source-preservation measures, not customer database/attachment backups.

## Validation of the root application

- `npm run build -- --mode staging` from repository root: **passed**. Supabase URL/key were explicitly empty for this local build; no production credentials or customer records used.
- Prebuild `npm run safety:check`: **passed**, 44 immutable authoritative migrations and no new migrations.
- Prebuild `npm test`: **342 passed, zero failed**.
- Explicit synthetic match integration plus Excel regression: **3 passed** (two integration tests already counted in the full suite; one additional Excel test).
- `git diff --check` and the final staged whitespace check: passed after removing a trailing blank line from DataTable.jsx.
- Final index audit: 43 added/modified files and 1,369 index-only removals; no unstaged or non-ignored untracked files. Targeted private-key/token/JWT pattern scan of the added/modified content passed. This is not a comprehensive historical secret audit.
- Browser against the root compiled build at `http://127.0.0.1:5206/?demo=true&page=products`: single Products table, Request quotation opens without selection, adding all 28 demo products updates the selected count and export count; drawer closes back into the preserved list. No backend writes.
- v7's 350-product browser/download test remains applicable to the functionally identical integrated implementation: exact 349 unique exported records after excluding one product; search/filter/page/reload preservation. It was not relabelled as a remote database test.

Known limitations remain: Vite's large-chunk warning; remote staging Supabase identity and connected match persistence still require verification; draft storage is browser-local, not cross-device; Vercel Node 24 execution has not been repeated locally. Production backups/restoration, reconciliation, concurrency/authorization audit and rollback controls remain unverified. No claim that all safety issues are resolved.
