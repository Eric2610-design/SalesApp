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
      <textarea
        value={text}
        readOnly
        style={{
          width: '100%',
          minHeight: 140,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          fontSize: 12,
          padding: 10,
          borderRadius: 12,
          border: '1px solid rgba(17,24,39,.12)',
        }}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="secondary" type="button" onClick={copy} style={{ padding: '10px 12px' }}>
          {copied ? 'Kopiert ✓' : 'Kopieren'}
        </button>
      </div>
    </div>
  );
}

export default function InstallerPage() {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [me, setMe] = useState(null);
  const [debug, setDebug] = useState({ session: null, token: null });
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null);
  const [packages, setPackages] = useState([]);

  async function loadMe() {
    const res = await authedFetch(supabase, '/api/auth/me');
    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(j?.error || text || 'Konnte Benutzer nicht laden');
    return j;
  }

  async function loadPackages() {
    const res = await authedFetch(supabase, '/api/admin/install');
    const text = await res.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(j?.error || text || 'Konnte Pakete nicht laden');
    setPackages(j?.packages || []);
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const s = await supabase.auth.getSession();
        const token = await getAccessToken(supabase).catch(() => null);
        if (!alive) return;
        setDebug({ session: !!s?.data?.session, token: token ? token.slice(0, 12) + '…' : null });

        const meJson = await loadMe();
        if (!alive) return;
        setMe(meJson);

        await loadPackages();
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || String(e));
      } finally {
        if (!alive) return;
        setLoading(false);
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

      const text = await res.text();
      let j = null;
      try { j = JSON.parse(text); } catch {}
      if (!res.ok) throw new Error(j?.error || text || 'Installation fehlgeschlagen');

      setResult(j);
      await loadPackages();
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !err) {
    return (
      <div className="card">
        <h1 className="h1">Installer</h1>
        <p className="sub">Lade…</p>
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Session: {String(debug.session)} · Token: {debug.token || '—'}
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="card">
        <h1 className="h1">Installer</h1>
        <div className="error">{err}</div>
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Session: {String(debug.session)} · Token: {debug.token || '—'}
        </div>
        <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
          <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Homescreen →
          </a>
          <a className="secondary" href="/login" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Login →
          </a>
          <button className="secondary" type="button" onClick={() => window.location.reload()} style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}>
            Neu laden
          </button>
        </div>
      </div>
    );
  }

  const isAdmin = !!me?.isAdmin;

  if (!isAdmin) {
    return (
      <div className="card">
        <h1 className="h1">Installer</h1>
        <div className="error">Nur Admin.</div>
        <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Gruppe: {me?.group?.name || '—'} · Session: {String(debug.session)} · Token: {debug.token || '—'}
        </div>
        <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, display: 'inline-block', border: '1px solid rgba(17,24,39,.12)', marginTop: 12 }}>
          Homescreen →
        </a>
      </div>
    );
  }

  return (
    <div className="card">
      <h1 className="h1">Installer</h1>
      <p className="sub">ZIP hochladen: installiert Apps + SQL (install.sql) + optional Seed-Daten (seed.json).</p>

      <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Eingeloggt als: {me?.user?.email} · Session: {String(debug.session)} · Token: {debug.token || '—'}
      </div>

      <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />
        <button className="primary" type="button" onClick={install} disabled={busy || !file} style={{ padding: '10px 12px', borderRadius: 14 }}>
          {busy ? 'Installiere…' : 'Installieren'}
        </button>
      </div>

      {result && (
        <div style={{ marginTop: 16 }}>
          <h2 className="h2">Ergebnis</h2>
          <div className="muted" style={{ fontSize: 12 }}>
            {result.message || 'OK'}
          </div>
          {result.sql && <CopyBox text={result.sql} />}
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <h2 className="h2">Installierte Pakete</h2>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          {packages?.length ? `${packages.length} Pakete` : 'Noch keine Pakete.'}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          {(packages || []).map((p) => (
            <div key={p.id} style={{ padding: 10, borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{p.package_name}</strong>
                <span className="muted" style={{ fontSize: 12 }}>{new Date(p.installed_at).toLocaleString()}</span>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {p.version || 'v1'} · {p.description || ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
