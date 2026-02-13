'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../../lib/supabaseClient';

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
    const sess = (await supabase.auth.getSession()).data.session;
    const token = sess?.access_token;
    if (!token) throw new Error('Bitte einloggen');
    const res = await fetch('/api/auth/me', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || 'Konnte Benutzer nicht laden');
    return { token, me: j };
  }

  async function loadPackages(token) {
    const res = await fetch('/api/admin/install', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const j = await res.json();
    if (res.ok) setPackages(j.packages || []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr('');
        const { token, me } = await loadMe();
        if (!alive) return;
        setMe(me);
        await loadPackages(token);
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
      const sess = (await supabase.auth.getSession()).data.session;
      const token = sess?.access_token;
      if (!token) throw new Error('Bitte einloggen');

      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch('/api/admin/install', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Installation fehlgeschlagen');

      setResult(j);
      await loadPackages(token);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const isAdmin = !!me?.isAdmin;

  if (err) {
    return (
      <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 className="h1">Installer</h1>
        <div className="error">{err}</div>
        <a className="secondary" href="/settings" style={{ display: 'inline-block', marginTop: 10, padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
          Einstellungen →
        </a>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 className="h1">Installer</h1>
        <div className="error">Nur Admin.</div>
        <a className="secondary" href="/" style={{ display: 'inline-block', marginTop: 10, padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
          Homescreen →
        </a>
      </div>
    );
  }

  return (
    <div className="grid">
      <div className="card">
        <h1 className="h1">Admin · Installer</h1>
        <p className="sub">
          Installer v1 installiert <b>nur Konfiguration</b> (Apps, Sichtbarkeit, Dock) aus einer ZIP mit <code>manifest.json</code>.
          SQL-Migrationen werden nur angezeigt (Copy/Paste in Supabase SQL Editor).
        </p>

        <div className="card" style={{ marginTop: 12 }}>
          <strong>ZIP hochladen</strong>
          <div className="sub" style={{ marginTop: 6 }}>Format: ZIP enthält <code>manifest.json</code> im Root.</div>

          <input type="file" accept=".zip" onChange={(e) => setFile(e.target.files?.[0] || null)} style={{ marginTop: 10 }} />

          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={install} disabled={busy || !file}>
              {busy ? 'Installiere…' : 'Installieren'}
            </button>
            <a className="secondary" href="/admin/apps" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', textDecoration: 'none' }}>
              Apps verwalten →
            </a>
          </div>
        </div>

        {result ? (
          <div className="card" style={{ marginTop: 12 }}>
            <strong>Ergebnis</strong>
            <div className="sub" style={{ marginTop: 8 }}>
              Paket: <b>{result.package?.name}</b> · Version: <b>{result.package?.version}</b>
            </div>
            <div className="sub" style={{ marginTop: 6 }}>
              Apps: {result.installed?.apps?.join(', ') || '—'}<br/>
              Visibility Rows: {result.installed?.visibility || 0}<br/>
              Dock Rows: {result.installed?.dock || 0}
            </div>

            {(result.warnings || []).length ? (
              <div className="toast" style={{ marginTop: 10 }}>
                <b>Hinweise</b><br/>
                {(result.warnings || []).map((w, i) => <div key={i} className="sub">• {w}</div>)}
              </div>
            ) : null}

            {(result.requires_sql || []).length ? (
              <div style={{ marginTop: 10 }}>
                <div className="sub"><b>Benötigte SQL-Schritte</b> (bitte in Supabase SQL Editor ausführen):</div>
                <CopyBox text={(result.requires_sql || []).join('\n\n')} />
              </div>
            ) : (
              <div className="sub" style={{ marginTop: 10 }}>Keine SQL Schritte im Paket.</div>
            )}
          </div>
        ) : null}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Zuletzt installierte Pakete</h2>
        <p className="sub">Tabelle <code>installed_packages</code> (max. 50).</p>

        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {(packages || []).map((p) => (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{p.name}</strong>
                <span className="sub">{p.version}</span>
              </div>
              <div className="sub" style={{ marginTop: 6 }}>
                by: {p.installed_by || '—'}<br/>
                at: {new Date(p.installed_at).toLocaleString('de-DE')}
              </div>
            </div>
          ))}
          {!packages?.length ? (
            <div className="sub">Noch keine Pakete installiert. (SQL: <code>supabase/installer.sql</code> ausführen)</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
