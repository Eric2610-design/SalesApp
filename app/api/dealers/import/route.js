export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

function validateRow(r) {
  const country_code = String(r?.country_code ?? '').toUpperCase();
  const customer_number = String(r?.customer_number ?? '').trim();

  if (!['DE', 'AT', 'CH'].includes(country_code)) return null;
  if (!customer_number) return null;

  return {
    country_code,
    customer_number,
    name: String(r?.name ?? '').trim(),
    street: String(r?.street ?? '').trim(),
    house_number: String(r?.house_number ?? '').trim(),
    postal_code: String(r?.postal_code ?? '').trim(),
    city: String(r?.city ?? '').trim(),
  };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];

    const clean = rows.map(validateRow).filter(Boolean);
    if (!clean.length) {
      return Response.json({ error: 'Keine gültigen Zeilen erhalten.' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // upsert on unique constraint (country_code, customer_number)
    const { error } = await supabase
      .from('dealers')
      .upsert(clean, { onConflict: 'country_code,customer_number' });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, upserted: clean.length });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
