import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const admin = getSupabaseAdmin();

  const { data: groups, error: gErr } = await admin.from('user_groups').select('id,name').order('name', { ascending: true });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const { data: users, error: uErr } = await admin
    .from('app_users')
    .select('user_id,email,display_name,group_id,country_code,ad_key,auth_user_id,created_at')
    .order('created_at', { ascending: false });
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ users: users || [], groups: groups || [] });
}

export async function PATCH(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const user_id = String(body.user_id || '').trim();
  if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });

  const patch = {};
  if (body.display_name != null) patch.display_name = String(body.display_name || '').trim() || null;
  if (body.group_id != null) patch.group_id = body.group_id ? String(body.group_id) : null;
  if (body.country_code != null) patch.country_code = String(body.country_code || '').trim() || null;
  if (body.ad_key != null) patch.ad_key = String(body.ad_key || '').trim() || null;

  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('app_users')
    .update(patch)
    .eq('user_id', user_id)
    .select('user_id,email,display_name,group_id,country_code,ad_key,auth_user_id,created_at')
    .limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data?.[0] || null });
}
