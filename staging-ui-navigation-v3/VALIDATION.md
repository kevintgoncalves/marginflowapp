# MarginFlow — settings navigation and account drawer

## Delivery
Isolated copy of revision 2 in `app/`. Previous source preserved and verified with SHA256 (`original-hashes.json`). No production deployment, schema/RLS/migration/authentication changes, or customer data mutations.

## Behaviour
- Company name opens an animated right drawer, showing available session name, email, role, business, location and selected department.
- Existing Settings page permission controls visibility of personal/business/team shortcuts. Support and existing logout remain available. No new permission policy introduced.
- Account drawer supports close button, Escape, backdrop click, focus trapping and opener focus restoration. Small-screen navigation is retained beneath the account drawer.
- Settings and category buttons expand in place. Leaves open in the main workspace using `?page=settings&section=...`; query context is retained. Active ancestors expand on direct links and history changes.
- Profile contains the current account summary only. Team members and existing permissions UI are separate. Business settings reuse existing fields and validation.
- Existing financial, labour, GP, invoice, AI/parser, POS/import, department, cloud and recovery interfaces have dedicated destinations. Recovery panels stay under Backup & recovery.

## Verification
- `npm run build -- --mode staging`: PASS. Prebuild ran `npm run safety:check` and `npm test`: 312 tests passed, 0 failed. Existing 44 migration files remain immutable.
- Added URL round-trip and unknown/stale-section tests.
- Browser on compiled build: company drawer content; Escape and backdrop dismissal; focus restored to trigger; Shift+Tab wraps to Sign out; category expansion leaves main page unchanged; business and department forms; direct links, refresh, Back and Forward; profile/team separation.
- Verified financial, targets, labour, POS, CSV, AI, parser, category and backup destinations render their existing forms. No writes or recovery actions executed.
- At 390×844, mobile navigation/account drawer and team shortcut worked; drawer width 390px, content scroll width 388px. Browser viewport reset afterward.
- Demo Sign out used the unchanged callback and returned to login setup. No console errors observed.
- Settings visibility follows existing `visibleNavItems`; authenticated permission variants were reviewed in source and existing permission tests ran, but live role-specific sessions and authenticated Supabase logout could not be exercised without a staging connection.

## Not implemented / remaining
- Personal profile editing, Sign-in & security and personal/notification preferences have no existing forms; no empty destinations were added. Profile is read-only.
- Units are configured in existing product editing, not in a standalone settings editor. Locations show the current session location; department management is retained.
- Team invitations, multiple logins and new per-member custom permission workflows remain for the next phase. Existing team controls were preserved exactly for their supported modes.
- Large-bundle Vite warning remains. Hosted staging integration, concurrent devices/companies, production backups, tested restoration, reconciliation and rollback controls remain unverified. Existing DATA_SAFETY audit findings are not resolved by this UI change.

## Changed files
- `src/components/InvoiceModal.jsx`
- `src/components/WorkspaceNavigation.jsx`
- `src/domain/settingsNavigation.js`
- `src/domain/settingsNavigation.test.js`
- `src/main.jsx`
- `src/styles.css`
