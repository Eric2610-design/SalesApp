import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['dealers', 'backlog', 'inventory']);

function normKey(v) {
  if (v == null) return '';
  return String(v).trim().toLowerCase();
}

async function getLatestImport(admin, dataset) {
  const { data: imp, error } = await admin
    .from('dataset_imports')
    .select('*')
    .eq('dataset', dataset)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return imp?.[0] || null;
}

async function getRowsForImport(admin, importId, limit) {
  const { data: rows, error } = await admin
    .from('dataset_rows')
    .select('row_index,row_data')
    .eq('import_id', importId)
    .order('row_index', { ascending: true })
    .limit(limit);
  if (error) throw new Error(error.message);
  return rows || [];
}

async function applyJoins(admin, dataset, rows, schema) {
  const joins = Array.isArray(schema?.joins) ? schema.joins : [];
  if (!joins.length || !rows?.length) return rows;

  // Precompute local keys per join
  const enriched = rows.map((r) => ({ ...r, row_data: { ...(r.row_data || {}) } }));

  for (const j of joins) {
    const source_dataset = String(j?.source_dataset || '').trim();
    const local_key = String(j?.local_key || '').trim();
    const source_key = String(j?.source_key || '').trim();
    const cols = Array.isArray(j?.columns) ? j.columns : [];
    if (!source_dataset || !local_key || !source_key || !cols.length) continue;

    const localValues = new Set();
    for (const r of enriched) {
      const v = (r.row_data || {})[local_key];
      const k = normKey(v);
      if (k) localValues.add(k);
    }
    if (!localValues.size) continue;

    // Load source dataset rows (cap)
    const srcImp = await getLatestImport(admin, source_dataset);
    if (!srcImp?.id) continue;
    const srcRows = await getRowsForImport(admin, srcImp.id, 5000);

    const map = new Map();
    for (const r of srcRows) {
      const v = (r.row_data || {})[source_key];
      const k = normKey(v);
      if (!k || !localValues.has(k)) continue;
      if (!map.has(k)) map.set(k, r.row_data || {});
    }

    for (const r of enriched) {
      const lk = normKey((r.row_data || {})[local_key]);
      const hit = lk ? map.get(lk) : null;
      if (!hit) continue;
      for (const c of cols) {
        const as = String(c?.as || '').trim();
        const source_col = String(c?.source_col || '').trim();
        if (!as || !source_col) continue;
        r.row_data[as] = hit?.[source_col] ?? null;
      }
    }
  }

  return enriched;
}

export async function GET(req, ctx) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const dataset = String(ctx?.params?.dataset || '').trim();
  if (!ALLOWED.has(dataset)) return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });

  const url = new URL(req.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200)));

  const admin = getSupabaseAdmin();

  // Optional: dataset schema overrides (display columns + type overrides)
  const { data: schemaRows } = await admin
    .from('dataset_schemas')
    .select('dataset,display_columns,import_columns,column_types,column_labels,joins,view_config,updated_by,updated_at')
    .eq('dataset', dataset)
    .limit(1);

  const schema = schemaRows?.[0] || null;

  let latest = null;
  try {
    latest = await getLatestImport(admin, dataset);
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
  if (!latest) return NextResponse.json({ import: null, schema, rows: [] });

  let rows = [];
  try {
    rows = await getRowsForImport(admin, latest.id, limit);
    rows = await applyJoins(admin, dataset, rows, schema);
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }

  return NextResponse.json({ import: latest, schema, rows });
}
