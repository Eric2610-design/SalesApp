export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

function dedupeDealers(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!r?.dealer_id) continue;
    if (!map.has(r.dealer_id)) map.set(r.dealer_id, r);
  }
  return Array.from(map.values());
}

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const user_id = String(searchParams.get('user_id') || '').trim();
    if (!user_id) return Response.json({ error: 'user_id fehlt' }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // user + group
    const { data: u, error: uErr } = await supabase
      .from('app_users')
      .select('user_id,email,display_name,country_code,created_at,group:user_groups(id,name,permissions)')
      .eq('user_id', user_id)
      .maybeSingle();

    if (uErr) return Response.json({ error: uErr.message }, { status: 500 });

    // territories
    const { data: terr, error: tErr } = await supabase
      .from('ad_territories')
      .select('id,user_id,country_code,prefix_len,from_prefix,to_prefix,created_at')
      .eq('user_id', user_id)
      .order('prefix_len', { ascending: true })
      .order('from_prefix', { ascending: true });

    if (tErr) return Response.json({ error: tErr.message }, { status: 500 });

    // dealers in territory (via view)
    const { data: matches, error: mErr } = await supabase
      .from('dealer_ad_matches')
      .select('dealer_id,country_code,customer_number,name,street,house_number,postal_code,city,ad_user_id')
      .eq('ad_user_id', user_id)
      .order('postal_code', { ascending: true });

    if (mErr) return Response.json({ error: mErr.message }, { status: 500 });

    const dealers = dedupeDealers(matches);
    const dealers_count = dealers.length;

    // backlog import (display columns)
    const { data: imp, error: impErr } = await supabase
      .from('backlog_imports')
      .select('id,display_columns,columns,created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (impErr) return Response.json({ error: impErr.message }, { status: 500 });

    // backlog summary (requires view ad_backlog_summary)
    let backlog_by_dealer = [];
    let backlog_total_lines = 0;

    if (imp?.id) {
      const { data: sums, error: sErr } = await supabase
        .from('ad_backlog_summary')
        .select('dealer_id,backlog_lines')
        .eq('ad_user_id', user_id);

      if (sErr) return Response.json({ error: sErr.message }, { status: 500 });

      backlog_by_dealer = sums || [];
      backlog_total_lines = (backlog_by_dealer || []).reduce((acc, x) => acc + (Number(x.backlog_lines) || 0), 0);
    }

    const backlogMap = new Map((backlog_by_dealer || []).map((x) => [x.dealer_id, Number(x.backlog_lines) || 0]));
    const dealers_enriched = dealers.map((d) => ({
      ...d,
      backlog_lines: backlogMap.get(d.dealer_id) || 0
    }));

    dealers_enriched.sort((a, b) => (b.backlog_lines || 0) - (a.backlog_lines || 0) || String(a.postal_code || '').localeCompare(String(b.postal_code || '')));

    const dealers_with_backlog = dealers_enriched.filter((d) => d.backlog_lines > 0).length;

    return Response.json({
      ok: true,
      user: u || null,
      territories: terr || [],
      dealers_count,
      dealers_with_backlog,
      backlog_total_lines,
      backlog_import: imp ? {
        id: imp.id,
        created_at: imp.created_at,
        display_columns: (imp.display_columns && imp.display_columns.length) ? imp.display_columns : (imp.columns || [])
      } : null,
      dealers: dealers_enriched
    });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
