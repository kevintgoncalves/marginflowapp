# MarginFlow - Invoices: Standard Reading

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Standard Reading     |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | Module Documentation |

---

# 1. Purpose

Standard Reading is the non-AI method of processing an uploaded invoice.

It extracts raw text from a PDF document without using AI interpretation, leaving the user to manually identify and enter the supplier, line items and totals.

Standard Reading exists for businesses or situations where AI reading is disabled, unavailable, or where a user prefers manual control.

---

# 2. When Standard Reading Is Used

* AI invoice reading is disabled in Settings.
* AI reading was attempted but failed or returned low-confidence results.
* The user explicitly chooses manual processing for a specific invoice.

---

# 3. Workflow

```text
Upload Invoice (PDF or image)
        ↓
Text Extraction (pdfjs-dist)
        ↓
Display Extracted Text Alongside Document
        ↓
User Manually Enters Invoice Details
        ↓
Review Invoice
```

---

# 4. How It Works

1. The uploaded PDF is processed by `pdfjs-dist` in the browser to extract raw text.
2. The original document is displayed alongside the extracted text for reference.
3. The user manually identifies:
   * Supplier
   * Invoice number
   * Invoice date
   * Line items (product, quantity, unit price, total)
   * VAT and invoice total
4. The user enters this information using the same form used in Manual Entry.
5. Once complete, the invoice proceeds to the standard Review Invoice workflow.

---

# 5. Differences from AI Reading

| Aspect | AI Reading | Standard Reading |
|---|---|---|
| Data extraction | Automatic via Claude API | Manual by user |
| Speed | Fast | Slower, depends on invoice complexity |
| Accuracy | High, requires verification | Depends entirely on user accuracy |
| Product matching | AI-assisted | Manual |
| Cost | Uses Anthropic API credits | No API cost |

---

# 6. Business Rules

* Standard Reading produces the same data structure as AI Reading. Downstream workflows (Review, Approval) do not distinguish between the two methods.
* An invoice processed via Standard Reading still requires the standard approval workflow before affecting operational data.
* If text extraction fails entirely (e.g. scanned image with no text layer), the user falls back to Manual Entry.

---

# 7. Dependencies

This feature depends on:

* `pdfjs-dist` for text extraction
* Products (for manual product matching)
* Suppliers (for manual supplier selection)

---

# 8. Future Improvements

* Optical character recognition (OCR) for scanned documents without a text layer.
* Highlighted text regions linked to form fields for faster manual entry.

---

# 9. Related Documents

* 02 Upload Invoice
* 03 AI Reading
* 05 Manual Entry
* 06 Review Invoice

---

# 10. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
