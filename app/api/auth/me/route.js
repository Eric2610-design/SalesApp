import { NextResponse } from 'next/server';
import { getMeFromRequest } from '@/lib/authServer';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  const me = await getMeFromRequest(req);
  if (me.status !== 200) {
    return NextResponse.json({ error: me.error || 'Unauthorized' }, { status: me.status || 401 });
  }
  return NextResponse.json({
    user: me.user,
    profile: me.profile,
    group: me.group,
    isAdmin: me.isAdmin
  });
}
