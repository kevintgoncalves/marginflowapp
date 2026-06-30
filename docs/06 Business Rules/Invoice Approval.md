# MarginFlow - Business Rule BR-001

# Invoice Approval

## Document Information

| Field    | Value            |
| -------- | ---------------- |
| Document | Invoice Approval |
| Version  | 1.0              |
| Status   | Approved         |
| Owner    | MarginFlow       |
| Category | Business Rules   |

---

# 1. Purpose

This document defines the official invoice approval process used throughout MarginFlow.

Invoice approval is one of the most important business rules within the platform.

No purchasing information becomes operational data until an invoice has been approved by the user.

---

# 2. Principle

Every imported invoice is considered **unverified** until it has been reviewed and approved.

Regardless of how the invoice was created, approval is always required.

This principle guarantees data quality across the entire platform.

---

# 3. Invoice Sources

Invoices may enter MarginFlow through one of the following methods:

* PDF upload
* Image upload
* Manual entry
* Future API integrations

The source of the invoice does not change the approval workflow.

---

# 4. Reading Methods

MarginFlow supports two invoice reading methods.

## Standard Reading

The invoice is processed without Artificial Intelligence.

Structured information is extracted using predefined rules where available.

---

## AI Reading

Artificial Intelligence analyses the document and attempts to identify:

* supplier;
* invoice number;
* invoice date;
* products;
* quantities;
* units;
* prices;
* VAT;
* totals.

AI may also suggest product matches and classifications.

Regardless of confidence, user approval remains mandatory.

---

# 5. Invoice Status

Every invoice belongs to exactly one status.

### Draft

The invoice has been created but not processed.

---

### Processing

The invoice is currently being read.

---

### Review Required

The extracted information requires user review.

The invoice cannot affect operational data.

---

### Approved

The invoice has been validated by the user.

Only approved invoices update operational data.

---

### Archived

The invoice remains available for historical reference but is no longer actively managed.

---

# 6. Approval Checklist

Before approving an invoice, the user should verify:

* supplier;
* invoice number;
* invoice date;
* VAT;
* invoice total;
* product list;
* quantities;
* prices;
* department allocation.

The system should highlight missing or potentially inconsistent information whenever possible.

---

# 7. Effects of Approval

Approving an invoice authorises MarginFlow to update operational information.

Approval may:

* create new supplier products;
* update existing product prices;
* extend supplier purchasing history;
* update reporting data;
* contribute to purchasing analytics.

Only approved information becomes part of the operational dataset.

---

# 8. Editing Approved Invoices

Approved invoices remain editable.

Whenever an approved invoice is modified:

* operational data should be recalculated where required;
* affected reports should be updated;
* supplier pricing should be refreshed if applicable;
* historical audit information should be preserved.

---

# 9. Validation Rules

The platform should prevent approval when critical information is missing.

Examples include:

* missing supplier;
* invalid totals;
* duplicated invoice numbers for the same supplier;
* incomplete product information where mandatory.

Validation rules may evolve over time without changing the overall approval workflow.

---

# 10. Audit Trail

Invoice approval is a business-critical action.

The system should record:

* approval date;
* approving user;
* modification history;
* approval source.

Operational history should remain traceable.

---

# 11. Guiding Principle

Invoice approval represents the transition from imported information to trusted operational data.

Every module consuming purchasing information assumes that approved invoices have already been validated.

---

# 12. Related Documents

* Invoices
* Suppliers
* Products
* Data Flow
* Architecture

---

# 13. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
