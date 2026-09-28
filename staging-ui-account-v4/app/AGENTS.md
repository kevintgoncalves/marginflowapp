# MarginFlow — mandatory data protection

Read `.ai/DATA_SAFETY.md` before changing code or deployment configuration.
This is the user's explicit requirement: updates must preserve existing work
for Kevin and every customer, including invoices, stock, sales and attachments.

- Work on a separate branch/copy. Preserve the original and record its hashes.
- Never reset/reseed a live database, clear customer browser storage, replace
  business tables from a demo/backup, or run a recovery migration as a routine release.
- A source ZIP is not a database or attachment backup. Do not claim otherwise.
- Never use production credentials or customer data in tests.
- Keep existing migrations immutable; this phase introduces no schema changes.
- Run `npm test` and `npm run safety:check`, then a staging build and integration
  tests. Read failures must preserve the last usable state, never become empty data.
- Retain pending work separately from confirmed financial inputs. Never silently
  resolve a conflict by deleting, overwriting or dropping either version.
- Production release requires documented fresh backups, a tested restoration,
  data reconciliation, target-project verification and a rollback plan that
  preserves records created since the backup. Follow the release checklist.
- Do not say all safety issues are resolved. Report what was tested and which
  production controls or audit findings remain unverified.

This file and `.ai/DATA_SAFETY.md` supersede older local-first instructions in
the repository. Incremental extraction of persistence/domain logic into tested
modules is authorized for data protection; a full rewrite is not requested.
