# MarginFlow - Glossary

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Glossary             |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Core Documentation   |

---

# 1. Purpose

This document defines the terminology used throughout MarginFlow.

Consistent terminology reduces ambiguity across documentation, code and user interface.

When the same concept appears in multiple modules, the term defined here is the authoritative reference.

---

# 2. Business Terms

### GP (Gross Profit)

The percentage of revenue remaining after deducting the direct cost of goods sold.

Formula: `((Revenue - Cost of Goods) / Revenue) × 100`

GP is the primary financial metric within MarginFlow.

---

### Gross Profit Percentage

See GP. Always expressed as a percentage, rounded to two decimal places.

---

### Revenue

Total sales income for a given period before any deductions.

---

### Cost of Goods (COGS)

The direct cost of ingredients and purchased items sold within a period.

---

### Labour Percentage

The proportion of revenue spent on labour.

Formula: `(Labour Cost / Revenue) × 100`

---

### Theoretical GP

The GP calculated from recipe costs and sales data, assuming no waste or variance.

---

### Actual GP

The GP calculated from actual purchasing costs, adjusted for stock.

---

### Variance

The difference between theoretical and actual consumption. Used in stock analysis.

---

### Department

An operational area within the business used to allocate costs and revenues.

Examples: Kitchen Made, Bought In, Bar, Non-food.

Departments are configurable per business.

---

### Department Type

A classification applied to a department that determines how GP is calculated for that area.

Available types: Food, Bar, Bought In, Non-food, Excluded.

---

### Period

A date range used for reporting and comparison. Examples: Today, This Week, This Month.

---

# 3. Operational Terms

### Supplier

A company or individual from whom the business purchases products.

Each supplier exists only once in the system.

---

### Invoice

A purchasing document received from a supplier listing products, quantities and prices.

---

### Invoice Line

A single line item on an invoice representing one product with its quantity and price.

---

### Credit Note

A document issued by a supplier to reduce a previous invoice amount.

Typically issued for returned, damaged or missing goods.

---

### Product

An item purchased from a supplier and used in recipes or sold directly.

Each product exists only once regardless of how many suppliers carry it.

---

### Supplier Price

The price at which a specific supplier sells a specific product.

One product may have multiple supplier prices.

---

### Recipe

A documented set of ingredients and quantities used to produce a menu item.

Recipes determine theoretical food cost.

---

### Menu

A collection of recipes presented as a sellable offering.

---

### Portion

A single serving of a recipe. Recipe costs are calculated per portion.

---

### Stocktake

A physical count of products held at a specific point in time.

Used to calculate actual stock levels and variance.

---

### Waste

Products consumed outside of normal production or sales. Recorded separately from stocktakes.

---

### Labour

The cost of staff wages and associated costs for a given period.

---

### POS (Point of Sale)

The system used to record customer transactions and sales. External to MarginFlow.

---

# 4. System Terms

### Approval

The action of a user confirming that invoice data is correct and ready to enter the operational dataset.

Only approved invoices affect reporting, pricing and GP calculations.

---

### Draft

An invoice that has been created but not yet processed or reviewed.

---

### Processing

The stage during which AI or standard reading extracts information from an uploaded invoice.

---

### Review Required

An invoice that has been processed and is awaiting user verification before approval.

---

### Archived

An invoice that has been removed from active reporting without being deleted.

---

### AI Reading

The invoice processing method that uses Artificial Intelligence to extract structured data from an uploaded document.

---

### Standard Reading

The invoice processing method that extracts text from a document without AI interpretation.

---

### Product Matching

The process of linking an invoice line description to an existing product in the MarginFlow catalogue.

---

### Department Allocation

The process of assigning an invoice line to one or more operational departments.

Split allocations must total 100%.

---

### Cloud Sync

The optional synchronisation of local data to Supabase for backup and multi-device access.

---

### Local Only

The operating mode when Supabase is not configured. All data is stored in localStorage.

---

# 5. UI Terms

### Workspace

The main content area to the right of the sidebar.

---

### Panel

A card-style container used to group related information or controls.

---

### Metric Card

A compact card displaying a single KPI value with label and optional trend indicator.

---

### Modal

A dialog that appears above the main content to capture user input or confirm an action.

---

### Badge

A small inline indicator used to display status, category or a count.

---

### Empty State

The state of a list or table when no records match the current filters or no records exist yet.

---

# 6. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
