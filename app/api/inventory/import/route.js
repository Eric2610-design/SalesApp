export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { getSupabaseAdmin } from '../../../../lib/supabaseAdmin';

function toLabelArray(columns) {
  return Array.isArray(columns) ? columns.map((c) => String(c ?? '').trim()).filter(Boolean) : [];
}

function toRowObject(columns, row) {
  const obj = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]] = row?.[i] == null ? '' : String(row[i]).trim();
  }
  return obj;
}

function parseQty(v) {
  const s = String(v ?? '').replace(',', '.').trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req) {
  try {
    const body = await req.json();
    const phase = body?.phase;

    const supabase = getSupabaseAdmin();

    if (phase === 'start') {
      const filename = body?.filename ? String(body.filename) : null;
      const has_header = body?.has_header !== false;
      const columns = toLabelArray(body?.columns);
      if (!columns.length) return Response.json({ error: 'columns fehlen' }, { status: 400 });

      // keep only latest import for simplicity
      await supabase.from('inventory_imports').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      const { data: imp, error } = await supabase
        .from('inventory_imports')
        .insert([{ filename, has_header, columns, display_columns: [] }])
        .select('id')
        .single();

      if (error) return Response.json({ error: error.message }, { status: 500 });
      return Response.json({ ok: true, import_id: imp.id });
    }

    if (phase === 'chunk') {
      const import_id = String(body?.import_id || '').trim();
      const row_start_index = Number(body?.row_start_index ?? 0);
      const rows = Array.isArray(body?.rows) ? body.rows : [];
      if (!import_id) return Response.json({ error: 'import_id fehlt' }, { status: 400 });
      if (!rows.length) return Response.json({ ok: true, inserted: 0 });

      const { data: imp, error: impErr } = await supabase
        .from('inventory_imports')
        .select('id,columns')
        .eq('id', import_id)
        .single();

      if (impErr) return Response.json({ error: impErr.message }, { status: 500 });

      const columns = toLabelArray(imp.columns);
      if (!columns.length) return Response.json({ error: 'Import columns fehlen' }, { status: 500 });

      const sku_col_index = Number(body?.sku_col_index ?? -1);
      const qty_col_index = Number(body?.qty_col_index ?? -1);

      const insertRows = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] || [];
        const sku = (sku_col_index >= 0 && sku_col_index < columns.length) ? String(row?.[sku_col_index] ?? '').trim() : null;
        const qty = (qty_col_index >= 0 && qty_col_index < columns.length) ? parseQty(row?.[qty_col_index]) : null;

        insertRows.push({
          import_id,
          row_index: row_start_index + i,
          sku: sku || null,
          qty,
          data: toRowObject(columns, row)
        });
      }

      const { error } = await supabase.from('inventory_rows').insert(insertRows);
      if (error) return Response.json({ error: error.message }, { status: 500 });

      return Response.json({ ok: true, inserted: insertRows.length });
    }

    if (phase === 'finish') {
      const import_id = String(body?.import_id || '').trim();
      const display_columns = toLabelArray(body?.display_columns);
      if (!import_id) return Response.json({ error: 'import_id fehlt' }, { status: 400 });

      const { error } = await supabase
        .from('inventory_imports')
        .update({ display_columns })
        .eq('id', import_id);

      if (error) return Response.json({ error: error.message }, { status: 500 });

      const { count, error: cErr } = await supabase
        .from('inventory_rows')
        .select('id', { count: 'exact', head: true })
        .eq('import_id', import_id);

      if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

      return Response.json({ ok: true, rows_inserted: count ?? 0 });
    }

    return Response.json({ error: 'Unknown phase' }, { status: 400 });
  } catch (e) {
    return Response.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
