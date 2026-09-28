# MarginFlow - Suppliers

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Suppliers            |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Suppliers module manages the complete directory of suppliers used by the business.

It provides the commercial context that connects purchasing documents (invoices) to the products and pricing information that flows through every other operational module.

Without suppliers, invoices cannot be linked to a source and product pricing cannot be attributed to a commercial relationship.

---

# 2. Objectives

* Maintain a single, accurate directory of all suppliers.
* Provide commercial context for every purchasing transaction.
* Enable supplier performance analysis and price comparison.
* Support AI-assisted supplier identification during invoice processing.

---

# 3. Position Within MarginFlow

Suppliers is the first module in the operational workflow.

```text
Suppliers
    ↓
Invoices
    ↓
Products / Pricing
    ↓
Recipes / Stock / Reports
```

Supplier information is referenced by invoices, products and purchasing reports.

---

# 4. Core Features

### Supplier Directory

A searchable, filterable list of all suppliers.

Each supplier record contains:

* Supplier name (canonical reference)
* Contact details (address, phone, email, website)
* Account number or reference
* Delivery schedule
* Notes
* Associated invoices
* Associated products

### Delivery Schedules

Each supplier may have a configured delivery schedule showing which days of the week they deliver.

Delivery schedules are informational. They assist users in planning purchases but do not trigger automatic actions.

### Supplier Pricing

Each supplier is linked to products through invoice-derived pricing.

The most recently approved invoice price for each product from each supplier is maintained automatically.

### Purchase History

The supplier record provides access to all invoices associated with that supplier.

---

# 5. Supplier Directory — List View

The supplier list displays:

* Supplier name
* Number of active products
* Last invoice date
* Last invoice total
* Delivery days
* Status (Active / Inactive)

Suppliers can be searched by name and filtered by status.

---

# 6. Supplier Record

Opening a supplier shows:

* All supplier details
* Current products and prices
* Invoice history
* Delivery schedule

---

# 7. Business Rules

* Each supplier must have a unique name within the system.
* A supplier cannot be deleted if it has associated invoices.
* Supplier names are the canonical reference used during AI invoice matching.
* Supplier pricing is always derived from approved invoices. It is never entered manually at the supplier level.
* If a supplier is deactivated, their invoices and pricing history remain intact.

---

# 8. AI Integration

During invoice processing, AI attempts to identify the supplier from the uploaded document.

The supplier name from the document is matched against the existing supplier directory.

If no match is found, the user may:

* select an existing supplier manually;
* create a new supplier record.

AI never creates suppliers automatically.

---

# 9. Dependencies

This module depends on:

* Settings (for organisation configuration)

The following modules depend on Suppliers:

* Invoices
* Products
* Reports
* Purchasing Analysis

---

# 10. Future Improvements

* Supplier performance scoring based on delivery accuracy and pricing trends.
* Automatic price alerts when a supplier raises prices above a threshold.
* Supplier portal for electronic invoice submission.
* Integration with supplier catalogues for product discovery.

---

# 11. Related Documents

* Invoices
* Products
* Data Flow
* Business Rules

---

# 12. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
