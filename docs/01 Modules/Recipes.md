# MarginFlow - Recipes

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Recipes              |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Recipes module allows hospitality businesses to document their dishes and calculate their theoretical food cost.

By connecting menu items to purchased ingredients, the Recipes module bridges the gap between purchasing and commercial performance.

A recipe is the financial blueprint of a dish. Without accurate recipes, GP calculations are based on estimates rather than real operational data.

---

# 2. Objectives

* Provide accurate theoretical food cost for every menu item.
* Calculate the GP of each recipe based on current ingredient prices.
* Enable menu engineering decisions using real cost data.
* Connect purchasing data directly to menu performance.

---

# 3. Position Within MarginFlow

```text
Products (ingredient prices)
    ↓
Recipes (theoretical cost)
    ↓
Sales (revenue)
    ↓
Reports (GP analysis)
```

Recipes consume product prices and produce cost data consumed by reporting.

---

# 4. Core Features

### Recipe Builder

A tool for creating and editing recipes.

Each recipe contains:

* Recipe name
* Number of portions
* Ingredients (linked products with quantities)
* Preparation notes (optional)
* Selling price (per portion)

### Cost Calculation

For each recipe, MarginFlow calculates:

* Total ingredient cost
* Cost per portion
* GP percentage based on current selling price
* GP value per portion

Calculations use the current approved product price at the time of calculation.

### Menu Management

Recipes are organised into menus.

A menu groups related recipes (e.g. a lunch menu, a dinner menu, a cocktail list).

Menus can have their own selling prices or inherit them from individual recipes.

### Recipe List

A searchable, filterable list of all recipes.

Displays: name, cost per portion, selling price, GP%, department.

---

# 5. Business Rules

* Recipe cost is theoretical. It reflects what a dish should cost based on current prices, not what it actually cost.
* Recipe GP is calculated as: `((Selling Price - Cost per Portion) / Selling Price) × 100`.
* Cost is recalculated automatically when product prices change following invoice approval.
* A recipe cannot be saved without at least one ingredient.
* Recipes reference products by ID. If a product price changes, all recipes using that product reflect the new cost immediately.
* Recipes do not affect stock. Stock is managed through stocktakes.

---

# 6. GP Visual Indicators

Recipe GP is displayed with visual indicators based on configured targets.

| State | Meaning |
|---|---|
| Good (green) | GP meets or exceeds the configured target |
| Warn (amber) | GP is within the warning threshold |
| Below (red) | GP falls below the minimum acceptable level |

Targets are configured in Settings.

---

# 7. Unit Handling

Ingredient quantities in recipes use the unit of the product as purchased.

For example, if beef is purchased by the kilogram, the recipe specifies grams or kilograms.

Unit conversions between purchase unit and recipe unit are handled consistently across the system.

---

# 8. Dependencies

This module depends on:

* Products (for ingredient costs)
* Settings (for GP targets and department configuration)

The following modules depend on Recipes:

* Sales (for theoretical GP comparison)
* Reports

---

# 9. Future Improvements

* Sub-recipes (recipes that use other recipes as ingredients).
* Version history for recipes (track cost changes over time).
* Menu engineering matrix (popularity vs profitability analysis).
* Print-ready recipe cards with costing summary.
* Allergen tracking per ingredient.

---

# 10. Related Documents

* Products
* Sales
* Reports
* Business Rules
* Department Rules

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
