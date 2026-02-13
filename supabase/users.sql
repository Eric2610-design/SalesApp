-- Users / Groups / Außendienst-Gebiete
create extension if not exists btree_gist;

create table if not exists public.user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.user_groups (name, permissions)
values
  ('Admin', '{"manage_users": true, "import_dealers": true, "view_database": true, "view_all_countries": true, "edit_territories": true}'::jsonb),
  ('Aussendienst', '{"manage_users": false, "import_dealers": false, "view_database": true, "view_all_countries": false, "edit_territories": false}'::jsonb),
  ('CEO', '{"manage_users": false, "import_dealers": true, "view_database": true, "view_all_countries": true, "edit_territories": false}'::jsonb)
on conflict (name) do nothing;

create table if not exists public.app_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  group_id uuid references public.user_groups(id) on delete set null,
  country_code text check (country_code in ('DE','AT','CH') or country_code is null),
  created_at timestamptz not null default now()
);

create table if not exists public.ad_territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_code text not null check (country_code in ('DE','AT','CH')),
  prefix_len int not null check (prefix_len between 2 and 5),
  from_prefix int not null check (from_prefix >= 0),
  to_prefix int not null check (to_prefix >= 0),
  prefix_range int4range generated always as (int4range(from_prefix, to_prefix, '[]')) stored,
  created_at timestamptz not null default now(),
  check (from_prefix <= to_prefix)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ad_territories_no_overlap') then
    alter table public.ad_territories
      add constraint ad_territories_no_overlap
      exclude using gist (
        user_id with =,
        country_code with =,
        prefix_len with =,
        prefix_range with &&
      );
  end if;
end $$;
