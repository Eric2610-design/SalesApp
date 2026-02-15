'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function Inner() {
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const [email, setEmail] = useState('e.fuhrmann@flyer-bikes.com');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function onLogin(e) {
    e.preventDefault();
    setMsg('');
    setBusy(true);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch('/api/auth/login', {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Login failed');
      window.location.assign(next);
    } catch (e2) {
      setMsg(e2?.message || String(e2));
    } finally {
      clearTimeout(t);
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth:520, margin:'0 auto' }}>
      <div className="h1">Login</div>
      <div className="sub">Passwort-Login über Server (stabil, ohne Supabase Session im Browser).</div>

      <form onSubmit={onLogin} style={{ marginTop:12 }}>
        <div>
          <div className="label">E-Mail</div>
          <input className="input" value={email} onChange={(e)=>setEmail(e.target.value)} autoComplete="email" />
        </div>

        <div style={{ marginTop:12 }}>
          <div className="label">Passwort</div>
          <input className="input" value={password} onChange={(e)=>setPassword(e.target.value)} type="password" autoComplete="current-password" />
        </div>

        <button className="primary" style={{ marginTop:14, width:'100%' }} disabled={busy || !email || !password}>
          {busy ? 'Logge ein…' : 'Einloggen'}
        </button>

        <div className="muted" style={{ marginTop:10, fontSize:12 }}>
          Falls noch kein Passwort gesetzt: Supabase → Authentication → Users → “Send password reset”.
        </div>
      </form>

      {msg ? <div className="error" style={{ marginTop:12 }}>Fehler: {msg}</div> : null}

      <div style={{ marginTop:12 }}>
        <a className="secondary" href="/debug" style={{ textDecoration:'none' }}>Debug</a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card">Lade…</div>}>
      <Inner />
    </Suspense>
  );
}
