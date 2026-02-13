'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';
import { authedFetch, getAccessToken } from '../../../lib/authedFetch';

function CopyBox({ text }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  }
  return (
    <div style={{ marginTop: 10 }}>
      <textarea value={text} readOnly style={{ width: '100%', minHeight: 140, fontFamily: 'ui-monospace', fontSize: 12, padding: 10 }} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="secondary" type="button" onClick={copy} style={{ padding: '10px 12px' }}>
          {copied ? 'Kopiert ✓' : 'SQL kopieren'}
        </button>
      </div>
    </div>
  );
}

export default function AdminInstaller() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [me, setMe] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [packages, setPackages] = useState([]);

  async function loadMe() {
    const res = await authedFetch(supabase, '/api/auth/me');
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || 'Konnte Benutzer nicht laden');
    return j;
  }

  async function loadPackages() {
    const res = await authedFetch(supabase, '/api/admin/install');
    const j = await res.json();
    if (res.ok) setPackages(j.packages || []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr('');
        const me = await loadMe();
        if (!alive) return;
        setMe(me);
        await loadPackages();
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  async function install() {
    setErr('');
    setResult(null);

    if (!file) {
      setErr('Bitte ZIP auswählen.');
      return;
    }

    setBusy(true);
    try {
      const token = await getAccessToken(supabase);
      if (!token) throw new Error('Bitte einloggen');

      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/admin/install', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });

      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Installation fehlgeschlagen');
      setResult(j);
      await loadPackages();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="card">
        <h1 className="h1">Installer</h1>
        <div className="error">{err}</div>
        <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Homescreen →
          </a>
          <a className="secondary" href="/login" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Login →
          </a>
        </div>
      </div>
    );
  }

  if (!me) return <div className="card"><p className="sub">Lade…</p></div>;

  if (!me.isAdmin) {
    return (
      <div className="card">
        <h1 className="h1">Installer</h1>
        <div className="error">Nur Admin.</div>
        <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block', marginTop: 12 }}>
          Homescreen →
        </a>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="h1">Installer</h1>

      <div style={{ marginTop: 10 }}>
        <input type="file" accept=".zip" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button className="primary" type="button" disabled={busy} onClick={install} style={{ padding: '10px 14px' }}>
          {busy ? 'Installiere…' : 'Installieren'}
        </button>
      </div>

      {result?.requires_sql?.length ? (
        <div style={{ marginTop: 16 }}>
          <h2 className="h2">Benötigte SQL-Schritte</h2>
          {result.requires_sql.map((s, i) => (
            <CopyBox key={i} text={s} />
          ))}
        </div>
      ) : null}

      {packages?.length ? (
        <div style={{ marginTop: 18 }}>
          <h2 className="h2">Installiert</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            {packages.map((p) => (
              <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: 10, border: '1px solid rgba(17,24,39,.10)', borderRadius: 12 }}>
                <div>
                  <strong>{p.name}</strong>
                  <div className="sub">{p.version}</div>
                </div>
                <div className="sub">{new Date(p.installed_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
