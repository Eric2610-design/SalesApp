import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const requiredKey = process.env.ADMIN_ACTIONS_KEY || '';
  const sentKey = req.headers.get('x-admin-actions-key') || '';
  if (requiredKey && sentKey !== requiredKey) {
    return NextResponse.json({ error: 'Missing/invalid ADMIN_ACTIONS_KEY' }, { status: 403 });
  }

  const { sql } = await req.json().catch(() => ({}));
  if (!sql || !String(sql).trim()) return NextResponse.json({ error: 'Missing sql' }, { status: 400 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.rpc('exec_sql', { sql: String(sql) });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}
