# MarginFlow - Changelog

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Changelog            |
| Version  | 1.0                  |
| Status   | Living Document      |
| Owner    | MarginFlow           |
| Category | Roadmap              |

---

# Purpose

This document records significant changes to the MarginFlow platform in reverse chronological order.

Each entry should describe what changed, why it changed and any impact on existing functionality or data.

---

# Format

```
## [Version or Date] — [Brief title]

### Added
- [New feature or capability]

### Changed
- [Modified behaviour]

### Fixed
- [Bug or issue resolved]

### Removed
- [Removed feature or behaviour]

### Notes
- [Migration notes, data impact, or anything users should know]
```

---

# Changelog

---

## June 2026 — Documentation Structure Established

### Added
- `.ai/` directory with AI context documents.
- `docs/` directory organised into 8 categories (00 Core through 07 Roadmap).
- `.specs/` directory with draft, approved and archived subdirectories.
- `.templates/` directory with reusable document templates.
- `AI_ONBOARDING.md` as the single entry point for AI assistants.
- `PROJECT_CONTEXT.md` and `PROJECT_PRINCIPLES.md` as the strategic foundation.
- Invoice module documentation (00–03) covering Overview, Invoice List, Upload and AI Reading.
- Architecture, Navigation and Project Overview core documents.
- Data Flow document in Database section.

### Notes
- Documentation is in progress. Many module docs remain empty placeholders.
- Implementation is ahead of documentation in several areas.

---

## June 2026 — Invoice AI Processing

### Added
- AI invoice reading via Anthropic Claude API.
- Vercel serverless function at `api/read-invoice-ai.js`.
- PDF text extraction using `pdfjs-dist` in the browser.
- Product matching during invoice review.
- Department allocation (single and split) per invoice line.
- Credit note management.

---

## June 2026 — Cloud Sync

### Added
- Optional Supabase synchronisation for all operational data.
- Cloud status indicator in the sidebar.
- `marginflow_cloud_state` Supabase table for state management.
- `isSupabaseConfigured()` helper for conditional cloud behaviour.

### Notes
- Application remains fully functional in local-only mode (localStorage).

---

## Earlier — Core Platform

### Added
- Authentication (login, register) via Supabase Auth.
- Sidebar navigation with all primary modules.
- Suppliers directory.
- Products catalogue with supplier price tracking.
- Invoices (upload, manual entry, approval workflow).
- Recipes with ingredient costing and GP calculation.
- Menus management.
- Sales entry.
- Stocktake and waste recording.
- Labour data entry and import.
- Dashboard with key operational metrics.
- Settings (company, financial, departments, labour, invoice preferences).

---

# Revision History

| Version | Date      | Description                  |
| ------- | --------- | ---------------------------- |
| 1.0     | June 2026 | Initial changelog established |
