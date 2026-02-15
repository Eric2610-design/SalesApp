import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /.+@.+\..+/.test(email);
}

function genPassword() {
  // ~12-16 chars URL-safe
  return randomBytes(12).toString('base64url');
}

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const admin = getSupabaseAdmin();

  const { data: groups, error: gErr } = await admin
    .from('user_groups')
    .select('id,name')
    .order('name', { ascending: true });
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 });

  const { data: users, error: uErr } = await admin
    .from('app_users')
    .select('user_id,email,display_name,group_id,country_code,ad_key,auth_user_id,created_at')
    .order('created_at', { ascending: false });
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });

  return NextResponse.json({ users: users || [], groups: groups || [] });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));

  const email = normalizeEmail(body.email);
  if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 });

  const display_name = String(body.display_name || '').trim() || null;
  const group_id = body.group_id ? String(body.group_id) : null;
  const country_code = String(body.country_code || '').trim() || null;
  const ad_key = String(body.ad_key || '').trim() || null;

  const providedPw = String(body.password || '').trim();
  const password = providedPw || genPassword();
  if (password.length < 8) return NextResponse.json({ error: 'Password too short (min 8)' }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Create auth user
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: display_name || email }
  });

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  const authId = created?.user?.id;
  if (!authId) return NextResponse.json({ error: 'User creation failed (no id)' }, { status: 500 });

  // Create profile row
  const profileRow = {
    user_id: authId,
    auth_user_id: authId,
    email,
    display_name: display_name || email,
    group_id,
    country_code,
    ad_key
  };

  const { error: pErr } = await admin.from('app_users').insert(profileRow);
  if (pErr) {
    // best-effort cleanup
    try { await admin.auth.admin.deleteUser(authId); } catch {}
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  await writeAdminLog(admin, me, {
    action: 'user_create',
    target: email,
    payload: { email, display_name: profileRow.display_name, group_id, country_code, ad_key },
    undo: null
  });

  return NextResponse.json({
    user: {
      user_id: authId,
      auth_user_id: authId,
      email,
      display_name: profileRow.display_name,
      group_id,
      country_code,
      ad_key,
      created_at: new Date().toISOString()
    },
    // only return generated password (never echo back a provided one)
    password: providedPw ? null : password
  });
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

  // fetch previous row for logging
  const { data: prevRows } = await admin
    .from('app_users')
    .select('user_id,email,display_name,group_id,country_code,ad_key')
    .eq('user_id', user_id)
    .limit(1);
  const prev = prevRows?.[0] || null;

  const { data, error } = await admin
    .from('app_users')
    .update(patch)
    .eq('user_id', user_id)
    .select('user_id,email,display_name,group_id,country_code,ad_key,auth_user_id,created_at')
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const updated = data?.[0] || null;
  await writeAdminLog(admin, me, {
    action: 'user_update',
    target: updated?.email || user_id,
    payload: { patch, previous: prev },
    undo: null
  });

  return NextResponse.json({ user: updated });
}

export async function DELETE(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const user_id = String(body.user_id || body.id || '').trim();
  if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });

  const myId = String(me?.profile?.user_id || me?.user?.id || '').trim();
  if (myId && user_id === myId) return NextResponse.json({ error: 'Du kannst dich nicht selbst löschen.' }, { status: 400 });

  const admin = getSupabaseAdmin();

  // Find profile row
  let row = null;
  {
    const { data } = await admin
      .from('app_users')
      .select('user_id,email,display_name,group_id,country_code,ad_key,auth_user_id')
      .eq('user_id', user_id)
      .limit(1);
    row = data?.[0] || null;
  }
  if (!row) {
    const { data } = await admin
      .from('app_users')
      .select('user_id,email,display_name,group_id,country_code,ad_key,auth_user_id')
      .eq('auth_user_id', user_id)
      .limit(1);
    row = data?.[0] || null;
  }

  const authId = row?.auth_user_id || row?.user_id || user_id;

  // delete profile first (so app no longer sees it even if auth deletion fails)
  if (row) {
    const { error: delProfileErr } = await admin.from('app_users').delete().eq('user_id', row.user_id);
    if (delProfileErr) return NextResponse.json({ error: delProfileErr.message }, { status: 500 });
  }

  // then delete auth user
  try {
    const { error: delAuthErr } = await admin.auth.admin.deleteUser(authId);
    if (delAuthErr) {
      // If profile was deleted but auth wasn't: surface error
      return NextResponse.json({ error: delAuthErr.message }, { status: 500 });
    }
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }

  await writeAdminLog(admin, me, {
    action: 'user_delete',
    target: row?.email || authId,
    payload: { user_id: row?.user_id || null, auth_user_id: authId, email: row?.email || null },
    undo: null
  });

  return NextResponse.json({ ok: true });
}
