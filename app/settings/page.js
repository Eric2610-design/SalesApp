'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr('');
      try {
        const res = await fetch('/api/auth/me', { cache:'no-store' });
        if (!res.ok) throw new Error('Nicht eingeloggt');
        const j = await res.json();
        if (alive) setMe(j);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div className="error">
        {err}
        <div style={{ marginTop:10 }}>
          <a className="secondary" href="/login" style={{ textDecoration:'none' }}>Zum Login</a>
        </div>
      </div>
    );
  }

  const profile = me?.profile;
  const group = me?.group;

  return (
    <div style={{ display:'grid', gap:14 }}>
      <div className="card">
        <div className="h1">Einstellungen</div>
        <div className="sub">iPhone-Style Settings</div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent:'space-between' }}>
          <div>
            <div style={{ fontWeight:800 }}>{profile?.display_name || profile?.email || me?.user?.email || '—'}</div>
            <div className="muted" style={{ fontSize:12 }}>{me?.user?.email || '—'}</div>
            <div className="muted" style={{ fontSize:12 }}>Gruppe: {group?.name || '—'} · Admin: {me?.isAdmin ? 'Ja' : 'Nein'}</div>
          </div>
          <form action="/api/auth/logout" method="post">
            <button className="secondary" type="submit">Logout</button>
          </form>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight:800, marginBottom:8 }}>Apps</div>
        <div className="row" style={{ flexWrap:'wrap' }}>
          <a className="secondary" href="/" style={{ textDecoration:'none' }}>Home</a>
          <a className="secondary" href="/users" style={{ textDecoration:'none' }}>Profil</a>
          {me?.isAdmin ? (
            <>
              <a className="secondary" href="/admin/installer" style={{ textDecoration:'none' }}>Installer</a>
              <a className="secondary" href="/admin/apps" style={{ textDecoration:'none' }}>Admin Apps</a>
            </>
          ) : null}
        </div>
        {!me?.isAdmin ? (
          <div className="muted" style={{ marginTop:10, fontSize:12 }}>
            Admin-Seiten sind nur für Emails aus <code>ADMIN_EMAILS</code> sichtbar.
          </div>
        ) : null}
      </div>
    </div>
  );
}
