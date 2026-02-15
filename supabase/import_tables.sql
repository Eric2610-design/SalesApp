-- Generic Import Tables (CSV/XLSX) + Admin Audit Log

create extension if not exists pgcrypto;

-- Import runs
create table if not exists public.dataset_imports (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  filename text,
  mimetype text,
  row_count int default 0,
  inserted_count int default 0,
  status text default 'done',
  selected_columns jsonb,
  display_columns jsonb,
  column_types jsonb,
  save_schema boolean default true,
  schema_guess jsonb,
  created_by text,
  created_at timestamptz default now()
);

-- Ensure newer columns exist even on older installs
alter table public.dataset_imports add column if not exists inserted_count int default 0;
alter table public.dataset_imports add column if not exists status text default 'done';
alter table public.dataset_imports add column if not exists selected_columns jsonb;
alter table public.dataset_imports add column if not exists display_columns jsonb;
alter table public.dataset_imports add column if not exists column_types jsonb;
alter table public.dataset_imports add column if not exists save_schema boolean default true;
alter table public.dataset_imports add column if not exists schema_guess jsonb;

-- Dataset schema (how to display + type overrides per dataset)
create table if not exists public.dataset_schemas (
  dataset text primary key,
  display_columns jsonb,
  import_columns jsonb,
  column_types jsonb,
  updated_by text,
  updated_at timestamptz default now()
);

alter table public.dataset_schemas add column if not exists display_columns jsonb;
alter table public.dataset_schemas add column if not exists import_columns jsonb;
alter table public.dataset_schemas add column if not exists column_types jsonb;
alter table public.dataset_schemas add column if not exists updated_by text;
alter table public.dataset_schemas add column if not exists updated_at timestamptz default now();

-- Imported rows (JSON per row)
create table if not exists public.dataset_rows (
  id bigserial primary key,
  import_id uuid references public.dataset_imports(id) on delete cascade,
  dataset text not null,
  row_index int not null,
  row_data jsonb not null,
  created_at timestamptz default now()
);

create index if not exists dataset_rows_dataset_idx on public.dataset_rows(dataset);
create index if not exists dataset_rows_import_idx on public.dataset_rows(import_id);

-- Admin audit log (who did what, when)
create table if not exists public.admin_audit_log (
  id bigserial primary key,
  actor_email text,
  action text not null,
  target text,
  payload jsonb,
  undo jsonb,
  undone_at timestamptz,
  undone_by text,
  created_at timestamptz default now()
);

create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);
