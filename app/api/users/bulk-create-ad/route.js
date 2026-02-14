export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';
import { requireUserFromRequest } from '../../../../lib/authServer';

const DOMAIN = 'flyer-bikes.com';
const ALLOWED_COUNTRIES = new Set(['DE', 'AT', 'CH']); // extend later if needed

function normalizeEmailLocalPart(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/\.+/g, '.')
    .replace(/^\.|\.$/g, '');
}

export async function POST(req) {
  try {
    const auth = await requireUserFromRequest(req);
    if (auth.error) return Response.json({ error: auth.error }, { status: 401 });
    if (!auth.isAdmin) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const emailMode = String(body?.email_mode || 'initial_lastname'); // 'ad_key' | 'initial_lastname'

    if (!rows.length) return Response.json({ error: 'Keine Zeilen übergeben' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    const { data: group, error: gErr } = await supabase
      .from('user_groups')
      .select('id,name')
      .ilike('name', 'Aussendienst')
      .limit(1)
      .maybeSingle();

    if (gErr) return Response.json({ error: gErr.message }, { status: 500 });
    if (!group?.id) return Response.json({ error: 'Gruppe "Aussendienst" nicht gefunden (supabase/users.sql ausführen).' }, { status: 400 });

    const emails = [];
    const adKeys = [];

    for (const r of rows) {
      const ad_key = String(r?.ad_key ?? '').trim();
      const first = String(r?.first_name ?? '').trim();
      const last = String(r?.last_name ?? '').trim();
      const country = String(r?.country_code ?? '').trim().toUpperCase();
      if (!ad_key || !first || !last || !country) continue;

      let local = emailMode === 'initial_lastname'
        ? normalizeEmailLocalPart(`${(first || '').slice(0,1)}.${last}`)
        : normalizeEmailLocalPart(ad_key);

      if (!local) continue;
      emails.push(`${local}@${DOMAIN}`.toLowerCase());
      adKeys.push(ad_key);
    }

    const existingEmailSet = new Set();
    const existingAdKeySet = new Set();

    if (emails.length) {
      const { data: ex1, error: exErr1 } = await supabase
        .from('app_users')
        .select('email,ad_key')
        .in('email', emails);

      if (exErr1) return Response.json({ error: exErr1.message }, { status: 500 });

      for (const u of ex1 || []) {
        if (u.email) existingEmailSet.add(String(u.email).toLowerCase());
        if (u.ad_key) existingAdKeySet.add(String(u.ad_key));
      }
    }

    if (adKeys.length) {
      const { data: ex2, error: exErr2 } = await supabase
        .from('app_users')
        .select('email,ad_key')
        .in('ad_key', adKeys);

      if (exErr2) return Response.json({ error: exErr2.message }, { status: 500 });

      for (const u of ex2 || []) {
        if (u.email) existingEmailSet.add(String(u.email).toLowerCase());
        if (u.ad_key) existingAdKeySet.add(String(u.ad_key));
      }
    }

    const results = [];
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const r of rows) {
      const ad_key = String(r?.ad_key ?? '').trim();
      const first_name = String(r?.first_name ?? '').trim();
      const last_name = String(r?.last_name ?? '').trim();
      const country_code = String(r?.country_code ?? '').trim().toUpperCase();

      if (!ad_key || !first_name || !last_name || !country_code) {
        skipped++;
        results.push({ ad_key, email: null, ok: false, reason: 'Missing required fields' });
        continue;
      }

      if (!ALLOWED_COUNTRIES.has(country_code)) {
        skipped++;
        results.push({ ad_key, email: null, ok: false, reason: `Unsupported country_code: ${country_code}` });
        continue;
      }

      const display_name = `${first_name} ${last_name}`.trim();

      const local = emailMode === 'initial_lastname'
        ? normalizeEmailLocalPart(`${(first_name || '').slice(0,1)}.${last_name}`)
        : normalizeEmailLocalPart(ad_key);

      if (!local) {
        skipped++;
        results.push({ ad_key, email: null, ok: false, reason: 'Could not generate email local-part' });
        continue;
      }

      const email = `${local}@${DOMAIN}`.toLowerCase();

      if (existingEmailSet.has(email)) {
        skipped++;
        results.push({ ad_key, email, ok: false, reason: 'Already exists (email)' });
        continue;
      }
      if (existingAdKeySet.has(ad_key)) {
        skipped++;
        results.push({ ad_key, email, ok: false, reason: 'Already exists (ad_key)' });
        continue;
      }

      const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email);
      if (inviteErr) {
        failed++;
        results.push({ ad_key, email, ok: false, reason: inviteErr.message });
        continue;
      }

      const userId = invited?.user?.id;
      if (!userId) {
        failed++;
        results.push({ ad_key, email, ok: false, reason: 'No user id returned' });
        continue;
      }

      const { error: profErr } = await supabase.from('app_users').insert([{
        user_id: userId,
        email,
        display_name,
        group_id: group.id,
        country_code,
        ad_key,
      }]);

      if (profErr) {
        failed++;
        results.push({ ad_key, email, ok: false, reason: profErr.message });
        continue;
      }

      created++;
      results.push({ ad_key, email, ok: true });
      existingEmailSet.add(email);
      existingAdKeySet.add(ad_key);
    }

    return Response.json({ ok: true, created, skipped, failed, results });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
