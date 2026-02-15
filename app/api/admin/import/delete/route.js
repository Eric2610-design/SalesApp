import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['dealers', 'backlog', 'inventory']);

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  let import_id = String(body.import_id || '').trim();
  const dataset = String(body.dataset || '').trim();

  const admin = getSupabaseAdmin();

  if (!import_id) {
    if (!ALLOWED.has(dataset)) return NextResponse.json({ error: 'Missing import_id or invalid dataset' }, { status: 400 });
    const { data, error } = await admin
      .from('dataset_imports')
      .select('id')
      .eq('dataset', dataset)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    import_id = data?.[0]?.id || '';
  }

  if (!import_id) return NextResponse.json({ error: 'No import found' }, { status: 404 });

  const { data: imp } = await admin.from('dataset_imports').select('id,dataset,filename,row_count').eq('id', import_id).limit(1);

  const { error } = await admin.from('dataset_imports').delete().eq('id', import_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminLog(admin, me, {
    action: 'delete_import',
    target: imp?.[0]?.dataset || dataset || null,
    payload: { import_id, filename: imp?.[0]?.filename || null, row_count: imp?.[0]?.row_count || null },
    undo: null
  });

  return NextResponse.json({ ok: true, import_id });
}
