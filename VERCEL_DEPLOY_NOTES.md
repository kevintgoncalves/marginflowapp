# MarginFlow Vercel deploy notes

This version is cleaned for Vercel deployment.

Important files:
- package.json uses Node 22 and npm 10.
- vercel.json uses `npm ci`, `npm run build`, and `dist` output.
- .npmrc disables audit/fund and keeps legacy peer dependency handling.
- .env is intentionally not included. Add environment variables in Vercel instead:
  - VITE_SUPABASE_URL
  - VITE_SUPABASE_ANON_KEY
  - OPENAI_API_KEY

After copying these files into your GitHub repo folder:

```bash
npm ci
npm run build
git status
git add .
git commit -m "Fix Vercel deployment config"
```

Then push using GitHub Desktop and wait for Vercel to deploy the latest commit.
