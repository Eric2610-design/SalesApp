import { cookies } from 'next/headers';

export const ACCESS_COOKIE = 'sb-access-token';
export const REFRESH_COOKIE = 'sb-refresh-token';
export const IMPERSONATE_COOKIE = 'sb-impersonate-user';

function cookieBaseOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/'
  };
}

export function setAuthCookies({ access_token, refresh_token, expires_in }) {
  const jar = cookies();
  const opts = cookieBaseOptions();

  jar.set(ACCESS_COOKIE, access_token || '', {
    ...opts,
    maxAge: Math.max(60, Math.floor(expires_in || 3600))
  });

  jar.set(REFRESH_COOKIE, refresh_token || '', {
    ...opts,
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAuthCookies() {
  const jar = cookies();
  const opts = { ...cookieBaseOptions(), maxAge: 0 };
  jar.set(ACCESS_COOKIE, '', opts);
  jar.set(REFRESH_COOKIE, '', opts);
}

export function readAuthCookies() {
  const jar = cookies();
  return {
    access_token: jar.get(ACCESS_COOKIE)?.value || '',
    refresh_token: jar.get(REFRESH_COOKIE)?.value || ''
  };
}

export function setImpersonateCookie(userId) {
  const jar = cookies();
  const opts = cookieBaseOptions();
  const v = String(userId || '').trim();
  if (!v) return;
  jar.set(IMPERSONATE_COOKIE, v, { ...opts, maxAge: 60 * 60 * 6 }); // 6h
}

export function clearImpersonateCookie() {
  const jar = cookies();
  const opts = { ...cookieBaseOptions(), maxAge: 0 };
  jar.set(IMPERSONATE_COOKIE, '', opts);
}

export function readImpersonateCookie() {
  const jar = cookies();
  return jar.get(IMPERSONATE_COOKIE)?.value || '';
}
