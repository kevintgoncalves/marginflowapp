# MarginFlow - AI: OCR

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | OCR                  |
| Version  | 1.0                  |
| Status   | Draft                |
| Owner    | MarginFlow           |
| Category | AI Documentation     |

---

# 1. Purpose

This document covers the handling of scanned documents and images within MarginFlow's invoice processing pipeline, and clarifies the distinction between text extraction and true Optical Character Recognition (OCR).

---

# 2. Current State: Text Extraction, Not OCR

MarginFlow currently uses `pdfjs-dist` to extract text from PDF documents that contain a text layer (i.e. digitally generated PDFs, such as those exported directly from accounting or invoicing software).

This is text extraction, not OCR. It reads text that already exists in the PDF's data structure.

True OCR — recognising text from a scanned image with no underlying text layer — is not currently implemented as a dedicated step in this flow.

---

# 3. How Images and Scanned PDFs Are Handled Today

| Document Type | Current Handling |
|---|---|
| Digital PDF (text layer present) | Text extracted via `pdfjs-dist`, sent to AI for structuring |
| Image upload (JPG, PNG) | Sent directly to the Anthropic Claude API, which has native image understanding capability |
| Scanned PDF (no text layer) | Text extraction returns empty/minimal content; user is directed toward Manual Entry |

For image uploads, Claude's native vision capability effectively performs the equivalent of OCR plus structured extraction in a single step, without a separate OCR library.

---

# 4. Why This Distinction Matters

Understanding this distinction is important for:

* Setting accurate user expectations (a scanned PDF will not process as well as a digital one).
* Future development decisions (whether to add a dedicated OCR step or rely entirely on the AI model's vision capability).
* Debugging extraction failures (failures on scanned PDFs are expected with the current text-extraction-only approach).

---

# 5. Business Rules

* If text extraction returns no usable content, the system should not attempt AI structuring on empty input. It should direct the user toward Manual Entry or suggest converting/re-uploading as an image.
* Image uploads always go through the AI vision pathway rather than text extraction.

---

# 6. Future Improvements

* Convert scanned PDF pages to images automatically and route through the AI vision pathway, rather than failing on empty text extraction.
* Dedicated OCR fallback library for environments where AI image processing is undesired (cost, privacy).
* Image pre-processing (deskew, contrast enhancement) to improve recognition accuracy on poor-quality scans.

---

# 7. Related Documents

* docs/03 AI/Invoice Reading.md
* docs/01 Modules/Invoices/03 AI Reading.md
* docs/01 Modules/Invoices/04 Standard Reading.md

---

# 8. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Draft   | Clarifies text extraction vs true OCR |
