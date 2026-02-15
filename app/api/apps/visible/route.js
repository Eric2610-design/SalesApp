import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

function dedupeApps(list) {
  const out = [];
  const seen = new Set();
  for (const a of list || []) {
    const k = String(a?.href || a?.slug || a?.id || '').toLowerCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = getSupabaseAdmin();

  const { data: allApps, error: appsErr } = await admin
    .from('apps')
    .select('id,slug,title,icon,href,sort,is_enabled')
    .eq('is_enabled', true)
    .order('sort', { ascending: true });

  if (appsErr) return NextResponse.json({ error: appsErr.message }, { status: 500 });

  let apps = allApps || [];
  const groupId = me.profile?.group_id;

  if (!me.isAdmin) {
    if (!groupId) apps = [];
    else {
      const { data: vis, error: visErr } = await admin
        .from('app_group_visibility')
        .select('app_id,is_visible')
        .eq('group_id', groupId);

      if (visErr) return NextResponse.json({ error: visErr.message }, { status: 500 });

      const map = new Map((vis || []).map(v => [v.app_id, !!v.is_visible]));
      apps = apps.filter(a => map.get(a.id));
    }
  }

  apps = dedupeApps(apps);

  let dock = [];
  if (groupId) {
    const { data: fav, error: favErr } = await admin
      .from('dock_favorites')
      .select('position, apps (id,slug,title,icon,href,sort,is_enabled)')
      .eq('group_id', groupId)
      .order('position', { ascending: true });

    if (!favErr && fav) {
      dock = dedupeApps(fav.map(r => r.apps).filter(Boolean).filter(a => a.is_enabled));
    }
  }

  return NextResponse.json({ apps, dock });
}
