import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['dealers', 'backlog', 'inventory']);

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dataset = String(body.dataset || '').trim();
  if (!ALLOWED.has(dataset)) return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });

  const filename = body.filename ? String(body.filename) : null;
  const mimetype = body.mimetype ? String(body.mimetype) : null;
  const row_count = Math.max(0, Number(body.row_count || 0));

  const selected_columns = Array.isArray(body.selected_columns) ? body.selected_columns : null;
  const display_columns = Array.isArray(body.display_columns) ? body.display_columns : null;
  const column_types = body.column_types && typeof body.column_types === 'object' ? body.column_types : null;
  const save_schema = body.save_schema === false ? false : true;
  const schema_guess = body.schema_guess && typeof body.schema_guess === 'object' ? body.schema_guess : null;

  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from('dataset_imports')
    .insert({
      dataset,
      filename,
      mimetype,
      row_count,
      inserted_count: 0,
      status: 'uploading',
      selected_columns,
      display_columns,
      column_types,
      save_schema,
      schema_guess,
      created_by: me?.profile?.email || me?.user?.email || null
    })
    .select('id')
    .limit(1);

  if (error) {
    const hint = (error.message || '').includes('dataset_imports')
      ? 'Import-Tabellen fehlen/alt. Bitte in Admin → Datenimport einmal „Setup“ ausführen (oder 03 import tables in Installer).' 
      : '';
    return NextResponse.json({ error: `${error.message}${hint ? ` (${hint})` : ''}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, import_id: data?.[0]?.id || null });
}
