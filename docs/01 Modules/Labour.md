# MarginFlow - Labour

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Labour               |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Labour module tracks staff costs and measures labour efficiency relative to sales revenue.

Labour is one of the largest controllable costs in any hospitality business.

By combining labour cost with sales data, MarginFlow enables managers to understand whether staffing levels are appropriate for the revenue generated.

---

# 2. Objectives

* Record actual labour costs per day and per department.
* Calculate labour percentage against sales revenue for the same period.
* Identify periods of over- or under-staffing.
* Support both FOH (front of house) and BOH (back of house) analysis.

---

# 3. Position Within MarginFlow

```text
Labour Entry (actual cost)
        +
Sales (revenue)
        ↓
Labour % = Labour Cost / Revenue × 100
        ↓
Reports / Dashboard
```

Labour data does not affect GP. It is reported alongside GP as a separate operational metric.

---

# 4. Core Features

### Labour Entry

Labour costs are entered per day, per department or across the whole business.

Each labour record contains:

* Date
* Department
* Labour cost (wages, including employer costs as configured)
* Hours worked (optional)
* Staff category (FOH, BOH, Management, etc.)

### Weekly View

Labour is typically reviewed on a weekly basis.

The weekly view aggregates daily entries and compares total labour cost against the week's revenue.

### Labour Percentage

Labour percentage is calculated as:

```
Labour % = (Labour Cost / Revenue) × 100
```

Revenue used is the net sales for the same period and department.

### Target Comparison

Each business configures a target labour percentage in Settings.

Labour is displayed with a visual indicator showing whether the target is met, close to it or exceeded.

Default target: 32%.

### Service Charge

MarginFlow supports service charge configuration.

Settings allow defining the percentage split between FOH and BOH.

Service charge can optionally be included in or excluded from the labour cost calculation.

### Import

Labour data can be imported from CSV or compatible exports.

Seed data is available for testing and demonstration purposes.

---

# 5. Business Rules

* Labour percentage is always calculated against net sales for the same period.
* If no sales exist for a period, labour percentage cannot be calculated.
* Labour cost is always a positive value.
* Service charge allocation is configurable per business and applied consistently.
* Labour targets are configurable per department or globally.
* Labour does not affect GP, invoice costs or recipe calculations.

---

# 6. Settings Reference

Labour behaviour is configured in Settings under Labour.

| Setting | Default | Description |
|---|---|---|
| Target Labour % | 32% | Business-wide labour target |
| Weekly View | Enabled | Group labour by week |
| BOH Service Charge % | 40% | Service charge allocated to BOH |
| FOH Service Charge % | 60% | Service charge allocated to FOH |
| Include Service Charge in Labour Cost | No | Whether to add service charge to labour cost |
| Exclude Freelance from Tronc | Yes | Freelancers excluded from tronc distribution |

---

# 7. Dependencies

This module depends on:

* Sales (for revenue data used in labour % calculation)
* Settings (for targets, service charge configuration, week start)
* Departments (for departmental labour views)

The following modules depend on Labour:

* Dashboard (labour % summary card)
* Reports (labour analysis)

---

# 8. Future Improvements

* Rota integration for scheduled vs actual labour comparison.
* Individual staff cost tracking.
* Automatic import from payroll systems.
* Holiday and absence tracking.
* Agency and freelance cost separation.
* Tronc distribution calculation.

---

# 9. Related Documents

* Sales
* Reports
* Settings
* Dashboard

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
