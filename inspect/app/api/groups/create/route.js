export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(req) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? '').trim();
    const permissions = body?.permissions ?? {};

    if (!name) return Response.json({ error: 'Gruppenname fehlt' }, { status: 400 });

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_groups')
      .insert([{ name, permissions }])
      .select('id,name,permissions,created_at')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, group: data });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
