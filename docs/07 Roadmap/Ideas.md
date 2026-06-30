# MarginFlow - Ideas

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Ideas                |
| Version  | 1.0                  |
| Status   | Living Document      |
| Owner    | MarginFlow           |
| Category | Roadmap              |

---

# 1. Purpose

This document is a holding space for ideas that have not yet been validated, prioritised or scoped.

Unlike `Roadmap.md`, which represents committed direction, Ideas is intentionally unfiltered. An idea here is not a promise — it is a candidate for future discussion.

When an idea matures into a planned feature, move it to `Roadmap.md` and, if development begins, create a spec in `.specs/draft/` using `feature-spec-template.md`.

---

# 2. How to Use This Document

* Add ideas as they occur, without needing to fully justify them upfront.
* Keep each idea brief — a sentence or two is enough.
* Periodically review this list and promote validated ideas to the Roadmap, or archive ones that no longer seem relevant.
* It's fine for ideas here to be vague, ambitious or even contradictory with each other.

---

# 3. Operational Ideas

* Par level alerts: notify when a product's stock falls below a configured minimum.
* Supplier scorecards: rate suppliers on price stability, delivery accuracy and invoice accuracy.
* Recipe version history: track how a recipe's cost and ingredients changed over time.
* Allergen and dietary tagging on recipes and menu items.
* Automated reorder suggestions based on consumption patterns and delivery schedules.

---

# 4. AI Ideas

* Natural language query bar: "What was my food GP last week?" answered directly from the Dashboard.
* AI-written weekly performance summary delivered automatically.
* Smarter product matching using purchase history and supplier context, not just text similarity.
* Anomaly detection: flag invoices with unusual price jumps automatically.

---

# 5. Reporting Ideas

* Menu engineering matrix (profitability vs popularity quadrant chart).
* Exportable, branded PDF reports for investors or accountants.
* Benchmark comparison against anonymised industry averages.
* Custom report builder with drag-and-drop metrics.

---

# 6. Integration Ideas

* Direct POS integrations beyond CSV import (Square, Toast, Lightspeed).
* Accounting software sync (Xero, QuickBooks) for invoice and payment reconciliation.
* Email inbox monitoring to automatically capture incoming supplier invoices.
* Supplier portal allowing suppliers to submit invoices directly into MarginFlow.

---

# 7. Platform Ideas

* Multi-site support for hospitality groups with shared reporting.
* Mobile app for stocktakes and labour entry on the floor.
* Role-based custom dashboards.
* White-label option for hospitality consultants managing multiple client businesses.

---

# 8. UX Ideas

* Guided onboarding checklist for new businesses setting up MarginFlow for the first time.
* Keyboard shortcuts for power users in invoice review.
* Dark/light theme toggle (currently dark-only by design — would require a documented decision to change).

---

# 9. Technical Ideas

* Modularise `src/main.jsx` into per-feature component files.
* Migrate to TypeScript for stronger type safety.
* Move from JSON-blob Supabase storage to a fully relational schema.

---

# 10. Related Documents

* Roadmap.md
* Changelog.md
* .specs/draft/

---

# 11. Revision History

| Version | Date      | Description     |
| ------- | --------- | ---------------- |
| 1.0     | June 2026 | Initial ideas list established |
