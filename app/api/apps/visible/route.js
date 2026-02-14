export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { requireUserFromRequest } from '../../../../lib/authServer';
import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  const { group, isAdmin, error } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });

  const admin = getSupabaseAdmin();

  const { data: allApps, error: aErr } = await admin
    .from('apps')
    .select('id,slug,title,icon,type,href,sort,is_enabled')
    .eq('is_enabled', true)
    .order('sort', { ascending: true });

  if (aErr) return Response.json({ error: aErr.message }, { status: 500 });

  let apps = allApps || [];

  if (!isAdmin) {
    if (!group?.id) apps = [];
    const { data: vis, error: vErr } = await admin
      .from('app_group_visibility')
      .select('app_id')
      .eq('group_id', group.id)
      .eq('is_visible', true);

    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });

    const allowed = new Set((vis || []).map((x) => x.app_id));
    apps = apps.filter((a) => allowed.has(a.id));
  }

  let dock = [];
  if (group?.id) {
    const { data: fav, error: fErr } = await admin
      .from('dock_favorites')
      .select('app_id,position')
      .eq('group_id', group.id)
      .order('position', { ascending: true });

    if (!fErr && (fav || []).length) {
      const pos = new Map((fav || []).map((x) => [x.app_id, x.position]));
      dock = apps.filter((a) => pos.has(a.id)).sort((a, b) => (pos.get(a.id) || 0) - (pos.get(b.id) || 0));
    }
  }

  const settings = (allApps || []).find((a) => a.slug === 'settings');
  if (settings && !apps.some((a) => a.slug === 'settings')) apps = [...apps, settings];

  return Response.json({ ok: true, apps, dock });
}
