'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../lib/supabaseClient';

export default function HomeScreen() {
  const sp = useSearchParams();
  const query = (sp.get('q') || '').trim().toLowerCase();

  const supabase = useMemo(() => getSupabaseClient(), []);
  const [apps, setApps] = useState([]);
  const [dock, setDock] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr('');
    setBusy(true);
    try {
      const sess = (await supabase.auth.getSession()).data.session;
      const token = sess?.access_token;
      if (!token) throw new Error('Bitte einloggen');

      const res = await fetch('/api/apps/visible', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Konnte Apps nicht laden');

      setApps(j.apps || []);
      setDock(j.dock || []);
    } catch (e) {
      setErr(e?.message || String(e));
      setApps([]);
      setDock([]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = query
    ? apps.filter((a) => String(a.title || '').toLowerCase().includes(query) || String(a.slug || '').toLowerCase().includes(query))
    : apps;

  return (
    <div className="home-grid">
      <div className="card">
        <h1 className="h1">SalesOS</h1>
        <p className="sub">Homescreen + Dock (Apps kommen aus Supabase, pro Gruppe gefiltert).</p>

        {err ? (
          <div className="error" style={{ marginTop: 12 }}>
            {err}
            <div className="row" style={{ marginTop: 10 }}>
              <a className="secondary" href="/login" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
                Login →
              </a>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 14 }} className="app-icons">
          {(filtered || []).map((app) => (
            <a key={app.id} className="app-icon" href={app.href || `/apps/${app.slug}`}>
              <div className="emoji">{app.icon || '•'}</div>
              <div className="label">{app.title}</div>
            </a>
          ))}
        </div>

        <div className="row" style={{ marginTop: 14 }}>
          <a className="secondary" href="/settings" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Einstellungen →
          </a>
          <a className="secondary" href="/admin/apps" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Admin · Apps →
          </a>
          <button className="secondary" onClick={load} disabled={busy} style={{ padding: '10px 12px' }}>
            {busy ? '…' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dock</h2>
        <p className="sub">Dock-Favoriten werden pro Gruppe in Supabase konfiguriert.</p>

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {(dock || []).map((a) => (
            <div key={a.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{a.icon} {a.title}</span>
              <a className="secondary" href={a.href || `/apps/${a.slug}`} style={{ padding: '6px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}>
                Öffnen →
              </a>
            </div>
          ))}
          {!dock?.length ? <div className="sub">Keine Dock-Favoriten gesetzt.</div> : null}
        </div>
      </div>
    </div>
  );
}
