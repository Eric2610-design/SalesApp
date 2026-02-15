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
- ADMIN_ACTIONS_KEY (wenn gesetzt, verlangen Setup/„Alles löschen“-Aktionen diesen Key)
- DEFAULT_GROUP (default: Aussendienst)

## Supabase SQL (Reihenfolge)

1) `supabase/core_users.sql` (user_groups + app_users minimal)
2) `supabase/admin_exec_sql.sql` (Installer: exec_sql Funktion)
3) `supabase/apps_registry.sql` (Apps + Dock + Visibility)
4) `supabase/import_tables.sql` (Datenimport + Admin-Log)

Hinweis: Im Installer gibt es dafür Beispiel-SQLs (oben rechts „Beispiele“).

## Admin-Regel

- Nur Emails in `ADMIN_EMAILS` gelten als Admin.
- Beim ersten `GET /api/auth/me` wird automatisch ein `app_users` Profil angelegt bzw. `auth_user_id` gesetzt.

## UI/Apps Updates (2026-02-15)

- Home/Dock zeigen keine doppelten Apps mehr (Dedup nach `href`/`slug`).
- Layout nutzt die komplette Browser-Fläche (kein grauer Außenrand/Device-Rahmen).
- Datum/Uhrzeit stehen rechts neben der Suchleiste.
- Admin → Apps: installierte Apps können jetzt direkt deaktiviert/aktiviert und gelöscht werden.

## UI/Apps Updates (2026-02-15.2)

- Home/Desktop: Alle Admin-Unterseiten (`/admin/*`) werden zu einer einzigen Kachel **Admin** zusammengefasst.
- Neue Admin-Startseite `/admin` (Apps, Installer, Benutzer, Datenimport).
- Admin → Datenimport: CSV/XLSX Upload in generische Import-Tabellen (`dataset_imports`, `dataset_rows`).

## UI/Apps Updates (2026-02-15.3)

- Admin → Datenimport:
  - Datei wird **vor dem Import analysiert** (Spalten, Typ, Füllgrad, Beispiele)
  - Du wählst **Import-Spalten** und **Anzeigespalten** (Anzeige ⊆ Import)
  - Import läuft in **Chunks mit Fortschrittsanzeige**
  - „Letzten Import löschen“ + „Alle Imports dieses Datasets löschen“
- Admin → Log (`/admin/log`):
  - zeichnet die letzten Admin-Aktionen auf
  - wo möglich, mit **Rückgängig** (z.B. Import rollback, App aktiv/inaktiv, App restore nach Delete)

### Setup-Hinweis

Wenn Import/Log Fehler wie „relation … does not exist“ melden:
- Admin → Datenimport → **Setup: Import-Tabellen + Admin-Log**
- oder im Admin → Installer das Beispiel **03 import tables** ausführen.

## UI/Apps Updates (2026-02-15.4)

- Admin → **Dataset Einstellungen** (`/admin/datasets`):
  - Anzeigespalten pro Dataset dauerhaft konfigurieren
  - Spalten-Typen/Formatierung anpassen (z.B. Datum als Excel-Zahl → Datum)
  - Live-Vorschau
  - Speichern schreibt in `dataset_schemas` (mit Admin-Log + Undo)
- Admin → Datenimport:
  - Nach der Analyse kannst du **den Typ pro Spalte ändern**
  - Optional: „Als Standard-Schema speichern“ (Anzeige + Typen)
  - Dataset-Seiten formatieren Werte anhand des Schemas

### SQL-Änderung

Für die neuen Schema-Funktionen brauchst du die aktualisierten Import-Tabellen:
- Im Admin → Installer: Beispiel **03 import tables** erneut ausführen (idempotent)
  - fügt `dataset_schemas` hinzu

## UI/Apps Updates (2026-02-15.6)

- **Händlerliste** (`/database`): Suchfeld zum Filtern der geladenen Zeilen.
- **Listen optional gruppieren** (z.B. Rückstand nach Auftragsnummer):
  - Admin → **Dataset Einstellungen** (`/admin/datasets`)
  - pro Dataset: „Listenansicht → Gruppierte Ansicht aktivieren“ + „Gruppieren nach …“
- **Rückstand auf Händlerseite gruppieren**:
  - Admin → **Händlerseite** (`/admin/dealer-view`)
  - „Rückstand auf Händlerseite gruppieren“ + „Gruppieren nach …“ (z.B. Auftragsnummer)
