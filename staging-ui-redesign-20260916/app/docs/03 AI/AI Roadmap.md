# MarginFlow - AI Roadmap

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | AI Roadmap           |
| Version  | 1.0                  |
| Status   | Living Document      |
| Owner    | MarginFlow           |
| Category | AI Documentation     |

---

# 1. Purpose

This document outlines the planned direction for AI capability within MarginFlow, separate from the general product roadmap.

AI is a strategic differentiator for the platform, so its development direction is tracked explicitly.

---

# 2. Current AI Capabilities

* AI-assisted invoice reading (text and image input) via Anthropic Claude API.
* Structured data extraction (supplier, date, line items, totals).
* Supplier detection and matching.
* Product matching with confidence scoring.

All current AI capability operates under one unbreakable principle: AI suggests, humans approve.

---

# 3. Near-Term AI Improvements

* OCR fallback for scanned PDFs without a text layer (currently routed manually).
* Confidence scoring at the field level, not only the line-item level.
* Improved product matching using supplier context as an additional signal.

---

# 4. Medium-Term AI Improvements

* AI-assisted anomaly detection: flagging unusual price increases or suspicious line items automatically.
* AI-generated insights on the Dashboard (e.g. "GP dropped 4% this week, mainly driven by rising beef prices").
* Learning from historical user corrections to improve matching accuracy over time.
* AI-assisted recipe costing suggestions based on similar existing recipes.

---

# 5. Long-Term AI Vision

* Predictive purchasing recommendations based on historical consumption patterns.
* Natural language querying of operational data ("What was my GP on the Bar last month?").
* Automated email inbox monitoring for incoming supplier invoices.
* AI-assisted menu engineering recommendations (pricing, portion size suggestions).

---

# 6. Principles Governing All AI Development

These principles apply to every AI feature added to MarginFlow, present or future.

1. AI never makes a final decision on financial data. A human always approves.
2. AI must be explainable — confidence and reasoning should be visible where practical, not a black box.
3. The platform must remain fully usable if AI is disabled or unavailable.
4. AI suggestions are always reversible and editable by the user.
5. AI must never fabricate data (e.g. inventing a price or product when extraction fails — it should leave the field empty for manual entry instead).

---

# 7. Model Strategy

MarginFlow currently uses the Anthropic Claude API exclusively.

Model selection (e.g. which Claude model version) should be reviewed periodically as new models are released, balancing accuracy, latency and cost.

The current model in use should always be confirmed against `.ai/SESSION_PROMPT.md` or the live implementation in `api/read-invoice-ai.js`, as this changes over time.

---

# 8. Related Documents

* docs/03 AI/Invoice Reading.md
* docs/03 AI/Product Matching.md
* docs/03 AI/OCR.md
* docs/03 AI/Supplier Detection.md
* docs/07 Roadmap/Roadmap.md

---

# 9. Revision History

| Version | Date      | Description            |
| ------- | --------- | ----------------------- |
| 1.0     | June 2026 | Initial AI roadmap established |
