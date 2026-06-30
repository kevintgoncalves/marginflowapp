# MarginFlow - Invoices: Search & Filters

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Search & Filters     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Search and Filters allow users to quickly locate invoices within a potentially large purchasing history.

As the number of invoices grows, efficient search becomes essential for day-to-day operations such as approvals, audits and supplier queries.

---

# 2. Search

The invoice list supports free-text search across:

* Supplier name
* Invoice number
* Product names within line items

Search is case-insensitive and matches partial text.

---

# 3. Filters

### Status Filter

Filter invoices by their current status:

* Draft
* Processing
* Review Required
* Approved
* Archived

### Date Range Filter

Filter invoices by invoice date using the standard date range selector (Today, This Week, This Month, Custom Range, etc.).

### Supplier Filter

Filter invoices to a single supplier or a selection of suppliers.

### Department Filter

Filter invoices that contain at least one line item allocated to the selected department.

### Value Range Filter

Filter invoices by total value (minimum and/or maximum).

---

# 4. Sorting

The invoice list can be sorted by:

* Invoice date (default: most recent first)
* Supplier name
* Total value
* Status

Sorting uses the `.sort-button` column header control consistent with other tables in the platform.

---

# 5. Combined Filtering

Filters can be combined. For example: Approved invoices from a specific supplier within the current month.

All active filters apply simultaneously (logical AND).

---

# 6. Business Rules

* Filters respect department-level user permissions — a user only sees invoices for departments they have access to.
* Search and filters operate on already-loaded data; they do not bypass permission restrictions.
* The default view shows all non-archived invoices sorted by most recent date.

---

# 7. Dependencies

This feature depends on:

* 01 Invoice List (the underlying list being filtered)
* Authentication (permission scoping)
* Suppliers and Departments (filter options)

---

# 8. Future Improvements

* Saved filter presets.
* Export filtered results to CSV.
* Advanced search with field-specific operators (e.g. `supplier:`, `total>`).

---

# 9. Related Documents

* 01 Invoice List
* Suppliers
* Department Rules

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
