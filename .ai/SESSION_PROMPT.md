# MarginFlow - Session Prompt

## Document Information

| Field    | Value             |
| -------- | ----------------- |
| Document | Session Prompt    |
| Version  | 1.0               |
| Status   | Approved          |
| Owner    | MarginFlow        |
| Category | AI Foundation     |

---

# Purpose

This document contains the standard prompt used to initialise any AI development session on the MarginFlow project.

Copy and paste this prompt at the beginning of every new AI session before describing the task.

---

# Standard Session Prompt

```
You are working on MarginFlow, a hospitality operations platform built with React 19, Vite, Supabase and the Anthropic API.

Before we begin, please acknowledge the following context:

PRODUCT
MarginFlow centralises purchasing, recipes, stock, labour and sales for hospitality businesses. Every module contributes to one shared operational dataset. No module exists in isolation.

TECH STACK
- React 19 + Vite (frontend)
- Supabase (PostgreSQL + Auth)
- CSS custom properties (dark theme, no Tailwind)
- Lucide React (icons)
- pdfjs-dist (PDF processing)
- Anthropic API via Vercel serverless function (AI invoice reading)
- All application logic currently lives in src/main.jsx

PRINCIPLES YOU MUST FOLLOW
1. Documentation is the specification. Do not invent undocumented behaviour.
2. AI never approves data automatically. Users always confirm.
3. Single source of truth. Never duplicate entities.
4. Simplicity in the UI. Complexity belongs in business logic.
5. Every change must integrate naturally with existing modules.

BEFORE IMPLEMENTING ANYTHING
- Ask which docs are relevant if uncertain.
- Distinguish clearly between existing functionality and proposals.
- If a business rule is unclear, say so rather than inventing one.

TODAY'S TASK
[Describe your task here]
```

---

# Task-Specific Additions

Depending on the session task, append the relevant section below.

---

## Working on a Module

```
The module we are working on today is: [MODULE NAME]

Relevant documentation:
- docs/01 Modules/[Module].md
- docs/06 Business Rules/ (if applicable)
- docs/02 Database/Tables.md (if data model is involved)

Please read and confirm you understand the module scope before proposing changes.
```

---

## Working on the Database

```
We are modifying the data model today.

Current data is stored in localStorage with keys following the pattern marginflow.<module>.
Supabase sync is optional and uses the marginflow_cloud_state table.

Do not introduce duplicate fields or create new entities for data that already exists elsewhere.
Always check docs/02 Database/Relationships.md before proposing schema changes.
```

---

## Working on AI Features

```
We are working on an AI-assisted feature today.

The AI pipeline uses:
- pdfjs-dist to extract text from PDFs
- Vercel serverless function at api/read-invoice-ai.js
- Anthropic Claude API (claude-sonnet model)
- Structured JSON output parsed by the frontend

AI rules:
- AI suggests. Users approve.
- Never auto-approve any financial or operational data.
- Confidence scoring is internal. It influences UI attention, not automatic decisions.
```

---

## Working on UI

```
We are working on the user interface today.

Design system:
- Dark theme only (color-scheme: dark)
- Font: Inter
- CSS custom properties defined in :root (see docs/04 UI/Design System.md)
- No Tailwind. Custom CSS only in src/styles.css.
- Icons: Lucide React

Key colours:
--bg: #0f172a
--card: #1e293b
--primary: #3b82f6
--success: #10b981
--warning: #f59e0b
--danger: #ef4444
--text: #e5edf7
--muted: #94a3b8

All new components must follow the existing pattern in src/styles.css.
Do not introduce inline styles for values that belong in CSS variables.
```

---

# Notes

This prompt is designed to be modular.

Use the Standard Session Prompt as the base and append only the sections relevant to the current task.

Keep sessions focused on one area at a time.

---

# Related Documents

- AI_ONBOARDING.md
- PROJECT_CONTEXT.md
- PROJECT_PRINCIPLES.md
- CODING_RULES.md
- UI_GUIDELINES.md

---

# Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
