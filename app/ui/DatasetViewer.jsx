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
  const [data, setData] = useState({ import: null, schema: null, rows: [] });
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr('');
      try {
        const res = await fetch(`/api/data/${dataset}?limit=200`, { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Fehler');
        if (alive) setData({ import: j.import || null, schema: j.schema || null, rows: j.rows || [] });
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      }
    })();
    return () => { alive = false; };
  }, [dataset]);

  const cols = useMemo(() => {
    const sc = data?.schema?.display_columns;
    if (Array.isArray(sc) && sc.length) return sc;
    const dc = data?.import?.display_columns;
    if (Array.isArray(dc) && dc.length) return dc;
    return collectColumns(data.rows);
  }, [data.rows, data.import, data.schema]);

  const typeMap = useMemo(() => {
    return data?.schema?.column_types || data?.import?.column_types || {};
  }, [data.schema, data.import]);

  function excelSerialToDate(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    // Excel epoch (1899-12-30)
    const ms = Math.round((n - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function formatCell(val, type) {
    if (val == null) return '';
    const t = String(type || 'text');

    if (t === 'leer') return '';

    if (t === 'number') {
      const n = typeof val === 'number' ? val : Number(String(val).replace(',', '.'));
      if (Number.isFinite(n)) return String(n);
      return String(val);
    }

    if (t === 'boolean') {
      const s = String(val).trim().toLowerCase();
      const yes = ['1', 'true', 'yes', 'ja', 'j', 'x'].includes(s);
      const no = ['0', 'false', 'no', 'nein', 'n', ''].includes(s);
      if (typeof val === 'boolean') return val ? 'ja' : 'nein';
      if (yes) return 'ja';
      if (no) return 'nein';
      return String(val);
    }

    if (t === 'date_excel') {
      const d = excelSerialToDate(val);
      if (!d) return String(val);
      return d.toLocaleDateString();
    }

    if (t === 'date') {
      const d = new Date(val);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
      // If it's a number and looks like Excel, try Excel conversion
      const n = Number(val);
      if (Number.isFinite(n) && n > 20000 && n < 70000) {
        const dd = excelSerialToDate(n);
        if (dd) return dd.toLocaleDateString();
      }
      return String(val);
    }

    return String(val);
  }

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
                    <td key={c}>{formatCell((r.row_data || {})[c], typeMap?.[c])}</td>
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
        <a className="secondary" href={`/admin/datasets?dataset=${encodeURIComponent(dataset)}`} style={{ textDecoration: 'none' }}>Spalten/Typen</a>
      </div>
    </div>
  );
}
