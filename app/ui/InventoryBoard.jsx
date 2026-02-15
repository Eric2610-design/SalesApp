'use client';

import { useEffect, useMemo, useState } from 'react';
import { formatCell } from '@/lib/typeDetect';

function collectColumns(rows, maxRows = 120) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, maxRows)) {
    const obj = r?.row_data || {};
    Object.keys(obj).forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

export default function InventoryBoard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  const [mode, setMode] = useState('cards');
  const [groupBy, setGroupBy] = useState('');
  const [itemFields, setItemFields] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    let alive = true;
    fetch('/api/data/inventory?limit=800', { cache: 'no-store' })
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) throw new Error(j?.error || 'Lager laden fehlgeschlagen');
        setData(j);
        const vc = j?.schema?.view_config || {};
        setMode(String(vc?.mode || 'cards'));
        setGroupBy(String(vc?.group_by || ''));
        setItemFields(Array.isArray(vc?.item_fields) ? vc.item_fields : []);
      })
      .catch((e) => alive && setErr(e?.message || String(e)));
    return () => { alive = false; };
  }, []);

  const rows = data?.rows || [];
  const schema = data?.schema || {};
  const typeMap = schema?.column_types || data?.import?.column_types || {};
  const labelMap = schema?.column_labels || {};

  const columns = useMemo(() => {
    const base = Array.isArray(schema?.display_columns) ? schema.display_columns : null;
    const fromRows = collectColumns(rows);
    const list = (base && base.length ? base : fromRows);
    return list;
  }, [rows, schema]);

  const groupOptions = useMemo(() => {
    const opts = collectColumns(rows).sort((a, b) => a.localeCompare(b));
    return opts;
  }, [rows]);

  const effectiveGroupBy = groupBy || groupOptions[0] || '';
  const effectiveItemFields = itemFields.length ? itemFields : columns.slice(0, 3);

  const groups = useMemo(() => {
    if (!effectiveGroupBy) return [];
    const map = new Map();
    for (const r of rows) {
      const v = (r.row_data || {})[effectiveGroupBy];
      const key = (v == null || String(v).trim() === '') ? '(leer)' : String(v);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    let out = Array.from(map.entries()).map(([k, items]) => ({ key: k, items }));
    out.sort((a, b) => b.items.length - a.items.length);
    if (q.trim()) {
      const qq = q.trim().toLowerCase();
      out = out.filter((g) => g.key.toLowerCase().includes(qq));
    }
    return out;
  }, [rows, effectiveGroupBy, q]);

  if (err) {
    return <div className="error">{err}</div>;
  }

  if (!data) {
    return <div className="card"><div className="muted">Lade Lager…</div></div>;
  }

  if (!rows.length) {
    return (
      <div className="card">
        <div className="h1">Lager</div>
        <div className="muted">Noch keine Daten. Importiere im Adminbereich eine CSV/XLSX als <strong>inventory</strong>.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">Lagerbestand</div>
        <div className="sub">Kacheln (gruppiert) oder Liste – ohne horizontales Scrollen.</div>

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 160 }}>
            <div className="label">Ansicht</div>
            <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="cards">Kacheln</option>
              <option value="list">Liste</option>
            </select>
          </div>

          {mode === 'cards' ? (
            <>
              <div style={{ minWidth: 220 }}>
                <div className="label">Gruppieren nach</div>
                <select className="input" value={effectiveGroupBy} onChange={(e) => setGroupBy(e.target.value)}>
                  {groupOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ minWidth: 240, flex: 1 }}>
                <div className="label">Suche Gruppe</div>
                <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. Modellname" />
              </div>
            </>
          ) : null}
        </div>

        {mode === 'cards' ? (
          <details style={{ marginTop: 10 }}>
            <summary className="muted" style={{ cursor: 'pointer' }}>Welche Felder sollen in den Kacheln stehen?</summary>
            <div className="row" style={{ flexWrap: 'wrap', marginTop: 8 }}>
              {groupOptions.slice(0, 60).map((c) => {
                const checked = effectiveItemFields.includes(c);
                return (
                  <label key={c} style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginRight: 10 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const set = new Set(effectiveItemFields);
                        if (e.target.checked) set.add(c);
                        else set.delete(c);
                        setItemFields(Array.from(set));
                      }}
                    />
                    <span className="muted" style={{ fontSize: 12 }}>{c}</span>
                  </label>
                );
              })}
            </div>
          </details>
        ) : null}
      </div>

      {mode === 'list' ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table className="table" style={{ minWidth: 760 }}>
            <thead>
              <tr>
                <th style={{ width: 60 }}>#</th>
                {columns.slice(0, 14).map((c) => <th key={c}>{(labelMap?.[c] || '').trim() || c}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 200).map((r) => (
                <tr key={r.row_index}>
                  <td className="muted">{r.row_index + 1}</td>
                  {columns.slice(0, 14).map((c) => <td key={c}>{formatCell((r.row_data || {})[c], typeMap?.[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>Liste zeigt max. 200 Zeilen & 14 Spalten.</div>
        </div>
      ) : (
        <div className="cards-grid">
          {groups.map((g) => (
            <div key={g.key} className="data-card">
              <div className="data-card-title">
                <div style={{ fontWeight: 900, fontSize: 14, lineHeight: 1.2 }}>{g.key}</div>
                <div className="muted" style={{ fontSize: 12 }}>{g.items.length} Artikel</div>
              </div>
              <div className="data-card-body">
                <ul className="data-card-list">
                  {g.items.slice(0, 20).map((r) => (
                    <li key={r.row_index} className="data-card-row">
                      {effectiveItemFields.map((f) => {
                        const v = (r.row_data || {})[f];
                        const label = (labelMap?.[f] || '').trim() || f;
                        return (
                          <span key={f} className="data-card-field">
                            <span className="muted" style={{ fontSize: 11 }}>{label}:</span>{' '}
                            <span style={{ fontSize: 12 }}>{formatCell(v, typeMap?.[f])}</span>
                          </span>
                        );
                      })}
                    </li>
                  ))}
                </ul>
                {g.items.length > 20 ? (
                  <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>… +{g.items.length - 20} weitere</div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
