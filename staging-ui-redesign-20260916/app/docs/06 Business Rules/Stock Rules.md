# MarginFlow - Stock Rules

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Stock Rules          |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Business Rules       |

---

# 1. Purpose

This document defines the business rules governing stock tracking, valuation and variance calculation within MarginFlow.

---

# 2. Stock Valuation

Stock is valued using the most recently approved product price at the time of the stocktake.

```
Stock Value = Σ (Quantity Counted × Current Approved Unit Price)
```

If a product's price has changed since it was last purchased, the current price is still used for valuation, since this reflects the cost to replace the stock, not the historical purchase cost.

---

# 3. Opening and Closing Stock

### Closing Stock

The value recorded at the most recent completed stocktake for a period.

### Opening Stock

The closing stock value of the immediately preceding period.

```
Opening Stock (Period N) = Closing Stock (Period N-1)
```

If no prior stocktake exists, opening stock is treated as zero, and this is flagged to the user as it will distort variance calculations for the first period.

---

# 4. Variance Calculation

Stock variance measures the difference between expected stock levels (based on purchasing and theoretical sales) and the actual physical count.

```
Expected Closing Stock = Opening Stock + Purchases - Theoretical Consumption - Waste

Variance = Expected Closing Stock - Actual Closing Stock
```

### Theoretical Consumption

Calculated from sales data combined with recipe costs — the quantity of each product that should have been used based on what was sold.

### Interpreting Variance

| Result | Meaning |
|---|---|
| Variance ≈ 0 | Stock matches expectations |
| Positive variance | Less stock used than expected (potential over-portioning error in recipe data, or unrecorded sales) |
| Negative variance | More stock used than expected (potential waste, theft, over-portioning, or unrecorded waste) |

---

# 5. Waste Handling

Waste is recorded separately from stocktakes but is included as a deduction in the variance formula.

Waste not recorded (e.g. spillage not logged) will appear as unexplained negative variance rather than properly attributed waste.

---

# 6. Stocktake Timing

* A stocktake reflects the physical state of stock at a specific date and time, not an average over a period.
* Stocktakes should be conducted at consistent intervals (commonly weekly) for variance trends to be meaningful.
* A stocktake can be scoped to a single department or to all departments.

---

# 7. Back-Dating and Corrections

* A stocktake should not be back-dated to a point before the previous approved stocktake without explicit override, since this would invalidate the opening/closing stock chain for that period.
* Corrections to a completed stocktake should be made by editing the specific stocktake record directly; this recalculates all dependent variance figures for the affected period.

---

# 8. Department Scoping

When a department context is active, stock values, opening/closing figures and variance are calculated using only products allocated to that department.

See `Department Rules.md` for department allocation logic.

---

# 9. Business Rules Summary

* Stock value always uses current approved prices, not historical purchase prices.
* Opening stock must always equal the prior period's closing stock for variance to be meaningful.
* Waste must be logged separately to be correctly attributed in variance, rather than appearing as unexplained loss.
* Products not counted in a stocktake are assumed to have zero stock for that stocktake.

---

# 10. Related Documents

* Stock
* Department Rules
* Reports
* Business Rules (AI Foundation)

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
