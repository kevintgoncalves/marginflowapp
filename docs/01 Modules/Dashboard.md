# MarginFlow - Dashboard

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Dashboard            |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

The Dashboard provides a high-level operational summary of the business.

It is the first screen users see after logging in and serves as the operational command centre for daily management decisions.

The Dashboard answers one question:

> "How is my business performing right now?"

---

# 2. Objectives

* Display the most important operational metrics at a glance.
* Highlight areas that require management attention.
* Provide direct navigation to the relevant module for each metric.
* Require no configuration to be useful from day one.

---

# 3. Position Within MarginFlow

The Dashboard is the entry point to the platform.

It consumes data from every other module but creates no data of its own.

---

# 4. Core Metrics

The Dashboard displays key metrics across the primary operational areas.

### Sales

* Total revenue for the current period.
* Revenue trend versus the previous comparable period.

### GP (Gross Profit)

* Current GP percentage.
* Visual indicator of whether GP meets the configured target.

### Labour

* Labour cost for the current period.
* Labour percentage.
* Visual indicator versus target.

### Invoices

* Number of invoices awaiting approval.
* Number of invoices with issues requiring attention.

### Stock

* Latest stocktake date.
* Stock variance if available.

---

# 5. Date Range

The Dashboard defaults to the current week or current month depending on business configuration.

Users can adjust the date range using the standard range picker.

The selected range applies to all metrics simultaneously.

---

# 6. Department Context

When a department is selected, the Dashboard filters metrics to that department.

This allows managers responsible for a specific area (e.g. Bar) to see their own performance in isolation.

The department selector is available in the top bar.

---

# 7. Design Principles

### At a Glance

The most important information must be visible without scrolling.

### No Dead Ends

Every metric card links to the relevant module for deeper analysis.

### Honest About Gaps

If data is missing for a metric (e.g. no sales entered for the period), the Dashboard must show this clearly rather than displaying zero or hiding the metric.

### Non-Intrusive

The Dashboard does not interrupt the user with notifications or forced actions. It informs.

---

# 8. Scope

The Dashboard is responsible for:

* displaying operational summaries;
* surfacing items that require attention;
* providing navigation shortcuts to other modules.

The Dashboard is NOT responsible for:

* entering data;
* approving invoices;
* detailed analysis (this belongs in Reports).

---

# 9. Dependencies

The Dashboard reads data from:

* Sales
* Invoices
* Labour
* Stock
* Products
* Settings (for targets and department configuration)

---

# 10. Future Improvements

* Customisable metric layout per user or role.
* Multi-site overview for group operators.
* AI-generated operational insights and anomaly alerts.
* Trend sparklines on each metric card.

---

# 11. Related Documents

* Sales
* Invoices
* Labour
* Reports
* Settings
* Navigation

---

# 12. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
