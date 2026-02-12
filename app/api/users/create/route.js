export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

const DOMAIN = 'flyer-bikes.com';
const ALLOWED_COUNTRIES = new Set(['DE', 'AT', 'CH']);

function isValidLocalPart(s) {
  return /^[a-zA-Z0-9._-]+$/.test(s);
}

function parseRanges(inputRanges) {
  const ranges = Array.isArray(inputRanges) ? inputRanges : [];
  const parsed = [];

  for (const r of ranges) {
    const fromRaw = String(r?.from ?? '').trim();
    const toRaw = String(r?.to ?? '').trim();

    if (!fromRaw || !toRaw) continue;

    if (!/^\d+$/.test(fromRaw) || !/^\d+$/.test(toRaw)) {
      throw new Error(`Range "${fromRaw}-${toRaw}" ist ungültig (nur Ziffern).`);
    }
    if (fromRaw.length !== toRaw.length) {
      throw new Error(`Range "${fromRaw}-${toRaw}" ist ungültig (von/bis müssen gleich viele Stellen haben).`);
    }

    const prefix_len = fromRaw.length;
    if (prefix_len < 2 || prefix_len > 5) {
      throw new Error(`Range "${fromRaw}-${toRaw}" ist ungültig (Prefix-Länge 2–5).`);
    }

    const from_prefix = Number.parseInt(fromRaw, 10);
    const to_prefix = Number.parseInt(toRaw, 10);

    if (!Number.isFinite(from_prefix) || !Number.isFinite(to_prefix)) {
      throw new Error(`Range "${fromRaw}-${toRaw}" ist ungültig.`);
    }
    if (from_prefix > to_prefix) {
      throw new Error(`Range "${fromRaw}-${toRaw}" ist ungültig (von > bis).`);
    }

    parsed.push({ prefix_len, from_prefix, to_prefix });
  }

  parsed.sort((a, b) => a.prefix_len - b.prefix_len || a.from_prefix - b.from_prefix);
  for (let i = 1; i < parsed.length; i++) {
    const prev = parsed[i - 1];
    const cur = parsed[i];
    if (prev.prefix_len === cur.prefix_len && cur.from_prefix <= prev.to_prefix) {
      throw new Error(`Ranges überlappen sich: ${prev.from_prefix}-${prev.to_prefix} und ${cur.from_prefix}-${cur.to_prefix}`);
    }
  }

  return parsed;
}

export async function POST(req) {
  try {
    const body = await req.json();

    const local = String(body?.local_part ?? '').trim();
    const display_name = String(body?.display_name ?? '').trim() || null;
    const group_id = String(body?.group_id ?? '').trim();
    const country_code = String(body?.country_code ?? '').trim().toUpperCase() || null;

    if (!local) return Response.json({ error: 'E-Mail (Local-Part) fehlt' }, { status: 400 });
    if (local.includes('@')) return Response.json({ error: 'Bitte nur den Teil vor dem @ eingeben' }, { status: 400 });
    if (!isValidLocalPart(local)) return Response.json({ error: 'Ungültiger Benutzername (nur a-z, 0-9, . _ -)' }, { status: 400 });

    if (!group_id) return Response.json({ error: 'Gruppe fehlt' }, { status: 400 });

    const email = `${local}@${DOMAIN}`.toLowerCase();

    const supabase = getSupabaseAdmin();

    const { data: group, error: gErr } = await supabase
      .from('user_groups')
      .select('id,name,permissions')
      .eq('id', group_id)
      .single();

    if (gErr) return Response.json({ error: gErr.message }, { status: 500 });
    if (!group) return Response.json({ error: 'Gruppe nicht gefunden' }, { status: 400 });

    const isAD = String(group.name).toLowerCase() === 'aussendienst';

    let rangesParsed = [];
    if (isAD) {
      if (!country_code || !ALLOWED_COUNTRIES.has(country_code)) {
        return Response.json({ error: 'Aussendienst braucht ein Land (DE/AT/CH).' }, { status: 400 });
      }
      rangesParsed = parseRanges(body?.territories);
      if (!rangesParsed.length) {
        return Response.json({ error: 'Aussendienst braucht mindestens ein Gebiet (von–bis).' }, { status: 400 });
      }
    }

    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email);
    if (inviteErr) return Response.json({ error: inviteErr.message }, { status: 500 });

    const userId = invited?.user?.id;
    if (!userId) return Response.json({ error: 'Konnte User-ID nicht ermitteln' }, { status: 500 });

    const { error: profErr } = await supabase.from('app_users').insert([{
      user_id: userId,
      email,
      display_name,
      group_id,
      country_code: isAD ? country_code : null
    }]);

    if (profErr) return Response.json({ error: profErr.message }, { status: 500 });

    if (isAD && rangesParsed.length) {
      const rows = rangesParsed.map((r) => ({
        user_id: userId,
        country_code,
        prefix_len: r.prefix_len,
        from_prefix: r.from_prefix,
        to_prefix: r.to_prefix,
      }));

      const { error: terrErr } = await supabase.from('ad_territories').insert(rows);
      if (terrErr) return Response.json({ error: terrErr.message }, { status: 500 });
    }

    return Response.json({ ok: true, user_id: userId, email });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
