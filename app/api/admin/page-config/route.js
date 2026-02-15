import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoRestorePageConfig } from '@/lib/adminLog';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Nur Admin.' }, { status: 403 });

  const url = new URL(req.url);
  const key = String(url.searchParams.get('key') || '').trim();
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('page_configs')
    .select('key,config,updated_by,updated_at')
    .eq('key', key)
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ key, config: data?.[0]?.config || null });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Nur Admin.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const key = String(body.key || '').trim();
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });
  const config = body.config && typeof body.config === 'object' ? body.config : {};

  const admin = getSupabaseAdmin();

  const { data: prevRows } = await admin
    .from('page_configs')
    .select('key,config,updated_by,updated_at')
    .eq('key', key)
    .limit(1);
  const previousRow = prevRows?.[0] || null;

  const nextRow = {
    key,
    config,
    updated_by: me.profile?.email || me.user?.email,
    updated_at: new Date().toISOString()
  };

  const { error } = await admin.from('page_configs').upsert(nextRow, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminLog({
    admin,
    actor: me.profile?.email || me.user?.email,
    action: 'update_page_config',
    details: { key, config },
    undo: undoRestorePageConfig(key, previousRow)
  });

  return NextResponse.json({ ok: true, key });
}
