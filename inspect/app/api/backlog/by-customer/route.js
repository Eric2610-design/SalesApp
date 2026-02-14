export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const customer_number = String(searchParams.get('customer_number') || '').trim();
    if (!customer_number) return Response.json({ ok: true, rows: [], display_columns: [] });

    const supabase = getSupabaseAdmin();

    const { data: imp, error: impErr } = await supabase
      .from('backlog_imports')
      .select('id,display_columns,columns')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (impErr) return Response.json({ error: impErr.message }, { status: 500 });
    if (!imp) return Response.json({ ok: false, rows: [], display_columns: [] });

    const { data: rows, error } = await supabase
      .from('backlog_rows')
      .select('id,row_index,customer_number,data,created_at')
      .eq('import_id', imp.id)
      .eq('customer_number', customer_number)
      .order('row_index', { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({
      ok: true,
      rows: rows ?? [],
      display_columns: (imp.display_columns && imp.display_columns.length) ? imp.display_columns : (imp.columns || [])
    });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
