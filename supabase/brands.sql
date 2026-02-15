-- Manufacturers + Buying Groups (icons)

create table if not exists public.manufacturers (
  key text primary key,
  name text not null,
  icon_data text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.buying_groups (
  key text primary key,
  name text not null,
  icon_data text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists manufacturers_name_idx on public.manufacturers(name);
create index if not exists buying_groups_name_idx on public.buying_groups(name);
