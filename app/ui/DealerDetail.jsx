'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCell } from '@/lib/typeDetect';

function pickName(row) {
  const obj = row?.row_data || {};
  const keys = Object.keys(obj);
  const pref = [
    'Name', 'Firmenname', 'Firma', 'Händlername', 'Haendlername', 'Shop', 'Store', 'Unternehmen', 'company'
  ];
  for (const p of pref) {
    const k = keys.find((x) => x.toLowerCase() === p.toLowerCase());
    if (k && obj[k]) return String(obj[k]);
  }
  const re = /(name|firma|haendler|händler|shop|store|company)/i;
  const hit = keys.find((k) => re.test(k) && obj[k]);
  if (hit) return String(obj[hit]);
  return `Händler #${(row?.row_index ?? 0) + 1}`;
}

function collectColumns(obj) {
  return Object.keys(obj || {});
}

function colsForSection(cfgCols, schema, rowObj, max = 12) {
  if (Array.isArray(cfgCols) && cfgCols.length) return cfgCols;
  if (Array.isArray(schema?.display_columns) && schema.display_columns.length) return schema.display_columns.slice(0, 16);
  const keys = collectColumns(rowObj);
  return keys.slice(0, max);
}

export default function DealerDetail({ id }) {
  const [err, setErr] = useState('');
  const [data, setData] = useState(null);

  useEffect(() => {
    let alive = true;
    setErr('');
    setData(null);
    fetch(`/api/dealers/${encodeURIComponent(String(id || ''))}`, { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) throw new Error(j?.error || 'Händler laden fehlgeschlagen');
        setData(j);
      })
      .catch((e) => alive && setErr(e?.message || String(e)));
    return () => { alive = false; };
  }, [id]);

  const dealer = data?.dealer || null;
  const dealerSchema = data?.dealer_schema || null;
  const dealerTypeMap = dealerSchema?.column_types || data?.dealer_import?.column_types || {};
  const dealerLabelMap = dealerSchema?.column_labels || {};

  const backlogRows = data?.backlog_rows || [];
  const backlogSchema = data?.backlog_schema || null;
  const backlogTypeMap = backlogSchema?.column_types || data?.backlog_import?.column_types || {};
  const backlogLabelMap = backlogSchema?.column_labels || {};

  const cfg = data?.config || {};

  const dealerCols = useMemo(() => {
    return colsForSection(cfg?.dealer_columns, dealerSchema, dealer?.row_data || {}, 12);
  }, [cfg?.dealer_columns, dealerSchema, dealer]);

  const backlogCols = useMemo(() => {
    const sampleObj = backlogRows?.[0]?.row_data || {};
    return colsForSection(cfg?.backlog_columns, backlogSchema, sampleObj, 10);
  }, [cfg?.backlog_columns, backlogSchema, backlogRows]);

  if (err) return <div className="error">{err}</div>;
  if (!data) return <div className="card"><div className="muted">Lade Händler…</div></div>;

  const title = pickName(dealer);
  const dealerObj = dealer?.row_data || {};

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">{title}</div>
        <div className="sub">
          Händler-Detailseite · ID {Number(dealer?.row_index ?? 0) + 1}
          {cfg?.dealer_key ? <span> · Key: <strong>{cfg.dealer_key}</strong></span> : null}
        </div>
        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <a className="secondary" href="/database" style={{ textDecoration: 'none' }}>Zur Händlerliste</a>
          <a className="secondary" href="/backlog" style={{ textDecoration: 'none' }}>Zum Rückstand</a>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Händlerdaten</div>
        <table className="table" style={{ minWidth: 680 }}>
          <thead>
            <tr>
              {dealerCols.map((c) => <th key={c}>{(dealerLabelMap?.[c] || '').trim() || c}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              {dealerCols.map((c) => (
                <td key={c}>{formatCell(dealerObj?.[c], dealerTypeMap?.[c])}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {cfg?.backlog_enabled ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 900 }}>Rückstand</div>
            <div className="muted" style={{ fontSize: 12 }}>{backlogRows.length} Positionen</div>
          </div>
          {!backlogRows.length ? (
            <div className="muted" style={{ marginTop: 10 }}>Keine Rückstände für diesen Händler gefunden.</div>
          ) : (
            <table className="table" style={{ minWidth: 760, marginTop: 10 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  {backlogCols.slice(0, 14).map((c) => <th key={c}>{(backlogLabelMap?.[c] || '').trim() || c}</th>)}
                </tr>
              </thead>
              <tbody>
                {backlogRows.slice(0, 200).map((r) => (
                  <tr key={r.row_index}>
                    <td className="muted">{r.row_index + 1}</td>
                    {backlogCols.slice(0, 14).map((c) => (
                      <td key={c}>{formatCell((r.row_data || {})[c], backlogTypeMap?.[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {backlogRows.length > 200 ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Zeigt max. 200 Zeilen.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
