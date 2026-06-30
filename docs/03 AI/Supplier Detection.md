# MarginFlow - AI: Supplier Detection

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Supplier Detection   |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | AI Documentation     |

---

# 1. Purpose

This document describes how MarginFlow identifies the supplier associated with an uploaded invoice during AI processing.

---

# 2. Where Supplier Detection Happens

Supplier detection is part of the AI extraction step. The structured prompt sent to the Anthropic API asks the model to identify the supplier name from the document text or image, as one of the fields in the structured JSON response.

See `docs/03 AI/Invoice Reading.md` for the full extraction pipeline.

---

# 3. Matching the Detected Name to an Existing Supplier

Once the AI returns a supplier name, MarginFlow attempts to match it against the existing supplier directory.

| Outcome | Behaviour |
|---|---|
| Exact or near-exact match | Supplier is pre-selected on the Review screen |
| No match found | The detected name is shown as free text; user selects an existing supplier or creates a new one |
| Multiple plausible matches | User is prompted to confirm which existing supplier is correct |

---

# 4. Why Suppliers Are Never Auto-Created

Unlike products, which can be auto-created from confirmed invoice lines, supplier creation always requires explicit user action.

This is because:

* incorrect supplier matching has a larger downstream impact (affecting purchasing reports and price history attribution across all of that supplier's products);
* supplier names on invoices often differ from the legal or preferred trading name a business wants recorded;
* duplicate suppliers are harder to merge after the fact than duplicate products.

---

# 5. Business Rules

* AI never creates a new supplier record automatically.
* The user must confirm or correct the detected supplier before the invoice can proceed to approval.
* The canonical supplier name (as stored in the Suppliers module) is always used downstream, regardless of how the name appeared on the original document.

---

# 6. Common Detection Challenges

* Suppliers with multiple trading names or letterhead variations.
* Invoices issued by a distributor on behalf of a brand (the "supplier" the AI detects may not match the supplier the business actually deals with).
* Logo-only branding with no text-based supplier name on the document, which fails entirely under pure text extraction.

---

# 7. Dependencies

This feature depends on:

* docs/03 AI/Invoice Reading.md (extraction pipeline)
* Suppliers (the directory being matched against)

---

# 8. Future Improvements

* Learning supplier name variations over time based on user corrections.
* Detecting supplier from bank/payment details as a secondary signal.
* Confidence scoring specific to supplier detection, separate from line-item matching confidence.

---

# 9. Related Documents

* docs/03 AI/Invoice Reading.md
* docs/01 Modules/Invoices/06 Review Invoice.md
* Suppliers

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
