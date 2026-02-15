'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function HomeClient() {
  const sp = useSearchParams();
  const q = (sp.get('q') || '').trim().toLowerCase();

  const [data, setData] = useState({ apps: [], dock: [] });
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setError('');
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 12000);
        try {
          const res = await fetch('/api/apps/visible', { cache:'no-store', signal: controller.signal });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j?.error || 'Nicht eingeloggt');
          }
          const j = await res.json();
          if (alive) setData({ apps: j.apps || [], dock: j.dock || [] });
        } finally { clearTimeout(t); }
      } catch (e) {
        if (alive) setError(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  const apps = useMemo(() => {
    const list = data.apps || [];
    if (!q) return list;
    return list.filter(a =>
      (a.title || '').toLowerCase().includes(q) ||
      (a.slug || '').toLowerCase().includes(q)
    );
  }, [data.apps, q]);

  return (
    <div>
      <div className="row" style={{ justifyContent:'space-between', marginBottom:12 }}>
        <div>
          <div className="h1">Home</div>
          <div className="sub">Apps (sichtbar nach Rolle). Suche über die Leiste oben.</div>
        </div>
        <a className="secondary" href="/settings" style={{ textDecoration:'none' }}>Einstellungen</a>
      </div>

      {error ? (
        <div className="error">
          {error}
          <div style={{ marginTop:10 }}>
            <a className="secondary" href="/login" style={{ textDecoration:'none' }}>Zum Login</a>
          </div>
        </div>
      ) : null}

      <div className="grid" style={{ marginTop:12 }}>
        {apps.map((a) => (
          <a key={a.id || a.slug} className="app-icon" href={a.href || `/apps/${a.slug}`}>
            <div className="app-emoji">{a.icon || '•'}</div>
            <div className="app-title">{a.title || a.slug}</div>
            <div className="app-href">{a.href || `/apps/${a.slug}`}</div>
          </a>
        ))}
      </div>
    </div>
  );
}
