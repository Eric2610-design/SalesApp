import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

async function undoAction(admin, undo) {
  const type = String(undo?.type || '');

  if (type === 'rollback_import') {
    const import_id = String(undo.import_id || '').trim();
    if (!import_id) throw new Error('Undo missing import_id');
    const { error } = await admin.from('dataset_imports').delete().eq('id', import_id);
    if (error) throw new Error(error.message);
    return { ok: true, result: { type, import_id } };
  }

  if (type === 'toggle_app_enabled') {
    const app_id = String(undo.app_id || '').trim();
    if (!app_id) throw new Error('Undo missing app_id');
    const previous_enabled = !!undo.previous_enabled;
    const { error } = await admin.from('apps').update({ is_enabled: previous_enabled }).eq('id', app_id);
    if (error) throw new Error(error.message);
    return { ok: true, result: { type, app_id, is_enabled: previous_enabled } };
  }

  if (type === 'restore_app') {
    const row = undo.app_row;
    if (!row || typeof row !== 'object') throw new Error('Undo missing app_row');

    // Try to restore with same id (works if deleted). If slug already exists, this will fail.
    const { error } = await admin.from('apps').insert(row);
    if (error) {
      // fallback: upsert by slug
      const { error: upErr } = await admin.from('apps').upsert(row, { onConflict: 'slug' });
      if (upErr) throw new Error(upErr.message);
    }
    return { ok: true, result: { type, slug: row.slug } };
  }

  if (type === 'restore_dataset_schema') {
    const dataset = String(undo.dataset || '').trim();
    if (!dataset) throw new Error('Undo missing dataset');
    const prev = undo.previous_row;

    if (!prev) {
      const { error } = await admin.from('dataset_schemas').delete().eq('dataset', dataset);
      if (error) throw new Error(error.message);
      return { ok: true, result: { type, dataset, restored: 'deleted' } };
    }

    const { error } = await admin.from('dataset_schemas').upsert(prev, { onConflict: 'dataset' });
    if (error) throw new Error(error.message);
    return { ok: true, result: { type, dataset, restored: true } };
  }

  if (type === 'restore_page_config') {
    const key = String(undo.key || '').trim();
    if (!key) throw new Error('Undo missing key');
    const prev = undo.previous_row;

    if (!prev) {
      const { error } = await admin.from('page_configs').delete().eq('key', key);
      if (error) throw new Error(error.message);
      return { ok: true, result: { type, key, restored: 'deleted' } };
    }

    const { error } = await admin.from('page_configs').upsert(prev, { onConflict: 'key' });
    if (error) throw new Error(error.message);
    return { ok: true, result: { type, key, restored: true } };
  }

  throw new Error('Unsupported undo type');
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const id = Number(body.id || 0);
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const admin = getSupabaseAdmin();

  const { data: rows, error } = await admin
    .from('admin_audit_log')
    .select('id,action,target,payload,undo,undone_at')
    .eq('id', id)
    .limit(1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const log = rows?.[0];
  if (!log) return NextResponse.json({ error: 'Log not found' }, { status: 404 });
  if (log.undone_at) return NextResponse.json({ error: 'Already undone' }, { status: 400 });
  if (!log.undo) return NextResponse.json({ error: 'No undo available' }, { status: 400 });

  let result = null;
  try {
    const r = await undoAction(admin, log.undo);
    result = r.result;
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }

  // Mark log as undone
  const actor = me?.profile?.email || me?.user?.email || null;
  await admin.from('admin_audit_log').update({ undone_at: new Date().toISOString(), undone_by: actor }).eq('id', id);

  // Write a follow-up log entry
  await writeAdminLog(admin, me, {
    action: 'undo',
    target: String(log.action || ''),
    payload: { undone_log_id: id, result },
    undo: null
  });

  return NextResponse.json({ ok: true, result });
}
