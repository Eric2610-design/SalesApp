import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['dealers', 'backlog', 'inventory']);

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
    .select('dataset,display_columns,import_columns,column_types,updated_by,updated_at')
    .eq('dataset', dataset)
    .limit(1);

  const schema = schemaRows?.[0] || null;

  const { data: imp, error: impErr } = await admin
    .from('dataset_imports')
    // Use '*' to stay compatible with older installs (missing newer columns)
    .select('*')
    .eq('dataset', dataset)
    .order('created_at', { ascending: false })
    .limit(1);

  if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 });
  const latest = imp?.[0] || null;
  if (!latest) return NextResponse.json({ import: null, schema, rows: [] });

  const { data: rows, error: rowsErr } = await admin
    .from('dataset_rows')
    .select('row_index,row_data')
    .eq('import_id', latest.id)
    .order('row_index', { ascending: true })
    .limit(limit);

  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  return NextResponse.json({ import: latest, schema, rows: rows || [] });
}
