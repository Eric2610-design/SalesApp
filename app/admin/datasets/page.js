'use client';

import { useEffect, useMemo, useState } from 'react';

const DATASETS = [
  { key: 'dealers', title: 'Händler' },
  { key: 'backlog', title: 'Rückstand' },
  { key: 'inventory', title: 'Lager' }
];

function normType(t) {
  const x = String(t || '').trim();
  if (!x) return 'text';
  return x;
}

function excelSerialToDate(serial) {
  const n = Number(serial);
  if (!Number.isFinite(n)) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatCell(val, type) {
  if (val == null) return '';
  const t = normType(type);

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
    const n = Number(val);
    if (Number.isFinite(n) && n > 20000 && n < 70000) {
      const dd = excelSerialToDate(n);
      if (dd) return dd.toLocaleDateString();
    }
    return String(val);
  }

  return String(val);
}

function collectColumns(rows, maxRows = 50) {
  const keys = new Set();
  for (const r of (rows || []).slice(0, maxRows)) {
    const obj = r?.row_data || {};
    Object.keys(obj || {}).forEach((k) => keys.add(k));
  }
  return Array.from(keys);
}

function guessTypeFromRows(rows, col) {
  const sample = [];
  for (const r of (rows || []).slice(0, 80)) {
    const v = (r?.row_data || {})[col];
    if (v == null) continue;
    const s = String(v);
    if (s.trim() === '') continue;
    sample.push(v);
    if (sample.length >= 10) break;
  }
  if (!sample.length) return 'text';

  const s = sample.map((x) => String(x));
  const boolOk = s.every((v) => {
    const vv = v.trim().toLowerCase();
    return ['1','0','true','false','yes','no','ja','nein','x',''].includes(vv);
  });
  if (boolOk) return 'boolean';

  const numOk = s.every((v) => {
    const vv = v.replace(',', '.');
    return vv !== '' && !Number.isNaN(Number(vv));
  });
  if (numOk) {
    const nums = s.map((v) => Number(v.replace(',', '.'))).filter((n) => Number.isFinite(n));
    const looksExcelDate = nums.length && nums.every((n) => n > 20000 && n < 70000);
    if (looksExcelDate) return 'date_excel';
    return 'number';
  }

  const dateOk = s.every((v) => !Number.isNaN(Date.parse(v)));
  if (dateOk) return 'date';

  return 'text';
}

