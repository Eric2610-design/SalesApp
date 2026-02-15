export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireUserFromRequest } from '../../../../lib/authServer';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

async function groupIdByName(admin, name) {
  const { data, error } = await admin.from('user_groups').select('id').ilike('name', name).maybeSingle();
  if (error) return null;
  return data?.id || null;
}

export async function GET(req) {
  const { isAdmin, error } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });
  if (!isAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data, error: e } = await admin.from('apps').select('*').order('sort', { ascending: true });
  if (e) return Response.json({ error: e.message }, { status: 500 });
  return Response.json({ ok: true, apps: data || [] });
}

export async function POST(req) {
  const { isAdmin, error } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });
  if (!isAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const {
    slug,
    title,
    icon,
    type = 'link',
    href,
    sort = 100,
    is_enabled = true,
    visibilityByGroup = {},
    dockByGroup = {},
  } = body || {};

  if (!slug || !title) return Response.json({ error: 'slug and title are required' }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: inserted, error: insErr } = await admin
    .from('apps')
    .insert([{ slug, title, icon: icon || '•', type, href: href || `/apps/${slug}`, sort: Number(sort) || 100, is_enabled: !!is_enabled }])
    .select('id')
    .single();

  if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
  const appId = inserted.id;

  const visRows = [];
  for (const [groupName, is_visible] of Object.entries(visibilityByGroup || {})) {
    const group_id = await groupIdByName(admin, groupName);
    if (!group_id) continue;
    visRows.push({ app_id: appId, group_id, is_visible: !!is_visible });
  }
  if (visRows.length) {
    const { error: vErr } = await admin.from('app_group_visibility').upsert(visRows, { onConflict: 'app_id,group_id' });
    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
  }

  const favRows = [];
  for (const [groupName, pos] of Object.entries(dockByGroup || {})) {
    if (pos == null || String(pos).trim() === '') continue;
    const group_id = await groupIdByName(admin, groupName);
    if (!group_id) continue;
    favRows.push({ group_id, app_id: appId, position: Number(pos) || 1 });
  }
  if (favRows.length) {
    const { error: fErr } = await admin.from('dock_favorites').upsert(favRows, { onConflict: 'group_id,app_id' });
    if (fErr) return Response.json({ error: fErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, app_id: appId });
}

export async function DELETE(req) {
  const { isAdmin, error } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });
  if (!isAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

  const url = new URL(req.url);
  const slug = url.searchParams.get('slug');
  if (!slug) return Response.json({ error: 'Missing slug' }, { status: 400 });

  // Protect core/admin pages from removal.
  const protectedSlugs = new Set([
    'home',
    'login',
    'profile',
    'users',
    'settings',
    'admin',
    'admin_apps',
    'admin_installer',
    'debug',
  ]);
  if (protectedSlugs.has(String(slug).toLowerCase())) {
    return Response.json({ error: 'Diese App ist geschützt und kann nicht deinstalliert werden.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data, error: delErr } = await admin
    .from('apps')
    .delete()
    .eq('slug', slug)
    .select('id,slug')
    .maybeSingle();

  if (delErr) return Response.json({ error: delErr.message }, { status: 500 });
  if (!data) return Response.json({ error: 'App nicht gefunden.' }, { status: 404 });

  // Foreign keys in supabase/apps_registry.sql are ON DELETE CASCADE, so
  // app_group_visibility + dock_favorites are cleaned automatically.
  return Response.json({ ok: true, deleted: data });
}
