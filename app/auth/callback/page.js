'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function AuthCallback() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const router = useRouter();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    async function run() {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (error) throw error;
        router.replace('/');
      } catch (e) {
        setErr(e?.message || String(e));
      } finally {
        setBusy(false);
      }
    }
    run();
  }, [supabase, router]);

  return (
    <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1 className="h1">Login…</h1>
      {busy ? <p className="sub">Session wird aufgebaut…</p> : null}
      {err ? <div className="error">{err}</div> : null}
    </div>
  );
}
