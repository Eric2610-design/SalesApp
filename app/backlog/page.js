'use client';
import { useEffect, useState } from 'react';

export default function Page() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/auth/me', { cache:'no-store' })
      .then(async r => { if (!r.ok) throw new Error('Nicht eingeloggt'); return r.json(); })
      .then(j => alive && setMe(j))
      .catch(e => alive && setErr(e?.message || String(e)));
    return () => { alive = false; };
  }, []);

  if (err) return <div className="error">{err} <div style={{ marginTop:10 }}><a className="secondary" href="/login">Zum Login</a></div></div>;

  return (
    <div className="card">
      <div className="h1">Auftragsrückstand</div>
      <div className="sub">Platzhalter (später Table Viewer Template).</div>
      <div className="muted" style={{ marginTop:10, fontSize:12 }}>Eingeloggt als: {me?.user?.email} · Admin: {me?.isAdmin ? 'Ja' : 'Nein'}</div>
    </div>
  );
}
