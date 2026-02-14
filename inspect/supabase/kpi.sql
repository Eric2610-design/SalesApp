-- KPI Summary function for Homescreen widgets
-- Run this in Supabase SQL Editor: supabase/kpi.sql

create or replace function public.kpi_summary()
returns jsonb
language sql
security definer
as $$
  select jsonb_build_object(
    'dealers_total', (select count(*) from public.dealers),
    'dealers_by_country', (
      select coalesce(jsonb_object_agg(country_code, cnt), '{}'::jsonb)
      from (
        select country_code, count(*)::int as cnt
        from public.dealers
        group by country_code
      ) x
    ),
    'backlog_lines', (select count(*) from public.backlog_rows),
    'backlog_customers', (select count(distinct customer_number) from public.backlog_rows),
    'backlog_latest', (
      select jsonb_build_object('created_at', created_at, 'filename', filename)
      from public.backlog_imports
      order by created_at desc
      limit 1
    ),
    'inventory_lines', (select count(*) from public.inventory_rows),
    'inventory_skus', (select count(distinct sku) from public.inventory_rows where sku is not null and sku <> ''),
    'inventory_latest', (
      select jsonb_build_object('created_at', created_at, 'filename', filename)
      from public.inventory_imports
      order by created_at desc
      limit 1
    ),
    'ad_users', (
      select count(*)::int
      from public.app_users au
      join public.user_groups ug on ug.id = au.group_id
      where lower(ug.name) = 'aussendienst'
    )
  );
$$;
