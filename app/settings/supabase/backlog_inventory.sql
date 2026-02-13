-- Auftragsrückstand (Backlog)
create table if not exists public.backlog_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  filename text,
  has_header boolean not null default true,
  columns jsonb not null default '[]'::jsonb,          -- array of column labels
  display_columns jsonb not null default '[]'::jsonb   -- array of column labels
);

create table if not exists public.backlog_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.backlog_imports(id) on delete cascade,
  row_index int not null,
  customer_number text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists backlog_rows_customer_number_idx
  on public.backlog_rows(customer_number);

create index if not exists backlog_rows_import_id_idx
  on public.backlog_rows(import_id);

-- Lagerbestand (Inventory)
create table if not exists public.inventory_imports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  filename text,
  has_header boolean not null default true,
  columns jsonb not null default '[]'::jsonb,
  display_columns jsonb not null default '[]'::jsonb
);

create table if not exists public.inventory_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.inventory_imports(id) on delete cascade,
  row_index int not null,
  sku text,
  qty numeric,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists inventory_rows_import_id_idx
  on public.inventory_rows(import_id);

create index if not exists inventory_rows_sku_idx
  on public.inventory_rows(sku);
-- Views: Rückstand im Außendienst-Gebiet (basierend auf dealer_ad_matches + backlog_rows)
-- Wichtig: backlog_imports wird im Import-Prozess auf "nur 1 aktueller Import" reduziert.
create or replace view public.ad_backlog_rows as
select
  m.ad_user_id,
  m.dealer_id,
  d.country_code,
  d.customer_number,
  d.name as dealer_name,
  d.postal_code,
  d.city,
  b.id as backlog_row_id,
  b.row_index,
  b.data
from public.dealer_ad_matches m
join public.dealers d on d.id = m.dealer_id
join public.backlog_rows b on b.customer_number = d.customer_number
join public.backlog_imports bi on bi.id = b.import_id;

create or replace view public.ad_backlog_summary as
select
  ad_user_id,
  dealer_id,
  max(dealer_name) as dealer_name,
  max(country_code) as country_code,
  max(postal_code) as postal_code,
  max(city) as city,
  count(*)::int as backlog_lines
from public.ad_backlog_rows
group by ad_user_id, dealer_id;
