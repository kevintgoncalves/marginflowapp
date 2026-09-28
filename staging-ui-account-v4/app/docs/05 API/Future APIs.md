# MarginFlow - API: Future APIs

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Future APIs          |
| Version  | 1.0                  |
| Status   | Living Document      |
| Owner    | MarginFlow           |
| Category | API Documentation    |

---

# 1. Purpose

This document tracks planned and candidate API integrations that are not yet implemented.

It complements `Integrations.md` (current state) by capturing direction for future development.

---

# 2. POS Direct Integrations

Replacing CSV-based import with direct, real-time API connections.

| Provider | Priority Rationale |
|---|---|
| Square | Already the default configured provider; CSV mapping exists as a foundation |
| Toast | Common in US hospitality |
| Lightspeed | Common in UK/EU hospitality |
| Tevalis | Common in UK hospitality groups |

Direct integration would enable automatic daily sales sync without manual export/import.

---

# 3. Accounting Software Integration

| Provider | Purpose |
|---|---|
| Xero | Sync approved invoices and payments for reconciliation |
| QuickBooks | Sync approved invoices and payments for reconciliation |

This would reduce duplicate data entry between MarginFlow (operational) and accounting software (financial reporting/compliance).

---

# 4. Email Integration

Automatic capture of supplier invoices sent via email.

Concept:

```text
Supplier sends invoice to a dedicated MarginFlow inbox address
        ↓
Email and attachment are retrieved automatically
        ↓
Invoice enters the standard AI Reading pipeline
        ↓
Appears in Review Required, same as manual upload
```

This would significantly reduce the manual effort of uploading invoices one by one.

---

# 5. Supplier Portal API

A future capability allowing suppliers to submit invoices directly into MarginFlow via a dedicated portal or API, bypassing email and PDF processing entirely for participating suppliers.

---

# 6. Payment Processor Integration

Potential integration with payment processors to reconcile invoice payments automatically, closing the loop between purchasing and payment status.

---

# 7. Evaluation Criteria for New Integrations

Before building a new API integration, it should be evaluated against:

* Does it reduce meaningful manual effort for the user?
* Is it consistent with the principle that humans approve financial data?
* Can the platform degrade gracefully if the integration is unavailable?
* Is there sufficient demand from current or prospective users to justify the development cost?

---

# 8. Related Documents

* Integrations.md
* Square.md
* CSV Imports.md
* docs/03 AI/AI Roadmap.md
* docs/07 Roadmap/Roadmap.md

---

# 9. Revision History

| Version | Date      | Description     |
| ------- | --------- | ---------------- |
| 1.0     | June 2026 | Initial future API directions documented |
