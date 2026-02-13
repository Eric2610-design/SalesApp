export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireUserFromRequest } from '../../../../lib/authServer';

function keyOf(r) {
  return `${r.country_code || ''}||${r.customer_number || ''}`.toUpperCase();
}

export async function POST(req) {
  try {
    const auth = await requireUserFromRequest(req);
    if (auth.error) return Response.json({ error: auth.error }, { status: 401 });
    if (!auth.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const input = Array.isArray(body?.rows) ? body.rows : [];

    if (!input.length) return Response.json({ error: 'Keine Zeilen übergeben' }, { status: 400 });

    const map = new Map();
    let skipped = 0;

    for (const r of input) {
      const country_code = String(r?.country_code ?? '').toUpperCase().trim();
      const customer_number = String(r?.customer_number ?? '').trim();
      if (!country_code || !customer_number) { skipped++; continue; }

      map.set(keyOf({ country_code, customer_number }), {
        country_code,
        customer_number,
        name: r?.name ? String(r.name).trim() : null,
        street: r?.street ? String(r.street).trim() : null,
        house_number: r?.house_number ? String(r.house_number).trim() : null,
        postal_code: r?.postal_code ? String(r.postal_code).trim() : null,
        city: r?.city ? String(r.city).trim() : null,
      });
    }

    const rows = Array.from(map.values());
    if (!rows.length) return Response.json({ error: 'Keine gültigen Zeilen (country_code + customer_number benötigt)' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: existing, error: exErr } = await supabase
      .from('dealers')
      .select('country_code,customer_number')
      .in('customer_number', rows.map(r => r.customer_number))
      .in('country_code', [...new Set(rows.map(r => r.country_code))]);

    if (exErr) return Response.json({ error: exErr.message }, { status: 500 });

    const existingKeys = new Set((existing || []).map((x) => keyOf(x)));
    const inserted = rows.filter((r) => !existingKeys.has(keyOf(r))).length;
    const updated = rows.length - inserted;

    const { error } = await supabase
      .from('dealers')
      .upsert(rows, { onConflict: 'country_code,customer_number' });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, inserted, updated, skipped });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
