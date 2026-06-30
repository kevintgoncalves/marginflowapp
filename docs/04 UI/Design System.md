# MarginFlow - Design System

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Design System        |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | UI Documentation     |

---

# 1. Purpose

This document defines the design system used throughout MarginFlow.

It is the authoritative reference for all visual decisions including colours, typography, spacing, layout and interactive states.

All new UI work must be consistent with this system.

---

# 2. Theme

MarginFlow uses a dark theme exclusively.

```css
color-scheme: dark;
background: #0f172a;
color: #e5edf7;
```

There is no light mode. Do not introduce conditional theming.

---

# 3. Colour Tokens

All colours are defined as CSS custom properties in `:root` inside `src/styles.css`.

Always use tokens. Never use hardcoded hex values in component styles.

### Backgrounds

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0f172a` | Page background |
| `--card` | `#1e293b` | Cards, panels, modals |
| `--card-soft` | `#243247` | Slightly elevated card variant |
| `#111827` | — | Sidebar background (direct value, consider tokenising) |
| `#111c31` | — | Input background (direct value, consider tokenising) |
| `#172033` | — | Sidebar card, auth card backgrounds |
| `#29384f` | — | Ghost button, icon button background |

### Borders

| Token | Value | Use |
|---|---|---|
| `--line` | `#334155` | All borders and dividers |

### Text

| Token | Value | Use |
|---|---|---|
| `--text` | `#e5edf7` | Primary text |
| `--muted` | `#94a3b8` | Secondary text, captions, labels |

### Semantic

| Token | Value | Use |
|---|---|---|
| `--primary` | `#3b82f6` | Primary actions, active states, links |
| `--success` | `#10b981` | Positive indicators, approved, GP good |
| `--warning` | `#f59e0b` | Warnings, GP near threshold |
| `--danger` | `#ef4444` | Errors, destructive actions, negative GP |

### Semantic Surfaces (rgba overlays)

| Use | Value |
|---|---|
| Primary surface (nav active) | `rgba(59, 130, 246, 0.16)` |
| Primary border | `rgba(59, 130, 246, 0.3–0.45)` |
| Success surface | `rgba(16, 185, 129, 0.16)` |
| Success border | `rgba(16, 185, 129, 0.38)` |
| Warning border | `rgba(245, 158, 11, 0.38)` |
| Danger surface | `rgba(239, 68, 68, 0.12–0.16)` |
| Danger border | `rgba(239, 68, 68, 0.42)` |

### Shadow

| Token | Value | Use |
|---|---|---|
| `--shadow` | `0 22px 70px rgba(2, 6, 23, 0.28)` | Modals, elevated surfaces |

---

# 4. Typography

| Property | Value |
|---|---|
| Font family | Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif |
| Rendering | `optimizeLegibility`, `-webkit-font-smoothing: antialiased` |
| Base size | Browser default (16px) |
| Small text | `13px` (muted labels, captions) |
| Tiny text | `11–12px` (badges, overlines) |
| Panel heading | `18px` |
| Modal heading | `20px` |
| Page heading | `26px` (auth) |

All inputs, buttons and form controls inherit the base font via `font: inherit`.

---

# 5. Spacing Scale

| Context | Value |
|---|---|
| Workspace padding | `28px` |
| Workspace grid gap | `18px` |
| Form grid gap | `14–16px` |
| Card padding (metric) | `17px` |
| Card padding (panel) | `20–24px` |
| Button padding | `0 14px` |
| Input padding | `0 11px` |
| Sidebar padding | `24px 18px` |
| Nav item gap | `4px` |
| Badge padding | `3px 9px` |

---

# 6. Border Radius Scale

| Element | Radius |
|---|---|
| Modal | `16px` |
| Card / Panel | `14–16px` |
| Sidebar card | `14px` |
| Input | `10px` |
| Button | `10px` |
| Brand mark | `12px` |
| Badge | `7px` |
| Bar chart track | `99px` |

---

# 7. Interactive States

### Buttons

| State | Visual |
|---|---|
| Default | Background + full opacity |
| Hover | Slight brightness shift (browser default) |
| Disabled | `opacity: 0.45`, `cursor: not-allowed` |
| Active (nav) | `rgba(59, 130, 246, 0.16)` background, `#fff` text |

### Inputs

| State | Visual |
|---|---|
| Default | `background: #111c31`, `color: var(--text)` |
| Readonly | `color: var(--muted)` |
| Focus | Browser default outline (do not remove) |

---

# 8. Layout System

### App Shell

```css
display: grid;
grid-template-columns: 278px minmax(0, 1fr);
min-height: 100vh;
```

### Workspace

```css
display: grid;
gap: 18px;
align-content: start;
padding: 28px;
```

### Page Grid

Two-column layout for main content and side panels.

### Dashboard Layout

Grid for metric cards and content panels. Secondary variant for narrower panels.

### Metric Grid

Responsive grid for KPI cards. Variants: `.compact`, `.performance-grid`.

### Form Grid

Responsive grid for form fields.

Variants control approximate column count:
- `.three` — 3 columns (~220px min)
- `.five` — 5 columns (~160px min)
- `.six` — 6 columns (~170px min)

---

# 9. Elevation

MarginFlow uses three levels of visual elevation.

| Level | Example | Treatment |
|---|---|---|
| Base | Page background | `--bg` |
| Raised | Cards, panels | `--card` |
| Floating | Modals, dropdowns | `--card` + `--shadow` |

Do not introduce additional elevation levels.

---

# 10. Motion

The application does not currently define a formal animation system.

Where transitions are used, keep them subtle and functional.

Do not use motion for decorative purposes.

---

# 11. Related Documents

* docs/04 UI/Colours.md
* docs/04 UI/Components.md
* docs/04 UI/Icons.md
* .ai/UI_GUIDELINES.md

---

# 12. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
