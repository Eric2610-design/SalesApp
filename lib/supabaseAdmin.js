import { createClient } from '@supabase/supabase-js';
import { getRequiredEnv } from './env';

let _admin = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;

  const url = getRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');

  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-client-info': 'salesapp-server' } }
  });

  return _admin;
}
