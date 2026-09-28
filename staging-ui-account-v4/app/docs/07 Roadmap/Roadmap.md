# MarginFlow - Roadmap

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Roadmap              |
| Version  | 1.0                  |
| Status   | Living Document      |
| Owner    | MarginFlow           |
| Category | Roadmap              |

---

# 1. Purpose

This document outlines the planned direction of MarginFlow development.

It is a living document and should be updated as priorities shift and features are completed.

Items in this roadmap are intentions, not commitments. Business needs may change the order or scope of any item.

---

# 2. Current State (June 2026)

The following capabilities are implemented and operational.

### Core

* Authentication (login, register, multi-user)
* Cloud sync via Supabase (optional; localStorage fallback)
* Department configuration
* Company and financial settings

### Invoices

* Invoice upload (PDF and image)
* AI reading via Anthropic Claude API
* Standard reading (manual review without AI)
* Manual invoice entry
* Invoice line review and editing
* Product matching during review
* Department allocation per line (single and split)
* Invoice approval workflow
* Credit note management
* Invoice list with search and filters

### Suppliers

* Supplier directory
* Delivery schedule configuration

### Products

* Product catalogue
* Supplier price tracking per product

### Recipes

* Recipe builder with ingredient costing
* Menu management
* GP calculation per recipe

### Sales

* Manual sales entry by day and department
* Date range selection

### Stock

* Stocktake entry
* Waste recording

### Labour

* Labour data entry
* Labour import from seed data

### Reports / Dashboard

* Dashboard with key metrics
* GP analysis
* Labour analysis
* Purchasing reports

---

# 3. Near-Term Priorities

Items currently planned for development in the next phase.

### Modularisation

Split `src/main.jsx` into separate component files organised by module.

This is a technical priority that enables faster development and reduces complexity.

### Database Tables Documentation

Complete `docs/02 Database/Tables.md` and `docs/02 Database/Relationships.md` with the full data model.

### Module Documentation Completion

Complete all empty files in `docs/01 Modules/` and `docs/03 AI/`.

### Invoices — Remaining Workflows

Complete documentation and implementation of:

* Standard Reading (04)
* Review Invoice (06) — detailed behaviour
* Edit Invoice (08)
* Audit Trail (14)

---

# 4. Medium-Term Features

Items planned for future development phases.

### Reporting Improvements

* Detailed purchasing analysis by supplier and product.
* Period-over-period comparison reports.
* Exportable reports (CSV, PDF).

### Multi-Site Support

* Organisation-level structure.
* Site selector in navigation.
* Cross-site reporting.

### POS Integration

* Import sales data from common POS systems.
* Automatic daily sales upload.

### AI Improvements

* Improved product matching using historical data.
* Supplier recognition accuracy improvements.
* Anomaly detection on invoice prices.
* AI-generated operational insights on the Dashboard.

### Stock Improvements

* Automated variance calculations.
* Waste trend analysis.
* Stock alerts for low inventory.

---

# 5. Long-Term Vision

The following are strategic directions rather than near-term features.

* Become the central operating platform for hospitality businesses.
* Replace all disconnected spreadsheets for the primary users.
* Support enterprise multi-site hospitality groups.
* Integrate with accounting software (Xero, QuickBooks).
* Email inbox integration for automatic invoice capture.
* Mobile application for on-the-go operational management.
* Supplier portal for electronic invoice submission.

---

# 6. Completed and Archived

Items that were considered but deprioritised or superseded.

*(None yet — this section will be populated as items are completed or archived.)*

---

# 7. How to Use This Document

When adding a new item to the roadmap:

1. Determine the appropriate phase (Near-Term, Medium-Term, Long-Term).
2. Add a brief description.
3. If a spec exists, link to it in `.specs/`.
4. Update the Changelog when an item moves from planned to completed.

---

# 8. Related Documents

* Changelog
* Ideas
* Architecture
* Project Overview

---

# 9. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | June 2026       | Initial version with current state audit |
