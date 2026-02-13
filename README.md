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


## Installer v1 (Admin)
### Setup
1. Run `supabase/installer.sql` in Supabase SQL Editor (creates `installed_packages`).
2. Deploy.

### Package format
Upload a ZIP containing `manifest.json` at root.

Example manifest:
```json
{
  "name": "Example Package",
  "version": "1.0.0",
  "apps": [
    { "slug": "dealers", "title": "Händler", "icon": "🏪", "type": "link", "href": "/dealers", "sort": 10, "is_enabled": true }
  ],
  "visibility": [
    { "slug": "dealers", "group": "Aussendienst", "is_visible": true },
    { "slug": "dealers", "group": "CEO", "is_visible": true }
  ],
  "dock": [
    { "slug": "dealers", "group": "Aussendienst", "position": 1 },
    { "slug": "dealers", "group": "CEO", "position": 1 }
  ],
  "requires_sql": [
    "alter table public.apps add column if not exists config jsonb;"
  ]
}
```


## Admin Upload Center
- Route: `/admin/imports`
- Zentraler Import für Händler / Backlog / Lagerbestand / AD Benutzer
- Import-Endpoints sind Admin-only und erwarten `Authorization: Bearer <access_token>`.
- Tipp: Über den Installer kannst du ein App-Icon installieren: `packages/examples/example-admin-upload-center.zip`
