-- Generic Import Tables (CSV/XLSX)

create extension if not exists pgcrypto;

create table if not exists public.dataset_imports (
  id uuid primary key default gen_random_uuid(),
  dataset text not null,
  filename text,
  mimetype text,
  row_count int default 0,
  created_by text,
  created_at timestamptz default now()
);

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
