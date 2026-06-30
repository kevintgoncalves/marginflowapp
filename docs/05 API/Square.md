# MarginFlow - API: Square

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Square               |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | API Documentation    |

---

# 1. Purpose

This document describes MarginFlow's integration with Square, the default configured POS provider for sales data import.

---

# 2. Integration Type

The current Square integration is CSV-based, not a direct API connection.

Users export sales data from Square and import the resulting CSV file into MarginFlow's Sales module.

---

# 3. Why CSV Instead of Direct API

A CSV-based approach was chosen as the initial integration method because it:

* requires no OAuth setup or ongoing API credential management for each business;
* works immediately without a Square developer account or app approval process;
* gives users a familiar, transparent way to verify the data being imported.

A direct Square API integration is a documented future improvement — see `Future APIs.md`.

---

# 4. CSV Mapping

Square exports are mapped to MarginFlow's sales fields using a configurable column mapping.

| MarginFlow Field | Typical Square Column |
|---|---|
| Date | Date |
| Gross Sales | Gross Sales |
| Net Sales | Net Sales |
| Department | Category (if applicable) |

Mapping templates can be saved per business so future imports do not require re-mapping.

---

# 5. Import Workflow

```text
Export Sales Report from Square (CSV)
        ↓
Upload CSV in MarginFlow Sales Module
        ↓
Apply or Confirm Column Mapping
        ↓
Preview Parsed Rows
        ↓
Confirm Import
```

---

# 6. Business Rules

* Imported sales follow the same validation rules as manually entered sales (no negative values, net ≤ gross).
* Imports do not overwrite existing sales records for the same date and department; duplicate detection should be confirmed against current implementation behaviour.
* The VAT rate applied to imported gross/net figures follows the financial settings default unless explicitly present in the CSV.

---

# 7. Configuration

The POS provider setting in Financial Settings defaults to "Square" and informs the default CSV mapping template offered to the user.

---

# 8. Limitations

* No automatic, scheduled import — each import is a manual action.
* No real-time sales data; data is only as current as the most recent export.
* Department-level granularity depends on how the business has configured categories within Square itself.

---

# 9. Related Documents

* CSV Imports.md
* Sales
* Future APIs.md

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
