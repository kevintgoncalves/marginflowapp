# MarginFlow - UI: Icons

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Icons                |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | UI Documentation     |

---

# 1. Purpose

This document defines how icons are used throughout MarginFlow.

---

# 2. Icon Library

MarginFlow uses Lucide React exclusively (version 0.468 as of this writing).

No other icon library should be introduced without a documented decision.

---

# 3. Import Pattern

Import only the specific icons required by a component. Do not import the entire library.

```javascript
import { Truck, FileText, AlertCircle } from "lucide-react";
```

---

# 4. Sizing

| Context | Size |
|---|---|
| Sidebar navigation | Default Lucide size (24px) |
| Buttons (inline with text) | 16px |
| Table row actions | 15px |
| Icon-only buttons (`.button.icon`) | Sized to fit the 34×34px container, typically 16–18px |

Maintain consistent sizing within the same context across the application. Do not mix icon sizes within a single button group or table.

---

# 5. Colour

Icons inherit the `color` of their containing element by default (via `currentColor`), consistent with the design token system.

Do not hardcode icon colours separately from the text/element colour they accompany, except for deliberate semantic colouring (e.g. a red icon next to a destructive action, or a green checkmark for success).

---

# 6. Semantic Icon Usage

While specific icon choices are an implementation detail best confirmed against the live codebase, the following conventions should be followed:

| Concept | Convention |
|---|---|
| Approve / Success | Check-style icon, `--success` colour where used standalone |
| Delete / Remove | Trash-style icon, paired with `.danger` button variant |
| Edit | Pencil-style icon |
| Warning / Attention | Alert-style icon, `--warning` colour where used standalone |
| Upload | Upload-style icon |
| Navigation items | One representative icon per module, used consistently in the sidebar |

---

# 7. Rules

* Every icon-only button must have an accessible label (e.g. `aria-label` or `title` attribute), since there is no visible text to convey its purpose.
* Do not use icons as the sole indicator of a destructive action without a text label or confirmation step.
* Keep icon choices consistent for the same concept across different modules (e.g. the same "edit" icon should be used everywhere edit actions exist).

---

# 8. Related Documents

* Components.md
* Design System.md
* .ai/UI_GUIDELINES.md

---

# 9. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
