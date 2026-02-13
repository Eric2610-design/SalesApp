export async function getAccessToken(supabase) {
  // First try current session
  let { data: { session } = {}, error } = await supabase.auth.getSession();
  if (error) throw error;

  if (session?.access_token) return session.access_token;

  // Try refresh once (helps right after login callback on some browsers)
  try {
    await supabase.auth.refreshSession();
  } catch {
    // ignore
  }

  ({ data: { session } = {}, error } = await supabase.auth.getSession());
  if (error) throw error;

  return session?.access_token || null;
}

export async function authedFetch(supabase, url, options = {}) {
  const token = await getAccessToken(supabase);
  if (!token) {
    throw new Error('Bitte einloggen (kein Session-Token gefunden).');
  }

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(url, {
    ...options,
    headers,
    cache: 'no-store',
  });

  return res;
}
