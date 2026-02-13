import { createClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from './supabaseAdmin';

export async function requireUserFromRequest(req) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { user: null, profile: null, group: null, isAdmin: false, error: 'Missing Bearer token' };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { user: null, profile: null, group: null, isAdmin: false, error: 'Missing Supabase env vars' };

  const supabaseAuth = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user) return { user: null, profile: null, group: null, isAdmin: false, error: error?.message || 'Invalid token' };

  const user = data.user;
  const admin = getSupabaseAdmin();

  const { data: profile, error: pErr } = await admin
    .from('app_users')
    .select('id,email,display_name,country_code,group_id,auth_user_id')
    .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
    .maybeSingle();

  if (pErr) return { user, profile: null, group: null, isAdmin: false, error: pErr.message };

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
      isAdmin = String(g?.name || '').toLowerCase() === 'admin';
    }
  }

  return { user, profile, group, isAdmin, error: null, token };
}
