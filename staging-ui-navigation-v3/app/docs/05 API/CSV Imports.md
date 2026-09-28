# MarginFlow - API: CSV Imports

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | CSV Imports          |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | API Documentation    |

---

# 1. Purpose

This document describes MarginFlow's general-purpose CSV import capability, used primarily for sales data but designed to be extensible to other data types.

---

# 2. Where CSV Import Is Used

| Module | Purpose |
|---|---|
| Sales | Import daily sales figures from POS exports (e.g. Square) |
| Labour | Import labour cost data from payroll exports or seed data |

---

# 3. Import Process

```text
1. User uploads a CSV file
2. File is parsed and headers are detected
3. User maps CSV columns to MarginFlow fields
4. Parsed rows are previewed before import
5. User confirms import
6. Rows are validated and saved
```

---

# 4. Column Mapping

CSV files from different sources rarely match MarginFlow's internal field names exactly. The mapping step allows the user to align:

* Date column
* Value columns (e.g. gross sales, net sales)
* Department/category column (if present)
* Any additional relevant fields

### Saved Templates

Mapping configurations can be saved as named templates (e.g. "Square Export", "Toast Export") so future imports from the same source skip the manual mapping step.

Templates can be saved as temporary (one-off) or permanent (reused going forward).

---

# 5. Validation During Import

Every imported row passes through the same validation rules as manually entered data for that module.

For Sales:

* Values cannot be negative.
* Net sales must be less than or equal to gross sales.
* Date must be a valid, parseable date.

Rows that fail validation are flagged in the preview before import is confirmed, allowing the user to fix the source file or exclude problem rows.

---

# 6. Default VAT Rate Handling

If a CSV does not include explicit VAT information, the default VAT rate configured in Financial Settings is applied to derive net sales from gross (or vice versa), depending on the configured Sales Input Method.

---

# 7. Business Rules

* CSV import never bypasses standard validation rules for the target module.
* Import is always a deliberate, confirmed action — there is no automatic or scheduled import in the current implementation.
* Saved mapping templates are specific to a business; they are not shared across organisations.

---

# 8. Dependencies

This feature depends on:

* Sales (primary use case)
* Labour (secondary use case)
* Settings (default VAT rate, sales input method)

---

# 9. Future Improvements

* Scheduled, automatic CSV pickup from a designated email inbox or cloud folder.
* Pre-built mapping templates for additional common POS providers.
* Import history log showing what was imported and when.

---

# 10. Related Documents

* Square.md
* Sales
* Labour
* Future APIs.md

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
