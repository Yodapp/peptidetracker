# Peptime

Peptime is a private, mobile-first peptide research logger. The interface is Swedish-first, uses Europe/Stockholm dates, defaults to dark mode, and keeps U-100 syringe units visible anywhere an injectable dose is shown.

> Log what you want. Peptime contains no medical advice.

## What is included

- Four-step first run with persistent disclaimer, syringe choice, vial-math preview, and optional clearly marked example rows
- One-handed Today flow with mix-group cards, two-tap Take logging, optional site picker, Skip, one-time adjustment, and 30-second undo
- Automatic concentration and U-100 calculation: `dose_mcg / (vial_mg / water_ml * 1000) * 100`
- Local offline-tolerant demo storage, installable PWA shell, light/dark mode, daily autosave note
- History with filters and edit/delete, peptide/vial editor and archive, monthly calendar, CSV/JSON export
- Supabase email magic-link authentication gate and production-ready PostgreSQL schema with RLS on every user table

No doses or protocols in the example data are recommendations. They are UI demonstration rows only and are labeled as examples in the app.

## Run locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Without Supabase environment variables, Peptime runs in demo mode and persists to browser `localStorage`.

## Connect Supabase

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). This creates `profiles`, `peptides`, `vials`, `schedules`, `dose_logs`, and `daily_notes`, enables Row Level Security, and adds policies where `user_id = auth.uid()`.
3. In **Authentication → URL Configuration**, set the Site URL and add both local and production callback URLs:
   - `http://localhost:3000/auth/callback`
   - `https://YOUR_VERCEL_DOMAIN/auth/callback`
4. Copy `.env.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

When these variables exist, the root route is private and unauthenticated users are sent to the magic-link login screen. The current v1 UI uses the included local persistence adapter after login; replace `useStore()` in `src/components/peptime-app.tsx` with Supabase queries against the provided schema to sync records across devices. RLS remains the security boundary.

## Deploy to Vercel

1. Import `https://github.com/Yodapp/peptidetracker` in Vercel.
2. Keep the detected Next.js defaults.
3. Add the three environment variables above, setting `NEXT_PUBLIC_SITE_URL` to the final `https://` Vercel domain.
4. Deploy, then add the exact production callback URL in Supabase Authentication.

Vercel will run `npm run build` using the stable webpack compiler. No service-role key is needed or expected in the browser.

## Data and privacy notes

- The demo adapter stores data on the current device only. Clearing browser storage clears demo data.
- Supabase tables use RLS and reject rows that do not belong to `auth.uid()`.
- Peptides with logs should be archived instead of deleted. The schema uses restrictive foreign keys for logged peptide records.
- CSV and JSON exports are generated entirely in the browser.

## Scripts

```bash
npm run dev    # local development
npm run build  # production build
npm run lint   # ESLint
```
