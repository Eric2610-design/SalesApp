export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: imp, error: impErr } = await supabase
      .from('inventory_imports')
      .select('id,created_at,filename,has_header,columns,display_columns')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (impErr) return Response.json({ error: impErr.message }, { status: 500 });
    if (!imp) return Response.json({ ok: false, row_count: 0 });

    const { count, error: cErr } = await supabase
      .from('inventory_rows')
      .select('id', { count: 'exact', head: true })
      .eq('import_id', imp.id);

    if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

    return Response.json({
      ok: true,
      id: imp.id,
      created_at: imp.created_at,
      filename: imp.filename,
      has_header: imp.has_header,
      columns: imp.columns || [],
      display_columns: imp.display_columns || [],
      row_count: count ?? 0
    });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
