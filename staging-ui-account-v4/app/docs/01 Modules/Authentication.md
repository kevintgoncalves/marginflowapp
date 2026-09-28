# MarginFlow - Authentication

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Authentication       |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Authentication module controls access to MarginFlow.

It manages user sign-in, company membership and role-based permissions, ensuring each user only sees and edits the data appropriate to their role.

---

# 2. Objectives

* Provide secure sign-in using Supabase Auth.
* Associate each user with a company (membership).
* Enforce role-based permissions across pages, departments and actions.
* Support a demo mode for evaluation without requiring an account.

---

# 3. Position Within MarginFlow

Authentication is the gate every user passes through before reaching any module.

```text
Sign In / Sign Up
        ↓
Load Company Membership
        ↓
Apply Role Permissions
        ↓
App (all modules)
```

---

# 4. Core Features

### Sign In / Sign Up

Standard email and password authentication via Supabase Auth.

Password recovery is supported through Supabase's reset flow.

### Company Membership

After signing in, the user's company membership is loaded.

If no membership exists, the user is guided through company creation (`CreateCompanyScreen`).

A user without a company cannot access operational modules.

### Demo Mode

MarginFlow supports a demo mode accessible via a specific URL parameter.

Demo mode bypasses Supabase authentication entirely and uses a fixed demo user and membership, allowing evaluation without setup.

### Supabase Setup Notice

If Supabase environment variables are not configured, the application displays a setup notice instead of the login screen, guiding the developer to add the required environment variables.

---

# 5. Roles and Permissions

MarginFlow uses a role-based permission system with three permission domains: pages, departments and actions.

### Permission Levels

| Level | Meaning |
|---|---|
| none | No access |
| view | Read-only access |
| edit | Can create and modify |
| full | Complete access including delete/admin actions |

### Default Roles

| Role | Description |
|---|---|
| Owner | Full access to everything, including settings and deletion |
| General Manager | Full dashboard and GP access; edit invoices, stocktake, waste; view-only products, suppliers, labour, settings |
| Head Chef | Edit access to invoices, products, recipes, menu, stocktake, waste; view-only dashboard, GP, labour |
| Bar Manager | Edit access to GP, invoices, stocktake, waste for Bar department; view-only elsewhere |
| Custom | Configurable combination of page, department and action permissions |

### Department-Level Permissions

Permissions can be scoped per department. For example, a Head Chef has edit access to Kitchen Made and Bought In departments but no access to Bar.

### Action Permissions

Separate from page access, certain destructive actions (delete, reset) are gated independently and disabled by default for all roles except Owner.

---

# 6. User Management

Users are managed within Settings by users with appropriate permission.

Each user record contains:

* Name
* Email
* Role
* Status (Active / Inactive)
* Page permissions
* Department permissions
* Action permissions

The first user of a company is always created with the Owner role.

---

# 7. Business Rules

* Every operational action in MarginFlow is associated with an authenticated user.
* A user cannot access a department they do not have permission for.
* Delete and reset actions require explicit permission, regardless of role.
* Demo mode never persists data to Supabase.
* Company membership must exist before any operational module is accessible.

---

# 8. Dependencies

This module depends on:

* Supabase Auth
* Settings (department configuration, used to build permission templates)

Every other module depends on Authentication for access control.

---

# 9. Future Improvements

* Single sign-on (SSO) support.
* Invitation-based user onboarding.
* Granular custom role builder in the UI.
* Two-factor authentication.
* Session timeout configuration.

---

# 10. Related Documents

* Settings
* Department Rules

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
