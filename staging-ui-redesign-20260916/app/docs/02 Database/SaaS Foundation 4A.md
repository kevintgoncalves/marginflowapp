# SaaS Foundation 4A

## Scope

Migration `20260813090000_saas_foundation_4a.sql` establishes the data and
authorization foundation for plans, trials, internal staff and auditing. It
does not enable payment processing, onboarding UI, support UI, AI quotas or
operational feature blocking. Those changes require their own later release.

## Customer and internal identities

Customer access remains company-scoped through `company_members`. Customer
roles such as Owner, General Manager and Head Chef are business roles only.
They do not create or imply a MarginFlow internal account.

MarginFlow staff must be explicitly inserted into `internal_staff_accounts`
by a trusted server-side or Supabase Dashboard operation. A staff account has a
template role in `internal_roles`; the effective permissions are resolved from
`internal_role_permissions` plus one optional allow/deny override per
permission. The browser cannot infer or grant this state.

Initial internal roles are `super_admin`, `admin`, `support` and `billing`.
The permission keys are data, rather than application role-name checks, and
cover company, subscription, customer-user, support-workspace, staff, plan and
audit actions.

Example initial super-admin assignment, to be run only with a trusted database
administrator connection after the user exists in `auth.users`:

```sql
insert into public.internal_staff_accounts (user_id, role_key, status)
values ('AUTH_USER_UUID', 'super_admin', 'active');
```

This is an explicit operational action. No company owner, profile metadata,
email address, client flag, route or local storage value can create it.

## Plans and trials

`plans` retains compatibility fields, while `features` and `plan_features` are
the authoritative relational plan matrix. The initial matrix is:

| Plan | Features |
| --- | --- |
| Basic | dashboard, sales, invoices, invoice_ai |
| Plus | Basic plus products, suppliers, stocktake, invoice_control_centre, recipes, waste |
| Pro | Plus plus menu_costing, labour, ai_insights, advanced_reporting |

Existing companies are provisioned as active Pro companies so the migration
does not remove access. New companies receive a Pro `trialing` subscription
with `trial_length_days = 14`, but with both trial timestamps unset. Prompt 4B
will start the clock after onboarding by writing the authoritative
`trial_ends_at` timestamp.

`get_effective_company_access(company_id)` is the authoritative customer-scoped
snapshot. It uses the database clock: a trial becomes `expired` as soon as
`trial_ends_at <= now()`, with no scheduler. A valid trial resolves Pro
features. `company_features` remains the existing company-specific mechanism
for custom add-ons and private beta access; it supplements, rather than
duplicates, the selected plan.

## Enforcement boundary

The new helpers are ready for later server and RPC enforcement:

- `get_effective_company_access(company_id)` returns effective status, feature keys and write access.
- `can_access_feature(company_id, feature_key)` is the central feature gate.
- `company_subscription_allows_write(company_id)` is the central write decision.

The current operational modules intentionally continue unchanged in 4A. A
future enforcement release must apply the helpers on every server/RPC mutation
path before making expired companies read-only or hiding plan-gated screens.
The current `api/read-invoice-ai.js` route uses an OpenAI server secret but does
not yet validate a Supabase bearer token or the `invoice_ai` entitlement. That
must be added before plan enforcement for invoice AI.

Service-role code bypasses RLS. It must validate the authenticated actor and
call the entitlement/internal-permission helpers rather than trusting client
claims. The existing `VITE_INTERNAL_RECOVERY_TOOLS` flag is presentation-only;
it is not internal authorization and must not be treated as such in future
support tooling.

## Audit foundation

`internal_audit_log` is a new append-only internal audit table. It stores the
actor, action, old and new values, metadata, and the company/location whenever
the action concerns one. Direct customer writes are revoked. Internal actions
can be recorded through `record_internal_audit_event(...)` only after the
server verifies an active internal staff account.
