export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import JSZip from 'jszip';
import { requireUserFromRequest } from '../../../../../lib/authServer';
import { getSupabaseAdmin } from '../../../../../lib/supabaseAdmin';

function asString(v) {
  return (v == null) ? '' : String(v);
}
function isSafeSlug(s) {
  return /^[a-z0-9][a-z0-9_-]*$/i.test(asString(s).trim());
}
function safeInt(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

async function loadManifestFromZip(fileBuf) {
  const zip = await JSZip.loadAsync(fileBuf);
  // Prefer root manifest.json
  let file = zip.file('manifest.json')?.[0];
  if (!file) {
    const candidates = zip.file(/manifest\.json$/i) || [];
    // pick shortest path
    candidates.sort((a, b) => a.name.length - b.name.length);
    file = candidates[0];
  }
  if (!file) throw new Error('manifest.json nicht gefunden (muss in der ZIP enthalten sein).');
  const str = await file.async('string');
  let manifest;
  try {
    manifest = JSON.parse(str);
  } catch {
    throw new Error('manifest.json ist kein gültiges JSON.');
  }
  return manifest;
}

async function getGroupsMap(admin) {
  const { data, error } = await admin.from('user_groups').select('id,name');
  if (error) throw new Error('Konnte user_groups nicht lesen: ' + error.message);
  const map = new Map();
  for (const g of data || []) map.set(String(g.name).toLowerCase(), g.id);
  return map;
}

export async function GET(req) {
  const { isAdmin, error, user } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });
  if (!isAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data, error: e } = await admin
    .from('installed_packages')
    .select('id,name,version,installed_by,installed_at')
    .order('installed_at', { ascending: false })
    .limit(50);

  if (e) return Response.json({ error: e.message }, { status: 500 });
  return Response.json({ ok: true, packages: data || [] });
}

export async function POST(req) {
  const { isAdmin, error, user } = await requireUserFromRequest(req);
  if (error) return Response.json({ error }, { status: 401 });
  if (!isAdmin) return Response.json({ error: 'Admin only' }, { status: 403 });

  const admin = getSupabaseAdmin();

  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: 'Ungültiger Upload' }, { status: 400 });

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Response.json({ error: 'Keine Datei gefunden (FormData: file)' }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  let manifest;
  try {
    manifest = await loadManifestFromZip(buf);
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 400 });
  }

  const warnings = [];

  const name = asString(manifest.name).trim();
  const version = asString(manifest.version).trim() || '0.0.0';
  if (!name) return Response.json({ error: 'manifest.name fehlt' }, { status: 400 });

  const apps = Array.isArray(manifest.apps) ? manifest.apps : [];
  if (!apps.length) warnings.push('manifest.apps ist leer (keine Apps zu installieren).');

  // Upsert apps
  const appRows = [];
  for (const a of apps) {
    const slug = asString(a.slug).trim();
    const title = asString(a.title).trim();
    if (!slug || !title) {
      warnings.push('App übersprungen (slug/title fehlt): ' + JSON.stringify(a).slice(0, 200));
      continue;
    }
    if (!isSafeSlug(slug)) {
      warnings.push('App übersprungen (ungültiger slug): ' + slug);
      continue;
    }
    const type = asString(a.type).trim() || 'link';
    const href = asString(a.href).trim() || `/apps/${slug}`;
    const icon = asString(a.icon).trim() || '•';
    const sort = safeInt(a.sort, 100);
    const is_enabled = (a.is_enabled === false) ? false : true;
    const config = (a.config == null) ? null : a.config;

    appRows.push({ slug, title, icon, type, href, sort, is_enabled, config });
  }

  let upserted = [];
  if (appRows.length) {
    const { data, error: upErr } = await admin
      .from('apps')
      .upsert(appRows, { onConflict: 'slug' })
      .select('id,slug');

    if (upErr) return Response.json({ error: upErr.message }, { status: 500 });
    upserted = data || [];
  }

  const appIdBySlug = new Map(upserted.map((x) => [x.slug, x.id]));

  // Visibility
  const vis = Array.isArray(manifest.visibility) ? manifest.visibility : [];
  const dock = Array.isArray(manifest.dock) ? manifest.dock : [];

  const groups = await getGroupsMap(admin);

  const visRows = [];
  for (const v of vis) {
    const slug = asString(v.slug).trim();
    const groupName = asString(v.group).trim().toLowerCase();
    const is_visible = (v.is_visible === false) ? false : true;

    const app_id = appIdBySlug.get(slug);
    const group_id = groups.get(groupName);
    if (!app_id) { warnings.push(`Visibility übersprungen: unbekannte App slug ${slug}`); continue; }
    if (!group_id) { warnings.push(`Visibility übersprungen: unbekannte Gruppe ${v.group}`); continue; }
    visRows.push({ app_id, group_id, is_visible });
  }
  if (visRows.length) {
    const { error: vErr } = await admin.from('app_group_visibility').upsert(visRows, { onConflict: 'app_id,group_id' });
    if (vErr) return Response.json({ error: vErr.message }, { status: 500 });
  }

  // Dock
  const dockRows = [];
  for (const d of dock) {
    const slug = asString(d.slug).trim();
    const groupName = asString(d.group).trim().toLowerCase();
    const position = safeInt(d.position, 1);

    const app_id = appIdBySlug.get(slug);
    const group_id = groups.get(groupName);
    if (!app_id) { warnings.push(`Dock übersprungen: unbekannte App slug ${slug}`); continue; }
    if (!group_id) { warnings.push(`Dock übersprungen: unbekannte Gruppe ${d.group}`); continue; }
    dockRows.push({ group_id, app_id, position });
  }
  if (dockRows.length) {
    const { error: dErr } = await admin.from('dock_favorites').upsert(dockRows, { onConflict: 'group_id,app_id' });
    if (dErr) return Response.json({ error: dErr.message }, { status: 500 });
  }

  // Log package install
  try {
    const installed_by = user?.email || user?.id || null;
    await admin.from('installed_packages').insert([{ name, version, manifest, installed_by }]);
  } catch (e) {
    // ignore duplicate installs
    warnings.push('Install-Log Hinweis: ' + (e?.message || String(e)));
  }

  const requires_sql = Array.isArray(manifest.requires_sql) ? manifest.requires_sql : [];

  return Response.json({
    ok: true,
    package: { name, version },
    installed: {
      apps: appRows.map((a) => a.slug),
      visibility: visRows.length,
      dock: dockRows.length,
    },
    requires_sql,
    warnings,
  });
}
