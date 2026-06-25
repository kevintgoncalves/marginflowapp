# MarginFlow Vercel deploy notes

This package was cleaned for Vercel deployment.

## Fixed

- Removed `.env` from the zip so secrets are not shared or committed.
- Removed `node_modules` and `dist` so Vercel installs/builds cleanly.
- Removed duplicated files such as `package 2.json`, `vercel 2.json`, `index 2.html`, etc.
- Removed Node/npm engine pins from `package.json` so Vercel Project Settings can control the Node version.
- Updated `vercel.json` to use:
  - `installCommand`: `npm install --legacy-peer-deps`
  - `buildCommand`: `npm run build`
  - `outputDirectory`: `dist`
  - `framework`: `vite`
- Regenerated `package-lock.json` so it matches the cleaned `package.json`.

## Verified locally

- `npm ci` passes.
- `npm run build` passes.

## Vercel settings to use

Environment Variables in the `marginflowapp` project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`

Build & Development Settings:

- Framework Preset: `Vite`
- Install Command: can be blank/default or `npm install --legacy-peer-deps`
- Build Command: `npm run build`
- Output Directory: `dist`

After pushing to GitHub, redeploy without build cache.
