# MarginFlow - Invoices: Department Allocation

## Document Information

| Field    | Value                   |
| -------- | ----------------------- |
| Document | Department Allocation   |
| Version  | 1.0                     |
| Status   | Approved                |
| Owner    | MarginFlow              |
| Category | Module Documentation    |

---

# 1. Purpose

Department Allocation assigns the cost of each invoice line item to one or more operational departments.

This allocation determines how purchasing costs flow into department-level GP calculations, making it one of the most financially significant steps in invoice processing.

---

# 2. Position in the Workflow

```text
Product Matching
        ↓
Department Allocation (this document)
        ↓
Review Invoice → Approval
```

---

# 3. How Allocation Works

### Single Department

By default, each invoice line is allocated entirely (100%) to a single department.

The default department for new lines is configurable in Settings (default: Kitchen Made).

### Split Allocation

A line can be split across multiple departments when the purchased item is shared.

Example: a delivery of cleaning supplies might be split 50% Kitchen Made, 50% Bar.

Each split portion specifies:

* Department name
* Percentage of the line value

The total of all splits for a line must equal exactly 100%.

---

# 4. Default Department Logic

When a line is created from a matched or new product, the system pre-fills the department based on:

1. The product's previously recorded department (if it exists in the catalogue).
2. The invoice's default department setting (if the product has no department history).
3. Manual selection by the user.

---

# 5. Business Rules

* Every invoice line must have a department allocation before the invoice can be approved.
* Split allocations must sum to exactly 100%. The system blocks approval if they do not.
* A minimum allocation of 1% per department in a split is required; smaller fractions are not supported.
* Department allocation can be changed during Review without restriction.
* Once an invoice is approved, changing department allocation is treated as a restricted edit (see `08 Edit Invoice.md`).

---

# 6. Why Department Allocation Matters

GP calculations are performed per department. An invoice line allocated to the wrong department will:

* incorrectly inflate or deflate that department's GP;
* misattribute purchasing cost in reports;
* potentially mask real performance issues in the correct department.

Accurate allocation is essential to trustworthy reporting.

---

# 7. Dependencies

This feature depends on:

* Settings (department configuration, default department)
* Department Rules (business logic governing department types)

The following depend on Department Allocation:

* Reports (department-level GP)
* Dashboard (department filtering)

---

# 8. Future Improvements

* Allocation templates for recurring split patterns (e.g. always split a specific supplier's deliveries the same way).
* Allocation suggestions based on historical patterns for the same product.
* Department allocation by quantity rather than percentage for mixed-unit deliveries.

---

# 9. Related Documents

* 06 Review Invoice
* 07 Invoice Approval
* 13 Validation Rules
* Department Rules

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
