import { NextResponse } from 'next/server';
import { signInWithPassword } from '@/lib/authServer';
import { setAuthCookies } from '@/lib/authCookies';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
    }
    if (!String(email).toLowerCase().trim().endsWith('@flyer-bikes.com')) {
      return NextResponse.json({ error: 'Only @flyer-bikes.com allowed' }, { status: 403 });
    }

    const session = await signInWithPassword(email, password);
    setAuthCookies(session);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e?.message || 'Login failed' }, { status: 401 });
  }
}
