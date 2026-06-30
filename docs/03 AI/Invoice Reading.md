# MarginFlow - AI: Invoice Reading

## Document Information

| Field    | Value                |
| -------- | -------------------- |
| Document | Invoice Reading      |
| Version  | 1.0                  |
| Status   | Approved             |
| Owner    | MarginFlow           |
| Category | AI Documentation     |

---

# 1. Purpose

This document describes the end-to-end pipeline used to extract structured data from an uploaded invoice using AI.

It is the technical companion to `docs/01 Modules/Invoices/03 AI Reading.md`, focused on implementation detail rather than user-facing workflow.

---

# 2. Pipeline Overview

```text
1. User uploads PDF or image
2. pdfjs-dist extracts raw text (PDF) or the image is passed directly
3. Text/image sent to Vercel serverless function: api/read-invoice-ai.js
4. Function calls Anthropic Claude API with a structured extraction prompt
5. Claude returns structured JSON
6. Frontend parses and validates the JSON
7. Data populates the Review Invoice screen
```

---

# 3. Text Extraction

For PDF documents, `pdfjs-dist` runs in the browser to extract the text layer before any data is sent to the server.

If a PDF has no text layer (e.g. a scanned image saved as PDF), text extraction returns empty or minimal content, and the workflow falls back toward Standard Reading or Manual Entry.

For image uploads (JPG, PNG), the image is sent directly to the AI model, which supports image input natively.

---

# 4. The Serverless Function

`api/read-invoice-ai.js` is a Vercel serverless function that acts as a secure proxy to the Anthropic API.

Responsibilities:

* Receive extracted text or image data from the frontend.
* Construct a structured prompt instructing the model to return JSON only.
* Call the Anthropic API using the server-side `ANTHROPIC_API_KEY` (never exposed to the frontend).
* Return the parsed response to the frontend.

The API key is never sent to or stored in the browser.

---

# 5. Expected Output Structure

The AI is prompted to return a structured JSON object containing:

```json
{
  "supplier": "string",
  "invoiceNumber": "string",
  "date": "YYYY-MM-DD",
  "vatRate": "number",
  "total": "number",
  "lines": [
    {
      "description": "string",
      "quantity": "number",
      "unitPrice": "number",
      "lineTotal": "number"
    }
  ]
}
```

---

# 6. Error Handling

| Failure | Behaviour |
|---|---|
| API call fails | User is notified; falls back to Standard Reading or Manual Entry |
| Malformed JSON response | Response is rejected; user falls back to manual processing |
| Partial extraction (some fields missing) | Available fields are populated; missing fields left blank for manual completion |
| Low overall confidence | All lines flagged for manual review during Review Invoice |

The workflow must always remain completable manually, regardless of AI failure.

---

# 7. Model

The current implementation uses a Claude Sonnet model via the Anthropic API.

Always confirm the exact model string against `.ai/SESSION_PROMPT.md` or the current `api/read-invoice-ai.js` implementation, as model versions are updated periodically.

---

# 8. Data Privacy

Invoice documents may contain sensitive commercial information (pricing, supplier relationships).

Data sent to the Anthropic API is used solely for processing the request and is not used to train Anthropic's models, consistent with Anthropic's API data usage policies.

Always verify current data handling terms against Anthropic's published policies before relying on this statement in a compliance context.

---

# 9. Business Rules

* AI output is always treated as a suggestion, never as final data.
* No data from AI extraction enters the operational dataset without passing through Review and Approval.
* The original AI-extracted values should be retained even after manual correction, to support audit and future accuracy improvements.

---

# 10. Dependencies

This pipeline depends on:

* `pdfjs-dist`
* Anthropic Claude API
* Vercel serverless functions
* `ANTHROPIC_API_KEY` environment variable

---

# 11. Future Improvements

* Caching of repeated supplier formats to reduce API calls.
* Confidence scoring per field, not just per line item.
* OCR fallback for scanned documents without a text layer.
* Multi-page invoice support improvements.

---

# 12. Related Documents

* docs/01 Modules/Invoices/03 AI Reading.md
* docs/03 AI/OCR.md
* docs/03 AI/Product Matching.md
* Tech Stack

---

# 13. Revision History

| Version | Date            | Description            |
| ------- | --------------- | ---------------------- |
| 1.0     | Initial Release | First approved version |
