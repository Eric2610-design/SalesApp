import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabaseAdmin';
import { fetchWithTimeout } from './fetchWithTimeout';

/**
 * Validates Bearer token (Supabase Auth) and resolves app profile + group.
 * IMPORTANT: This project uses public.app_users.user_id (FK -> auth.users.id).
 */
export async function requireUserFromRequest(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return { user: null, profile: null, group: null, isAdmin: false, error: 'Missing Bearer token' };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return { user: null, profile: null, group: null, isAdmin: false, error: 'Missing Supabase env vars' };
  }

  try {
    // Verify token using anon client (no session persistence on server)
    const supabaseAuth = createClient(url, anon, {
      auth: { persistSession: false },
      global: { fetch: (input, init) => fetchWithTimeout(input, init, 15000) },
    });
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      return { user: null, profile: null, group: null, isAdmin: false, error: error?.message || 'Invalid token' };
    }

    const user = data.user;
    const admin = getSupabaseAdmin();

    // Resolve profile:
    // 1) auth_user_id (if present in your schema)
    // 2) user_id
    // 3) email (case-insensitive)
    let profile = null;

    const tryQuery = async (fn) => {
      const res = await fn;
      if (res?.data) return { ok: true, data: res.data };
      if (res?.error) return { ok: false, error: res.error };
      return { ok: true, data: null };
    };

    // 1) auth_user_id (optional column)
    let r = await tryQuery(
      admin.from('app_users').select('*').eq('auth_user_id', user.id).maybeSingle()
    );
    if (r.error && /auth_user_id/i.test(r.error.message || '')) {
      r = { ok: true, data: null };
    }
    if (r.data) profile = r.data;

    // 2) user_id
    if (!profile) {
      const r2 = await tryQuery(admin.from('app_users').select('*').eq('user_id', user.id).maybeSingle());
      if (r2.error) {
        return { user, profile: null, group: null, isAdmin: false, error: r2.error.message };
      }
      if (r2.data) profile = r2.data;
    }

    // 3) email (case-insensitive)
    if (!profile && user.email) {
      const r3 = await tryQuery(admin.from('app_users').select('*').ilike('email', user.email).maybeSingle());
      if (r3.error) {
        return { user, profile: null, group: null, isAdmin: false, error: r3.error.message };
      }
      if (r3.data) profile = r3.data;
    }

    let group = null;
    let isAdmin = false;

    if (profile?.group_id) {
      const { data: g, error: gErr } = await admin
        .from('user_groups')
        .select('id,name')
        .eq('id', profile.group_id)
        .maybeSingle();

      if (!gErr) {
        group = g;
        const name = String(g?.name || '').toLowerCase();
        isAdmin = name === 'admin' || name === 'administrator';
      }
    }

    return { user, profile, group, isAdmin, error: null, token };
  } catch (e) {
    return { user: null, profile: null, group: null, isAdmin: false, error: e?.message || String(e) };
  }
}
