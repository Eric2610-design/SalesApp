-- Installer v1: package install log table
-- Run in Supabase SQL Editor

create table if not exists public.installed_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  manifest jsonb not null,
  installed_by text,
  installed_at timestamptz not null default now(),
  unique (name, version)
);

create index if not exists installed_packages_installed_at_idx
on public.installed_packages(installed_at desc);
