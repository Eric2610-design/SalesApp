export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = searchParams.get('user_id');
    const country = (searchParams.get('country') || '').toUpperCase();

    const supabase = getSupabaseAdmin();

    let q = supabase
      .from('dealer_ad_matches')
      .select('dealer_id,country_code,customer_number,name,street,house_number,postal_code,city,ad_user_id,prefix_len,from_prefix,to_prefix');

    if (user_id) q = q.eq('ad_user_id', user_id);
    if (country) q = q.eq('country_code', country);

    const { data, error } = await q
      .order('country_code', { ascending: true })
      .order('postal_code', { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, rows: data ?? [] });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
