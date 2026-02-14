import { createClient } from '@supabase/supabase-js';
import { fetchWithTimeout } from './fetchWithTimeout';

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }

  _client = createClient(url, anon, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    global: {
      // Prevent auth/login/logout from hanging forever.
      fetch: (input, init) => fetchWithTimeout(input, init, 15000),
    },
  });

  return _client;
}
