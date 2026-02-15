import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog, undoRestoreDatasetSchema } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['dealers', 'backlog', 'inventory']);

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const url = new URL(req.url);
  const dataset = String(url.searchParams.get('dataset') || '').trim();
  if (!ALLOWED.has(dataset)) return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('dataset_schemas')
    .select('dataset,display_columns,import_columns,column_types,updated_by,updated_at')
    .eq('dataset', dataset)
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schema: data?.[0] || null });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dataset = String(body.dataset || '').trim();
  if (!ALLOWED.has(dataset)) return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });

  const display_columns = Array.isArray(body.display_columns) ? body.display_columns : null;
  const import_columns = Array.isArray(body.import_columns) ? body.import_columns : null;
  const column_types = body.column_types && typeof body.column_types === 'object' ? body.column_types : null;

  const admin = getSupabaseAdmin();
  const actor = me?.profile?.email || me?.user?.email || null;

  // load previous for undo
  const { data: prevRows } = await admin
    .from('dataset_schemas')
    .select('dataset,display_columns,import_columns,column_types,updated_by,updated_at')
    .eq('dataset', dataset)
    .limit(1);
  const previous = prevRows?.[0] || null;

  const nextSchema = {
    dataset,
    display_columns,
    import_columns,
    column_types,
    updated_by: actor,
    updated_at: new Date().toISOString()
  };

  const { error } = await admin.from('dataset_schemas').upsert(nextSchema, { onConflict: 'dataset' });
  if (error) {
    const hint = (error.message || '').includes('dataset_schemas')
      ? 'Schema-Tabelle fehlt/alt. Bitte in Admin → Datenimport einmal „Setup“ ausführen (oder 03 import tables in Installer).' 
      : '';
    return NextResponse.json({ error: `${error.message}${hint ? ` (${hint})` : ''}` }, { status: 500 });
  }

  await writeAdminLog(admin, me, {
    action: 'update_dataset_schema',
    target: dataset,
    payload: { schema: nextSchema },
    undo: undoRestoreDatasetSchema(dataset, previous)
  });

  return NextResponse.json({ ok: true, schema: nextSchema });
}
