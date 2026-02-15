import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoRollbackImport } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const import_id = String(body.import_id || '').trim();
  if (!import_id) return NextResponse.json({ error: 'Missing import_id' }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: imp, error: impErr } = await admin
    .from('dataset_imports')
    .select('id,dataset,filename,row_count,inserted_count,created_at')
    .eq('id', import_id)
    .limit(1);

  if (impErr) return NextResponse.json({ error: impErr.message }, { status: 500 });
  const row = imp?.[0];
  if (!row) return NextResponse.json({ error: 'Import not found' }, { status: 404 });

  const { error } = await admin.from('dataset_imports').update({ status: 'done' }).eq('id', import_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminLog(admin, me, {
    action: 'import_dataset',
    target: row.dataset,
    payload: { import_id, filename: row.filename, row_count: row.row_count, inserted_count: row.inserted_count },
    undo: undoRollbackImport(import_id)
  });

  return NextResponse.json({ ok: true });
}
