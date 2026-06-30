# MarginFlow - Invoices: Manual Entry

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Manual Entry         |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Manual Entry allows users to create an invoice record directly within MarginFlow without uploading a source document.

This supports situations where no digital invoice exists, such as cash purchases, supplier phone orders, or invoices received in a format that cannot be processed automatically.

---

# 2. When Manual Entry Is Used

* No PDF or image of the invoice is available.
* A cash or informal purchase needs to be recorded.
* Text extraction from an uploaded document failed entirely.
* The user prefers to enter data directly rather than upload a document.

---

# 3. Workflow

```text
Start Manual Invoice
        ↓
Enter Supplier and Invoice Header
        ↓
Add Line Items
        ↓
Allocate Departments
        ↓
Review Invoice
        ↓
Approve
```

---

# 4. Invoice Header Fields

| Field | Required | Description |
|---|---|---|
| Supplier | Yes | Existing supplier or create new |
| Invoice Number | No | Supplier's reference if available |
| Invoice Date | Yes | Date of purchase |
| Due Date | No | Payment due date |
| VAT Rate | No | Defaults to the configured default VAT rate |

---

# 5. Line Item Fields

Each line item contains:

| Field | Required | Description |
|---|---|---|
| Product | Yes | Existing product or create new |
| Quantity | Yes | Number of units purchased |
| Unit | Yes | Inherited from product or specified |
| Unit Price | Yes | Price per unit |
| Department | Yes | Operational department allocation |
| Line Total | Calculated | Quantity × Unit Price |

Line items can be added or removed freely before the invoice is saved.

---

# 6. Product Selection

When adding a line item, the user searches the existing product catalogue.

If no matching product exists, a new product can be created directly from the line item form, following the same rules as AI-driven product creation.

---

# 7. Business Rules

* A manual invoice must have at least one line item before it can proceed to Review.
* Manual invoices follow the same approval workflow as AI-processed and Standard Reading invoices.
* Manual invoices are flagged with their entry method for audit purposes.
* All standard validation rules (department allocation totalling 100%, positive quantities, valid prices) apply equally to manually entered invoices.

---

# 8. Dependencies

This feature depends on:

* Suppliers (for supplier selection or creation)
* Products (for product selection or creation)
* Departments (for line allocation)

---

# 9. Future Improvements

* Duplicate invoice number detection across the same supplier.
* Quick-entry mode for recurring small purchases.
* Template invoices for regular recurring orders.

---

# 10. Related Documents

* 02 Upload Invoice
* 06 Review Invoice
* 09 Product Matching
* 10 Department Allocation
* 13 Validation Rules

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
