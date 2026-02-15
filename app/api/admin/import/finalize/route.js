import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoRollbackImport, undoRestoreDatasetSchema } from '@/lib/adminLog';

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
    .select('id,dataset,filename,row_count,inserted_count,created_at,selected_columns,display_columns,column_types,save_schema')
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

  // Optional: persist schema defaults for the dataset (display columns + type overrides)
  if (row.save_schema) {
    try {
      const actor = me?.profile?.email || me?.user?.email || null;

      const { data: prevRows } = await admin
        .from('dataset_schemas')
        .select('dataset,display_columns,import_columns,column_types,updated_by,updated_at')
        .eq('dataset', row.dataset)
        .limit(1);

      const previous = prevRows?.[0] || null;

      const nextSchema = {
        dataset: row.dataset,
        display_columns: row.display_columns || null,
        import_columns: row.selected_columns || null,
        column_types: row.column_types || null,
        updated_by: actor,
        updated_at: new Date().toISOString()
      };

      await admin
        .from('dataset_schemas')
        .upsert(nextSchema, { onConflict: 'dataset' });

      await writeAdminLog(admin, me, {
        action: 'update_dataset_schema',
        target: row.dataset,
        payload: { schema: nextSchema },
        undo: undoRestoreDatasetSchema(row.dataset, previous)
      });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true });
}
