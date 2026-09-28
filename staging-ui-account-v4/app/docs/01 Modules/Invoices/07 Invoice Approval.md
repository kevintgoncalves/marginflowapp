# MarginFlow - Invoices: Invoice Approval

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Invoice Approval     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Invoice Approval is the final step that confirms an invoice is correct and authorises its data to enter the operational dataset.

This is the single most important checkpoint in MarginFlow's data integrity model. Until an invoice is approved, none of its data affects product prices, GP calculations or reporting.

---

# 2. Position in the Workflow

```text
Draft → Processing → Review Required → Approved
                                            ↑
                                     (this document)
```

---

# 3. What Happens on Approval

When a user approves an invoice, the system performs the following actions:

1. The invoice status changes to Approved.
2. Product prices are updated using the approved line item prices (per supplier, per product).
3. New products created during review are formally added to the catalogue.
4. The invoice becomes available in GP calculations, purchasing reports and stock variance.
5. The approval is recorded with the approving user and timestamp for audit purposes.

---

# 4. Who Can Approve

Approval permission is governed by the role-based permission system (see Authentication).

By default, Owner and General Manager roles have edit/full access to invoice approval. Custom roles can be configured with or without this permission.

---

# 5. Pre-Approval Validation

An invoice cannot be approved unless it passes all validation checks defined in `13 Validation Rules.md`:

* All line items linked to a product.
* All line items have department allocations totalling 100%.
* Supplier and date are valid.
* No unresolved low-confidence matches remain unconfirmed.

If validation fails, the Approve action is disabled and the unresolved issues are highlighted.

---

# 6. After Approval

### Editing

Once approved, an invoice cannot be freely edited. See `08 Edit Invoice.md` for the rules governing changes to approved invoices.

### Archiving

An approved invoice can be archived, removing it from active views while preserving the historical record. Archiving does not reverse the price updates already applied.

### Deletion

Approved invoices cannot be deleted. This preserves the integrity of historical pricing and GP data.

---

# 7. Business Rules

* Only one approval action is required per invoice; there is no multi-stage approval chain by default.
* Approval is irreversible in the sense that price updates already applied are not automatically rolled back if the invoice is later archived.
* AI never approves an invoice. Approval is always a deliberate human action.
* The approving user and timestamp are permanently recorded.

---

# 8. Dependencies

This module depends on:

* 06 Review Invoice (must be completed first)
* 13 Validation Rules
* Products (price updates)
* Authentication (approval permission)

The following depend on Invoice Approval:

* Products (pricing)
* Reports (GP calculations)
* Stock (purchasing data for variance)

---

# 9. Future Improvements

* Multi-stage approval for high-value invoices (e.g. requires two approvers above a threshold).
* Approval delegation when the primary approver is unavailable.
* Bulk approval for multiple low-risk invoices at once.

---

# 10. Related Documents

* 06 Review Invoice
* 08 Edit Invoice
* 13 Validation Rules
* 14 Audit Trail
* Business Rules

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
