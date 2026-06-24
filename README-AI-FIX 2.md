# MarginFlow v3 AI Invoice Fix

This version improves the AI invoice reader so different supplier invoice layouts can be parsed more reliably.

Changes included:

- PDF invoices are converted to text in the browser using `pdfjs-dist`.
- The frontend sends invoice text plus known suppliers/products to `/.netlify/functions/read-invoice-ai`.
- Netlify Function now supports `OPENAI_API_KEY` and also the previous `Marginflow` env var name as fallback.
- Removed fake demo line fallback when an invoice has real text.
- Improved the OpenAI prompt for messy supplier invoice text from TG Fruits, Albion, Woods, BNFS, Cheese Man, Coburn & Baker, etc.
- The AI response requires real product lines and should not invent demo products.

After replacing your current app folder:

```bash
npm install
npm run build
npm run dev
```

Then commit and push with GitHub Desktop.

Important Netlify setting:
Use environment variable name:

```text
OPENAI_API_KEY
```

The old `Marginflow` variable is supported as fallback, but `OPENAI_API_KEY` is recommended.
