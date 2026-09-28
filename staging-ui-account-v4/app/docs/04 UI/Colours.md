# MarginFlow - UI: Colours

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Colours              |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | UI Documentation     |

---

# 1. Purpose

This document is the single reference for every colour used in MarginFlow's interface, extracted directly from `src/styles.css`.

Always use the listed CSS custom properties rather than hardcoded hex values.

---

# 2. Core Palette

| Token | Hex | Swatch Description | Use |
|---|---|---|---|
| `--bg` | `#0f172a` | Deep navy | Page background |
| `--card` | `#1e293b` | Slate blue | Cards, panels, modals |
| `--card-soft` | `#243247` | Lighter slate | Elevated card variant |
| `--line` | `#334155` | Muted slate | Borders, dividers |
| `--text` | `#e5edf7` | Off-white | Primary text |
| `--muted` | `#94a3b8` | Grey-blue | Secondary text, labels |

---

# 3. Semantic Palette

| Token | Hex | Meaning | Use |
|---|---|---|---|
| `--primary` | `#3b82f6` | Blue | Primary actions, links, active nav |
| `--success` | `#10b981` | Green | Positive values, approved, GP good |
| `--warning` | `#f59e0b` | Amber | Warnings, GP near threshold |
| `--danger` | `#ef4444` | Red | Errors, destructive actions, GP below target |

---

# 4. Surface Variants (Direct Values)

These values appear directly in the stylesheet rather than as named tokens. They should be considered candidates for tokenisation in a future refactor.

| Value | Use |
|---|---|
| `#111827` | Sidebar background |
| `#111c31` | Input field background |
| `#172033` | Sidebar card, auth card background |
| `#29384f` | Ghost button / icon button background |

---

# 5. Transparent Overlays (rgba)

Used for subtle background tints behind semantic states, layered over the base background.

| Use | Value |
|---|---|
| Primary surface (active nav item) | `rgba(59, 130, 246, 0.16)` |
| Primary border | `rgba(59, 130, 246, 0.3)` to `rgba(59, 130, 246, 0.45)` |
| Success surface | `rgba(16, 185, 129, 0.16)` |
| Success border | `rgba(16, 185, 129, 0.38)` |
| Warning border | `rgba(245, 158, 11, 0.38)` |
| Danger surface | `rgba(239, 68, 68, 0.12)` to `rgba(239, 68, 68, 0.16)` |
| Danger border | `rgba(239, 68, 68, 0.42)` |

---

# 6. Shadow

| Token | Value | Use |
|---|---|---|
| `--shadow` | `0 22px 70px rgba(2, 6, 23, 0.28)` | Modals, floating elements |

---

# 7. Colour Usage by Meaning

### GP and Financial Indicators

| State | Colour |
|---|---|
| GP meets/exceeds target | `--success` |
| GP within warning range | `--warning` |
| GP below acceptable threshold | `--danger` |

### Invoice Status

| Status | Colour |
|---|---|
| Approved | `--success` |
| Review Required / Processing | `--warning` |
| Error / Failed | `--danger` |
| Informational | `--primary` |

### Badges

| Variant | Colour |
|---|---|
| `.green` | `--success` |
| `.amber` | `--warning` |
| `.red` | `--danger` |

---

# 8. Rules

* Never introduce a new hex value without first checking whether an existing token applies.
* Never use light-theme colours; this product is dark-theme only.
* When a new semantic state is needed, map it to one of the four existing semantic tokens (primary, success, warning, danger) rather than introducing a fifth.
* Direct hex values listed in Section 4 should be tokenised when touched during future refactors, but do not need retroactive changes purely for this reason.

---

# 9. Related Documents

* Design System.md
* Components.md
* .ai/UI_GUIDELINES.md

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | Extracted directly from src/styles.css |
