# MarginFlow

## Overview

MarginFlow is a hospitality management platform designed to centralise operational and financial data into a single, integrated system.

The platform replaces disconnected spreadsheets and manual workflows with a structured application that provides accurate operational insights across purchasing, suppliers, invoices, products, recipes, stock, labour, sales and reporting.

MarginFlow is designed to support hospitality businesses of all sizes, from independent cafés and restaurants to multi-site operations.

---

# Documentation

The project documentation is organised into logical sections.

```
docs/
│
├── 00 Core
├── 01 Modules
├── 02 Database
├── 03 AI
├── 04 UI
├── 05 API
├── 06 Business Rules
└── 07 Roadmap
```

Each section documents one specific aspect of the platform.

The documentation should be considered the authoritative specification of the application.

---

# AI Context

The project also contains an `.ai` directory.

This directory provides structured context for AI development assistants such as ChatGPT, Codex, Claude and other compatible tools.

AI assistants should always load the contents of the `.ai` directory before interpreting the project documentation.

---

# Project Structure

```
.ai/
Context and instructions for AI assistants.

docs/
Official functional specification.

.specs/
Draft specifications under discussion.

.templates/
Reusable documentation templates.

src/
Application source code.
```

---

# Documentation Principles

The documentation follows several principles.

* Single source of truth.
* One subject per document.
* Clear separation between approved functionality and future ideas.
* Business rules are documented independently from implementation.
* Documentation is written before implementation whenever possible.

---

# Development Workflow

Every new feature follows the same lifecycle.

```
Idea

↓

Specification (.specs)

↓

Review

↓

Approval

↓

Documentation (docs)

↓

Implementation

↓

Testing

↓

Release
```

---

# Versioning

Documentation evolves alongside the application.

Changes to approved functionality should always be reflected in the relevant documentation.

---

# Contributing

When modifying the application:

1. Update the relevant specification.
2. Update the corresponding documentation.
3. Implement the required changes.
4. Verify that business rules remain consistent.
5. Commit both code and documentation.

---

# Licence

Private project.

MarginFlow documentation and source code are proprietary.
