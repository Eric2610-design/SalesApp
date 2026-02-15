import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { setImpersonateCookie, clearImpersonateCookie } from '@/lib/authCookies';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  return NextResponse.json({ impersonating: me.impersonating || null });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('app_users')
    .select('user_id,email,display_name')
    .eq('user_id', user_id)
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const u = data?.[0] || null;
  if (!u) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  setImpersonateCookie(user_id);

  await writeAdminLog(admin, me, {
    action: 'impersonate_start',
    target: u.email || user_id,
    payload: { user_id },
    undo: null
  });

  return NextResponse.json({ ok: true, user: u });
}

export async function DELETE(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const admin = getSupabaseAdmin();
  const prev = me.impersonating || null;
  clearImpersonateCookie();

  await writeAdminLog(admin, me, {
    action: 'impersonate_end',
    target: prev?.email || null,
    payload: prev || null,
    undo: null
  });

  return NextResponse.json({ ok: true });
}
