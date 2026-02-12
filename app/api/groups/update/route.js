export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(req) {
  try {
    const body = await req.json();
    const id = String(body?.id ?? '').trim();
    const name = body?.name != null ? String(body.name).trim() : null;
    const permissions = body?.permissions ?? null;

    if (!id) return Response.json({ error: 'Group-ID fehlt' }, { status: 400 });

    const patch = {};
    if (name !== null) patch.name = name;
    if (permissions !== null) patch.permissions = permissions;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('user_groups')
      .update(patch)
      .eq('id', id)
      .select('id,name,permissions,created_at')
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, group: data });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
