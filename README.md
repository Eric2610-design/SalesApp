# SalesApp – Händler Import (DE/AT/CH)

Diese kleine App erlaubt dir:

- Händlerlisten als **xlsx/xls/csv** hochzuladen
- Parsing der Spalten:
  - **Spalte A**: Kundennummer + Name (getrennt durch `.`) → wird in `customer_number` und `name` getrennt
  - **Spalte B**: Straße + Hausnummer → wird (best effort) in `street` und `house_number` getrennt
  - **Spalte C**: Postleitzahl → `postal_code`
  - **Spalte D**: Ort → `city`
- Zusätzlich wird ein **Länderkürzel** (`DE`, `AT`, `CH`) gespeichert
- Import in **Supabase** (Postgres) per serverseitiger API (Service Role Key bleibt geheim)
- Händler-Tabelle anzeigen, nach Land filtern und durchsuchen

## 1) Supabase Tabelle

Lege in Supabase diese Tabelle an (SQL Editor):

```sql
create table if not exists public.dealers (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  customer_number text not null,
  name text,
  street text,
  house_number text,
  postal_code text,
  city text,
  created_at timestamptz not null default now(),
  unique (country_code, customer_number)
);

-- Optional: schneller filtern/suchen
create index if not exists dealers_country_idx on public.dealers(country_code);
create index if not exists dealers_customer_idx on public.dealers(customer_number);
```

## 2) Env Vars

In Vercel (Project → Settings → Environment Variables):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Lokal: `.env.local` anhand `.env.example`.

## 3) Start

```bash
npm install
npm run dev
```

## Hinweise zum Parsing

Das Parsing versucht Hausnummern wie `12`, `12a`, `12-14`, `12/1` zu erkennen. Wenn etwas nicht trennbar ist, bleibt `house_number` leer.

Wenn du mir die 3 Beispiel-Dateien hochlädst, kann ich die Regex/Regeln schnell auf eure echten Daten feinjustieren.
