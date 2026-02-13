'use client';

import { useEffect, useMemo, useState } from 'react';
import { toAoaFromFile } from '../../lib/fileToAoa';

function normalizeHeader(h, idx) {
  const s = String(h ?? '').trim();
  return s ? s : `Spalte ${idx + 1}`;
}

export default function BacklogPage() {
  const [file, setFile] = useState(null);
  const [aoa, setAoa] = useState([]);
  const [hasHeader, setHasHeader] = useState(true);

  const [customerCol, setCustomerCol] = useState(0);
  const [displayCols, setDisplayCols] = useState(new Set());

  const [status, setStatus] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [current, setCurrent] = useState(null); // current import status

  const headers = useMemo(() => {
    const first = aoa?.[0] || [];
    if (!first.length) return [];
    return first.map((h, i) => ({ i, label: normalizeHeader(h, i) }));
  }, [aoa]);

  const previewRows = useMemo(() => {
    if (!aoa?.length) return [];
    const start = hasHeader ? 1 : 0;
    return aoa.slice(start, start + 8);
  }, [aoa, hasHeader]);

  async function loadStatus() {
    try {
      const res = await fetch('/api/backlog/status');
      const data = await res.json();
      if (res.ok) setCurrent(data);
    } catch {}
  }

  useEffect(() => { loadStatus(); }, []);

  async function onPickFile(f) {
    setFile(f);
    setAoa([]);
    setToast('');
    setError('');
    setStatus('');

    if (!f) return;

    setStatus('Lese Datei…');
    try {
      const rows = await toAoaFromFile(f);
      const cleaned = (rows || []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
      setAoa(cleaned);
      setStatus(`Geladen: ${cleaned.length} Zeilen`);
      setCustomerCol(0);

      // default display columns = first 6 cols
      const def = new Set();
      for (let i = 0; i < Math.min(6, (cleaned?.[0] || []).length); i++) def.add(i);
      setDisplayCols(def);
    } catch (e) {
      setError(e?.message || String(e));
      setStatus('');
    }
  }

  function toggleDisplay(idx) {
    setDisplayCols((s) => {
      const n = new Set(s);
      if (n.has(idx)) n.delete(idx);
      else n.add(idx);
      return n;
    });
  }

  async function importBacklog() {
    setToast('');
    setError('');

    if (!aoa.length) return setError('Bitte zuerst eine Datei auswählen.');
    if (!headers.length) return setError('Konnte keine Spalten erkennen.');

    const start = hasHeader ? 1 : 0;
    const dataRows = aoa.slice(start);

    if (!dataRows.length) return setError('Keine Datenzeilen gefunden.');
    if (customerCol == null || customerCol < 0) return setError('Bitte Kundennummer-Spalte auswählen.');

    const columns = headers.map((h) => h.label);
    const displayColumnLabels = Array.from(displayCols).sort((a, b) => a - b).map((i) => columns[i]);

    setBusy(true);
    try {
      // START: clear previous + create new import
      const startRes = await fetch('/api/backlog/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phase: 'start',
          filename: file?.name || null,
          has_header: hasHeader,
          columns,
          customer_col_index: customerCol
        })
      });
      const startData = await startRes.json();
      if (!startRes.ok) throw new Error(startData?.error || 'Start fehlgeschlagen');
      const importId = startData.import_id;

      // CHUNKS
      const CHUNK = 400;
      for (let i = 0; i < dataRows.length; i += CHUNK) {
        const chunk = dataRows.slice(i, i + CHUNK);
        const res = await fetch('/api/backlog/import', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            phase: 'chunk',
            import_id: importId,
            row_start_index: start + i,
            rows: chunk,
            customer_col_index: customerCol
          })
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d?.error || 'Chunk fehlgeschlagen');
      }

      // FINISH: store display columns
      const finRes = await fetch('/api/backlog/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          phase: 'finish',
          import_id: importId,
          display_columns: displayColumnLabels
        })
      });
      const fin = await finRes.json();
      if (!finRes.ok) throw new Error(fin?.error || 'Finish fehlgeschlagen');

      setToast(`Auftragsrückstand importiert: ${fin.rows_inserted} Zeilen`);
      await loadStatus();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <div>
          <h1 className="h1">Auftragsrückstand</h1>
          <p className="sub">Excel/CSV hochladen → Kundennummer-Spalte wählen → Spalten auswählen, die angezeigt werden sollen.</p>
        </div>
        <div className="row">
          <a className="secondary" href="/" style={{ textDecoration:'none', padding:'10px 12px', borderRadius:12, display:'inline-block' }}>Import</a>
          <a className="secondary" href="/database" style={{ textDecoration:'none', padding:'10px 12px', borderRadius:12, display:'inline-block' }}>Datenbank</a>
          <a className="secondary" href="/inventory" style={{ textDecoration:'none', padding:'10px 12px', borderRadius:12, display:'inline-block' }}>Lagerbestand</a>
          <a className="secondary" href="/users" style={{ textDecoration:'none', padding:'10px 12px', borderRadius:12, display:'inline-block' }}>Benutzer</a>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop:0 }}>Upload</h2>

          <div className="row" style={{ alignItems:'end' }}>
            <div style={{ flex:1, minWidth:260 }}>
              <label>Datei (XLSX/CSV)</label><br/>
              <input type="file" accept=".xlsx,.xls,.csv,.txt" onChange={(e)=>onPickFile(e.target.files?.[0]||null)} disabled={busy} style={{ width:'100%' }}/>
            </div>
            <label className="small" style={{ display:'flex', gap:8, alignItems:'center' }}>
              <input type="checkbox" checked={hasHeader} onChange={(e)=>setHasHeader(e.target.checked)} disabled={busy}/>
              erste Zeile ist Header
            </label>
          </div>

          {status ? <div className="small" style={{ marginTop:10 }}>{status}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {toast ? <div className="toast">{toast}</div> : null}

          <hr className="sep" />

          <h2 style={{ marginTop:0 }}>Spalten wählen</h2>

          <div className="row" style={{ marginTop:10, alignItems:'end' }}>
            <div>
              <label>Kundennummer-Spalte</label><br/>
              <select value={customerCol} onChange={(e)=>setCustomerCol(Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h)=> <option key={h.i} value={h.i}>{h.label}</option>)}
              </select>
            </div>
          </div>

          <div className="small" style={{ marginTop:10 }}>Spalten, die in der Kundenübersicht angezeigt werden sollen:</div>
          <div className="row" style={{ marginTop:8, gap:14 }}>
            {headers.map((h)=>(
              <label key={h.i} className="small" style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input type="checkbox" checked={displayCols.has(h.i)} onChange={()=>toggleDisplay(h.i)} disabled={busy}/>
                {h.label}
              </label>
            ))}
          </div>

          <div className="row" style={{ marginTop:14 }}>
            <button onClick={importBacklog} disabled={busy || !aoa.length}> {busy ? 'Importiere…' : 'Auftragsrückstand importieren'} </button>
          </div>

          <hr className="sep" />

          <h2 style={{ marginTop:0 }}>Aktueller Stand</h2>
          {current?.ok ? (
            <div className="small">
              Datei: <span className="mono">{current.filename || '—'}</span> ·
              Zeilen: <span className="mono">{current.row_count ?? 0}</span> ·
              Spalten: <span className="mono">{(current.columns || []).length}</span>
            </div>
          ) : (
            <div className="small">Noch kein Auftragsrückstand importiert.</div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop:0 }}>Vorschau</h2>
          <div className="small" style={{ marginBottom:10 }}>
            {aoa.length ? `Zeilen: ${aoa.length} · Vorschau: ${previewRows.length}` : 'Noch keine Datei geladen.'}
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {(aoa?.[0] || []).slice(0, 12).map((h, i) => <th key={i}>{String(h || `Spalte ${i+1}`)}</th>)}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => (
                  <tr key={idx}>
                    {(r || []).slice(0, 12).map((c, i) => <td key={i}>{String(c ?? '')}</td>)}
                  </tr>
                ))}
                {!previewRows.length ? <tr><td className="small" style={{ padding:12 }} colSpan={12}>Keine Vorschau verfügbar.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
