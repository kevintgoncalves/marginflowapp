# MarginFlow - Stock

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Stock                |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Stock module manages physical inventory through stocktakes and waste records.

It validates whether purchasing and production data align with what is actually on the shelves.

Stock is the bridge between theoretical GP (what should have happened) and actual GP (what did happen).

---

# 2. Objectives

* Record physical stock counts at regular intervals.
* Track waste separately from stocktakes.
* Calculate stock variance between theoretical and actual consumption.
* Provide accurate opening and closing stock values for GP calculations.

---

# 3. Position Within MarginFlow

```text
Invoices (purchasing data)
        ↓
Stock (physical count)
        ↓
Variance = Purchases + Opening Stock - Closing Stock - Theoretical Sales
        ↓
Reports (actual GP)
```

Stock data validates the accuracy of purchasing and production information.

---

# 4. Core Features

### Stocktake

A stocktake records the physical quantity of products at a specific point in time.

Each stocktake contains:

* Date and time
* Department (or all departments)
* Product list with quantities
* Calculated value based on current approved product prices

Stocktakes are completed at the end of a trading period (typically weekly or monthly).

### Waste Recording

Waste records items consumed outside of normal production or sales.

Each waste entry contains:

* Date
* Product
* Quantity
* Reason (optional)
* Department

Waste is tracked separately from stocktakes and contributes to variance calculations.

### Stock Valuation

The value of stock is calculated using the most recently approved invoice price for each product.

Stock value is calculated per department when a department context is selected.

---

# 5. Stocktake Workflow

```text
Select Date and Department
        ↓
Enter Quantities per Product
        ↓
Review Total Value
        ↓
Save Stocktake
```

A stocktake can be saved in progress and completed later.

A completed stocktake is used in GP calculations for the relevant period.

---

# 6. Business Rules

* Stock values use the current approved product price at the time of the stocktake.
* A stocktake cannot be back-dated beyond the previous approved stocktake without overriding it.
* Opening stock for a period is the closing stock of the previous period.
* Stock variance is calculated as: `Opening Stock + Purchases - Sales (theoretical) - Closing Stock`.
* Waste is included in consumption and reduces the stock variance.
* Products not included in a stocktake are assumed to have zero stock.

See `docs/06 Business Rules/Stock Rules.md` for full calculation logic.

---

# 7. Dependencies

This module depends on:

* Products (for product list and current prices)
* Invoices (for purchase quantities, used in variance)
* Sales (for theoretical consumption)
* Departments (for departmental stock views)

The following modules depend on Stock:

* Reports (actual GP, stock variance)
* Dashboard (latest stocktake summary)

---

# 8. Future Improvements

* Automated variance alerts when stock loss exceeds a configured threshold.
* Barcode or scanner-based stocktake entry.
* Par level management and automated reorder suggestions.
* Stock location tracking (fridge, dry store, cellar).
* Integration with electronic shelf labels.

---

# 9. Related Documents

* Products
* Invoices
* Reports
* Business Rules
* Stock Rules

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
