'use client';

import { useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';

export default function LoginPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  function normalizeEmail(raw) {
    const value = (raw || '').trim().toLowerCase();
    if (!value.endsWith('@flyer-bikes.com')) {
      throw new Error('Bitte eine @flyer-bikes.com E-Mail verwenden.');
    }
    return value;
  }

  async function signInWithPassword(e) {
    e.preventDefault();
    setMsg('');
    setErr('');

    let value = '';
    try {
      value = normalizeEmail(email);
    } catch (e2) {
      setErr(e2?.message || String(e2));
      return;
    }

    if (!password || password.length < 1) {
      setErr('Bitte Passwort eingeben.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: value,
        password,
      });
      if (error) throw error;

      // session should now exist; go home
      window.location.href = '/';
    } catch (e2) {
      setErr(e2?.message || String(e2));
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    setMsg('');
    setErr('');

    let value = '';
    try {
      value = normalizeEmail(email);
    } catch (e2) {
      setErr(e2?.message || String(e2));
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
    <div className="card" style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 className="h1">Login</h1>
      <p className="sub">
        {mode === 'password'
          ? 'Einloggen mit Passwort (nur @flyer-bikes.com).'
          : 'Einloggen per Magic Link (nur @flyer-bikes.com).'}
      </p>

      <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          type="button"
          className={mode === 'password' ? 'primary' : 'secondary'}
          onClick={() => setMode('password')}
          style={{ padding: '10px 12px', borderRadius: 14 }}
        >
          Passwort
        </button>
        <button
          type="button"
          className={mode === 'magic' ? 'primary' : 'secondary'}
          onClick={() => setMode('magic')}
          style={{ padding: '10px 12px', borderRadius: 14 }}
        >
          Magic Link
        </button>
        <a
          className="secondary"
          href="/"
          style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', textDecoration: 'none' }}
        >
          Zurück
        </a>
      </div>

      <div style={{ marginTop: 14 }}>
        <label>E-Mail</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="e.fuhrmann@flyer-bikes.com"
          autoComplete="email"
          style={{ width: '100%', marginTop: 6 }}
        />
      </div>

      {mode === 'password' ? (
        <form onSubmit={signInWithPassword} style={{ marginTop: 12 }}>
          <label>Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            style={{ width: '100%', marginTop: 6 }}
          />

          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={busy} className="primary" type="submit">
              {busy ? 'Logge ein…' : 'Einloggen'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={sendMagicLink} style={{ marginTop: 12 }}>
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={busy} className="primary" type="submit">
              {busy ? 'Sende…' : 'Magic Link senden'}
            </button>
          </div>
          <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
            Hinweis: Bei vielen Klicks kann Supabase ein E-Mail Rate Limit setzen.
          </div>
        </form>
      )}

      {err ? <div className="error" style={{ marginTop: 12 }}>{err}</div> : null}
      {msg ? <div className="toast" style={{ marginTop: 12 }}>{msg}</div> : null}
    </div>
  );
}
