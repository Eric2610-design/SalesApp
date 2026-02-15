import { NextResponse } from 'next/server';
import { clearAuthCookies } from '@/lib/authCookies';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  clearAuthCookies();
  return NextResponse.redirect(new URL('/login', req.url));
}
