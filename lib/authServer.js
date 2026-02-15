import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabaseAdmin';

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
    const supabaseAuth = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data?.user) {
      return { user: null, profile: null, group: null, isAdmin: false, error: error?.message || 'Invalid token' };
    }

    const user = data.user;
    const admin = getSupabaseAdmin();

    // Resolve profile via user_id first; fallback to email.
    let profile = null;

    const p1 = await admin
      .from('app_users')
      .select('user_id,email,display_name,country_code,group_id,created_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!p1.error && p1.data) {
      profile = p1.data;
    } else if (user.email) {
      const p2 = await admin
        .from('app_users')
        .select('user_id,email,display_name,country_code,group_id,created_at')
        .eq('email', user.email)
        .maybeSingle();

      if (!p2.error && p2.data) {
        profile = p2.data;
      } else if (p2.error) {
        return { user, profile: null, group: null, isAdmin: false, error: p2.error.message };
      }
    } else if (p1.error) {
      return { user, profile: null, group: null, isAdmin: false, error: p1.error.message };
    }

    let group = null;

    // Admin logic: only specific emails are admins (env ADMIN_EMAILS or default list)
    const emailLower = String(user?.email || '').toLowerCase();
    const allowlistRaw = process.env.ADMIN_EMAILS ||
      'e.fuhrmann@flyer-bikes.com,d.heise@flyer-bikes.com,h.retzlaff@flyer-bikes.com,d.salzhuber@flyer-bikes.com';
    const allowlist = allowlistRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    let isAdmin = allowlist.includes(emailLower);

    // Still resolve group info for UI/display.
    if (profile?.group_id) {
      const { data: g, error: gErr } = await admin
        .from('user_groups')
        .select('id,name')
        .eq('id', profile.group_id)
        .maybeSingle();

      if (!gErr) {
        group = g;
      }
    }

    return { user, profile, group, isAdmin, error: null, token };
  } catch (e) {
    return { user: null, profile: null, group: null, isAdmin: false, error: e?.message || String(e) };
  }
}
