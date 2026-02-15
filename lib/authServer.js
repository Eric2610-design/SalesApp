import { getRequiredEnv, getEnv, parseCsvList } from './env';
import { getSupabaseAdmin } from './supabaseAdmin';
import { readAuthCookies, setAuthCookies, clearAuthCookies, readImpersonateCookie } from './authCookies';

const ADMIN_EMAILS = parseCsvList(getEnv('ADMIN_EMAILS', ''));
const DEFAULT_GROUP = getEnv('DEFAULT_GROUP', 'Aussendienst');

const APP_USER_COLS_WITH_PLZ = 'user_id,email,display_name,group_id,country_code,ad_key,plz_filter,auth_user_id';
const APP_USER_COLS_BASE = 'user_id,email,display_name,group_id,country_code,ad_key,auth_user_id';

async function safeSelectAppUsers(admin, builderFactory) {
  // Some installs may not yet have optional columns (e.g. plz_filter).
  // Try with the newest column set and fall back gracefully.
  let res = await builderFactory(APP_USER_COLS_WITH_PLZ);
  const msg = String(res?.error?.message || '').toLowerCase();
  if (res?.error && msg.includes('plz_filter') && msg.includes('does not exist')) {
    res = await builderFactory(APP_USER_COLS_BASE);
  }
  return res;
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email));
}

async function fetchJson(url, init = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache:'no-store' });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

export async function signInWithPassword(email, password) {
  const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const url = `${supabaseUrl}/auth/v1/token?grant_type=password`;
  const { ok, json, text } = await fetchJson(url, {
    method:'POST',
    headers:{ apikey: anonKey, 'Content-Type':'application/json' },
    body: JSON.stringify({ email: normalizeEmail(email), password })
  });

  if (!ok) throw new Error(json?.error_description || json?.error || text || 'Login failed');
  return json;
}

async function refreshSession(refresh_token) {
  const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const url = `${supabaseUrl}/auth/v1/token?grant_type=refresh_token`;
  const { ok, json, text } = await fetchJson(url, {
    method:'POST',
    headers:{ apikey: anonKey, 'Content-Type':'application/json' },
    body: JSON.stringify({ refresh_token })
  });

  if (!ok) throw new Error(json?.error_description || json?.error || text || 'Refresh failed');
  return json;
}

async function getUserFromAccessToken(access_token) {
  const supabaseUrl = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = getRequiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const url = `${supabaseUrl}/auth/v1/user`;
  const { ok, json, text, status } = await fetchJson(url, {
    headers:{ apikey: anonKey, authorization: `Bearer ${access_token}` }
  }, 12000);

  if (!ok) {
    const e = new Error(json?.msg || json?.error_description || json?.error || text || 'Unauthorized');
    e.status = status || 401;
    throw e;
  }
  return json;
}

async function ensureGroups() {
  const admin = getSupabaseAdmin();
  const desired = ['Admin', 'Aussendienst', 'CEO'];
  const { data: existing } = await admin.from('user_groups').select('id,name');
  const existingLower = new Set((existing || []).map((x) => (x.name || '').toLowerCase()));
  const toInsert = desired.filter((n) => !existingLower.has(n.toLowerCase())).map((name) => ({ name }));
  if (toInsert.length) await admin.from('user_groups').insert(toInsert);
}

async function getGroupIdByName(name) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('user_groups').select('id').ilike('name', name).limit(1);
  if (error) throw error;
  return data?.[0]?.id || null;
}

