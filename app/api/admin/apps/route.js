import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoToggleAppEnabled, undoRestoreApp } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('apps').select('*').order('sort', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ apps: data || [] });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '').trim();
  const title = String(body.title || '').trim();
  if (!slug || !title) return NextResponse.json({ error: 'Missing slug/title' }, { status: 400 });

  const payload = {
    slug,
    title,
    icon: String(body.icon || '•'),
    href: String(body.href || `/apps/${slug}`),
    sort: Number(body.sort || 100),
    is_enabled: body.enabled === false ? false : true,
    type: 'link'
  };

  const admin = getSupabaseAdmin();

  // Prevent accidental duplicates if the DB table was created without a UNIQUE(slug) constraint.
  const { data: existing, error: exErr } = await admin
    .from('apps')
    .select('*')
    .eq('slug', slug)
    .limit(1);

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  if (existing?.length) {
    const id = existing[0].id;
    const { data, error } = await admin.from('apps').update(payload).eq('id', id).select('*').limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAdminLog(admin, me, {
      action: 'update_app',
      target: slug,
      payload: { id, patch: payload },
      undo: null
    });

    return NextResponse.json({ app: data?.[0] || null, updated: true });
  }

  const { data, error } = await admin.from('apps').insert(payload).select('*').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminLog(admin, me, {
    action: 'create_app',
    target: slug,
    payload: { id: data?.[0]?.id || null, app: data?.[0] || null },
    undo: null
  });

  return NextResponse.json({ app: data?.[0] || null, created: true });
}

export async function PATCH(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = String(body.id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const patch = {};
  if (body.slug != null) patch.slug = String(body.slug).trim();
  if (body.title != null) patch.title = String(body.title).trim();
  if (body.icon != null) patch.icon = String(body.icon || '•');
  if (body.href != null) patch.href = String(body.href || '').trim();
  if (body.sort != null) patch.sort = Number(body.sort);
  if (body.is_enabled != null) patch.is_enabled = !!body.is_enabled;
  if (body.enabled != null) patch.is_enabled = !!body.enabled;

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: before } = await admin.from('apps').select('*').eq('id', id).limit(1);
  const prev = before?.[0] || null;

  const { data, error } = await admin.from('apps').update(patch).eq('id', id).select('*').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const after = data?.[0] || null;

  let undo = null;
  if (prev && Object.prototype.hasOwnProperty.call(patch, 'is_enabled')) {
    undo = undoToggleAppEnabled(id, prev.is_enabled);
  }

  await writeAdminLog(admin, me, {
    action: 'patch_app',
    target: after?.slug || prev?.slug || id,
    payload: { id, patch },
    undo
  });

  return NextResponse.json({ app: after });
}

export async function DELETE(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const url = new URL(req.url);
  let id = url.searchParams.get('id');
  if (!id) {
    const body = await req.json().catch(() => ({}));
    id = body?.id;
  }
  id = String(id || '').trim();
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: before } = await admin.from('apps').select('*').eq('id', id).limit(1);
  const prev = before?.[0] || null;

  // Best-effort cleanup (works even if FK constraints were not created).
  await admin.from('dock_favorites').delete().eq('app_id', id);
  await admin.from('app_group_visibility').delete().eq('app_id', id);

  const { error } = await admin.from('apps').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminLog(admin, me, {
    action: 'delete_app',
    target: prev?.slug || id,
    payload: { id, slug: prev?.slug || null },
    undo: prev ? undoRestoreApp(prev) : null
  });

  return NextResponse.json({ ok: true });
}
