'use client';

import { useState } from 'react';

const TARGETS = [
  { key: 'dealers', label: 'Händler-Datenbank leeren' },
  { key: 'backlog', label: 'Auftragsrückstand leeren' },
  { key: 'inventory', label: 'Lagerbestand leeren' },
  { key: 'all_data', label: 'ALLES leeren (Händler + Rückstand + Lager)' },
];

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function clear(target) {
    setToast('');
    setError('');
    setResult(null);

    if (!adminKey.trim()) {
      setError('Bitte Admin Key eingeben (ENV: ADMIN_ACTIONS_KEY).');
      return;
    }

    const warn =
      target === 'all_data'
        ? 'Wirklich ALLES löschen? (Händler + Rückstand + Lager)'
        : `Wirklich "${TARGETS.find((t) => t.key === target)?.label}"?`;

    if (!confirm(warn)) return;

    setBusy(true);
    try {
      const res = await fetch('/api/admin/clear', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-admin-key': adminKey.trim(),
        },
        body: JSON.stringify({ target }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Löschen fehlgeschlagen');

      setResult(data);
      setToast('OK – Daten wurden gelöscht.');
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">Admin</h1>
          <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <a className="secondary" href="/admin/imports" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block' }}>📥 Upload Center</a>
            <a className="secondary" href="/admin/apps" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block' }}>🧩 Apps</a>
            <a className="secondary" href="/admin/installer" style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)', display: 'inline-block' }}>📦 Installer</a>
          </div>
          <p className="sub">Gefährliche Aktionen (Datenbanken leeren). Nur mit Admin Key.</p>
        </div>
        <div className="row">
          <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            ← Start
          </a>
          <a className="secondary" href="/users" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Benutzer →
          </a>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Admin Key</h2>
        <div className="small" style={{ marginBottom: 8 }}>
          Der Key ist <span className="mono">ADMIN_ACTIONS_KEY</span> in Vercel / .env.local.
        </div>

        <div className="row" style={{ alignItems: 'end' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <label>Admin Key</label><br />
            <input value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="(Secret)" style={{ width: '100%' }} />
          </div>
        </div>

        <hr className="sep" />

        <h2 style={{ marginTop: 0 }}>Daten leeren</h2>
        <div className="small" style={{ marginBottom: 10 }}>
          Löscht Daten in Supabase-Tabellen. Auth-User werden <b>nicht</b> gelöscht.
        </div>

        <div className="row" style={{ gap: 10 }}>
          {TARGETS.map((t) => (
            <button key={t.key} className={t.key === 'all_data' ? '' : 'secondary'} onClick={() => clear(t.key)} disabled={busy}>
              {busy ? '…' : t.label}
            </button>
          ))}
        </div>

        {toast ? <div className="toast">{toast}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        {result ? (
          <div className="card" style={{ marginTop: 12 }}>
            <div className="small">Ergebnis:</div>
            <pre className="mono small" style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
