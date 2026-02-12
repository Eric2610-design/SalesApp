export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function POST(req) {
  try {
    const body = await req.json();
    const dealers = Array.isArray(body?.dealers) ? body.dealers : [];
    if (!dealers.length) return Response.json({ error: 'No dealers provided' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // Upsert by unique (country_code, customer_number)
    const { data, error } = await supabase
      .from('dealers')
      .upsert(dealers, { onConflict: 'country_code,customer_number' })
      .select('id');

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, upserted: data?.length ?? 0 });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
