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

  // Defensive: if the DB was created without a UNIQUE constraint on apps.slug,
  // repeated installs can create duplicates. We dedupe by slug here so the UI
  // stays usable even before the DB is cleaned.
  const slugById = new Map((allApps || []).map((a) => [a.id, a.slug]));

  const dedupeBySlug = (list) => {
    const seen = new Set();
    const out = [];
    for (const a of list || []) {
      const slug = a?.slug;
      if (!slug) continue;
      if (seen.has(slug)) continue;
      seen.add(slug);
      out.push(a);
    }
    return out;
  };

  let apps = allApps || [];

  if (!isAdmin) {
    if (!group?.id) apps = [];

    const { data: vis, error: vErr } = await admin
      .from('app_group_visibility')
      .select('app_id')
      .eq('group_id', group.id)
      .eq('is_visible', true);

    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });

    // Convert allowed IDs to allowed slugs so duplicates don't break visibility.
    const allowedSlugs = new Set(
      (vis || [])
        .map((x) => slugById.get(x.app_id))
        .filter(Boolean)
    );

    apps = apps.filter((a) => allowedSlugs.has(a.slug));
  }

  apps = dedupeBySlug(apps);

  let dock = [];
  if (group?.id) {
    const { data: fav, error: fErr } = await admin
      .from('dock_favorites')
      .select('app_id,position')
      .eq('group_id', group.id)
      .order('position', { ascending: true });

    if (!fErr && (fav || []).length) {
      // Map favorite app_ids -> slug, then build a stable dock list by slug
      // so duplicate app rows don't break the dock.
      const posBySlug = new Map();
      for (const x of fav || []) {
        const slug = slugById.get(x.app_id);
        if (!slug) continue;
        if (!posBySlug.has(slug) || x.position < posBySlug.get(slug)) posBySlug.set(slug, x.position);
      }

      dock = apps
        .filter((a) => posBySlug.has(a.slug))
        .sort((a, b) => (posBySlug.get(a.slug) || 0) - (posBySlug.get(b.slug) || 0));
    }
  }

  const settings = (allApps || []).find((a) => a.slug === 'settings');
  if (settings && !apps.some((a) => a.slug === 'settings')) apps = [...apps, settings];

  // Final safety: ensure the response has no duplicates.
  apps = dedupeBySlug(apps);

  return Response.json({ ok: true, apps, dock });
}
