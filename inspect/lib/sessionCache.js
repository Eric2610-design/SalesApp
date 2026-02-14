// Client-only helpers to read Supabase session from localStorage.
// Motivation: in some browser states supabase.auth.getSession() can hang.

export function getProjectRefFromUrl(url) {
  if (!url) return null;
  const m = String(url).match(/^https?:\/\/([^.]+)\.supabase\.co\/?$/i);
  return m ? m[1] : null;
}

export function getAuthStorageKey() {
  if (typeof window === 'undefined') return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const ref = getProjectRefFromUrl(url);
  if (!ref) return null;
  return `sb-${ref}-auth-token`;
}

export function readRawAuthStorage() {
  if (typeof window === 'undefined') return null;
  const key = getAuthStorageKey();
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readCachedSession() {
  const raw = readRawAuthStorage();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);

    // Common shape: session object directly
    if (parsed && typeof parsed === 'object' && parsed.access_token) return parsed;

    // Some variants wrap it
    if (parsed?.currentSession?.access_token) return parsed.currentSession;
    if (parsed?.session?.access_token) return parsed.session;

    return null;
  } catch {
    return null;
  }
}

export function getCachedAccessToken() {
  const s = readCachedSession();
  return s?.access_token || null;
}

export function clearCachedSession() {
  if (typeof window === 'undefined') return;
  const key = getAuthStorageKey();
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
