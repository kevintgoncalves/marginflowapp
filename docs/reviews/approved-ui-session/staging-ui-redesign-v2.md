# MarginFlow UI revision 2 — validation

Validated 26 September 2026. Local isolated source copy; no production deployment.

## Changes
- Consolidated dashboard performance layout, compact filters and quieter reporting surfaces.
- Bars, line, area and table views on performance, daily sales and GP charts; metric selectors and dark tooltips with keyboard navigation.
- Full-screen creation/editing workflows; existing side-panel details and anchored filter menus.
- No changes to financial calculations, persistence, permissions or migration history.

## Checks completed
- `npm run build -- --mode staging` passed. Prebuild ran `npm run safety:check` and `npm test`: 310 passed, 0 failed; 44 migration files remain intact.
- Chart domain tests cover negatives, zeros, missing data, decimal values and immutable inputs.
- Local synthetic-data browser integration: chart modes and keyboard details; values remain consistent between charts and tables; sales metric switching; empty period display; product create/edit opening and cancellation; sales editor Escape closing.
- Final compiled build served at http://127.0.0.1:5199/?demo=true.
- Desktop verification at 1440px. Dashboard and sales editor checked at 390×844; document/dialog width 390px with no horizontal overflow. Viewport override reset.
- No browser console errors observed during final checks.
- Original tracked source and previous delivered UI source verified against their preserved SHA256 manifests; no differences.

## Limits and remaining controls
- Vite reports large output chunks; this UI revision does not address bundle splitting.
- This is a local staging-mode build and synthetic-data UI verification, not a hosted staging or production release.
- Production backups, attachment protection, tested restoration, target-project verification, reconciliation, two-device/two-company concurrent cloud integration and rollback controls remain unverified.
- Existing data-safety audit findings in `.ai/DATA_SAFETY.md` remain applicable. No claim that all safety issues are resolved.
- The source archive is not a database or attachment backup. No production credentials or customer records were used for tests.

## Changed files relative to revision 1
- `src/components/InteractiveChart.jsx`
- `src/domain/chartPresentation.js`
- `src/domain/chartPresentation.test.js`
- `src/main.jsx`
- `src/styles.css`
