-- Add AD_KEY column to app_users for Außendienst mapping / imports
alter table if exists public.app_users
  add column if not exists ad_key text;

create unique index if not exists app_users_ad_key_unique
  on public.app_users(ad_key)
  where ad_key is not null;
