# MarginFlow - Invoices: Review Invoice

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Review Invoice       |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Review Invoice is the mandatory checkpoint between data extraction (AI Reading, Standard Reading or Manual Entry) and approval.

It exists to enforce the platform's core principle: AI extracts and suggests, but humans always verify before data enters the operational dataset.

No invoice can be approved without passing through Review.

---

# 2. Position in the Workflow

```text
Draft → Processing → Review Required → Approved
                          ↑
                    (this document)
```

---

# 3. What the Review Screen Shows

### Invoice Header

* Supplier (matched or selected)
* Invoice number
* Invoice date
* VAT rate
* Invoice total

### Line Items

Each line item is displayed in an editable table (`invoice-review-table`) showing:

* Original extracted text (for reference, when AI/Standard Reading was used)
* Matched or selected product
* Quantity
* Unit price
* Line total
* Department allocation
* Match confidence indicator (AI Reading only)

### Source Document

The original uploaded document remains visible alongside the extracted data for visual verification.

---

# 4. Review Actions

Within Review, the user can:

* Edit any field on the invoice header.
* Edit, add or remove line items.
* Change the matched product on any line.
* Adjust department allocation per line.
* Confirm or reject AI-suggested product matches.
* Flag a line for further investigation.

---

# 5. Confidence Indicators

When AI Reading was used, each line item displays a confidence indicator reflecting how certain the AI was about the product match.

| Confidence | Visual Treatment |
|---|---|
| High (above auto-match threshold) | Pre-selected, minimal visual emphasis |
| Medium | Highlighted, suggested match shown |
| Low | Highlighted, no product pre-selected, requires manual selection |

The auto-match confidence threshold is configurable in Settings (default 90%).

---

# 6. Validation Before Approval

Before an invoice can move from Review to Approved, the following must be true:

* Every line item has a linked product.
* Every line item has a department allocation totalling 100%.
* The invoice header has a valid supplier and date.
* The sum of line totals reconciles with the invoice total (or the discrepancy is acknowledged).

See `13 Validation Rules.md` for the complete validation logic.

---

# 7. Business Rules

* Review is mandatory for every invoice regardless of entry method.
* No data from a Review-stage invoice affects pricing, GP or stock calculations.
* The original AI-extracted values remain available for reference even after manual edits, supporting audit and AI accuracy improvement.
* A user can save progress and return to Review later without losing changes.

---

# 8. Dependencies

This module depends on:

* 03 AI Reading / 04 Standard Reading / 05 Manual Entry (data source)
* 09 Product Matching
* 10 Department Allocation
* Products and Suppliers (for selection)

---

# 9. Future Improvements

* Side-by-side highlighting linking document regions to form fields.
* Bulk department allocation for multiple lines at once.
* Review history showing what was changed from the original AI extraction.

---

# 10. Related Documents

* 03 AI Reading
* 07 Invoice Approval
* 09 Product Matching
* 10 Department Allocation
* 13 Validation Rules
* 14 Audit Trail

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
