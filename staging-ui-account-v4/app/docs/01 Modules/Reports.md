# MarginFlow - Reports

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Reports              |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Reports module consolidates operational data from every module into meaningful analysis.

It is the final stage of the MarginFlow data lifecycle — where purchasing, production, sales, stock and labour data combine to produce the financial and operational picture of the business.

Reports never create data. They visualise and analyse existing operational information.

---

# 2. Objectives

* Provide accurate GP analysis by period and by department.
* Combine purchasing, sales and stock data into a single performance view.
* Enable period-over-period comparisons.
* Support management decision-making with reliable operational data.

---

# 3. Position Within MarginFlow

```text
Invoices + Sales + Stock + Labour
        ↓
Reports (analysis and visualisation)
```

Reports are the read-only output of the entire operational dataset.

---

# 4. Core Report Types

### GP Report

The primary report in MarginFlow.

Calculates actual GP for a selected period and department.

Components:

* Revenue (from Sales)
* Cost of goods (from approved Invoices)
* Opening stock value (from Stocktakes)
* Closing stock value (from Stocktakes)
* Waste (from Waste records)
* Net purchases for period
* Actual GP %

Formula:

```
Actual GP % = ((Revenue - Net Cost of Goods) / Revenue) × 100

Net Cost of Goods = Opening Stock + Purchases - Closing Stock - Waste
```

### Labour Report

Combines labour cost with revenue to produce:

* Total labour cost for the period
* Labour percentage
* Comparison against target
* Breakdown by department

### Purchasing Report

Summarises purchasing activity for a period.

Includes:

* Total spend by supplier
* Total spend by product
* Total spend by department
* Price trend per product over time
* Cheapest supplier per product

### Period Comparison

Side-by-side comparison of two periods.

Allows managers to understand whether performance is improving or declining.

---

# 5. Date Range and Filters

All reports support the standard date range selector.

Standard ranges: Today, Yesterday, This Week, Last Week, This Month, Last Month, This Year, Custom Range.

Reports can be filtered by department.

When a department is selected, all report figures are scoped to that department.

---

# 6. Business Rules

* Reports only include data from approved invoices. Unapproved invoices are excluded from all calculations.
* GP calculations follow the rules defined in `docs/06 Business Rules/`.
* If no stocktake exists for a period, theoretical stock movement is used and this is clearly indicated.
* Reports cannot be modified. If a figure appears incorrect, the underlying operational data must be corrected.
* Period comparisons must use consistent methodology across both periods.

---

# 7. Principle: Correct the Source, Not the Report

If a report shows an unexpected result, the correct action is always to:

1. Identify the source of the incorrect data.
2. Correct the data in the relevant module (Invoices, Sales, Stock, Labour).
3. The report will update automatically.

Reports must never be adjusted directly to produce a desired output.

---

# 8. Dependencies

Reports read data from every operational module:

* Sales (revenue)
* Invoices (purchasing cost)
* Stock (opening and closing values)
* Labour (staff costs)
* Products (current prices for stock valuation)
* Settings (GP targets, financial settings, department configuration)

---

# 9. Future Improvements

* Exportable reports in CSV and PDF format.
* Scheduled report delivery by email.
* Custom report builder.
* Executive summary with AI-generated narrative.
* Benchmarking against industry averages.
* Multi-site consolidated reporting.

---

# 10. Related Documents

* Sales
* Invoices
* Stock
* Labour
* Business Rules
* Department Rules
* Stock Rules

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
