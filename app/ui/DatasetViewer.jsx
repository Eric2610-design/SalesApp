'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCell } from '@/lib/typeDetect';

function collectColumns(rows, maxRows = 50) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, maxRows)) {
    const obj = r?.row_data || {};
    Object.keys(obj || {}).forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

export default function DatasetViewer({ dataset, title, rowLinkBase = null }) {
  const [data, setData] = useState({ import: null, schema: null, rows: [] });
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

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

  const labelMap = useMemo(() => {
    return data?.schema?.column_labels || {};
  }, [data.schema]);

  const effectiveRowLinkBase = rowLinkBase || (dataset === 'dealers' ? '/dealers' : null);

  const viewConfig = useMemo(() => {
    const vc = data?.schema?.view_config;
    return (vc && typeof vc === 'object') ? vc : {};
  }, [data?.schema]);

  const filteredRows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return data.rows || [];
    const useCols = cols.length ? cols : collectColumns(data.rows);
    return (data.rows || []).filter((r) => {
      const obj = r?.row_data || {};
      for (const c of useCols) {
        const v = obj?.[c];
        if (v == null) continue;
        if (String(v).toLowerCase().includes(qq)) return true;
      }
      return false;
    });
  }, [q, data.rows, cols]);

  const listGrouping = useMemo(() => {
    const enabled = viewConfig?.list_group_enabled === true;
    const by = String(viewConfig?.list_group_by || '').trim();
    return { enabled, by };
  }, [viewConfig]);

  const groups = useMemo(() => {
    if (!listGrouping.enabled || !listGrouping.by) return [];
    const map = new Map();
    for (const r of (filteredRows || [])) {
      const v = (r?.row_data || {})[listGrouping.by];
      const key = (v == null || String(v).trim() === '') ? '(leer)' : String(v);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const out = Array.from(map.entries()).map(([key, items]) => ({ key, items }));
    out.sort((a, b) => b.items.length - a.items.length);
    return out;
  }, [filteredRows, listGrouping]);

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
            : <>Noch keine Daten. Importiere über den Admin‑Bereich.</>}
        </div>
        {data.import ? (
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {new Date(data.import.created_at).toLocaleString()} · {data.import.created_by || ''}
            {data.import.status && data.import.status !== 'done' ? <> · Status: <strong>{data.import.status}</strong></> : null}
          </div>
        ) : null}

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="label">Suche in {title}</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Name, Ort, Nummer…" />
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            {q.trim() ? <>Treffer: <strong>{filteredRows.length}</strong></> : null}
          </div>
        </div>
      </div>

      {filteredRows?.length ? (
        listGrouping.enabled && listGrouping.by ? (
          <div className="card" style={{ padding: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 900 }}>Gruppiert nach: {listGrouping.by}</div>
              <div className="muted" style={{ fontSize: 12 }}>{groups.length} Gruppen · {filteredRows.length} Zeilen</div>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
              {groups.slice(0, 80).map((g, idx) => (
                <details key={g.key} open={idx === 0} className="card" style={{ padding: 12 }}>
                  <summary style={{ cursor: 'pointer' }}>
                    <span style={{ fontWeight: 900 }}>{g.key}</span>
                    <span className="muted" style={{ marginLeft: 10, fontSize: 12 }}>{g.items.length} Zeilen</span>
                  </summary>
                  <div style={{ marginTop: 10, overflowX: 'auto' }}>
                    <table className="table" style={{ minWidth: effectiveRowLinkBase ? 720 : 600 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 60 }}>#</th>
                          {effectiveRowLinkBase ? <th style={{ width: 110 }}>Öffnen</th> : null}
                          {cols.map((c) => <th key={c}>{(labelMap?.[c] || '').trim() || c}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.slice(0, 60).map((r) => (
                          <tr key={r.row_index}>
                            <td className="muted">{r.row_index + 1}</td>
                            {effectiveRowLinkBase ? (
                              <td>
                                <a className="secondary" href={`${effectiveRowLinkBase}/${r.row_index}`} style={{ textDecoration: 'none', padding: '6px 10px', fontSize: 12 }}>Details</a>
                              </td>
                            ) : null}
                            {cols.map((c) => (
                              <td key={c}>{formatCell((r.row_data || {})[c], typeMap?.[c])}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {g.items.length > 60 ? (
                      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Zeigt max. 60 Zeilen pro Gruppe.</div>
                    ) : null}
                  </div>
                </details>
              ))}
              {groups.length > 80 ? (
                <div className="muted" style={{ fontSize: 12 }}>Es werden max. 80 Gruppen angezeigt.</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ minWidth: effectiveRowLinkBase ? 720 : 600 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  {effectiveRowLinkBase ? <th style={{ width: 110 }}>Öffnen</th> : null}
                  {cols.map((c) => <th key={c}>{(labelMap?.[c] || '').trim() || c}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.row_index}>
                    <td className="muted">{r.row_index + 1}</td>
                    {effectiveRowLinkBase ? (
                      <td>
                        <a className="secondary" href={`${effectiveRowLinkBase}/${r.row_index}`} style={{ textDecoration: 'none', padding: '6px 10px', fontSize: 12 }}>Details</a>
                      </td>
                    ) : null}
                    {cols.map((c) => (
                      <td key={c}>{formatCell((r.row_data || {})[c], typeMap?.[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Anzeige: {filteredRows.length} Zeilen (geladen: {data.rows.length}).
            </div>
          </div>
        )
      ) : null}

      <div className="row">
        <a className="secondary" href="/" style={{ textDecoration: 'none' }}>Home</a>
      </div>
    </div>
  );
}
