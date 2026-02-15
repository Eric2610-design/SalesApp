-- Clean up duplicate app rows (and related visibility/dock rows) caused by running
-- installer multiple times on a DB that was created without UNIQUE constraints.
--
-- Safe to run multiple times.

-- 0) Inspect duplicates
-- select slug, count(*) from public.apps group by slug having count(*) > 1;

-- 1) For each slug, keep the oldest row and remap references
with ranked as (
  select
    id,
    slug,
    row_number() over (partition by slug order by created_at asc, id asc) as rn,
    first_value(id) over (partition by slug order by created_at asc, id asc) as keep_id
  from public.apps
)
update public.app_group_visibility v
set app_id = r.keep_id
from ranked r
where v.app_id = r.id
  and r.rn > 1
  and r.keep_id is not null;

with ranked as (
  select
    id,
    slug,
    row_number() over (partition by slug order by created_at asc, id asc) as rn,
    first_value(id) over (partition by slug order by created_at asc, id asc) as keep_id
  from public.apps
)
update public.dock_favorites d
set app_id = r.keep_id
from ranked r
where d.app_id = r.id
  and r.rn > 1
  and r.keep_id is not null;

-- 2) Delete duplicate app rows
with ranked as (
  select
    id,
    slug,
    row_number() over (partition by slug order by created_at asc, id asc) as rn
  from public.apps
)
delete from public.apps a
using ranked r
where a.id = r.id
  and r.rn > 1;

-- 3) Remove duplicates inside linking tables (same group/app twice)
with d as (
  select group_id, app_id, min(ctid) as keep_ctid
  from public.app_group_visibility
  group by group_id, app_id
  having count(*) > 1
)
delete from public.app_group_visibility v
using d
where v.group_id = d.group_id
  and v.app_id = d.app_id
  and v.ctid <> d.keep_ctid;

with d as (
  select group_id, app_id, min(ctid) as keep_ctid
  from public.dock_favorites
  group by group_id, app_id
  having count(*) > 1
)
delete from public.dock_favorites f
using d
where f.group_id = d.group_id
  and f.app_id = d.app_id
  and f.ctid <> d.keep_ctid;

-- 4) Add UNIQUE indexes (needed for proper UPSERT / onConflict)
-- Note: index names are fixed; if you already have different unique constraints,
-- you can skip this block.

create unique index if not exists apps_slug_uidx
  on public.apps (slug);

create unique index if not exists app_group_visibility_group_app_uidx
  on public.app_group_visibility (group_id, app_id);

create unique index if not exists dock_favorites_group_app_uidx
  on public.dock_favorites (group_id, app_id);

-- Optional (recommended): a group should not have two different apps at the same position
create unique index if not exists dock_favorites_group_pos_uidx
  on public.dock_favorites (group_id, position);
