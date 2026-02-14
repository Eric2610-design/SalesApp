'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '../../lib/supabaseClient';

function errMsg(err) {
  if (!err) return 'Unbekannter Fehler';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || String(err);
  if (typeof err === 'object') return err.message || err.error_description || err.error || JSON.stringify(err);
  return String(err);
}

async function pingSupabase(url, anonKey, ms = 8000) {
  const base = (url || '').replace(/\/+$/, '');
  if (!base || !anonKey) throw new Error('Missing URL/Key');
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      headers: { apikey: anonKey, authorization: `Bearer ${anonKey}` },
      cache: 'no-store',
      signal: controller.signal,
    });
    await res.text();
    return true;
  } finally {
    clearTimeout(t);
  }
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp.get('next') || '/';

  const supabase = useMemo(() => getSupabaseClient(), []);

  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [email, setEmail] = useState('e.fuhrmann@flyer-bikes.com');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  async function onPassword() {
    setBusy(true);
    setMsg('');
    try {
      await pingSupabase(url, anon, 8000);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) throw error;
      if (!data?.session) throw new Error('Login fehlgeschlagen (keine Session).');

      router.push(next);
    } catch (e) {
      const m = errMsg(e);
      if (m.toLowerCase().includes('abort') || m.toLowerCase().includes('timeout')) {
        setMsg('Timeout: Supabase antwortet nicht. Prüfe URL/Keys oder Netzwerk. Tipp: öffne /debug für einen Verbindungstest.');
      } else {
        setMsg(m);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onMagic() {
    setBusy(true);
    setMsg('');
    try {
      await pingSupabase(url, anon, 8000);

      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
      setMsg('Magic Link gesendet. Bitte Mail öffnen.');
    } catch (e) {
      const m = errMsg(e);
      if (m.toLowerCase().includes('abort') || m.toLowerCase().includes('timeout')) {
        setMsg('Timeout: Supabase antwortet nicht. Prüfe URL/Keys oder Netzwerk. Tipp: öffne /debug für einen Verbindungstest.');
      } else {
        setMsg(m);
      }
    } finally {
      setBusy(false);
    }
  }

  function onlyFlyer(v) {
    const s = (v || '').toLowerCase().trim();
    return s.endsWith('@flyer-bikes.com');
  }

  return (
    <div style={{ padding: 18 }}>
      <div className="card" style={{ maxWidth: 520, margin: '0 auto', padding: 16 }}>
        <h1 style={{ fontSize: 22, marginBottom: 6 }}>Login</h1>
        <div className="muted" style={{ marginBottom: 12 }}>
          Einloggen mit Passwort (empfohlen) oder Magic Link (nur @flyer-bikes.com).
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className={mode === 'password' ? 'primary' : 'secondary'} onClick={() => setMode('password')} type="button">
            Passwort
          </button>
          <button className={mode === 'magic' ? 'primary' : 'secondary'} onClick={() => setMode('magic')} type="button">
            Magic Link
          </button>
          <a className="secondary" href="/" style={{ textDecoration: 'none' }}>
            Zurück
          </a>
          <a className="secondary" href="/debug" style={{ textDecoration: 'none' }}>
            Debug
          </a>
        </div>

        <label className="label">E-Mail</label>
        <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vorname.nachname@flyer-bikes.com" autoComplete="email" />

        {mode === 'password' ? (
          <>
            <label className="label" style={{ marginTop: 12 }}>
              Passwort
            </label>
            <input className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete="current-password" />

            <button className="primary" style={{ marginTop: 14, width: '100%' }} onClick={onPassword} disabled={busy || !onlyFlyer(email) || !password} type="button">
              {busy ? 'Logge ein…' : 'Einloggen'}
            </button>
          </>
        ) : (
          <button className="primary" style={{ marginTop: 14, width: '100%' }} onClick={onMagic} disabled={busy || !onlyFlyer(email)} type="button">
            {busy ? 'Sende…' : 'Magic Link senden'}
          </button>
        )}

        {msg ? (
          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: 12,
              background: 'rgba(239,68,68,.10)',
              border: '1px solid rgba(239,68,68,.20)',
              color: '#b91c1c',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
            }}
          >
            Fehler: {msg}
          </div>
        ) : null}

        <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
          Tipp: Wenn Buttons “hängen”, liegt es meistens an einem hängenden Netzwerk-Request. Öffne /debug und prüfe “Auth Health”.
        </div>
      </div>
    </div>
  );
}
