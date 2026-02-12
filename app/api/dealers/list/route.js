export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

const ALLOWED_COUNTRIES = new Set(['DE', 'AT', 'CH']);
const ALLOWED_SORT = new Set(['created_at', 'country_code', 'customer_number', 'name', 'postal_code', 'city']);

function toInt(v, def) {
  const n = Number.parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : def;
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);

    const country = String(searchParams.get('country') ?? '').toUpperCase();
    const qRaw = String(searchParams.get('q') ?? '').trim();

    const limit = Math.min(Math.max(toInt(searchParams.get('limit'), 200), 1), 1000);
    const offset = Math.max(toInt(searchParams.get('offset'), 0), 0);

    const sort = String(searchParams.get('sort') ?? 'country_code').trim();
    const dir = String(searchParams.get('dir') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

    const supabase = getSupabaseAdmin();

    let query = supabase
      .from('dealers')
      .select('country_code,customer_number,name,street,house_number,postal_code,city,created_at', { count: 'exact' });

    if (country && ALLOWED_COUNTRIES.has(country)) {
      query = query.eq('country_code', country);
    }

    if (qRaw) {
      const q = qRaw.replace(/,/g, ' ');
      query = query.or(
        `customer_number.ilike.%${q}%,name.ilike.%${q}%,city.ilike.%${q}%,street.ilike.%${q}%`
      );
    }

    const sortCol = ALLOWED_SORT.has(sort) ? sort : 'country_code';
    query = query.order(sortCol, { ascending: dir === 'asc' });

    if (sortCol !== 'country_code') query = query.order('country_code', { ascending: true });
    if (sortCol !== 'customer_number') query = query.order('customer_number', { ascending: true });

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      ok: true,
      rows: data ?? [],
      count: typeof count === 'number' ? count : null,
      limit,
      offset,
      country: country && ALLOWED_COUNTRIES.has(country) ? country : null,
      q: qRaw || null,
      sort: sortCol,
      dir,
    });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
