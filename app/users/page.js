'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { authedFetch } from '../../lib/authedFetch';

export default function MyProfile() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let alive = true;

    async function load() {
      setBusy(true);
      setErr('');
      try {
        const res = await authedFetch(supabase, '/api/auth/me');
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Konnte Profil nicht laden');
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

  if (busy && !me && !err) return <div className="card"><p className="sub">Lade Profil…</p></div>;

  if (err) {
    return (
      <div className="card">
        <h1 className="h1">Profil</h1>
        <div className="error">{err}</div>
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
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">E-Mail</span><strong>{me.user?.email}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Gruppe</span><strong>{me.group?.name || '-'}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Land</span><strong>{me.profile?.country_code || '-'}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Admin</span><strong>{me.isAdmin ? 'Ja' : 'Nein'}</strong></div>
      </div>
    </div>
  );
}
