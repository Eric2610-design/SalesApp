import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoRestoreManufacturer } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

function cleanKey(v) {
  return String(v || '').trim();
}

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Nur Admin' }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('manufacturers').select('*').order('name', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data || [] });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Nur Admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const key = cleanKey(body.key);
  const name = String(body.name || '').trim();
  const icon_data = body.icon_data == null ? null : String(body.icon_data);
  if (!key) return NextResponse.json({ error: 'Key fehlt' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Name fehlt' }, { status: 400 });

  const admin = getSupabaseAdmin();
  try {
    const { data: prevRows } = await admin.from('manufacturers').select('*').eq('key', key).limit(1);
    const prev = prevRows?.[0] || null;

    const row = { key, name, icon_data, updated_at: new Date().toISOString() };
    const { error } = await admin.from('manufacturers').upsert(row, { onConflict: 'key' });
    if (error) throw new Error(error.message);

    await writeAdminLog(admin, me, {
      action: prev ? 'manufacturer.update' : 'manufacturer.create',
      target: key,
      payload: { key, name, has_icon: !!icon_data },
      undo: undoRestoreManufacturer(key, prev)
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Nur Admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const key = cleanKey(body.key);
  if (!key) return NextResponse.json({ error: 'Key fehlt' }, { status: 400 });

  const admin = getSupabaseAdmin();
  try {
    const { data: prevRows } = await admin.from('manufacturers').select('*').eq('key', key).limit(1);
    const prev = prevRows?.[0] || null;

    const { error } = await admin.from('manufacturers').delete().eq('key', key);
    if (error) throw new Error(error.message);

    await writeAdminLog(admin, me, {
      action: 'manufacturer.delete',
      target: key,
      payload: { key },
      undo: undoRestoreManufacturer(key, prev)
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