export default function AdminDatasetsPage() {
  const [err, setErr] = useState('');
  const [dataset, setDataset] = useState('dealers');
  const [schema, setSchema] = useState(null);
  const [rows, setRows] = useState([]);
  const [imp, setImp] = useState(null);

  const [displayCols, setDisplayCols] = useState({});
  const [colTypes, setColTypes] = useState({});

  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  // dataset from query param
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ds = url.searchParams.get('dataset');
      if (ds && ['dealers', 'backlog', 'inventory'].includes(ds)) setDataset(ds);
    } catch {}
  }, []);

  async function loadAll(ds = dataset) {
    setErr('');
    setMsg('');

    const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
    const meJ = await meRes.json().catch(() => ({}));
    if (!meRes.ok) return setErr('Nicht eingeloggt');
    if (!meJ?.isAdmin) return setErr('Nur Admin. (ADMIN_EMAILS)');

    try {
      const dataRes = await fetch(`/api/data/${ds}?limit=60`, { cache: 'no-store' });
      const dataJ = await dataRes.json().catch(() => ({}));
      if (!dataRes.ok) throw new Error(dataJ?.error || 'Daten laden fehlgeschlagen');

      setRows(dataJ.rows || []);
      setImp(dataJ.import || null);

      const scRes = await fetch(`/api/admin/schema?dataset=${encodeURIComponent(ds)}`, { cache: 'no-store' });
      const scJ = await scRes.json().catch(() => ({}));
      if (!scRes.ok) throw new Error(scJ?.error || 'Schema laden fehlgeschlagen');
      setSchema(scJ.schema || null);

      // Build defaults for UI
      const cols = collectColumns(dataJ.rows || []);
      const baseDisplay = Array.isArray(scJ.schema?.display_columns)
        ? scJ.schema.display_columns
        : (Array.isArray(dataJ.import?.display_columns) ? dataJ.import.display_columns : cols.slice(0, 10));

      const disp = {};
      for (const c of cols) disp[c] = baseDisplay.includes(c);
      // keep schema columns even if currently not in sample
      for (const c of baseDisplay) if (!(c in disp)) disp[c] = true;

      const types = { ...(dataJ.import?.column_types || {}), ...(scJ.schema?.column_types || {}) };
      // guess missing types
      const allCols = Array.from(new Set([...cols, ...Object.keys(types || {}), ...baseDisplay]));
      for (const c of allCols) {
        if (!types[c]) types[c] = guessTypeFromRows(dataJ.rows || [], c);
      }

      setDisplayCols(disp);
      setColTypes(types);
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }

  useEffect(() => {
    loadAll(dataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset]);

  const dsTitle = useMemo(() => DATASETS.find((d) => d.key === dataset)?.title || dataset, [dataset]);

  const columns = useMemo(() => {
    const cols = collectColumns(rows);
    const set = new Set([
      ...cols,
      ...Object.keys(displayCols || {}),
      ...Object.keys(colTypes || {}),
      ...(Array.isArray(schema?.display_columns) ? schema.display_columns : [])
    ]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [rows, displayCols, colTypes, schema]);

  const selectedDisplay = useMemo(() => {
    return columns.filter((c) => displayCols?.[c]);
  }, [columns, displayCols]);

  async function save() {
    setMsg('');
    setBusy(true);
    try {
      const payload = {
        dataset,
        display_columns: selectedDisplay,
        import_columns: Array.isArray(imp?.selected_columns) ? imp.selected_columns : null,
        column_types: colTypes || {}
      };

      const res = await fetch('/api/admin/schema', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Speichern fehlgeschlagen');
      setMsg('OK: Schema gespeichert.');
      await loadAll(dataset);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function setAllDisplay(v) {
    const next = { ...displayCols };
    columns.forEach((c) => (next[c] = v));
    setDisplayCols(next);
  }

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin · Dataset Einstellungen</div>
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
        <div className="h1">Admin · Dataset Einstellungen</div>
        <div className="sub">Anzeigespalten + Typen (Formatierung) inkl. Vorschau.</div>
      </div>

      {msg ? (
        <div className={msg.startsWith('OK') ? 'card' : 'error'}>{msg}</div>
      ) : null}

      <div className="card">
        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 240 }}>
            <div className="label">Dataset</div>
            <select className="input" value={dataset} onChange={(e) => setDataset(e.target.value)}>
              {DATASETS.map((d) => (
                <option key={d.key} value={d.key}>{d.title}</option>
              ))}
            </select>
          </div>
          <div className="muted" style={{ fontSize: 12, marginLeft: 6 }}>
            Letzter Import: {imp?.filename ? <strong>{imp.filename}</strong> : <span>—</span>}
          </div>
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
          <button className="secondary" type="button" onClick={() => setAllDisplay(true)} disabled={busy}>Anzeige: Alle</button>
          <button className="secondary" type="button" onClick={() => setAllDisplay(false)} disabled={busy}>Anzeige: Keine</button>
          <button className="primary" onClick={save} disabled={busy}>Speichern</button>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Spalten</div>
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Spalte</th>
              <th style={{ width: 140 }}>Anzeige</th>
              <th style={{ width: 220 }}>Typ</th>
              <th>Beispiel (formatiert)</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((c) => {
              const ex = rows?.[0]?.row_data?.[c];
              return (
                <tr key={c}>
                  <td><div style={{ fontWeight: 700 }}>{c}</div></td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!displayCols?.[c]}
                        onChange={(e) => setDisplayCols({ ...displayCols, [c]: e.target.checked })}
                      />
                      <span className="muted" style={{ fontSize: 12 }}>{displayCols?.[c] ? 'ja' : 'nein'}</span>
                    </label>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      value={normType(colTypes?.[c] || 'text')}
                      onChange={(e) => setColTypes({ ...colTypes, [c]: e.target.value })}
                    >
                      <option value="text">text</option>
                      <option value="number">zahl</option>
                      <option value="date">datum</option>
                      <option value="date_excel">datum (Excel-Zahl)</option>
                      <option value="boolean">ja/nein</option>
                      <option value="leer">leer</option>
                    </select>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>{formatCell(ex, colTypes?.[c])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Vorschau</div>
        {!rows?.length ? (
          <div className="muted">Noch keine Daten – importiere zuerst über Admin → Datenimport.</div>
        ) : (
          <>
            <table className="table" style={{ minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={{ width: 60 }}>#</th>
                  {selectedDisplay.slice(0, 12).map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r) => (
                  <tr key={r.row_index}>
                    <td className="muted">{r.row_index + 1}</td>
                    {selectedDisplay.slice(0, 12).map((c) => (
                      <td key={c}>{formatCell((r.row_data || {})[c], colTypes?.[c])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Vorschau zeigt max. 12 Spalten und 10 Zeilen.
            </div>
          </>
        )}
      </div>

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        <a className="secondary" href={`/${dataset === 'dealers' ? 'database' : dataset}`} style={{ textDecoration: 'none' }}>Zur Seite</a>
        <button className="secondary" onClick={() => loadAll(dataset)} disabled={busy}>Neu laden</button>
      </div>
    </div>
  );
}
