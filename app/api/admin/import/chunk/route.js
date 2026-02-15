import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const import_id = String(body.import_id || '').trim();
  const dataset = String(body.dataset || '').trim();
  const start_index = Number(body.start_index || 0);
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!import_id) return NextResponse.json({ error: 'Missing import_id' }, { status: 400 });
  if (!dataset) return NextResponse.json({ error: 'Missing dataset' }, { status: 400 });
  if (!Number.isFinite(start_index) || start_index < 0) return NextResponse.json({ error: 'Invalid start_index' }, { status: 400 });
  if (!rows.length) return NextResponse.json({ error: 'Empty rows' }, { status: 400 });

  const admin = getSupabaseAdmin();

  const payload = rows.map((r, idx) => ({
    import_id,
    dataset,
    row_index: start_index + idx,
    row_data: r || {}
  }));

  const { error } = await admin.from('dataset_rows').insert(payload);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update counter best-effort
  try {
    const { data: imp } = await admin.from('dataset_imports').select('inserted_count').eq('id', import_id).limit(1);
    const current = Number(imp?.[0]?.inserted_count || 0);
    await admin.from('dataset_imports').update({ inserted_count: current + rows.length }).eq('id', import_id);
  } catch {}

  return NextResponse.json({ ok: true, inserted: rows.length });
}
