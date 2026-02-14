'use client';

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabaseClient';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [mode, setMode] = useState('password'); // 'password' | 'magic'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const isFlyer = useMemo(() => {
    const e = (email || '').trim().toLowerCase();
    return e.endsWith('@flyer-bikes.com') || e.endsWith('@flyer.ch') || e.endsWith('@flyer.com');
  }, [email]);

  async function onMagic(e) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);

    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (error) throw error;
      setMsg({ type: 'ok', text: 'Magic Link gesendet. Bitte Email öffnen und klicken.' });
    } catch (err) {
      setMsg({ type: 'err', text: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }

  async function onPassword(e) {
    e.preventDefault();
    setMsg(null);

    if (!isFlyer) {
      setMsg({ type: 'err', text: 'Passwort-Login ist nur für @flyer-bikes.com Accounts gedacht.' });
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (!data?.session) throw new Error('Login fehlgeschlagen (keine Session).');
      router.replace(next);
    } catch (err) {
      setMsg({ type: 'err', text: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: '60px auto', padding: 24 }}>
      <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700 }}>Login</h1>
      <p style={{ marginTop: 6, marginBottom: 16, color: 'var(--muted)' }}>
        Einloggen mit Passwort (nur @flyer-bikes.com) oder Magic Link.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className={mode === 'password' ? 'btn primary' : 'btn'}
          onClick={() => setMode('password')}
        >
          Passwort
        </button>
        <button
          type="button"
          className={mode === 'magic' ? 'btn primary' : 'btn'}
          onClick={() => setMode('magic')}
        >
          Magic Link
        </button>
        <button type="button" className="btn" onClick={() => router.push('/')}>Zurück</button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>E-Mail</span>
          <input
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.fuhrmann@flyer-bikes.com"
            autoComplete="email"
          />
        </label>

        {mode === 'password' && (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Passwort</span>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {!isFlyer && email.trim().length > 3 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                Hinweis: Passwort-Login ist nur für @flyer-bikes.com gedacht.
              </span>
            )}
          </label>
        )}

        {msg && (
          <div
            className="card"
            style={{
              padding: 12,
              borderColor: msg.type === 'err' ? 'rgba(255,0,0,.25)' : 'rgba(0,180,90,.25)',
              background: msg.type === 'err' ? 'rgba(255,0,0,.06)' : 'rgba(0,180,90,.06)',
            }}
          >
            {msg.text}
          </div>
        )}

        {mode === 'password' ? (
          <button className="btn primary" disabled={loading} onClick={onPassword}>
            {loading ? 'Logge ein…' : 'Einloggen'}
          </button>
        ) : (
          <button className="btn primary" disabled={loading} onClick={onMagic}>
            {loading ? 'Sende…' : 'Magic Link senden'}
          </button>
        )}

        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
          Tipp: Wenn du (noch) keinen Passwort-User hast, kannst du ihn im Supabase Dashboard unter
          Authentication → Users anlegen oder weiterhin Magic Link nutzen.
        </div>
      </div>
    </div>
  );
}
