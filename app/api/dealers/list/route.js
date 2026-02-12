export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const country = (searchParams.get('country') || '').toUpperCase();

    const supabase = getSupabaseAdmin();

    let q = supabase
      .from('dealers')
      .select('country_code,customer_number,name,street,house_number,postal_code,city,created_at')
      .order('country_code', { ascending: true })
      .order('customer_number', { ascending: true });

    if (['DE', 'AT', 'CH'].includes(country)) {
      q = q.eq('country_code', country);
    }

    const { data, error } = await q;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ rows: data ?? [] });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
