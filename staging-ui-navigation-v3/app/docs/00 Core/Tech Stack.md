# MarginFlow - Tech Stack

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Tech Stack           |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Core Documentation   |

---

# 1. Purpose

This document defines the technology stack used to build and operate MarginFlow.

Every technology choice is listed here with the rationale behind it.

New technologies should not be introduced without updating this document.

---

# 2. Frontend

| Technology | Version | Role |
|---|---|---|
| React | 19 | UI framework |
| Vite | 6 | Build tool and dev server |
| JavaScript (ESM) | — | Language (no TypeScript) |
| Lucide React | 0.468 | Icon library |
| pdfjs-dist | 4.10 | PDF rendering and text extraction |

### Notes

The entire application is currently a single-page application built in `src/main.jsx`.

Modularisation into separate component files is planned but not yet implemented.

React 19 is used. Do not use deprecated React patterns (class components, legacy context API, etc.).

---

# 3. Styling

| Technology | Role |
|---|---|
| CSS custom properties | Design tokens (colours, spacing) |
| Custom CSS (`src/styles.css`) | All component styles |

No CSS framework is used. No Tailwind. No CSS-in-JS.

All styles live in one file: `src/styles.css`.

---

# 4. Backend and Database

| Technology | Role |
|---|---|
| Supabase | PostgreSQL database + authentication + real-time |
| Supabase Auth | User authentication (email/password) |
| localStorage | Local data fallback when Supabase is not configured |

### Supabase

Supabase is the cloud backend. The application works in local-only mode (localStorage) when Supabase is not configured.

The `isSupabaseConfigured()` helper gates all Supabase calls.

Cloud sync uses a single table: `marginflow_cloud_state`.

### localStorage

Keys follow the pattern `marginflow.<module>`.

The full list of module keys is defined in `cloudModuleDefinitions` in `src/main.jsx`.

---

# 5. AI and Serverless

| Technology | Role |
|---|---|
| Anthropic Claude API | Invoice reading and data extraction |
| Vercel Serverless Functions | API gateway for Anthropic calls |
| pdfjs-dist | PDF-to-text conversion before AI processing |

### Invoice AI Pipeline

1. User uploads PDF or image.
2. `pdfjs-dist` extracts text from PDF in the browser.
3. Extracted text is sent to `api/read-invoice-ai.js` (Vercel function).
4. The function calls the Anthropic API with a structured prompt.
5. Claude returns structured JSON (supplier, date, invoice number, line items).
6. The frontend parses the response and presents it for user review.

### Model

The current model used is `claude-sonnet-4-6` (or equivalent Sonnet model at implementation time).

Always check `.ai/SESSION_PROMPT.md` for the current recommended model.

---

# 6. Infrastructure and Deployment

| Technology | Role |
|---|---|
| Vercel | Frontend hosting + serverless functions |
| Supabase | Managed PostgreSQL and auth |

### Vercel

`vercel.json` contains routing configuration.

Serverless functions live in the `api/` directory.

### Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key |
| `ANTHROPIC_API_KEY` | Anthropic API key (server-side only) |

The `.env.example` file documents required variables.

Never commit `.env` to version control.

---

# 7. Development Tools

| Tool | Role |
|---|---|
| npm | Package manager |
| Vite dev server | Local development (`npm run dev`) |
| Supabase CLI | Local Supabase instance for development |
| Git | Version control |

### Scripts

```
npm run dev      → Start development server
npm run build    → Build for production
npm run preview  → Preview production build locally
```

---

# 8. Database Migrations

Database schema changes are managed through Supabase migrations.

Migration files live in `supabase/migrations/`.

Seed data for development is in `supabase/seed.sql`.

---

# 9. What Is Not Used

The following technologies are explicitly not part of the stack.

* TypeScript — not currently used. Do not introduce without a documented decision.
* Tailwind CSS — not used. All styles are custom.
* Redux / Zustand / Jotai — no global state management library.
* React Router — no routing library. Navigation is managed with component state.
* GraphQL — not used. Supabase is accessed via its JS client.
* Next.js — not used. This is a Vite SPA.

---

# 10. Future Considerations

The following are under consideration but not yet adopted.

* Component modularisation (splitting `main.jsx` into separate files).
* TypeScript migration.
* React Router for URL-based navigation.
* Additional AI models or providers.

Changes to the stack require documentation before implementation.

---

# 11. Related Documents

* Architecture
* CODING_RULES.md
* docs/02 Database/Tables.md
* docs/05 API/

---

# 12. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
