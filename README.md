# SalesApp

Next.js App to import dealer lists (DE/AT/CH) into Supabase and view them.

## Setup
1. Create Supabase tables (see `supabase/schema.sql`)
2. Create `.env.local` from `.env.example`
3. `npm i`
4. `npm run dev`


## Admin (Tabellen leeren)
- Route: `/admin`
- ENV: `ADMIN_ACTIONS_KEY`


## Bulk Außendienst Upload
- Run `supabase/ad_key_migration.sql`
- Use `/users` → „Außendienst per Datei importieren“


## iOS Shell
- `/` Homescreen (Apps + Widgets)
- Händler Upload: `/settings/uploads/dealers`
- Widgets konfigurieren: `/settings/widgets`
- Uploads Overview: `/settings/uploads`


## KPI Widgets
Für KPI Widgets bitte `supabase/kpi.sql` im Supabase SQL Editor ausführen.
Route: `/api/kpi/summary`

## Env Vars (Vercel)
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- optional: ADMIN_ACTIONS_KEY (für /admin Daten löschen)
