# MarginFlow v2

Modern React + Vite prototype for hospitality F&B profit management.

MarginFlow helps restaurants and hotels turn invoices, stock, recipes, menu costing, waste and sales into profit insights.

## Modules

- Dashboard
- Invoices
- Products
- Suppliers
- Stocktake
- Recipes
- Menu Costing
- Waste
- GP Analysis
- AI Insights
- Settings

## Run locally

```bash
npm install
npm run dev
```

The dev server uses:

```text
http://127.0.0.1:5174
```

## AI API scaffold

The frontend includes an AI chat panel. For development, run the mock backend in a second terminal:

```bash
npm run api
```

The backend exposes:

```text
POST /api/ai/ask
```

It returns mock answers unless `OPENAI_API_KEY` is configured and the OpenAI integration is wired inside `server.js`.

Important: never put the OpenAI key in the React frontend.

## Build

```bash
npm run build
```

The production build is created in `dist/`.

## Notes

This is a new v2 React/Vite structure. It does not replace or delete the original Invoice GP Manager app.

## Current functional prototype

- Invoice upload, drag/drop, review table and confirm flow
- Confirmed invoices update the product database
- Product CRUD with search, sort, edit and delete
- Supplier CRUD with spend totals
- GP analysis charts
- AI chat architecture with backend endpoint scaffold
