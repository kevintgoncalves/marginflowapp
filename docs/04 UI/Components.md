# MarginFlow - UI: Components

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Components           |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | UI Documentation     |

---

# 1. Purpose

This document catalogues every reusable UI component class defined in `src/styles.css`, describing its purpose, variants and correct usage.

Use this as the reference before creating a new component class — check whether an existing one already covers the need.

---

# 2. Buttons

### `.button` (base)

Primary action button. `display: inline-flex`, `min-height: 38px`, `border-radius: 10px`.

### `.button.ghost`

Secondary, lower-emphasis action. Transparent or subtle background.

### `.button.icon`

Icon-only button, fixed 34×34px square.

### `.button.ghost.danger` / `.button.icon.danger`

Destructive secondary actions (e.g. remove a line item). Always paired with a confirmation step for irreversible actions.

### Disabled State

All button variants: `opacity: 0.45`, `cursor: not-allowed`.

---

# 3. Inputs

### Base Input

`min-height: 38px`, `border-radius: 10px`, `background: #111c31`, `color: var(--text)`.

Applies to text inputs, number inputs, selects and textareas consistently.

### Readonly Input

`color: var(--muted)` to visually distinguish from editable fields.

---

# 4. Cards and Panels

### `.metric-card`

Compact KPI display. Contains a label, a value, and optionally a trend indicator or comparison.

Use `.good` or `.warn` modifier classes on the value (`strong`) to indicate performance against target.

### `.panel`

General-purpose content container. `overflow: hidden`, card background, rounded corners.

### `.panel-head`

Header row within a panel, typically containing a title and right-aligned actions.

---

# 5. Badges

### `.badge`

Small inline status indicator.

Variants: `.green` (success/approved), `.amber` (warning/pending), `.red` (error/below target).

---

# 6. Modals

### `.modal-backdrop`

Full-screen semi-transparent overlay behind any modal.

### `.app-modal`

Centred dialog box. Default width is content-based; use `.wide` modifier for content up to 1180px wide (e.g. invoice review tables).

### `.modal-head`

Title bar containing the modal title and close button.

### `.modal-body`

Scrollable content region of the modal.

### `.modal-footer`

Action button row, typically right-aligned (Cancel / Confirm pattern).

---

# 7. Tables

### `.table-wrap`

Scrollable container wrapping a standard `<table>` element, used for horizontal overflow on smaller viewports.

### `.invoice-review-table`

Specialist table used specifically in the invoice Review screen. Supports inline editable cells for product, quantity, price and department.

### `.sort-button`

Clickable column header control indicating current sort direction.

---

# 8. Status Indicators

### `.invoice-status`

Banner component communicating invoice processing state.

Variants: `.success`, `.error`, `.info`, `.warn`.

### `.cloud-status-banner`

Indicates Supabase cloud sync status in the sidebar or settings area.

Variants: `.success`, `.error`, `.info`.

---

# 9. Forms

### `.form-grid`

Responsive grid layout for form fields.

Variants control approximate column count:
- `.three` — ~3 columns (220px min width per field)
- `.five` — ~5 columns (160px min width per field)
- `.six` — ~6 columns (170px min width per field)

### `.button-row`

Horizontal row of action buttons below a form.

Variants: `.left` (left-aligned instead of default), `.tight` (reduced gap).

---

# 10. Navigation

### `nav button`

Sidebar navigation item.

`.active` modifier applies the primary-tinted background (`rgba(59, 130, 246, 0.16)`) and white text for the current page.

---

# 11. Metric Grids

### `.metric-grid`

Container grid for arranging multiple `.metric-card` components.

Variants: `.compact` (denser layout), `.performance-grid` (layout tuned for performance/comparison metrics).

---

# 12. Layout Containers

### `.dashboard-layout`

Grid layout combining metric cards and content panels on the Dashboard.

### `.page-grid`

Standard two-column layout used across most module pages: main content plus a side panel.

---

# 13. Component Usage Rules

* Always reuse an existing component class before creating a new one.
* New components must use existing colour tokens, spacing values and border radii from the Design System — never introduce ad hoc values.
* Destructive variants (`.danger`) must always be paired with a confirmation interaction.
* Every new list-rendering component must have a corresponding empty state.

---

# 14. Related Documents

* Design System.md
* Colours.md
* .ai/UI_GUIDELINES.md
* CODING_RULES.md

---

# 15. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | Extracted directly from src/styles.css |
