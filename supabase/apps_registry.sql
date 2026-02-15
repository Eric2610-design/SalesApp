-- Apps registry + visibility + dock favorites
create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  icon text,
  type text default 'link',
  href text,
  sort int default 100,
  is_enabled boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.app_group_visibility (
  app_id uuid references public.apps(id) on delete cascade,
  group_id uuid references public.user_groups(id) on delete cascade,
  is_visible boolean default true,
  primary key (app_id, group_id)
);

create table if not exists public.dock_favorites (
  group_id uuid references public.user_groups(id) on delete cascade,
  app_id uuid references public.apps(id) on delete cascade,
  position int default 100,
  primary key (group_id, app_id)
);

-- Seed apps
insert into public.apps (slug,title,icon,href,sort,is_enabled)
values
  ('database','Händler','🏪','/database',10,true),
  ('backlog','Auftragsrückstand','📦','/backlog',20,true),
  ('inventory','Lagerbestand','🏷️','/inventory',30,true),
  ('users','Profil','👤','/users',40,true),
  ('settings','Einstellungen','⚙️','/settings',90,true),
  ('admin','Admin','🛡️','/admin',94,true),
  ('admin-installer','Installer','🛠️','/admin/installer',95,true),
  ('admin-apps','Admin Apps','🧩','/admin/apps',96,true),
  ('admin-users','Benutzer','👥','/admin/users',97,true),
  ('admin-import','Datenimport','⬆️','/admin/import',98,true)
on conflict (slug) do nothing;

-- Visible for CEO/AD
insert into public.app_group_visibility(app_id, group_id, is_visible)
select a.id, g.id, true
from public.apps a
join public.user_groups g on lower(g.name) in ('aussendienst','ceo')
where a.slug in ('database','backlog','inventory','users','settings')
on conflict (app_id, group_id) do update set is_visible = excluded.is_visible;

-- Dock favorites for AD/CEO
insert into public.dock_favorites(group_id, app_id, position)
select g.id, a.id,
       case a.slug when 'database' then 10 when 'backlog' then 20 when 'inventory' then 30 when 'settings' then 90 else 100 end
from public.user_groups g
join public.apps a on a.slug in ('database','backlog','inventory','settings')
where lower(g.name) in ('aussendienst','ceo')
on conflict (group_id, app_id) do update set position = excluded.position;
