# MarginFlow - Invoices: Edit Invoice

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Edit Invoice         |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

This document defines how invoices can be edited at different stages of their lifecycle, and the constraints that protect data integrity once an invoice has been approved.

---

# 2. Editing by Status

| Status | Editable | Notes |
|---|---|---|
| Draft | Fully editable | No restrictions |
| Processing | Not editable | Wait for processing to complete |
| Review Required | Fully editable | This is the intended editing stage |
| Approved | Restricted | See section 3 |
| Archived | Not editable | Must be unarchived first |

---

# 3. Editing Approved Invoices

Once an invoice is approved, its data has already affected product prices, GP calculations and reporting. Editing it freely would silently corrupt historical figures.

### Allowed Without Restriction

* Administrative fields: notes, internal references, tags.
* Department re-allocation, with a recorded reason.

### Restricted (Requires Re-Approval)

* Line item quantities or prices.
* Line item product matches.
* Supplier change.
* Invoice total.

Editing a restricted field on an approved invoice triggers one of the following, depending on configuration:

* The change is recorded and the invoice returns to Review Required status for re-approval.
* The change is blocked entirely, requiring a credit note and new invoice instead.

The exact behaviour is configurable and should be confirmed against current implementation before relying on it.

---

# 4. Why This Matters

If an approved invoice's price is silently changed:

* historical GP reports become inaccurate without explanation;
* product price history loses integrity;
* audit trail cannot explain why figures changed.

This is why restricted fields require a deliberate re-approval step rather than a silent edit.

---

# 5. Business Rules

* Every edit to an approved invoice must be attributable to a user and timestamp.
* Editing a restricted field always re-triggers the relevant validation rules.
* Edits to approved invoices should be visible in the Audit Trail.
* Bulk edits across multiple invoices are not supported; each invoice is edited individually.

---

# 6. Recommended Alternative: Credit Notes

For corrections to approved invoices (wrong price, returned goods, incorrect quantity), the recommended approach is to issue a Credit Note rather than editing the original invoice.

This preserves the original record while accurately reflecting the correction.

See `11 Credit Notes.md`.

---

# 7. Dependencies

This feature depends on:

* 07 Invoice Approval
* 13 Validation Rules
* 14 Audit Trail

---

# 8. Future Improvements

* Formal versioning for approved invoice edits.
* Configurable approval workflow for edits above a value threshold.
* Side-by-side diff view showing what changed and when.

---

# 9. Related Documents

* 07 Invoice Approval
* 11 Credit Notes
* 14 Audit Trail
* 13 Validation Rules

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
