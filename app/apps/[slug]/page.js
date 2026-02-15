'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { getSupabaseClient } from '../../../lib/supabaseClient';

export default function AppPlaceholder() {
  const { slug } = useParams();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [app, setApp] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const sess = (await supabase.auth.getSession()).data.session;
        const token = sess?.access_token;
        if (!token) throw new Error('Bitte einloggen');

        const res = await fetch('/api/apps/visible', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Konnte Apps nicht laden');

        const found = (j.apps || []).find((x) => x.slug === slug);
        if (!found) throw new Error('App nicht sichtbar oder nicht vorhanden');
        if (alive) setApp(found);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    }

    load();
    return () => { alive = false; };
  }, [slug, supabase]);

  if (err) return (
    <div className="card">
      <h1 className="h1">App</h1>
      <div className="error">{err}</div>
      <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block' }}>
        Zum Homescreen
      </a>
    </div>
  );

  if (!app) return <div className="card"><p className="sub">Lade App…</p></div>;

  return (
    <div className="card">
      <h1 className="h1">{app.icon} {app.title}</h1>
      <p className="sub">Platzhalter (Link-App). Ändere die Route im Admin.</p>
      <div className="row" style={{ marginTop: 12 }}>
        <a className="secondary" href={app.href || '/'} style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
          Öffnen →
        </a>
        <a className="secondary" href="/" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
          Homescreen
        </a>
      </div>
      <div className="sub" style={{ marginTop: 10 }}>Slug: <span style={{ fontFamily: 'ui-monospace' }}>{app.slug}</span></div>
    </div>
  );
}
