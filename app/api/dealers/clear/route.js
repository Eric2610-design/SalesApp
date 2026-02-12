export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST() {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('dealers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