export async function getMeFromRequest(req) {
  const authHeader = req?.headers?.get?.('authorization') || '';
  let bearer = '';
  if (authHeader.toLowerCase().startsWith('bearer ')) bearer = authHeader.slice(7).trim();

  const jar = readAuthCookies();
  let access_token = bearer || jar.access_token;
  let refresh_token = jar.refresh_token;

  if (!access_token && !refresh_token) return { status: 401, error: 'Not authenticated' };

  let user = null;
  try {
    user = await getUserFromAccessToken(access_token);
  } catch {
    if (!refresh_token) return { status: 401, error: 'Not authenticated' };
    try {
      const refreshed = await refreshSession(refresh_token);
      setAuthCookies(refreshed);
      access_token = refreshed.access_token;
      refresh_token = refreshed.refresh_token || refresh_token;
      user = refreshed.user || (await getUserFromAccessToken(access_token));
    } catch {
      clearAuthCookies();
      return { status: 401, error: 'Not authenticated' };
    }
  }

  const admin = getSupabaseAdmin();
  await ensureGroups();

  const email = normalizeEmail(user?.email);
  const emailIsAdmin = isAdminEmail(email);

  // profile by auth_user_id else email
  const { data: byAuth, error: byAuthErr } = await safeSelectAppUsers(admin, (cols) =>
    admin.from('app_users').select(cols).eq('auth_user_id', user.id).limit(1)
  );
  if (byAuthErr) throw byAuthErr;

  let profile = byAuth?.[0] || null;

  if (!profile) {
    const { data: byEmail, error: byEmailErr } = await safeSelectAppUsers(admin, (cols) =>
      admin.from('app_users').select(cols).ilike('email', email).limit(1)
    );
    if (byEmailErr) throw byEmailErr;
    profile = byEmail?.[0] || null;
  }

  if (!profile) {
    const groupName = emailIsAdmin ? 'Admin' : DEFAULT_GROUP;
    const group_id = await getGroupIdByName(groupName);

    const display_name =
      user?.user_metadata?.full_name ||
      user?.user_metadata?.name ||
      email;

    const payload = {
      user_id: user.id,
      auth_user_id: user.id,
      email,
      display_name,
      group_id,
      country_code: null
    };

    const { data: created, error } = await admin.from('app_users').insert(payload).select().limit(1);
    if (error) throw error;
    profile = created?.[0] || payload;
  } else {
    const updates = {};
    if (!profile.auth_user_id) updates.auth_user_id = user.id;

    if (emailIsAdmin) {
      const adminGroupId = await getGroupIdByName('Admin');
      if (adminGroupId && profile.group_id !== adminGroupId) updates.group_id = adminGroupId;
    }

    if (Object.keys(updates).length) {
      const { data: upd, error } = await admin
        .from('app_users')
        .update(updates)
        .eq('user_id', profile.user_id)
        .select()
        .limit(1);
      if (error) throw error;
      profile = upd?.[0] || profile;
    }
  }

  let group = null;
  if (profile?.group_id) {
    const { data: g } = await admin.from('user_groups').select('id,name').eq('id', profile.group_id).limit(1);
    group = g?.[0] || null;
  }

  const isAdminFinal = emailIsAdmin || (group?.name || '').toLowerCase() === 'admin';

  // Optional: Admin can "view as" another user via httpOnly cookie.
  // This is used to preview what an AD sees (apps + data restrictions).
  let effectiveProfile = profile;
  let effectiveGroup = group;
  let effectiveIsAdmin = isAdminFinal;
  let impersonating = null;

  const imp = String(readImpersonateCookie() || '').trim();
  if (isAdminFinal && imp) {
    const { data: impRows, error: impErr } = await safeSelectAppUsers(admin, (cols) =>
      admin.from('app_users').select(cols).eq('user_id', imp).limit(1)
    );
    if (impErr) throw impErr;
    const impProfile = impRows?.[0] || null;
    if (impProfile) {
      effectiveProfile = impProfile;
      if (impProfile?.group_id) {
        const { data: g2 } = await admin.from('user_groups').select('id,name').eq('id', impProfile.group_id).limit(1);
        effectiveGroup = g2?.[0] || null;
      } else {
        effectiveGroup = null;
      }
      effectiveIsAdmin = (effectiveGroup?.name || '').toLowerCase() === 'admin';
      impersonating = { user_id: impProfile.user_id, email: impProfile.email, display_name: impProfile.display_name };
    }
  }

  return {
    status: 200,
    user,
    profile,
    group,
    isAdmin: isAdminFinal,
    effectiveProfile,
    effectiveGroup,
    effectiveIsAdmin,
    impersonating
  };
}
