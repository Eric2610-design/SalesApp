export async function getAccessToken(supabase, timeoutMs = 6000) {
  const withTimeout = (p) =>
    Promise.race([
      p,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout beim Laden der Session (bitte neu laden).')), timeoutMs)),
    ]);

  // Try current session
  let session = null;
  try {
    const res = await withTimeout(supabase.auth.getSession());
    session = res?.data?.session || null;
    if (res?.error) throw res.error;
  } catch (e) {
    // continue to refresh attempt below
  }

  if (session?.access_token) return session.access_token;

  // Try refresh once (helps right after login callback)
  try {
    await withTimeout(supabase.auth.refreshSession());
  } catch {
    // ignore
  }

  const res2 = await withTimeout(supabase.auth.getSession());
  if (res2?.error) throw res2.error;

  return res2?.data?.session?.access_token || null;
}

export async function authedFetch(supabase, url, options = {}) {
  const token = await getAccessToken(supabase);
  if (!token) {
    throw new Error('Bitte einloggen (kein Session-Token gefunden).');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      cache: 'no-store',
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}
