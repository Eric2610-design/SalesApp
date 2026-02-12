export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    // 1) Users + Group holen (Group-Relation existiert)
    const { data: users, error: usersErr } = await supabase
      .from('app_users')
      .select('user_id,email,display_name,country_code,created_at,group:user_groups(id,name,permissions)')
      .order('created_at', { ascending: false });

    if (usersErr) return Response.json({ error: usersErr.message }, { status: 500 });

    const ids = (users || []).map((u) => u.user_id).filter(Boolean);

    // 2) Territories separat holen und im JS mergen (keine DB-Relation nötig)
    let territoriesByUser = {};
    if (ids.length) {
      const { data: terr, error: terrErr } = await supabase
        .from('ad_territories')
        .select('id,user_id,country_code,prefix_len,from_prefix,to_prefix,created_at')
        .in('user_id', ids)
        .order('prefix_len', { ascending: true })
        .order('from_prefix', { ascending: true });

      if (terrErr) return Response.json({ error: terrErr.message }, { status: 500 });

      for (const t of terr || []) {
        if (!territoriesByUser[t.user_id]) territoriesByUser[t.user_id] = [];
        territoriesByUser[t.user_id].push(t);
      }
    }

    const merged = (users || []).map((u) => ({
      ...u,
      territories: territoriesByUser[u.user_id] || [],
    }));

    return Response.json({ ok: true, users: merged });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
