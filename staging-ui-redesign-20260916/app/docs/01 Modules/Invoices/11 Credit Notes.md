# MarginFlow - Invoices: Credit Notes

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Credit Notes         |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Credit Notes record reductions to previously approved invoices, typically issued by a supplier for returned, damaged or missing goods, or pricing corrections.

Credit Notes preserve the integrity of the original invoice record while accurately reflecting the net purchasing value for a period.

---

# 2. Why Credit Notes Instead of Editing

Editing an approved invoice directly would silently change historical figures without a clear record of why.

A Credit Note is a separate, linked record that explains the adjustment, preserving full audit clarity.

This is the recommended correction mechanism described in `08 Edit Invoice.md`.

---

# 3. Workflow

```text
Identify Need for Correction
        ↓
Create Credit Note
        ↓
Link to Original Invoice (optional but recommended)
        ↓
Enter Credit Line Items
        ↓
Allocate Departments
        ↓
Approve Credit Note
```

---

# 4. Credit Note Structure

| Field | Required | Description |
|---|---|---|
| Supplier | Yes | Must match the original invoice's supplier |
| Linked Invoice | No | Reference to the original invoice, if applicable |
| Credit Note Number | No | Supplier's reference |
| Date | Yes | Date of the credit |
| Line Items | Yes | Products and quantities being credited |
| Department Allocation | Yes | Same rules as standard invoices |

---

# 5. Effect on Calculations

Credit Notes reduce the net purchasing value for the relevant supplier, product and department in the period they are approved.

```
Net Purchases = Sum of Approved Invoices - Sum of Approved Credit Notes
```

Credit Notes affect:

* Purchasing reports
* GP calculations (as a reduction in cost of goods)
* Product price history is not changed by a credit note; it only affects total spend

---

# 6. Business Rules

* A credit note must be linked to a valid supplier.
* Credit note line items follow the same product matching rules as standard invoices.
* Credit notes require department allocation following the same 100% rule as invoices.
* Credit notes follow the same approval workflow as invoices — they do not affect data until approved.
* A credit note can reference an original invoice for traceability but is not required to.

---

# 7. Dependencies

This feature depends on:

* Invoices (the records being corrected)
* Suppliers
* Products
* Department Allocation rules

---

# 8. Future Improvements

* Automatic suggestion of the original invoice when creating a credit note for the same supplier and product.
* Partial credit note tracking against an invoice (e.g. 2 of 10 units credited).
* Credit note expiry or follow-up reminders for outstanding supplier credits.

---

# 9. Related Documents

* 07 Invoice Approval
* 08 Edit Invoice
* 10 Department Allocation
* Business Rules

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
