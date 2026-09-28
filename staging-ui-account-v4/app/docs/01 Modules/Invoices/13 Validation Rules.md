# MarginFlow - Invoices: Validation Rules

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Validation Rules     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

This document defines every validation rule that an invoice must pass before it can be approved.

These rules are the final safeguard protecting the accuracy of MarginFlow's operational dataset.

---

# 2. Header-Level Validation

| Rule | Requirement |
|---|---|
| Supplier | Must be set to an existing supplier, or a new supplier explicitly confirmed |
| Invoice Date | Must be a valid date, not in the future |
| VAT Rate | Must be a non-negative number |
| Duplicate Check | Warn if an invoice with the same supplier, number and date already exists |

---

# 3. Line Item Validation

| Rule | Requirement |
|---|---|
| Product | Every line must be linked to an existing product or a confirmed new product |
| Quantity | Must be greater than zero |
| Unit Price | Must be zero or greater (zero is allowed for free items/samples) |
| Unit | Must be set, inherited from the product if not specified |
| Department Allocation | Every line must have at least one department allocation |

---

# 4. Department Allocation Validation

| Rule | Requirement |
|---|---|
| Total Allocation | All splits for a line must sum to exactly 100% |
| Minimum Split | Each split portion must be at least 1% |
| Valid Department | Each allocated department must exist and be active |

---

# 5. Total Reconciliation

| Rule | Requirement |
|---|---|
| Line Total Sum | Sum of all line totals should equal the invoice total |
| Tolerance | A small tolerance (e.g. rounding differences under the smallest currency unit) is acceptable |
| Discrepancy Handling | If the sum does not reconcile within tolerance, the discrepancy is flagged for user acknowledgment before approval |

---

# 6. Product Matching Validation

| Rule | Requirement |
|---|---|
| Unresolved Suggestions | No line items may remain in "Needs confirmation" status |
| New Product Confirmation | New products must be explicitly confirmed, not silently created |

---

# 7. Approval Gate

An invoice's Approve action is disabled (greyed out or blocked) unless all of the above validations pass.

Each failing validation is displayed to the user with a clear explanation of what needs to be corrected.

---

# 8. Validation Timing

Validation runs:

* Continuously while editing in Review Invoice (real-time feedback).
* As a final check immediately before the Approve action executes.

---

# 9. Business Rules

* Validation rules apply identically regardless of entry method (AI Reading, Standard Reading, Manual Entry).
* Validation cannot be bypassed by any user role.
* A validation failure never silently allows approval; it always blocks the action with visible feedback.

---

# 10. Dependencies

This document governs:

* 06 Review Invoice
* 07 Invoice Approval
* 09 Product Matching
* 10 Department Allocation

---

# 11. Future Improvements

* Configurable tolerance thresholds for total reconciliation.
* Custom validation rules per business (e.g. mandatory invoice number).
* Warning-level vs blocking-level validation distinction.

---

# 12. Related Documents

* 06 Review Invoice
* 07 Invoice Approval
* 09 Product Matching
* 10 Department Allocation

---

# 13. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
