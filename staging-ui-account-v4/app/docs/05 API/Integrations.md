# MarginFlow - API: Integrations Overview

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Integrations Overview|
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | API Documentation    |

---

# 1. Purpose

This document provides an overview of all external integrations used by or planned for MarginFlow.

It serves as the index for the more detailed documents in this section.

---

# 2. Current Integrations

| Integration | Purpose | Status |
|---|---|---|
| Anthropic Claude API | AI invoice reading and data extraction | Active |
| Supabase | Database, authentication, cloud sync | Active |
| Square (via CSV) | Sales data import | Active |
| Vercel | Hosting and serverless functions | Active |

---

# 3. Integration Categories

### AI Integration

The Anthropic Claude API powers invoice reading. See `docs/03 AI/Invoice Reading.md` for the full pipeline and `docs/00 Core/Tech Stack.md` for environment configuration.

### Data and Auth Integration

Supabase provides the optional cloud database and authentication layer. See `docs/00 Core/Tech Stack.md` and `docs/02 Database/Tables.md`.

### POS Integration

Point of sale systems are integrated via CSV import rather than direct API connection at this stage. See `CSV Imports.md` and `Square.md`.

### Hosting Integration

Vercel hosts the frontend application and the serverless functions used for AI processing.

---

# 4. Integration Principles

* External integrations must never compromise the core principle that AI suggests and humans approve.
* The application must remain functional in a degraded mode if any single integration is unavailable (e.g. local-only mode without Supabase, manual entry without AI).
* API keys and secrets are always handled server-side (Vercel environment variables), never exposed to the browser.
* New integrations require updating this document and the relevant environment variable documentation in `docs/00 Core/Tech Stack.md`.

---

# 5. Related Documents

* Square.md
* CSV Imports.md
* Future APIs.md
* docs/03 AI/Invoice Reading.md
* docs/00 Core/Tech Stack.md

---

# 6. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
