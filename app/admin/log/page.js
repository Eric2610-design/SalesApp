'use client';

import { useEffect, useState } from 'react';

function fmt(x) {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x ?? '');
  }
}

export default function AdminLogPage() {
  const [err, setErr] = useState('');
  const [logs, setLogs] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState('');

  async function load() {
    setErr('');
    setMsg('');
    const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const meJ = await meRes.json().catch(() => ({}));
    if (!meRes.ok) return setErr('Nicht eingeloggt');
    if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');

    try {
      const res = await fetch('/api/admin/log?limit=80', { cache: 'no-store' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Log laden fehlgeschlagen');
      setLogs(j.logs || []);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function undo(id) {
    setMsg('');
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/log/undo', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Undo fehlgeschlagen');
      setMsg('OK: Aktion rückgängig gemacht.');
      await load();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusyId(null);
    }
  }

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Log</div>
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
        <div className="h1">Admin · Log</div>
        <div className="sub">Letzte Admin-Aktionen. Wo möglich, kannst du sie rückgängig machen.</div>
      </div>

      {msg ? (
        <div className={msg.startsWith('OK') ? 'card' : 'error'}>{msg}</div>
      ) : null}

      <div className="card" style={{ overflowX: 'auto' }}>
        <table className="table" style={{ minWidth: 900 }}>
          <thead>
            <tr>
              <th style={{ width: 160 }}>Zeit</th>
              <th style={{ width: 200 }}>User</th>
              <th style={{ width: 160 }}>Aktion</th>
              <th style={{ width: 200 }}>Target</th>
              <th>Details</th>
              <th style={{ width: 140 }}>Undo</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => {
              const undoable = !!l.undo && !l.undone_at;
              return (
                <tr key={l.id}>
                  <td className="muted">{new Date(l.created_at).toLocaleString()}</td>
                  <td>{l.actor_email || ''}</td>
                  <td><code>{l.action}</code></td>
                  <td>{l.target || ''}</td>
                  <td>
                    <details>
                      <summary className="muted">anzeigen</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontSize: 12 }}>
                        {fmt({ payload: l.payload, undo: l.undo, undone_at: l.undone_at, undone_by: l.undone_by })}
                      </pre>
                    </details>
                  </td>
                  <td>
                    {l.undone_at ? (
                      <span className="muted">undo done</span>
                    ) : undoable ? (
                      <button className="secondary" onClick={() => undo(l.id)} disabled={busyId === l.id}>
                        Rückgängig
                      </button>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row">
        <button className="secondary" onClick={load}>Neu laden</button>
        <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
      </div>
    </div>
  );
}
