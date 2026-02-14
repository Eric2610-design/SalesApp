'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { authedFetch, getAccessToken } from '../../lib/authedFetch';

export default function MyProfile() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);
  const [debug, setDebug] = useState({ token: null, session: null });

  useEffect(() => {
    let alive = true;

    async function load() {
      setBusy(true);
      setErr('');
      try {
        // Debug: session + token
        const s = await supabase.auth.getSession();
        const token = await getAccessToken(supabase).catch(() => null);
        if (!alive) return;
        setDebug({ token: token ? token.slice(0, 12) + '…' : null, session: !!s?.data?.session });

        const res = await authedFetch(supabase, '/api/auth/me');
        const text = await res.text();
        let j = null;
        try { j = JSON.parse(text); } catch { /* ignore */ }
        if (!res.ok) throw new Error(j?.error || text || 'Konnte Profil nicht laden');
        if (alive) setMe(j);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
      } finally {
        if (alive) setBusy(false);
      }
    }

    load();
    return () => { alive = false; };
  }, [supabase]);

  if (busy && !me && !err) return (
    <div className="card">
      <h1 className="h1">Profil</h1>
      <p className="sub">Lade Profil…</p>
      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Session: {String(debug.session)} · Token: {debug.token || '—'}
      </div>
    </div>
  );

  if (err) {
    return (
      <div className="card">
        <h1 className="h1">Profil</h1>
        <div className="error">{err}</div>
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Session: {String(debug.session)} · Token: {debug.token || '—'}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <a className="secondary" href="/login" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Zum Login →
          </a>
          <button
            type="button"
            className="secondary"
            onClick={() => window.location.reload()}
            style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}
          >
            Neu laden
          </button>
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="card">
        <h1 className="h1">Profil</h1>
        <p className="sub">Kein Profil geladen.</p>
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Session: {String(debug.session)} · Token: {debug.token || '—'}
        </div>
        <a className="secondary" href="/login" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
          Zum Login →
        </a>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="h1">Profil</h1>
      <p className="sub">{me.profile?.display_name || me.user?.email}</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">E-Mail</span>
          <span>{me.user?.email}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Gruppe</span>
          <span>{me.group?.name || '—'}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Land</span>
          <span>{me.profile?.country_code || '—'}</span>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Admin</span>
          <span>{me.isAdmin ? 'Ja' : 'Nein'}</span>
        </div>
      </div>

      <div className="muted" style={{ marginTop: 14, fontSize: 12 }}>
        Session: {String(debug.session)} · Token: {debug.token || '—'}
      </div>
    </div>
  );
}
