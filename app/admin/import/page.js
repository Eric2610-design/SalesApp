'use client';

import { useEffect, useMemo, useState } from 'react';

const DATASETS = [
  { key: 'dealers', title: 'Händler', hint: 'Import in die Händler-Datenbasis' },
  { key: 'backlog', title: 'Rückstand', hint: 'Import für Auftragsrückstand' },
  { key: 'inventory', title: 'Lager', hint: 'Import für Lagerbestand' }
];

export default function AdminImportPage() {
  const [err, setErr] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [dataset, setDataset] = useState('dealers');
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const ds = useMemo(() => DATASETS.find(d => d.key === dataset) || DATASETS[0], [dataset]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr('');
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const meJ = await meRes.json().catch(() => ({}));
      if (!meRes.ok) return alive && setErr('Nicht eingeloggt');
      if (!meJ?.isAdmin) return alive && setErr('Nur Admin. (ADMIN_EMAILS)');
    })();
    return () => { alive = false; };
  }, []);

  async function setupTables() {
    setMsg('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/import/setup', {
        method: 'POST',
        headers: { 'x-admin-actions-key': adminKey || '' }
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Setup fehlgeschlagen');
      setMsg('OK: Import-Tabellen sind bereit.');
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function upload() {
    setMsg('');
    setBusy(true);
    try {
      if (!file) throw new Error('Bitte Datei auswählen (CSV oder XLSX).');
      const fd = new FormData();
      fd.set('dataset', dataset);
      fd.set('file', file);

      const res = await fetch('/api/admin/import', { method: 'POST', body: fd });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Upload fehlgeschlagen');
      setMsg(`OK: ${j.row_count} Zeilen importiert (Import-ID: ${j.import_id}).`);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Datenimport</div>
        <div className="error" style={{ marginTop: 10 }}>{err}</div>
        <div style={{ marginTop: 10 }}>
          <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">Admin · Datenimport</div>
        <div className="sub">CSV oder Excel (XLSX) hochladen. Erste Zeile = Spaltennamen.</div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>ADMIN_ACTIONS_KEY (optional)</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Nur für den <strong>Setup</strong>-Button nötig (Tabellen anlegen). Wenn du den Key in Vercel gesetzt hast, trage ihn hier ein.
        </div>
        <input className="input" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="(optional, falls env gesetzt)" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="secondary" onClick={setupTables} disabled={busy}>Setup: Import-Tabellen anlegen</button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Upload</div>

        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 200 }}>
            <div className="label">Ziel</div>
            <select className="input" value={dataset} onChange={(e) => setDataset(e.target.value)}>
              {DATASETS.map(d => (
                <option key={d.key} value={d.key}>{d.title}</option>
              ))}
            </select>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{ds.hint}</div>
          </div>

          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="label">Datei</div>
            <input
              className="input"
              type="file"
              accept=".csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              CSV: <code>;</code> oder <code>,</code> (automatisch erkannt). XLSX: erstes Tabellenblatt.
            </div>
          </div>

          <button className="primary" onClick={upload} disabled={busy || !file}>Hochladen</button>
        </div>
      </div>

      {msg ? (
        <div className={msg.startsWith('OK') ? 'card' : 'error'}>{msg}</div>
      ) : null}

      <div className="row">
        <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        <a className="secondary" href="/database" style={{ textDecoration: 'none' }}>Zu Händler</a>
        <a className="secondary" href="/backlog" style={{ textDecoration: 'none' }}>Zu Rückstand</a>
        <a className="secondary" href="/inventory" style={{ textDecoration: 'none' }}>Zu Lager</a>
      </div>
    </div>
  );
}
