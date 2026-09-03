# Peptime

Peptime is a private, mobile-first peptide research logger. The interface is Swedish-first, uses Europe/Stockholm dates, defaults to dark mode, and keeps U-100 syringe units visible anywhere an injectable dose is shown.

> Log what you want. Peptime contains no medical advice.

## What is included

- Four-step first run with persistent disclaimer, syringe choice, vial-math preview, and optional clearly marked example rows
- One-handed Today flow with mix-group cards, two-tap Take logging, optional site picker, Skip, one-time adjustment, and 30-second undo
- Automatic concentration and U-100 calculation: `dose_mcg / (vial_mg / water_ml * 1000) * 100`
- Supabase-backed cross-device storage with local cache, installable PWA shell, light/dark mode, and daily autosave note
- History with filters and edit/delete, peptide/vial editor and archive, monthly calendar, CSV/JSON export
- Supabase email magic-link authentication with an in-PWA email-code fallback and RLS on every user table
- Separate scheduled day and actual timestamp: unfinished doses from yesterday remain available until 12:00 while a late log keeps its real time
- Editable scheduled day and actual time in Logg, with the same scheduled-day grouping in Kalender and exports
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

For iPhone Home Screen login, keep the magic link and also expose the email OTP in **Authentication → Email Templates → Magic Link**. The template can use both the existing confirmation URL and `{{ .Token }}`. A minimal addition is: `Engångskod: {{ .Token }}`. The user can enter that code inside the installed Peptime PWA, so the session is created in the PWA rather than in Safari.

Supabase sessions refresh automatically and, by default, remain valid until the user signs out or the session is revoked. Increasing the short-lived access-token duration is therefore not needed for normal Peptime use.

### Upgrade an existing Peptime database

Run these migrations once, in order, in Supabase SQL Editor before deploying this version:

1. [`supabase/migrations/202609010001_cross_device_and_log_day.sql`](supabase/migrations/202609010001_cross_device_and_log_day.sql)
2. [`supabase/migrations/202609010002_group_schedules_and_reminders.sql`](supabase/migrations/202609010002_group_schedules_and_reminders.sql)
3. [`supabase/migrations/202609030001_scheduled_log_date.sql`](supabase/migrations/202609030001_scheduled_log_date.sql)

The second migration adds group-owned schedules, pause/cycle fields, the reminder preference, and RLS for `mix_groups`. The third separates the scheduled day from the actual timestamp and backfills existing logs using each profile's previous log-day boundary.

On the first signed-in load after upgrading, Peptime uploads existing browser data if the remote account is empty. It also merges locally added peptides if another device reached the account first.

## Deploy to Vercel

1. Import `https://github.com/Yodapp/peptidetracker` in Vercel.
2. Keep the detected Next.js defaults.
3. Add the three environment variables above, setting `NEXT_PUBLIC_SITE_URL` to the final `https://` Vercel domain.
4. Deploy, then add the exact production callback URL in Supabase Authentication.

Vercel will run `npm run build` using the stable webpack compiler. No service-role key is needed or expected in the browser.

## Web Push reminders

The app contains a safe notification-permission flow and service-worker handlers. The switch defaults to off and remains off if permission is denied. iOS Web Push requires Peptime to be installed on the Home Screen and permission to be requested from the installed app.

Production delivery still needs a server-side Web Push scheduler. Configure VAPID keys in Vercel (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`), store each authenticated user's Push API subscription in a protected Supabase table, and schedule one message per due time slot. The payload should combine all items in the slot, for example `Morgon 08:00 — Adamax 2 IU, Selank 5 IU`; do not enqueue one message per peptide. Browser push delivery is best-effort and should not be presented as native-app reliability.

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
