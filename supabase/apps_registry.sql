-- Apps Registry for SalesOS
-- Run in Supabase SQL Editor

create table if not exists public.apps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  icon text not null default '•',
  type text not null default 'link',
  href text not null,
  sort int not null default 100,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_group_visibility (
  app_id uuid not null references public.apps(id) on delete cascade,
  group_id uuid not null references public.user_groups(id) on delete cascade,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (app_id, group_id)
);

create table if not exists public.dock_favorites (
  group_id uuid not null references public.user_groups(id) on delete cascade,
  app_id uuid not null references public.apps(id) on delete cascade,
  position int not null default 1,
  created_at timestamptz not null default now(),
  primary key (group_id, app_id)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists apps_set_updated_at on public.apps;
create trigger apps_set_updated_at before update on public.apps
for each row execute function public.set_updated_at();

insert into public.user_groups (name)
select x.name from (values ('Admin'),('Aussendienst'),('CEO')) x(name)
where not exists (select 1 from public.user_groups g where lower(g.name)=lower(x.name));

insert into public.apps (slug,title,icon,type,href,sort,is_enabled)
select * from (values
  ('dealers','Händler','🏪','link','/database',10,true),
  ('backlog','Rückstand','📦','link','/backlog',20,true),
  ('inventory','Lager','🏭','link','/inventory',30,true),
  ('profile','Profil','👤','link','/users',40,true),
  ('settings','Settings','⚙️','link','/settings',90,true),
  ('admin_apps','Admin Apps','🛠️','link','/admin/apps',95,true),
  ('admin','Admin','🧨','link','/admin',99,true)
) v(slug,title,icon,type,href,sort,is_enabled)
where not exists (select 1 from public.apps a where a.slug=v.slug);

do $$
declare
  g_ad uuid;
  g_ceo uuid;
  a_dealers uuid;
  a_backlog uuid;
  a_inventory uuid;
  a_profile uuid;
  a_settings uuid;
begin
  select id into g_ad from public.user_groups where lower(name)='aussendienst' limit 1;
  select id into g_ceo from public.user_groups where lower(name)='ceo' limit 1;

  select id into a_dealers from public.apps where slug='dealers';
  select id into a_backlog from public.apps where slug='backlog';
  select id into a_inventory from public.apps where slug='inventory';
  select id into a_profile from public.apps where slug='profile';
  select id into a_settings from public.apps where slug='settings';

  insert into public.app_group_visibility(app_id,group_id,is_visible)
  values
    (a_dealers,g_ad,true),
    (a_backlog,g_ad,true),
    (a_inventory,g_ad,true),
    (a_profile,g_ad,true),
    (a_settings,g_ad,true)
  on conflict (app_id,group_id) do update set is_visible=excluded.is_visible;

  insert into public.app_group_visibility(app_id,group_id,is_visible)
  values
    (a_dealers,g_ceo,true),
    (a_backlog,g_ceo,true),
    (a_inventory,g_ceo,true),
    (a_profile,g_ceo,true),
    (a_settings,g_ceo,true)
  on conflict (app_id,group_id) do update set is_visible=excluded.is_visible;

  insert into public.dock_favorites(group_id,app_id,position)
  values
    (g_ad,a_dealers,1),
    (g_ad,a_backlog,2),
    (g_ad,a_inventory,3),
    (g_ad,a_settings,4),
    (g_ceo,a_dealers,1),
    (g_ceo,a_backlog,2),
    (g_ceo,a_inventory,3),
    (g_ceo,a_settings,4)
  on conflict (group_id,app_id) do update set position=excluded.position;
end $$;
