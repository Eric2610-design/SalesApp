'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Dock from './Dock';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { withTimeout } from '../../lib/withTimeout';

function nowLabel() {
  const d = new Date();
  const date = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

export default function Shell({ children }) {
  const router = useRouter();
  const sp = useSearchParams();
  const q0 = sp.get('q') || '';

  const [clock, setClock] = useState(nowLabel());
  const [q, setQ] = useState(q0);
  const [session, setSession] = useState(null);

  const supabase = useMemo(() => getSupabaseClient(), []);

  useEffect(() => {
    const t = setInterval(() => setClock(nowLabel()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => setQ(q0), [q0]);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const res = await withTimeout(
          supabase.auth.getSession(),
          4000,
          'Timeout beim Laden der Session (bitte neu laden).'
        );
        if (!alive) return;
        setSession(res?.data?.session || null);
      } catch {
        if (!alive) return;
        setSession(null);
      }
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (alive) setSession(s || null);
    });

    return () => {
      alive = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [supabase]);

  function onSearchSubmit(e) {
    e.preventDefault();
    router.push(`/?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <div className="ios-bg">
      <div className="ios-device">
        <div className="ios-statusbar">
          <div className="ios-status-left">
            <div className="ios-pill" />
            <div className="ios-mini">
              {clock.date} · {clock.time}
            </div>
          </div>

          <form onSubmit={onSearchSubmit} className="ios-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche Apps…" aria-label="Suche Apps" />
          </form>

          <div className="ios-status-right">
            {session ? (
              <a className="ios-avatar" href="/settings" title="Einstellungen">
                ⚙️
              </a>
            ) : (
              <a className="ios-avatar" href="/login" title="Login">
                🔐
              </a>
            )}
          </div>
        </div>

        <main className="ios-main">{children}</main>

        <Dock />
      </div>
    </div>
  );
}
