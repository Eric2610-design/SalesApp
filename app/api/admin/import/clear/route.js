import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { writeAdminLog } from '@/lib/adminLog';

export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['dealers', 'backlog', 'inventory']);

function requireAdminActionsKey(req) {
  const requiredKey = process.env.ADMIN_ACTIONS_KEY || '';
  const sentKey = req.headers.get('x-admin-actions-key') || '';
  if (requiredKey && sentKey !== requiredKey) {
    const err = new Error('Missing/invalid ADMIN_ACTIONS_KEY');
    err.status = 403;
    throw err;
  }
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const dataset = String(body.dataset || '').trim();
  if (!ALLOWED.has(dataset)) return NextResponse.json({ error: 'Invalid dataset' }, { status: 400 });

  try {
    requireAdminActionsKey(req);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 403 });
  }

  const admin = getSupabaseAdmin();

  // Delete all imports for dataset (rows cascade)
  const { error } = await admin.from('dataset_imports').delete().eq('dataset', dataset);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAdminLog(admin, me, {
    action: 'clear_dataset',
    target: dataset,
    payload: { dataset },
    undo: null
  });

  return NextResponse.json({ ok: true });
}
