# MarginFlow - Data Flow

## Document Information

| Field    | Value      |
| -------- | ---------- |
| Document | Data Flow  |
| Version  | 1.0        |
| Status   | Approved   |
| Owner    | MarginFlow |
| Category | Database   |

---

# 1. Purpose

This document defines how operational data moves throughout MarginFlow.

Unlike traditional applications where modules operate independently, MarginFlow is designed around a connected operational data model.

Every action performed within one module has the potential to enrich data used by multiple other modules.

Understanding this flow is essential before implementing new features or modifying existing ones.

---

# 2. Core Principle

MarginFlow is data-driven.

Modules do not exist to store information.

Modules exist to create, enrich, validate and consume operational data.

Every workflow contributes towards one shared operational dataset.

---

# 3. Operational Lifecycle

The platform follows a continuous operational lifecycle.

```text
Supplier
      │
      ▼
Invoice
      │
      ▼
Invoice Lines
      │
      ▼
Products
      │
      ▼
Recipes
      │
      ▼
Sales
      │
      ▼
Stock
      │
      ▼
Labour
      │
      ▼
Reporting
```

Every stage strengthens the quality of the information available to later stages.

---

# 4. Supplier Flow

Suppliers represent the source of purchasing information.

Each supplier provides invoices containing products and pricing.

Supplier information supports:

* purchasing history;
* price comparison;
* supplier performance;
* cheapest supplier identification.

Suppliers never exist in isolation.

Their purpose is to provide commercial context for purchased products.

---

# 5. Invoice Flow

Invoices are the primary source of purchasing data.

Invoices introduce:

* products;
* quantities;
* prices;
* VAT;
* invoice dates;
* supplier relationships.

Invoices do not affect operational reporting until they have been approved.

Approval confirms that extracted information is considered reliable.

---

# 6. Product Flow

Products become the foundation of multiple operational modules.

Products may be used by:

* recipes;
* stocktakes;
* purchasing analysis;
* supplier comparisons;
* reporting.

Products should exist only once regardless of how many suppliers sell them.

Supplier-specific pricing is linked to products rather than creating duplicate product records.

---

# 7. Recipe Flow

Recipes consume products.

Recipes generate:

* ingredient costs;
* menu costs;
* theoretical GP;
* portion costing.

Recipe accuracy depends directly on product accuracy.

---

# 8. Sales Flow

Sales measure commercial performance.

Sales combine with recipes to calculate theoretical profitability.

Sales also provide context for:

* labour analysis;
* reporting;
* operational trends.

Sales never determine product costs.

They consume operational information produced elsewhere.

---

# 9. Stock Flow

Stock validates purchasing and production.

Stock compares theoretical inventory with physical inventory.

Stock information supports:

* GP calculations;
* variance reporting;
* purchasing decisions;
* operational accuracy.

---

# 10. Labour Flow

Labour measures operational efficiency.

Labour combines with sales to produce labour percentage calculations.

Labour remains operationally independent from purchasing but contributes to overall business performance reporting.

---

# 11. Reporting Flow

Reporting consumes information from every operational module.

Reports never become the source of information.

Reports visualise existing operational data.

Whenever inconsistencies appear within reporting, the underlying operational data should be corrected rather than adjusting reports.

---

# 12. Artificial Intelligence Flow

Artificial Intelligence enhances several stages of the operational lifecycle.

AI may:

* read invoices;
* identify suppliers;
* recognise products;
* suggest product matches;
* classify operational information.

AI never bypasses user approval.

Business-critical information only becomes operational data after user confirmation.

---

# 13. Single Source of Truth

Each operational entity should exist only once.

Examples include:

* one supplier;
* one product;
* one recipe;
* one invoice.

Relationships connect entities.

They should never be duplicated simply to simplify implementation.

---

# 14. Guiding Principle

Every new feature added to MarginFlow should answer one question before implementation:

> Which operational data does this feature create, enrich, validate or consume?

If the answer is unclear, the feature probably does not belong within the platform.

---

# 15. Related Documents

* Architecture
* Database Relationships
* Business Rules
* Products
* Invoices
* Recipes

---

# 16. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
