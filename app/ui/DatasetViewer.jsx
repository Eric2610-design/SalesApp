'use client';

import { useEffect, useMemo, useState } from 'react';

function collectColumns(rows, maxRows = 50) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, maxRows)) {
    const obj = r?.row_data || {};
    Object.keys(obj || {}).forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

export default function DatasetViewer({ dataset, title }) {
  const [data, setData] = useState({ import: null, rows: [] });
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr('');
      try {
        const res = await fetch(`/api/data/${dataset}?limit=200`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Fehler');
        if (alive) setData({ import: j.import || null, rows: j.rows || [] });
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [dataset]);

  const cols = useMemo(() => {
    const dc = data?.import?.display_columns;
    if (Array.isArray(dc) && dc.length) return dc;
    return collectColumns(data.rows);
  }, [data.rows, data.import]);

  if (err) {
    return (
      <div className="error">
        {err}
        <div style={{ marginTop: 10 }}>
          <a className="secondary" href="/login" style={{ textDecoration: 'none' }}>Zum Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">{title}</div>
        <div className="sub">
          {data.import
            ? <>Letzter Import: <strong>{data.import.filename || 'Datei'}</strong> · {data.import.inserted_count ?? data.import.row_count} Zeilen</>
            : <>Noch keine Daten. Importiere über <a href="/admin/import">Admin → Datenimport</a>.</>}
        </div>
        {data.import ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {new Date(data.import.created_at).toLocaleString()} · {data.import.created_by || ''}
            {data.import.status && data.import.status !== 'done' ? <> · Status: <strong>{data.import.status}</strong></> : null}
          </div>
        ) : null}
      </div>

      {data.rows?.length ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                {cols.map((c) => <th key={c}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.row_index}>
                  <td className="muted">{r.row_index + 1}</td>
                  {cols.map((c) => (
                    <td key={c}>{String((r.row_data || {})[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            Anzeige: erste {data.rows.length} Zeilen (von {data.import?.row_count || data.rows.length}).
          </div>
        </div>
      ) : null}

      <div className="row">
        <a className="secondary" href="/" style={{ textDecoration: 'none' }}>Home</a>
        <a className="secondary" href="/admin/import" style={{ textDecoration: 'none' }}>Import</a>
      </div>
    </div>
  );
}
