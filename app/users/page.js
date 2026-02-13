'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';

export default function MyProfile() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [me, setMe] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    async function load() {
      setErr('');
      try {
        const sess = (await supabase.auth.getSession()).data.session;
        const token = sess?.access_token;
        if (!token) throw new Error('Bitte einloggen');

        const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Konnte Profil nicht laden');
        if (alive) setMe(j);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    }
    load();
    return () => { alive = false; };
  }, [supabase]);

  if (err) return <div className="card"><div className="error">{err}</div></div>;
  if (!me) return <div className="card"><p className="sub">Lade Profil…</p></div>;

  return (
    <div className="card">
      <h1 className="h1">Profil</h1>
      <p className="sub">{me.profile?.display_name || me.user?.email}</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">E-Mail</span><strong>{me.user?.email}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Gruppe</span><strong>{me.group?.name || '—'}</strong></div>
        <div className="row" style={{ justifyContent: 'space-between' }}><span className="sub">Land</span><strong>{me.profile?.country_code || '—'}</strong></div>
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        <a className="secondary" href="/settings" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>Einstellungen</a>
        <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>Homescreen</a>
      </div>

      {!me.profile ? <div className="toast" style={{ marginTop: 14 }}>Kein app_users Profil gefunden. Admin muss dich anlegen und einer Gruppe zuordnen.</div> : null}
    </div>
  );
}
