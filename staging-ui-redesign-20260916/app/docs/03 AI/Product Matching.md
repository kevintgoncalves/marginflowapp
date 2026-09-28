# MarginFlow - AI: Product Matching

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Product Matching     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | AI Documentation     |

---

# 1. Purpose

This document describes the technical implementation of product matching, the process that links invoice line item descriptions to existing products in the catalogue.

It is the technical companion to `docs/01 Modules/Invoices/09 Product Matching.md`.

---

# 2. Where Matching Happens

Product matching is implemented client-side in `src/main.jsx` via the `enrichInvoiceLine` and `matchProduct` functions.

Unlike invoice text extraction, product matching does not call an external AI API — it uses local string-similarity matching against the existing product catalogue.

---

# 3. Matching Algorithm

The matching function compares the extracted line item description against every product name in the catalogue and returns the best match with a confidence score between 0 and 1.

The exact similarity method (e.g. token overlap, edit distance, normalised string comparison) should be confirmed against the current implementation of `matchProduct` in `src/main.jsx`, as this is an internal function not otherwise documented in this version.

---

# 4. Confidence Thresholds

| Confidence | Behaviour |
|---|---|
| ≥ auto-match threshold (default 90%, configurable) | Automatically applied |
| ≥ 60% but below auto-match threshold | Suggested, requires manual confirmation |
| < 60% | Treated as no match; candidate for new product creation |

These thresholds are read from `matchingSettings.autoMatchConfidenceThreshold`, configurable in Settings.

---

# 5. Sensitivity Setting

The `productMatchingSensitivity` setting (Low / Medium / High) is intended to adjust how strictly names must align before they are considered a candidate match at all, independent of the confidence score thresholds above.

---

# 6. Matching Disabled

If `enableProductMatching` (or the legacy `enableAiProductMatching` flag) is set to false, every line item bypasses matching entirely and is returned with:

```
matchStatus: "Product matching disabled"
matchConfidence: 0
```

The user must select a product manually for every line.

---

# 7. Output per Line

For every invoice line, the enrichment process returns:

| Field | Description |
|---|---|
| `matchedProductId` | Set when auto-matched |
| `suggestedProductId` / `suggestedProductName` | Set when a match needs confirmation |
| `matchConfidence` | Numeric score (0–1) |
| `matchStatus` | Human-readable status string |

---

# 8. Limitations of the Current Approach

* Matching is based on text similarity only. It does not currently use supplier context, price history or purchase frequency as matching signals.
* Matching runs entirely client-side; it does not use the Anthropic API and therefore has no semantic understanding of product synonyms unless explicitly handled by the similarity function.
* Unit and packaging variations (e.g. "Tomatoes 5kg" vs "Tomatoes Tin 5kg") may produce lower confidence than ideal.

---

# 9. Business Rules

* A product is never created or linked silently; user confirmation is always required below the auto-match threshold.
* Auto-matched lines remain editable by the user during Review.

---

# 10. Future Improvements

* AI-assisted (LLM-based) semantic matching as an alternative or supplement to string similarity.
* Supplier-aware matching (same supplier + similar description = higher confidence).
* Learning from historical confirmations to improve future matches.
* Unit-aware normalisation before comparison.

---

# 11. Related Documents

* docs/01 Modules/Invoices/09 Product Matching.md
* docs/03 AI/Invoice Reading.md
* Products

---

# 12. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
