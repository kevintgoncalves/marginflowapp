# MarginFlow - Products

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Products             |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Products module is the central catalogue of every item purchased by the business.

Products are the shared foundation of recipes, stocktakes, purchasing analysis and GP calculations.

Every item that passes through an invoice, enters a recipe or appears in a stocktake must exist as a product.

---

# 2. Objectives

* Maintain a single, deduplicated catalogue of all purchased products.
* Track the current and historical price of each product from each supplier.
* Provide accurate ingredient costs to the recipe module.
* Enable stock tracking across stocktakes and waste records.

---

# 3. Position Within MarginFlow

```text
Invoices
    ↓
Products  ←─── (prices updated on invoice approval)
    ↓
Recipes / Stock / Reports
```

Products are created or enriched during invoice processing.

They are consumed by recipes, stocktakes and reporting.

---

# 4. Core Features

### Product Catalogue

A searchable, filterable list of all products.

Each product record contains:

* Product name
* Unit of measure (kg, litre, each, portion, etc.)
* Department
* Current price per unit (from most recent approved invoice)
* Supplier prices (one per supplier)
* Associated recipes
* Purchase history

### Supplier Prices

One product may be sold by multiple suppliers at different prices.

Supplier prices are updated automatically when an invoice is approved.

The system maintains the most recent approved price from each supplier.

### Department Allocation

Each product is associated with one operational department.

The department determines how the product's cost is allocated in GP calculations.

### Unit of Measure

Products have a defined unit of measure used consistently across recipes, invoices and stocktakes.

Unit conversions (e.g. invoice in cases, recipe in kg) are handled at the invoice line level.

---

# 5. Product List

The product list displays:

* Product name
* Unit
* Department
* Current price
* Number of suppliers
* Last purchased date

Products can be searched by name and filtered by department.

---

# 6. Product Record

Opening a product shows:

* Product details
* Supplier prices (all suppliers, current price, last updated)
* Recipe usage (which recipes use this product)
* Purchase history (invoices containing this product)
* Price trend over time

---

# 7. Business Rules

* Each product exists only once in the system.
* The same product may be purchased from multiple suppliers. Supplier prices are linked to the product, not duplicated as separate products.
* Product prices are updated only from approved invoices.
* A product cannot be deleted if it is referenced by a recipe or a stocktake.
* If an invoice line does not match any existing product, a new product is created during the invoice review workflow.
* Products created through invoice processing must be confirmed by the user before being added to the catalogue.

---

# 8. AI Integration

During invoice processing, AI attempts to match each invoice line to an existing product.

Matching outcomes:

* Exact match — high confidence match to an existing product.
* Suggested match — possible match requiring user confirmation.
* New product — no match found; user creates a new product record.

AI may suggest a match but never applies it without user confirmation.

---

# 9. Dependencies

This module depends on:

* Invoices (for price updates)
* Suppliers (for supplier price context)
* Settings (for department configuration)

The following modules depend on Products:

* Recipes
* Stock
* Reports
* Purchasing Analysis

---

# 10. Future Improvements

* Product image support.
* Automatic price change alerts (significant price increase from a supplier).
* Cheapest supplier identification per product.
* Product categories or tags for flexible grouping.
* Barcode or SKU field for POS integration.

---

# 11. Related Documents

* Invoices
* Recipes
* Stock
* Suppliers
* Department Rules
* Data Flow

---

# 12. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
