import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50)));

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('admin_audit_log')
    .select('id,actor_email,action,target,payload,undo,undone_at,undone_by,created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    const hint = (error.message || '').includes('admin_audit_log')
      ? 'Admin-Log Tabelle fehlt. Bitte in Admin → Datenimport einmal „Setup“ ausführen (oder 03 import tables im Installer).' 
      : '';
    return NextResponse.json({ error: `${error.message}${hint ? ` (${hint})` : ''}` }, { status: 500 });
  }

  return NextResponse.json({ logs: data || [] });
}
