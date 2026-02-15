-- Minimal tables required by the app

create table if not exists public.user_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table if not exists public.app_users (
  user_id uuid primary key,
  email text not null unique,
  display_name text,
  group_id uuid references public.user_groups(id),
  country_code text,
  created_at timestamptz default now(),
  ad_key text,
  auth_user_id uuid unique
);

insert into public.user_groups (name) values ('Admin') on conflict (name) do nothing;
insert into public.user_groups (name) values ('Aussendienst') on conflict (name) do nothing;
insert into public.user_groups (name) values ('CEO') on conflict (name) do nothing;
