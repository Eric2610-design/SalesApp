'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import GlobalErrors from './GlobalErrors';
import Dock from './Dock';

function nowLabel() {
  const d = new Date();
  const date = d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  return { date, time };
}

async function fetchMe(timeoutMs = 8000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch('/api/auth/me', { cache: 'no-store', signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

export default function Shell({ children }) {
  const router = useRouter();
  const [clock, setClock] = useState(nowLabel());
  const [q, setQ] = useState('');
  const [me, setMe] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setClock(nowLabel()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    fetchMe().then((m) => alive && setMe(m)).catch(() => alive && setMe(null));
    return () => { alive = false; };
  }, []);

  function onSearchSubmit(e) {
    e.preventDefault();
    router.push(`/?q=${encodeURIComponent(q.trim())}`);
  }

  const authed = !!me?.user;

  return (
    <div className="ios-bg">
      <GlobalErrors />
      <div className="ios-device">
        <div className="ios-statusbar">
          <div className="ios-status-left">
            <button className="ios-navbtn" type="button" onClick={() => router.back()} title="Zurück">←</button>
            <a className="ios-navbtn" href="/" title="Home">⌂</a>
          </div>

          <form onSubmit={onSearchSubmit} className="ios-search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suche Apps…" />
          </form>

          <div className="ios-status-right">
            <div className="ios-mini">{clock.date} · {clock.time}</div>
            {authed ? (
              <a className="ios-avatar" href="/settings" title="Einstellungen">⚙️</a>
            ) : (
              <a className="ios-avatar" href="/login" title="Login">🔐</a>
            )}
          </div>
        </div>

        <main className="ios-main">{children}</main>
        <Dock />
      </div>
    </div>
  );
}
