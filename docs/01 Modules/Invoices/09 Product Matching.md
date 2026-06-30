# MarginFlow - Invoices: Product Matching

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Product Matching     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Product Matching links invoice line items to existing products in the catalogue, preventing duplicate product creation and ensuring pricing data is attributed correctly.

This is one of the most important automated processes in MarginFlow, since duplicate products would silently fragment purchasing history and corrupt GP calculations.

---

# 2. Position in the Workflow

```text
Invoice Line Extracted (AI or Standard Reading)
        ↓
Product Matching (this document)
        ↓
Review Invoice (user confirms or corrects)
```

---

# 3. Matching Logic

For each invoice line, the system attempts to match the extracted product description against the existing product catalogue.

### Confidence Scoring

Each potential match receives a confidence score between 0 and 1 (0–100%), based on the similarity between the invoice line description and existing product names.

### Outcome by Confidence Level

| Confidence | Outcome |
|---|---|
| Above auto-match threshold (default 90%) | Automatically matched. Line uses the existing product's name and ID. |
| Below auto-match threshold, above 60% | Suggested match. Requires user confirmation before linking. |
| Below 60% | No reliable match. Treated as a new product candidate. |

### Matching Disabled

If product matching is disabled in Settings, every line is treated as requiring manual product selection, with no automatic suggestions.

---

# 4. Match Status Values

Each line item carries a `matchStatus` reflecting the outcome:

| Status | Meaning |
|---|---|
| `[method] - auto matched` | Matched automatically above the confidence threshold |
| `Needs confirmation` | A suggested match exists but requires user approval |
| `Create new product` | No reliable match found; will create a new product on approval |
| `Product matching disabled` | Matching is turned off; manual selection required |

---

# 5. User Review

During Review Invoice, lines with `Needs confirmation` status are visually highlighted.

The user can:

* Accept the suggested match.
* Search for and select a different existing product.
* Confirm creation of a new product.

Lines marked `Create new product` proceed to create a new product record upon invoice approval, using the extracted name, unit and department as the initial values.

---

# 6. Sensitivity Setting

Product matching sensitivity is configurable in Settings (Low / Medium / High), affecting how strictly product names must align to be considered a potential match.

Higher sensitivity reduces false matches but increases the number of lines requiring manual confirmation.

---

# 7. Business Rules

* A product is never created or linked without passing through this matching process.
* Auto-matched lines can still be manually overridden during Review.
* The matching algorithm considers product name similarity; it does not currently consider price or supplier history.
* New products created from unmatched lines must be confirmed by the user before the invoice is approved.

---

# 8. Dependencies

This feature depends on:

* Products (the catalogue being matched against)
* Settings (matching configuration)
* 06 Review Invoice (where matches are confirmed)

---

# 9. Future Improvements

* Matching informed by supplier context (same supplier, same product, different wording).
* Machine-learning-based matching using historical confirmation data.
* Bulk-confirm for multiple similar suggested matches.
* Fuzzy unit detection (e.g. "1KG" vs "1 kg" vs "1000g").

---

# 10. Related Documents

* 03 AI Reading
* 06 Review Invoice
* Products
* docs/03 AI/Product Matching.md

---

# 11. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
