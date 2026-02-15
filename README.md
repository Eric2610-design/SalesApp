# SalesApp (Cookie Auth Edition)

Stabiler Login ohne `supabase.auth.getSession()` im Browser:
- Passwort-Login läuft über `/api/auth/login`
- Session liegt in httpOnly Cookies
- `/api/auth/me` liefert User + app_users Profil + Gruppe + isAdmin

## ENV Vars (Vercel)

Pflicht:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ADMIN_EMAILS (CSV) z.B. `e.fuhrmann@flyer-bikes.com,ceo@flyer-bikes.com`

Optional:
- ADMIN_ACTIONS_KEY (wenn gesetzt, verlangt der Installer diesen Key)
- DEFAULT_GROUP (default: Aussendienst)

## Supabase SQL (Reihenfolge)

1) `supabase/core_users.sql` (user_groups + app_users minimal)
2) `supabase/admin_exec_sql.sql` (Installer: exec_sql Funktion)
3) `supabase/apps_registry.sql` (Apps + Dock + Visibility)

## Admin-Regel

- Nur Emails in `ADMIN_EMAILS` gelten als Admin.
- Beim ersten `GET /api/auth/me` wird automatisch ein `app_users` Profil angelegt bzw. `auth_user_id` gesetzt.

## UI/Apps Updates (2026-02-15)

- Home/Dock zeigen keine doppelten Apps mehr (Dedup nach `href`/`slug`).
- Layout nutzt die komplette Browser-Fläche (kein grauer Außenrand/Device-Rahmen).
- Datum/Uhrzeit stehen rechts neben der Suchleiste.
- Admin → Apps: installierte Apps können jetzt direkt deaktiviert/aktiviert und gelöscht werden.
