# MarginFlow - Sales

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Sales                |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Sales module is the source of revenue data within MarginFlow.

It provides the commercial performance figures against which all other operational metrics — GP, labour percentage, purchasing cost — are measured.

Without sales data, MarginFlow cannot calculate GP or labour percentage.

---

# 2. Objectives

* Record daily revenue accurately by department.
* Support both manual entry and POS import.
* Provide the revenue base for GP and labour calculations.
* Enable period-over-period performance comparisons.

---

# 3. Position Within MarginFlow

```text
POS System / Manual Entry
        ↓
Sales
        ↓
GP Calculations / Labour % / Reports
```

Sales data is consumed by the Dashboard, GP reports and labour analysis.

---

# 4. Core Features

### Manual Sales Entry

Sales are entered per day per department.

Each entry includes:

* Date
* Department
* Gross sales (total revenue including VAT)
* Net sales (revenue excluding VAT)
* Number of covers (optional)

### Sales Input Method

The method for entering sales is configured in Settings.

Available methods:

* Manual Gross + Net Sales — user enters both gross and net values directly.
* Gross + Net from POS — values imported from a POS export.

The GP calculation base (gross or net) is also configurable.

### CSV Import

Sales data can be imported from CSV exports produced by POS systems.

CSV mapping templates can be saved per POS provider to speed up future imports.

### Date Range

Sales are viewed and filtered by configurable date ranges.

Standard ranges: Today, Yesterday, This Week, Last Week, This Month, Last Month, This Year, Custom Range.

### Department Breakdown

Sales can be viewed per department (Kitchen Made, Bar, Bought In, etc.) or across all departments combined.

---

# 5. Sales Data Structure

Each sales record contains:

* Date (ISO format: YYYY-MM-DD)
* Department name
* Gross sales value
* Net sales value
* Covers (optional)
* VAT rate applied
* Source (manual or import)

---

# 6. Business Rules

* Sales figures cannot be negative.
* Net sales must be less than or equal to gross sales.
* A day may have multiple sales records (one per department).
* If no sales are entered for a period, GP cannot be calculated for that period.
* The GP calculation base (gross or net) is applied consistently across all calculations for that organisation.
* Sales do not affect product prices, recipe costs or stock. They are consumed only for reporting.

---

# 7. POS Integration

MarginFlow is designed to accept sales exports from common POS systems.

Current support: CSV import with configurable column mapping.

Supported POS providers (via CSV): Square, and others via custom mapping.

Future: direct API integration with POS providers.

---

# 8. Dependencies

This module depends on:

* Settings (for VAT rate, sales input method, GP calculation base, week start day)
* Departments (for per-department revenue allocation)

The following modules depend on Sales:

* Dashboard
* Reports (GP analysis, labour %)
* Labour (labour % calculation)

---

# 9. Future Improvements

* Direct POS API integration (Square, Lightspeed, Toast, Tevalis, etc.).
* Automatic daily sales import via email or webhook.
* Cover count trend analysis.
* Average spend per cover calculation.
* Sales forecasting based on historical patterns.

---

# 10. Related Documents

* Labour
* Reports
* Settings
* Business Rules
* Department Rules

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
