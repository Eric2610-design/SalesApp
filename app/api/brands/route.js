import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) return NextResponse.json({ error: 'Nicht eingeloggt' }, { status: 401 });

  const admin = getSupabaseAdmin();
  try {
    const [mRes, bgRes] = await Promise.all([
      admin.from('manufacturers').select('key,name,icon_data,updated_at').order('name', { ascending: true }),
      admin.from('buying_groups').select('key,name,icon_data,updated_at').order('name', { ascending: true })
    ]);

    // If tables are missing, Supabase will return error
    if (mRes.error || bgRes.error) {
      const msg = (mRes.error?.message || bgRes.error?.message || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) {
        return NextResponse.json({ manufacturers: [], buying_groups: [], error: 'Tabellen fehlen (brands.sql noch nicht ausgeführt)' }, { status: 200 });
      }
      throw new Error(mRes.error?.message || bgRes.error?.message || 'Brands laden fehlgeschlagen');
    }

    return NextResponse.json({
      manufacturers: mRes.data || [],
      buying_groups: bgRes.data || []
    });
  } catch (e) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
