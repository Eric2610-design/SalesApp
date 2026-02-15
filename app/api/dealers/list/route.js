export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const country = (searchParams.get('country') || '').toUpperCase();
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('dealers')
      .select('id,country_code,customer_number,name,street,house_number,postal_code,city,updated_at')
      .order('country_code', { ascending: true })
      .order('postal_code', { ascending: true });

    if (country) query = query.eq('country_code', country);

    if (q) {
      const like = `%${q}%`;
      query = query.or(
        [
          `customer_number.ilike.${like}`,
          `name.ilike.${like}`,
          `street.ilike.${like}`,
          `postal_code.ilike.${like}`,
          `city.ilike.${like}`,
        ].join(',')
      );
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, rows: data ?? [] });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
