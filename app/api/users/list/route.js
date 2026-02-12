export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('app_users')
      .select(`
        user_id,
        email,
        display_name,
        country_code,
        created_at,
        group:user_groups(id,name,permissions),
        territories:ad_territories(id,country_code,prefix_len,from_prefix,to_prefix,created_at)
      `)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, users: data ?? [] });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
