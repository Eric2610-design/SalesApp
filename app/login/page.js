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
  const [debug, setDebug] = useState('');

  const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const SUPA_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  function normalizeEmail(raw) {
    const value = (raw || '').trim().toLowerCase();
    if (!value.endsWith('@flyer-bikes.com')) {
      throw new Error('Bitte eine @flyer-bikes.com E-Mail verwenden.');
    }
    return value;
  }

  function prettyError(e) {
    if (!e) return 'Unbekannter Fehler';
    if (typeof e === 'string') return e;
    const msg = e.message || e.error_description || e.error || '';
    try {
      return msg || JSON.stringify(e);
    } catch {
      return msg || String(e);
    }
  }

  async function withTimeout(promise, ms = 12000) {
    return await Promise.race([
      promise,
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout: Supabase antwortet nicht. Prüfe URL/Keys oder Netzwerk.')), ms)),
    ]);
  }

  async function testConnection() {
    setErr('');
    setMsg('');
    setDebug('Teste Session…');
    try {
      const res = await withTimeout(supabase.auth.getSession(), 8000);
      const hasSession = !!res?.data?.session;
      setDebug(`OK. Session vorhanden: ${hasSession ? 'JA' : 'NEIN'}`);
    } catch (e) {
      setDebug(`Fehler: ${prettyError(e)}`);
    }
  }

  async function signInWithPassword(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    setDebug('');

    let value = '';
    try {
      value = normalizeEmail(email);
    } catch (e2) {
      setErr(prettyError(e2));
      return;
    }

    if (!password || password.length < 1) {
      setErr('Bitte Passwort eingeben.');
      return;
    }

    setBusy(true);
    setDebug('Sende Login an Supabase…');
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email: value, password }),
        12000
      );

      if (error) throw error;

      // Verify session exists
      const ses = await withTimeout(supabase.auth.getSession(), 8000);
      const ok = !!ses?.data?.session?.access_token;

      setDebug(`Login OK: ${ok ? 'Session gesetzt' : 'Session fehlt (check storage/cookies)'}`);

      if (ok) {
        window.location.href = '/';
      } else {
        setErr('Login wurde akzeptiert, aber es wurde keine Session gespeichert. Bitte Cookies/Storage prüfen oder Seite neu laden.');
      }
    } catch (e2) {
      setErr(prettyError(e2));
    } finally {
      setBusy(false);
    }
  }

  async function sendMagicLink(e) {
    e.preventDefault();
    setMsg('');
    setErr('');
    setDebug('');

    let value = '';
    try {
      value = normalizeEmail(email);
    } catch (e2) {
      setErr(prettyError(e2));
      return;
    }

    setBusy(true);
    setDebug('Sende Magic Link…');
    try {
      const origin = window.location.origin;
      const { error } = await withTimeout(
        supabase.auth.signInWithOtp({
          email: value,
          options: { emailRedirectTo: `${origin}/auth/callback` },
        }),
        12000
      );
      if (error) throw error;
      setMsg('Magic Link wurde gesendet. Bitte E-Mail öffnen und einloggen.');
    } catch (e2) {
      setErr(prettyError(e2));
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
        <button
          type="button"
          className="secondary"
          onClick={testConnection}
          style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}
        >
          Verbindung testen
        </button>
        <a
          className="secondary"
          href="/"
          style={{
            padding: '10px 12px',
            borderRadius: 14,
            border: '1px solid rgba(17,24,39,.12)',
            textDecoration: 'none',
          }}
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

      {err ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.25)' }}>
          <strong>Fehler:</strong> {err}
        </div>
      ) : null}

      {msg ? (
        <div style={{ marginTop: 12, padding: 10, borderRadius: 12, background: 'rgba(34,197,94,.12)', border: '1px solid rgba(34,197,94,.25)' }}>
          {msg}
        </div>
      ) : null}

      {debug ? (
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          {debug}
        </div>
      ) : null}

      <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        Debug: Supabase URL gesetzt: {SUPA_URL ? 'JA' : 'NEIN'} · Key gesetzt: {SUPA_KEY ? 'JA' : 'NEIN'}
      </div>
    </div>
  );
}