- **Lagerbestand flexibel filtern**:
  - Admin → Dataset Einstellungen → **inventory**
  - Filter-Regeln (mehrere Kriterien, UND-Verknüpfung), werden auf `/inventory` angewendet
- Admin-Log Bugfix: `page-config` schreibt wieder korrekt ins Admin-Log (Undo möglich).

### SQL

Für diese Änderungen ist **keine neue SQL-Struktur** nötig (nur JSON-Konfigurationen). Falls dir jedoch noch Tabellen fehlen:
- Admin → Installer → Beispiel **03 import tables** ausführen.
  - ergänzt `dataset_imports` um `column_types` + `save_schema`

## UI/Apps Updates (2026-02-15.5)

- Globaler Header: **Zurück** + **Home** oben links (immer sichtbar, ohne Scrollen).
- Admin → Dataset Einstellungen:
  - Spalten **Reihenfolge** ändern (↑/↓)
  - Spalten **Labels** (Überschriften) setzen
  - Rückstand: **Zusatzinfos per Join** aus Händler/Lager als neue Spalten hinzufügen (Alias + Label + Typ)
  - Lager: **Standard-Ansicht** (Kacheln/Liste) + Gruppierung (z.B. nach Modell)
- Lagerseite `/inventory`: neue **Kachel-Ansicht** (responsive Grid, keine horizontale Scrollbar).
- Händler-Detailseite `/dealers/[id]`:
  - zeigt Händlerdaten + optional Rückstand dieses Händlers
  - Admin → **Händlerseite** (`/admin/dealer-view`) konfiguriert Keys + angezeigte Spalten

### SQL-Änderung

Für Join/Labels/Views + Händlerseite braucht `supabase/import_tables.sql` erneut auszuführen (idempotent):
- `dataset_schemas` bekommt neue Spalten: `column_labels`, `joins`, `view_config`
- neue Tabelle: `page_configs` (z.B. `dealer_view`)

## UI/Apps Updates (2026-02-15.7)

- **Händlerkarte** (OpenStreetMap/Leaflet) ist jetzt die Standard-Ansicht auf `/database`.
  - Marker sind anklickbar → Link zur Händler-Übersichtsseite `/dealers/[id]`.
  - **Liste** zeigt **nur Händler im aktuellen Kartenausschnitt**.
  - Toggle: **„Nur Händler mit Rückstand“** (ermittelt via `dealer_view` Keys `dealer_key`/`backlog_key`).
- Neue API: `GET /api/dealers/map`
  - liefert alle Händler mit Koordinaten (plus `hasBacklog`).
  - Fallback-Key-Erkennung für `lat/lng` falls Spalten anders heißen.

## UI/Apps Updates (2026-02-15.8)

- Admin → **Dataset Einstellungen** → Dataset **dealers**:
  - neue Sektion **„Geodaten (Karte)“**
  - Modus: **Auto** oder **Manuell (Lat/Lng Spalten wählen)**
  - Buttons: „Vorschlag setzen“ + „Lat/Lng tauschen“
- Händlerkarte (`/database`) nutzt nun – falls gesetzt – die konfigurierten Spalten aus `dataset_schemas.view_config.geo`.

## UI/Apps Updates (2026-02-15.9)

- **Apps/Listen:** keine „Spalten/Typen“/„Import“-Links mehr in den normalen Apps. Konfiguration nur noch im Admin.
- **Header:** bleibt in **einer Zeile** und passt sich der Browserbreite an (ohne Umbruch).
- **Admin → Hersteller & Einkaufsverbände** (`/admin/brands`):
  - Hersteller + Einkaufsverbände anlegen/bearbeiten/löschen inkl. **Piktogramm Upload**.
  - Aktionen werden im Admin‑Log erfasst (Undo möglich).
- **Admin → Dataset Einstellungen → dealers:** neue Sektion **Hersteller & Einkaufsverbände**
  - einstellen, aus welcher Spalte (oder aus mehreren Spalten) Hersteller‑Keys gelesen werden
  - optionale Spalte für Einkaufsverband
  - inkl. Vorschau
- **Händlerkarte + Händlerdetail:** zeigt Piktogramme (Hersteller links, Einkaufsverband rechts)
  - Marker‑Popup + Händlerliste + Händlerdetail nutzen die hinterlegten Keys

### SQL

Für Hersteller/Einkaufsverbände werden neue Tabellen benötigt:
- Admin → Installer → Beispiel **04 manufacturers + buying groups** ausführen.
  - legt `manufacturers` und `buying_groups` an
