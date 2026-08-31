# Peptime

Peptime is a private, mobile-first peptide research logger. The interface is Swedish-first, uses Europe/Stockholm dates, defaults to dark mode, and keeps U-100 syringe units visible anywhere an injectable dose is shown.

> Log what you want. Peptime contains no medical advice.

## What is included

- Four-step first run with persistent disclaimer, syringe choice, vial-math preview, and optional clearly marked example rows
- One-handed Today flow with mix-group cards, two-tap Take logging, optional site picker, Skip, one-time adjustment, and 30-second undo
- Automatic concentration and U-100 calculation: `dose_mcg / (vial_mg / water_ml * 1000) * 100`
- Supabase-backed cross-device storage with local cache, installable PWA shell, light/dark mode, and daily autosave note
- History with filters and edit/delete, peptide/vial editor and archive, monthly calendar, CSV/JSON export
- Supabase email magic-link authentication gate and production-ready PostgreSQL schema with RLS on every user table
- Configurable log-day boundary (04:00 by default) so after-midnight bedtime doses remain on the intended day
- Case-insensitive mix groups with suggestions from existing groups

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

When these variables exist, the root route is private and unauthenticated users are sent to the magic-link login screen. Peptides, schedules, vial state, logs, daily notes, and settings sync to Supabase under the authenticated user. RLS remains the security boundary.

### Upgrade an existing Peptime database

Run [`supabase/migrations/202609010001_cross_device_and_log_day.sql`](supabase/migrations/202609010001_cross_device_and_log_day.sql) once in Supabase SQL Editor before deploying this version. It adds the log-day preference, persists onboarding state, changes mix groups to free-text identifiers, and grants the authenticated role access behind RLS.

On the first signed-in load after upgrading, Peptime uploads existing browser data if the remote account is empty. It also merges locally added peptides if another device reached the account first.

## Deploy to Vercel

1. Import `https://github.com/Yodapp/peptidetracker` in Vercel.
2. Keep the detected Next.js defaults.
3. Add the three environment variables above, setting `NEXT_PUBLIC_SITE_URL` to the final `https://` Vercel domain.
4. Deploy, then add the exact production callback URL in Supabase Authentication.

Vercel will run `npm run build` using the stable webpack compiler. No service-role key is needed or expected in the browser.

## Data and privacy notes

- With Supabase configured, the local browser store is an offline-tolerant cache and Supabase is the cross-device source of truth.
- Without Supabase variables, Peptime continues to work as a device-local demo.
- Supabase tables use RLS and reject rows that do not belong to `auth.uid()`.
- Peptides with logs should be archived instead of deleted. The schema uses restrictive foreign keys for logged peptide records.
- CSV and JSON exports are generated entirely in the browser.

## Scripts

```bash
npm run dev    # local development
npm run build  # production build
npm run lint   # ESLint
```
