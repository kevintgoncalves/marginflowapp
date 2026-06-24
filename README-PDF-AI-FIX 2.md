# MarginFlow V3 PDF AI Fix

This version adds PDF text extraction with pdfjs-dist before calling the Netlify OpenAI function.

Run:

```bash
npm install
npm run build
npm run dev
```

Then test:

1. Go to Invoices
2. Upload a text-based PDF invoice
3. Click Read Invoice
4. The app should extract PDF text, send it to `/.netlify/functions/read-invoice-ai`, and populate review lines.

Note: scanned image PDFs may still need OCR. This fix handles text-based PDFs.
