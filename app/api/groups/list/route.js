export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_groups')
      .select('id,name,permissions,created_at')
      .order('name', { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, groups: data ?? [] });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
