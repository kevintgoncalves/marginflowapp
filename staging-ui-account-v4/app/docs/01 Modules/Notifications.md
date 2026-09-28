# MarginFlow - Notifications

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Notifications        |
| Version  | 1.0                  |
| Status   | Draft                |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Notifications module surfaces important events and required actions to users without requiring them to actively search for them.

Notifications keep managers informed of items that need attention: invoices awaiting approval, GP targets missed, unusual price changes, and similar operational events.

---

# 2. Objectives

* Surface items requiring user attention across all modules.
* Reduce the need for users to manually check every module for pending work.
* Provide a single, consistent place to review platform activity.

---

# 3. Position Within MarginFlow

Notifications is a cross-cutting module. It reads events from every other module but does not create operational data.

```text
Invoices / Stock / GP / Labour
        ↓
Notifications (aggregation)
        ↓
User (sidebar / banner)
```

---

# 4. Notification Types

### Invoice Notifications

* Invoice requires review.
* Invoice pending approval.
* Invoice processing failed.

### GP Notifications

* GP fell below target for a department or period.
* Significant GP change versus the previous period.

### Pricing Notifications

* Supplier price increased significantly on a product.
* New product created from an invoice and requires categorisation.

### Stock Notifications

* Stocktake overdue.
* Stock variance exceeds the configured threshold.

### System Notifications

* Cloud sync issues.
* Failed imports.

---

# 5. Display

Notifications are surfaced in two places:

* A notification indicator in the sidebar showing the count of unread items.
* Inline banners within the relevant module (e.g. an invoice status banner).

---

# 6. Business Rules

* Notifications are informational. They do not block any workflow.
* A notification is cleared when the underlying condition is resolved (e.g. the invoice is approved).
* Notifications respect department-level permissions — a user only sees notifications for departments they have access to.
* Notifications are not stored as a permanent audit log. See Audit Trail for permanent records.

---

# 7. Current Implementation Status

This module is partially implemented through inline status indicators (invoice status banners, cloud sync status) rather than a centralised notification centre.

A dedicated, centralised Notifications module is planned but not yet built.

---

# 8. Dependencies

This module depends on:

* Invoices
* Reports (GP thresholds)
* Stock
* Settings (for thresholds and targets)

---

# 9. Future Improvements

* Centralised notification centre with read/unread state.
* Email and push notification delivery.
* Configurable notification preferences per user.
* Digest mode (daily/weekly summary instead of real-time).

---

# 10. Related Documents

* Invoices — Invoice Approval
* Reports
* Stock
* Dashboard

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Draft   | Documents current and planned state |
