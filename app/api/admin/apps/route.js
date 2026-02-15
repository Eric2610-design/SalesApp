import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('apps').select('*').order('sort', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ apps: data || [] });
}

export async function POST(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!me.isAdmin) return NextResponse.json({ error: 'Only admin' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const slug = String(body.slug || '').trim();
  const title = String(body.title || '').trim();
  if (!slug || !title) return NextResponse.json({ error: 'Missing slug/title' }, { status: 400 });

  const payload = {
    slug,
    title,
    icon: String(body.icon || '•'),
    href: String(body.href || `/apps/${slug}`),
    sort: Number(body.sort || 100),
    is_enabled: body.enabled === false ? false : true,
    type: 'link'
  };

  const admin = getSupabaseAdmin();
  const { data, error } = await admin.from('apps').insert(payload).select('*').limit(1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ app: data?.[0] || null });
}
