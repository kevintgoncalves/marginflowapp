# MarginFlow - Business Rules

## Document Information

| Field    | Value             |
| -------- | ----------------- |
| Document | Business Rules    |
| Version  | 1.0               |
| Status   | Approved          |
| Owner    | MarginFlow        |
| Category | AI Foundation     |

---

# 1. Purpose

This document defines the core business rules that govern calculations, workflows and data integrity within MarginFlow.

These rules apply across all modules.

Module-specific rules are documented in `docs/06 Business Rules/`.

---

# 2. GP (Gross Profit)

### Definition

Gross Profit measures the commercial efficiency of a business after deducting the direct cost of goods.

### Formula

```
GP % = ((Revenue - Cost of Goods) / Revenue) × 100
```

### Rules

* GP is always calculated from approved invoice data.
* GP calculations use the most recent approved supplier price for each product.
* Recipe GP uses theoretical cost based on ingredient quantities and current product prices.
* Actual GP combines sales revenue with stock and purchasing data.
* GP is never calculated from unapproved invoices.
* GP is always expressed as a percentage rounded to two decimal places.

### Thresholds

GP thresholds are configurable per business in Settings.

Default visual indicators:

| State | Meaning |
|---|---|
| Good (green) | GP meets or exceeds target |
| Warn (amber) | GP is within 5% below target |
| Below (red) | GP is more than 5% below target |

---

# 3. Invoice Rules

* An invoice does not affect operational data until it has been approved.
* Invoice approval is always performed by a human user.
* AI may suggest invoice data but never approves automatically.
* Every invoice must be linked to a supplier before approval.
* Every invoice line must be linked to a product before approval.
* Invoice totals must reconcile with the sum of approved invoice lines.
* Credit notes reduce the net purchasing value for the relevant period.
* An approved invoice cannot be deleted — only archived.
* Editing an approved invoice creates a new version or requires re-approval (behaviour to be specified per edit type).

---

# 4. Product Rules

* Each product exists only once in the system.
* The same product may be supplied by multiple suppliers at different prices.
* The most recently approved invoice price is the current price for that supplier.
* Product prices are never updated from unapproved invoices.
* Deleting a product is blocked if it is referenced by any recipe or stocktake.
* Products are identified by their internal ID, not by name. Names may vary between suppliers.

---

# 5. Supplier Rules

* Each supplier exists only once in the system.
* Supplier names are the canonical reference. Variations on invoices are matched to the existing supplier.
* A supplier cannot be deleted if it has associated invoices.
* Supplier delivery schedules are informational and do not trigger automatic actions.

---

# 6. Recipe Rules

* Recipe cost is calculated from the current product price at the time of calculation.
* Recipe cost is theoretical. It reflects what the recipe should cost based on current pricing.
* Recipes use the unit and quantity specified by the chef. Conversion to purchase units is handled by the system.
* A recipe cost is only as accurate as the product prices it relies on.
* GP from a recipe is calculated as: `((Selling Price - Recipe Cost) / Selling Price) × 100`.
* Recipes do not affect stock automatically. Stock is managed separately through stocktakes.

---

# 7. Stock Rules

* A stocktake records the physical quantity of products at a specific date and time.
* Stock variance is calculated as: `Opening Stock + Purchases - Sales (theoretical) - Closing Stock`.
* A stocktake must be completed before stock figures are considered final for a period.
* Stock values use the current approved product price at the time of the stocktake.
* Waste is recorded separately from stocktakes and contributes to variance reporting.

See `docs/06 Business Rules/Stock Rules.md` for full stock calculation logic.

---

# 8. Labour Rules

* Labour cost is recorded as actual cost per day, per department.
* Labour percentage is calculated as: `(Labour Cost / Revenue) × 100`.
* Labour is compared against revenue for the same period.
* Labour targets are configurable per business in Settings.
* Labour data does not affect GP calculations. It is reported separately.

---

# 9. Sales Rules

* Sales figures are the source of revenue data.
* Sales are entered manually or imported from a POS system.
* Sales figures are used for GP calculations, labour percentage and reporting.
* Sales are recorded per day and per department.
* Sales figures cannot be negative.

---

# 10. Departments

* Departments are used to allocate costs and revenues to operational areas.
* Default departments: Kitchen Made, Bought In, Bar, Non-food.
* Departments are configurable in Settings.
* Department types determine how GP is calculated for that area.
* Invoice lines must be allocated to a department before approval.
* A department allocation of 100% must always be maintained per invoice line.
* Split allocations across multiple departments must total exactly 100%.

See `docs/06 Business Rules/Department Rules.md` for full department logic.

---

# 11. Approval Workflow

The approval workflow applies to invoices.

```
Draft → Processing → Review Required → Approved
```

* An invoice cannot skip the Review stage.
* Only Approved invoices affect operational data.
* Approved status cannot be reverted without a documented re-approval process.
* Archiving an invoice removes it from active reporting without deleting the record.

---

# 12. Data Integrity

* Every record must have a unique `id` generated at creation time.
* Records are never truly deleted when they are referenced by other records.
* Deleting a supplier, product or recipe that is referenced by other records must be blocked with a clear explanation.
* All financial values are stored with sufficient decimal precision to avoid rounding errors in calculations.
* Dates are stored in ISO format (`YYYY-MM-DD`).

---

# 13. AI Rules

* AI extracts and suggests. It never confirms, approves or finalises.
* Every AI suggestion is presented for user review before any data changes.
* If AI confidence is low, the field must be flagged for manual review.
* AI must never invent product names, prices or supplier names.
* AI-suggested product matches require user confirmation before linking.

---

# 14. Related Documents

* docs/06 Business Rules/Department Rules.md
* docs/06 Business Rules/Stock Rules.md
* docs/02 Database/Data Flow.md
* docs/01 Modules/Invoices/07 Invoice Approval.md
* PROJECT_PRINCIPLES.md

---

# 15. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
