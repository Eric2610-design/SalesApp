'use client';

import { useEffect, useState } from 'react';

export default function UsersPage() {
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
        <div className="h1">Profil</div>
        <div className="sub">User-Profil aus app_users</div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent:'space-between', alignItems:'flex-start' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16 }}>{profile?.display_name || '—'}</div>
            <div className="muted" style={{ fontSize:12 }}>{profile?.email || me?.user?.email || '—'}</div>
            <div className="muted" style={{ fontSize:12 }}>Country: {profile?.country_code || '—'}</div>
            <div className="muted" style={{ fontSize:12 }}>Gruppe: {group?.name || '—'}</div>
            <div className="muted" style={{ fontSize:12 }}>Admin: {me?.isAdmin ? 'Ja' : 'Nein'}</div>
            <div className="muted" style={{ fontSize:12 }}>AD Key: {profile?.ad_key || '—'}</div>
          </div>
          <a className="secondary" href="/settings" style={{ textDecoration:'none' }}>Zurück</a>
        </div>
      </div>
    </div>
  );
}
