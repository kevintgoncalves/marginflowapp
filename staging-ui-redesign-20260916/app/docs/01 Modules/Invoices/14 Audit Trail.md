# MarginFlow - Invoices: Audit Trail

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Audit Trail          |
| Version  | 1.0                  |
| Status   | Draft                |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Audit Trail provides a permanent, traceable record of every significant action taken on an invoice throughout its lifecycle.

It exists to answer the questions: who changed this, when, and why — essential for financial accountability in a hospitality business.

---

# 2. Events Tracked

| Event | Information Recorded |
|---|---|
| Invoice Created | User, timestamp, entry method (AI / Standard / Manual) |
| AI Extraction Completed | Timestamp, extraction confidence summary |
| Line Item Edited | User, timestamp, field changed, previous value, new value |
| Product Match Confirmed/Changed | User, timestamp, original suggestion, final selection |
| Department Allocation Changed | User, timestamp, previous allocation, new allocation |
| Invoice Approved | User, timestamp |
| Approved Invoice Edited | User, timestamp, field changed, previous value, new value |
| Invoice Archived | User, timestamp |
| Credit Note Linked | User, timestamp, linked credit note reference |

---

# 3. What the Audit Trail Shows

For each invoice, the Audit Trail displays a chronological list of events with:

* Date and time
* User responsible
* Action taken
* Before and after values, where applicable

---

# 4. Why This Matters

In hospitality finance, price discrepancies and data errors are common sources of dispute with suppliers and confusion in reporting.

The Audit Trail allows a manager to answer:

* "Why did this product's price change?"
* "Who approved this invoice?"
* "What did the AI originally extract versus what was confirmed?"

---

# 5. Business Rules

* Audit Trail entries are immutable. They cannot be edited or deleted by any user.
* Every action covered in Section 2 must generate an audit entry automatically; it is not optional or user-triggered.
* The Audit Trail is visible to users with appropriate permission (typically Owner and General Manager roles).
* AI-suggested values that were overridden by a human must be retained in the audit record, not discarded.

---

# 6. Current Implementation Status

This is a planned capability. The underlying events described in this document occur within the application today, but a dedicated, queryable Audit Trail view has not yet been fully implemented.

Implementing this module is a near-term documentation and development priority — see `docs/07 Roadmap/Roadmap.md`.

---

# 7. Dependencies

This module depends on:

* Every Invoice sub-module (as the source of trackable events)
* Authentication (to attribute actions to users)

---

# 8. Future Improvements

* Exportable audit log per invoice or per period.
* Audit Trail extended to other modules (Products, Recipes, Stock).
* Searchable, filterable global audit log across the platform.

---

# 9. Related Documents

* 06 Review Invoice
* 07 Invoice Approval
* 08 Edit Invoice
* Authentication

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Draft   | Documents intended design; implementation in progress |
