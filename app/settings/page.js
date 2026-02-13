'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../lib/supabaseClient';

function Row({ href, title, subtitle, icon }) {
  return (
    <a className="settings-row" href={href}>
      <div className="settings-left">
        <div className="settings-icon">{icon}</div>
        <div>
          <div className="settings-title">{title}</div>
          {subtitle ? <div className="settings-sub">{subtitle}</div> : null}
        </div>
      </div>
      <div className="settings-right">›</div>
    </a>
  );
}

export default function Settings() {
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
        if (!res.ok) throw new Error(j?.error || 'Konnte Benutzer nicht laden');
        if (alive) setMe(j);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    }
    load();
    return () => { alive = false; };
  }, [supabase]);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = '/';
  }

  const isAdmin = !!me?.isAdmin;
  const groupName = me?.group?.name || '—';

  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Einstellungen</h1>
        <p className="sub">Wie beim iPhone: Bereiche, die für deine Gruppe sichtbar sind.</p>

        {err ? <div className="error">{err}</div> : null}

        <div className="settings-section" style={{ marginTop: 14 }}>
          <div className="settings-header">Account</div>
          <Row href="/users" icon="👤" title="Profil" subtitle={me?.profile?.email || '—'} />
          <div className="sub" style={{ marginTop: 10 }}>Gruppe: <b>{groupName}</b></div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="secondary" onClick={signOut} style={{ padding: '10px 12px' }}>Logout</button>
            <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>Homescreen</a>
          </div>
        </div>

        <div className="settings-section" style={{ marginTop: 14 }}>
          <div className="settings-header">Apps</div>
          <Row href="/" icon="🧩" title="Homescreen" subtitle="Apps & Dock" />
        </div>

        {isAdmin ? (
          <div className="settings-section" style={{ marginTop: 14 }}>
            <div className="settings-header">Admin</div>
            <Row href="/admin/apps" icon="🛠️" title="Apps verwalten" subtitle="Sichtbarkeit & Dock" />
            <Row href="/admin/installer" icon="📦" title="Installer" subtitle="Pakete installieren" />
            <Row href="/admin" icon="🧨" title="Admin Bereich" subtitle="Tools & Uploads" />
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Hinweis</h2>
        <p className="sub">
          Ziel: Apps werden im Admin-Bereich angelegt (Supabase). Danach erscheinen sie automatisch auf dem Homescreen,
          ohne Code-Änderung – solange es ein „Link“-App ist oder eine Standard-App-Template nutzt.
        </p>
      </div>
    </div>
  );
}
