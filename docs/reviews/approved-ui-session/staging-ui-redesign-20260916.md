# MarginFlow staging UI redesign — delivery and validation

## Status

Local staging-mode implementation prepared for review. **Not deployed to a hosted staging or production environment.** Staging URL and Supabase target identification are still required before connected acceptance testing.

Source: `staging/schema-baseline`, commit `e64b2236cc8abad073e2f1091575190fdbad12e7`. Work was performed in a separate source copy. Every original tracked-file SHA-256 was verified unchanged after implementation. `original-source.tar` and `original-hashes.json` preserve the source version. They are **not database or attachment backups**.

## Implementation

- Shared light canvas, green actions, fine borders, system typography, compact controls and visible focus styles. Existing MarginFlow logo retained byte-for-byte.
- Responsive sidebar with permission-filtered page navigation, invoice status links, Inventory, Costing and Reports groups, department selector, page search and sign-out. Mobile drawer uses the existing accessible modal stack, Escape dismissal and focus return.
- Dashboard: top period/department controls and comparison selector; net sales, purchases, invoice GP, real GP, waste and labour figures from existing metrics; visible sales/purchases chart, GP chart, supplier spend and breakdown. Missing sales records no longer produce a fabricated comparison percentage.
- Operational links and pending-sync notifications use existing state. Quick actions enter existing sales, invoice, stocktake and waste workflows.
- Invoice Control Centre: actionable status strip, sidebar links to existing All/Review/Pending/Credit-note filters, existing searchable list and review flows. Desktop invoice detail is presented at the right edge; the modal stack preserves list filters and draft safeguards.
- Products: department/supplier filters, retained search while inspecting a product, accessible right-hand Details/Costs/Suppliers/History views. History and costs come only from existing records. Existing edit, delete, export and merge flows remain in place. Export respects current filters.
- Suppliers: existing category filter; active supplier workflow retained. Add Supplier icon spacing fixed (MF-STG-001).
- Live Stocktake: search icon no longer overlaps the input (MF-STG-003). Existing count workflow retained.
- Settings: clear destination index and section selector. Existing invoice, financial, labour and menu settings are reachable. No new financial or persistence rules introduced.
- Utilities: operational notifications, setup guidance linking existing workflows, product-help topics, downloadable support report with opt-in technical context, and honest unavailable AI entry point.

New `WorkspaceNavigation.jsx` isolates reusable presentation from the large workspace component. The existing sign-out source-contract test was updated to inspect that component; no assertion was removed.

## Validation performed

- `npm run build -- --mode staging` completed, including `npm run safety:check` and `npm test` via the unchanged prebuild gate.
- **306 tests passed, 0 failed.** Safety check: **44 original migrations unchanged; no new migration**.
- Built artifact served locally at `http://127.0.0.1:5197/?demo=true` with no Supabase configuration. Development preview also used blank Supabase variables. No `.env` credentials were copied.
- Browser route checks at 1440×1000 and 390×844: Dashboard, Invoice Control Centre, Products, Suppliers, Stocktake, Sales, Settings, Recipes, Menu Costing, Waste and Labour rendered with no document-width overflow. No browser errors observed in those checks.
- Product search → detail → recorded history → Escape: search remained intact. Products route persisted after refresh.
- Mobile navigation opened and closed correctly; invoice Credit notes link selected the correct existing filter. Opening and closing a credit-note detail preserved the underlying filtered browser.
- Mobile Add Supplier visually checked. Live Stocktake search measured a 10px gap between icon and input, and the count entry dialog was visually checked.
- Invoice Processing settings destination opened existing approval/default controls.
- Compiled artifact verified on mobile and desktop. Empty-period comparisons show an unavailable message; populated synthetic August data displays original figures and charts.
- AI entry displays current period/department and a coming-soon message. Support download produced its success state using synthetic text with technical-context consent off; nothing was sent to support.
- Build still reports large JavaScript chunks; no bundle-size optimisation was included.

These are local UI integration/smoke checks, not proof of hosted Supabase durability or real multi-device behaviour.

## Deliberate capability limits / remaining acceptance work

- Company identity is displayed and department switching works; cross-company switching is not implemented. Search covers permitted page names, not business-record contents.
- Report links use existing dashboard report sections, Sales, Labour, Waste and rule-based insights. They are not newly implemented standalone report engines. Existing target GP is shown; target-based period comparisons were not invented.
- Separate processing-history view is labelled unavailable. Pending processing links to existing pending/save-failed document state; it is not a new processing queue monitor.
- Products and Suppliers retain their existing active-only model. No inactive-record browser, persisted saved views or new bulk action was added. Existing bulk merge confirmations were preserved.
- Setup guide is a checklist of configuration steps, not persisted onboarding progress; the existing onboarding flow is unchanged.
- AI conversational retrieval, online support submission, screenshot upload and call booking remain unavailable. A support report can be downloaded and shared manually, with a screenshot attached separately.
- Supplier categories are unchanged. A safe next approach is to offer the proposed vocabulary alongside the union of existing category values, preserving every stored label. Only an explicit edit should change a supplier category. Persisting an organisation-specific vocabulary requires an agreed organisation-scoped configuration contract; do not introduce automatic relabelling or migration.
- Hosted staging checks still required: verified project target, login/logout, second real device, two companies, data/attachment reconciliation, concurrent and interrupted writes, old-client compatibility, upload/extraction, and persistence after refresh. No customer data or production credentials were used here.
- Production remains subject to the existing release checklist: fresh database and attachment backups, tested restoration, reconciliation, target verification, monitoring ownership and a rollback preserving records created after backup. Those controls were not verified here.
- Existing data-safety audit findings remain: AI endpoint authorisation/quotas, fine-grained backend permissions, cross-account browser isolation, server-side invoice deletion and pending-operation durability. This UI work does not resolve them.

## Files and rollback

Changed: `src/main.jsx`, `src/styles.css`, `src/domain/adminBackOffice.test.js`. Added: `src/components/WorkspaceNavigation.jsx`.

`redesign.patch` contains the complete application diff. The `app` directory is a standalone source copy and `MarginFlow-UI-Redesign-staging.zip` packages that source. Dependencies and credentials are excluded from the ZIP.

No release occurred, so rollback means continue using the untouched original checkout. For a future staging rollout, switch the application build back to the recorded source version without changing or restoring any database records. Do not apply the patch over newer work blindly: check its base version and review conflicts. Do not use a database restore as an application rollback.

To run the delivered source locally, install locked dependencies in its `app` directory and run the existing Vite commands with verified staging configuration, or use `?demo=true` without Supabase configuration for synthetic UI review. Never copy production credentials into the preview.
