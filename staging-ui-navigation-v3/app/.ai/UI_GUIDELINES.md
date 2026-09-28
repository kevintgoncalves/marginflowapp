# MarginFlow - UI Guidelines

## Document Information

| Field    | Value             |
| -------- | ----------------- |
| Document | UI Guidelines     |
| Version  | 1.0               |
| Status   | Approved          |
| Owner    | MarginFlow        |
| Category | AI Foundation     |

---

# 1. Purpose

This document defines the user interface standards for MarginFlow.

Every screen, component and interaction must follow these guidelines to maintain a consistent and professional experience across the platform.

---

# 2. Design Philosophy

MarginFlow is used by hospitality professionals during busy operational periods.

The interface must be:

* immediately understandable without training;
* fast to navigate;
* consistent across every module;
* honest about uncertainty;
* never cluttered with unnecessary information.

Complexity belongs in the business logic. The interface should feel simple.

---

# 3. Theme

MarginFlow uses a dark theme exclusively.

Dark theme is not a style preference. It is the only supported mode.

Do not introduce light mode components or conditional theming.

---

# 4. Typography

| Property | Value |
|---|---|
| Font family | Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif |
| Base colour | `#e5edf7` (`--text`) |
| Muted colour | `#94a3b8` (`--muted`) |
| Rendering | `optimizeLegibility`, antialiased |

Use `--muted` for secondary labels, captions, subtitles and helper text.

Use `--text` for primary content and values.

---

# 5. Colour System

All colours are defined as CSS custom properties in `:root`.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0f172a` | Page background |
| `--card` | `#1e293b` | Card and panel backgrounds |
| `--card-soft` | `#243247` | Slightly lighter card variant |
| `--line` | `#334155` | Borders and dividers |
| `--text` | `#e5edf7` | Primary text |
| `--muted` | `#94a3b8` | Secondary text and labels |
| `--primary` | `#3b82f6` | Primary actions, active states, links |
| `--success` | `#10b981` | Positive values, approved states, GP good |
| `--warning` | `#f59e0b` | Warnings, attention required, GP warn |
| `--danger` | `#ef4444` | Errors, destructive actions, negative values |
| `--shadow` | `0 22px 70px rgba(2, 6, 23, 0.28)` | Modal and elevated surface shadows |

Never use hardcoded colour values. Always reference CSS custom properties.

---

# 6. Layout

### App Shell

The application uses a two-column grid layout.

```
sidebar (278px fixed) | workspace (fluid)
```

The sidebar is sticky and full-height.

The workspace scrolls independently.

### Workspace

Content within the workspace uses a grid with `gap: 18px` and `padding: 28px`.

### Page Grid

Most pages use `.page-grid` which is a two-column layout for main content and side panels.

### Dashboard Layout

`.dashboard-layout` provides a grid suitable for metric cards and content panels.

---

# 7. Spacing

| Use | Value |
|---|---|
| Workspace padding | `28px` |
| Card padding | `17px` (metric), `20–24px` (panel) |
| Grid gap (workspace) | `18px` |
| Grid gap (form) | `14–18px` |
| Border radius (card) | `14–16px` |
| Border radius (input) | `10px` |
| Border radius (button) | `10px` |
| Border radius (badge) | `7px` |

---

# 8. Components

### Buttons

Buttons use `display: inline-flex`, `align-items: center`, `gap: 8px`.

| Variant | Class | Use |
|---|---|---|
| Primary | `button` (default) | Main actions |
| Ghost | `button.ghost` | Secondary actions |
| Icon | `button.icon` | Icon-only actions (34×34px) |
| Danger ghost | `button.ghost.danger` | Destructive secondary |
| Danger icon | `button.icon.danger` | Destructive icon action |

Minimum height for all buttons is `38px` (except icon buttons: `34px`).

Disabled buttons use `opacity: 0.45` and `cursor: not-allowed`.

Buttons that trigger destructive actions must always require confirmation.

### Inputs

All inputs share: `min-height: 38px`, `border-radius: 10px`, `background: #111c31`, `color: var(--text)`.

Readonly inputs use `color: var(--muted)`.

### Cards and Panels

`.metric-card` — displays a single KPI with label, value and optional trend.

`.panel` — general content container with `overflow: hidden` and card background.

`.panel-head` — header row within a panel containing title and optional actions.

### Badges

`.badge` — inline status indicator. Variants: `.green`, `.amber`, `.red`.

### Modals

`.modal-backdrop` — full-screen overlay.

`.app-modal` — centred dialog. Use `.wide` for wider content (max 1180px).

`.modal-head` — modal title bar with close button.

`.modal-body` — scrollable content area.

`.modal-footer` — action buttons row.

### Tables

Standard data tables use `.table-wrap` (scrollable container) with an inner `table`.

`.invoice-review-table` — specialist table for invoice line review with editable cells.

`.sort-button` — column header sort control.

### Status Indicators

`.invoice-status` — banner component with variants: `.success`, `.error`, `.info`, `.warn`.

`.cloud-status-banner` — cloud sync status bar with variants: `.success`, `.error`, `.info`.

### Forms

`.form-grid` — responsive grid for form fields. Variants: `.three`, `.five`, `.six` for column count hints.

`.button-row` — horizontal row of action buttons. Variants: `.left`, `.tight`.

### Navigation

`nav button` — sidebar navigation item. Use `.active` class for current page.

### Metric Cards

`.metric-grid` — grid container for KPI cards. Variants: `.compact`, `.performance-grid`.

`.metric-card` — individual KPI card. Use `.good` or `.warn` on `strong` for coloured values.

---

# 9. Icons

MarginFlow uses Lucide React exclusively.

Import only the icons required per component.

Do not import the entire Lucide library.

Icon size in navigation: default Lucide size (24px).

Icon size in buttons: 16px.

Icon size in table actions: 15px.

---

# 10. Interaction Principles

### Confirmation

All destructive actions (delete, archive, override) must display a confirmation step before executing.

### Feedback

Every user action that modifies data must provide visible feedback.

Examples: success banners, updated record counts, status badge changes.

### Empty States

Every list or table must have an empty state.

Empty states explain why there is no data and offer a relevant next action.

Never show a blank page.

### Loading States

Async operations must show a visible loading indicator.

The interface must never appear frozen.

### Validation

Form validation errors must appear inline, adjacent to the relevant field.

Do not rely on browser default validation UI.

---

# 11. Terminology

Use consistent terminology throughout the interface.

| Correct | Avoid |
|---|---|
| Invoice | Bill, Document |
| Approve | Confirm, Save, Submit |
| Product | Item, SKU, Article |
| Supplier | Vendor, Provider |
| Recipe | Dish, Menu Item |
| Stocktake | Stock Count, Inventory |
| Labour | Staff Cost, Payroll |
| GP | Gross Profit, Margin |
| Department | Category (for operational departments) |
| Credit Note | Refund, Return |

---

# 12. Responsiveness

MarginFlow is a desktop-first application.

The minimum supported viewport width is `320px` for content, though the primary use case is desktop.

The sidebar collapses or adapts on narrow viewports.

Do not design for mobile-first layouts.

---

# 13. Related Documents

* docs/04 UI/Design System.md
* docs/04 UI/Components.md
* docs/04 UI/Colours.md
* docs/04 UI/Icons.md
* CODING_RULES.md

---

# 14. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
