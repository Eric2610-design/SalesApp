export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const country = (url.searchParams.get('country') || '').toUpperCase();
    const q = (url.searchParams.get('q') || '').trim();
    const limit = Math.min(Number(url.searchParams.get('limit') || 200), 1000);
    const offset = Math.max(Number(url.searchParams.get('offset') || 0), 0);

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('dealers')
      .select('*', { count: 'exact' })
      .order('country_code', { ascending: true })
      .order('customer_number', { ascending: true })
      .range(offset, offset + limit - 1);

    if (country && ['DE', 'AT', 'CH'].includes(country)) {
      query = query.eq('country_code', country);
    }

    if (q) {
      query = query.or(`customer_number.ilike.%${q}%,name.ilike.%${q}%,city.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, dealers: data ?? [], count: count ?? 0, limit, offset });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
