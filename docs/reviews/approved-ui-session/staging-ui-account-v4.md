# Account and settings revision 4

## Implemented
- Removed duplicate Inventory settings entry. The existing department table is retained under Business / Locations & departments and labelled Departments. Old `section=categories` URLs redirect with replaceState to `section=locations`; department data/actions are unchanged.
- Personal profile uses row-based display and inline Save/Cancel. Name writes to the signed-in user's existing Supabase Auth full_name metadata, verifies via getUser, then synchronises existing profiles fields. A failed directory mirror reports partial success explicitly. Existing auth state events refresh the workspace name. Company and role remain read-only.
- Security: provider-managed email update with confirmation/pending state, existing resetPasswordForEmail and existing recovery screen, global signout confirmation. No password, verification date, 2FA or passkey state is fabricated.
- Every operation checks the provider's current user against the displayed session ID, and uses only the self-service auth API. No admin user API, arbitrary target ID, RLS or permission changes. Demo and support/read-only sessions cannot perform personal security/profile operations.
- Pricing & subscriptions is a direct Settings leaf. It reads the existing company-access RPC under its existing server authorisation; shows plan key, status and trial end only when returned. No customer billing/payment portal exists, so prices, cards, subscription invoice downloads, billing details and payment actions are explicitly unavailable. No supplier invoices are used for this page.
- One breadcrumb and page title; narrower personal pages, wider department table. Active ancestors expand without accumulating every group. Mobile navigation and sidebar scroll retained.
- Company language stays in Business details. Timezone, week start and fiscal reporting settings stay in Currency, VAT & reporting. There are no persisted personal notification/language/date preferences to expose. Product units remain in Products.

## Verification
- Staging-mode build passed (`npm run build -- --mode staging`), including npm test: **319 passed, 0 failed**, and safety:check with existing 44 immutable migrations.
- Self-account contract tests use synthetic provider doubles: saved canonical name survives a fresh provider read; metadata retained; mismatched session prevents mutation, email request, reset and global signout; validation/backend errors; pending email does not replace the current login email; reset targets the verified email; directory failure reports partial success.
- Browser verified compiled build: legacy redirect, single Departments table, no duplicate Inventory settings entry, profile/security demo controls disabled, honest billing empty state, direct links, refresh, Back/Forward, active groups and mobile navigation. Profile and billing rendered at 390×844 without document horizontal overflow. No console errors observed. Viewport restored.
- Prior revision source verified unchanged against SHA256 manifest. No production deployment, migration, reset, destructive action or customer-data test.

## Live verification still pending
No authenticated Supabase staging connection/test account was supplied. Real name persistence after a browser refresh, auth-event name propagation, email delivery/confirmation, password reset completion, real global token revocation and role-specific company-access responses have NOT been validated against a live server. Unit/contract tests are not a substitute for these checks. Demo writes are intentionally disabled, not simulated as saved.

## Integration gaps / next phase
- Connect and validate the existing auth integration in staging, including allowed redirect URLs and email delivery. No migration is required for the implemented name/email/reset flows.
- Customer billing portal, payment methods, price/interval data, renewal/payment dates, invoice downloads and measured limits/usage are not integrated. Existing internal subscription administration remains unchanged and is not exposed to customer users.
- Personal preferences, 2FA/passkeys, additional personal fields, invitations, multiple logins and new member permissions are outside this revision.
- Global signout revokes refresh sessions; access tokens may remain valid until expiry. UI states this limitation.
- Vite large-chunk warning remains. Production backups/restoration, cross-company/concurrent-device integration, reconciliation, rollout/rollback controls and existing DATA_SAFETY audit findings remain unverified.

## Provider references
- [Supabase updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
- [Supabase signOut scopes and token limits](https://supabase.com/docs/reference/javascript/auth-signout)

## Changed files
- `src/components/CompanySubscription.jsx`
- `src/components/PersonalAccount.jsx`
- `src/components/WorkspaceNavigation.jsx`
- `src/domain/selfAccount.js`
- `src/domain/selfAccount.test.js`
- `src/domain/settingsNavigation.js`
- `src/domain/settingsNavigation.test.js`
- `src/main.jsx`
- `src/styles.css`
