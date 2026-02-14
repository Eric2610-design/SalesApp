'use client';

import { useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setMsg('');
    setErr('');

    const value = email.trim().toLowerCase();
    if (!value.endsWith('@flyer-bikes.com')) {
      setErr('Bitte eine @flyer-bikes.com E-Mail verwenden.');
      return;
    }

    setBusy(true);
    try {
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: value,
        options: { emailRedirectTo: `${origin}/auth/callback` },
      });
      if (error) throw error;
      setMsg('Magic Link wurde gesendet. Bitte E-Mail öffnen und einloggen.');
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
      <h1 className="h1">Login</h1>
      <p className="sub">Einloggen per Magic Link (nur @flyer-bikes.com).</p>

      <form onSubmit={submit} style={{ marginTop: 14 }}>
        <label>E-Mail</label><br />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="e.fuhrmann@flyer-bikes.com" style={{ width: '100%', marginTop: 6 }} />
        <div className="row" style={{ marginTop: 12 }}>
          <button disabled={busy}>{busy ? 'Sende…' : 'Magic Link senden'}</button>
          <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>Zurück</a>
        </div>
      </form>

      {err ? <div className="error">{err}</div> : null}
      {msg ? <div className="toast">{msg}</div> : null}
    </div>
  );
}
