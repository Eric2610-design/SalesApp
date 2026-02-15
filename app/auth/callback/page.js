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
    let alive = true;

    async function run() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get('code');

        // Some providers / setups may return tokens in the hash
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const hasAccessToken = !!hashParams.get('access_token');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          router.replace('/');
          return;
        }

        if (hasAccessToken) {
          // detectSessionInUrl=true should persist the session automatically
          router.replace('/');
          return;
        }

        throw new Error(
          'Kein Login-Code gefunden. Bitte Login-Link erneut anfordern und im selben Browser öffnen.'
        );
      } catch (e) {
        const msg = e?.message || String(e);
        if (!alive) return;

        if (msg.toLowerCase().includes('code verifier')) {
          setErr(
            'Login-Link wurde vermutlich in einem anderen Browser/Gerät geöffnet. Bitte den Magic Link im selben Browser öffnen, in dem du ihn angefordert hast (oder dort neu anfordern).'
          );
        } else {
          setErr(msg);
        }
      } finally {
        if (alive) setBusy(false);
      }
    }

    run();
    return () => {
      alive = false;
    };
  }, [supabase, router]);

  return (
    <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1 className="h1">Login…</h1>
      {busy ? <p className="sub">Session wird aufgebaut…</p> : null}

      {err ? (
        <div className="error">
          {err}
          <div style={{ marginTop: 12 }}>
            <a
              className="secondary"
              href="/login"
              style={{
                padding: '10px 12px',
                borderRadius: 14,
                border: '1px solid rgba(17,24,39,.12)',
                display: 'inline-block',
                textDecoration: 'none',
              }}
            >
              Zurück zum Login →
            </a>
          </div>
        </div>
      ) : null}

      {!busy && !err ? <p className="sub">Weiterleitung…</p> : null}
    </div>
  );
}
