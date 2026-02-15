'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { inferTypeFromSamples, formatCell } from '@/lib/typeDetect';

const DATASETS = [
  { key: 'dealers', title: 'Händler', hint: 'Import in die Händler-Datenbasis' },
  { key: 'backlog', title: 'Rückstand', hint: 'Import für Auftragsrückstand' },
  { key: 'inventory', title: 'Lager', hint: 'Import für Lagerbestand' }
];

function detectDelimiter(firstLine) {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi >= comma ? ';' : ',';
}

function parseCsv(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter((l) => l.trim().length);
  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);

  const rows = [];
  for (const line of lines) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && ch === delimiter) {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    rows.push(out.map((v) => String(v ?? '').trim()));
  }

  const header = rows.shift().map((h, idx) => (h || `col_${idx + 1}`).trim());
  const objects = rows.map((r) => {
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = r[i] ?? '';
    return obj;
  });

  return objects;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]+/gi, ' ');
}

function buildRecommendations(dataset, colName) {
  const c = norm(colName);

  const baseImportant = [
    'id', 'nr', 'nummer', 'kunde', 'kundennummer', 'name', 'firma', 'shop', 'händler',
    'street', 'straße', 'strasse', 'plz', 'zip', 'post', 'city', 'ort', 'country',
    'telefon', 'phone', 'email', 'website', 'url'
  ];

  const dsHints = {
    dealers: ['name', 'firma', 'händler', 'straße', 'plz', 'ort', 'telefon', 'website', 'email'],
    backlog: ['auftrag', 'order', 'modell', 'model', 'menge', 'qty', 'datum', 'kunde', 'status'],
    inventory: ['sku', 'artikel', 'item', 'modell', 'model', 'bestand', 'stock', 'avail', 'menge', 'qty']
  };

  const hit = (arr) => arr.some((k) => c.includes(norm(k)));

  const recommendImport = hit(dsHints[dataset] || []) || hit(baseImportant);
  // Display: usually a bit less (keep it readable)
  const recommendDisplay = hit(dsHints[dataset] || []) || ['name', 'firma', 'modell', 'model', 'auftrag', 'order', 'bestand', 'stock', 'plz', 'ort'].some((k) => c.includes(norm(k)));

  return { recommendImport, recommendDisplay };
}

function pct(n, d) {
  if (!d) return '0%';
  return `${Math.round((n / d) * 100)}%`;
}

export default function AdminImportPage() {
  const [err, setErr] = useState('');
  const [adminKey, setAdminKey] = useState('');
  const [dataset, setDataset] = useState('dealers');
  const [file, setFile] = useState(null);

  const [step, setStep] = useState('select'); // select | choose | uploading
  const [analysis, setAnalysis] = useState(null);

  const [importCols, setImportCols] = useState({});
  const [displayCols, setDisplayCols] = useState({});
  const [colTypes, setColTypes] = useState({});
  const [saveSchema, setSaveSchema] = useState(true);

  const rowsRef = useRef([]);

  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [progress, setProgress] = useState({ phase: '', done: 0, total: 0 });

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
      setMsg('OK: Import-Tabellen + Admin-Log sind bereit.');
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function rollbackLastImport() {
    setMsg('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/import/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dataset })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Rollback fehlgeschlagen');
      setMsg(`OK: Letzter Import gelöscht (${j.import_id}).`);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearDataset() {
    const ok = window.confirm(`Wirklich ALLE Imports für „${ds.title}“ löschen? (irreversibel)`);
    if (!ok) return;

    setMsg('');
    setBusy(true);
    try {
      const res = await fetch('/api/admin/import/clear', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-actions-key': adminKey || '' },
        body: JSON.stringify({ dataset })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Löschen fehlgeschlagen');
      setMsg(`OK: Alle Daten für ${ds.title} gelöscht.`);
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function analyzeFile() {
    setMsg('');
    setBusy(true);
    setProgress({ phase: 'Analysiere Datei…', done: 0, total: 1 });

    try {
      if (!file) throw new Error('Bitte Datei auswählen (CSV oder XLSX).');

      const name = String(file.name || '').toLowerCase();
      let rows = [];

      if (name.endsWith('.xlsx')) {
        const ab = await file.arrayBuffer();
        // cellDates helps Excel date cells become real Date objects.
        const wb = XLSX.read(ab, { type: 'array', cellDates: true });
        const sheetName = wb.SheetNames?.[0];
        if (!sheetName) throw new Error('XLSX ohne Tabellenblatt.');
        const sheet = wb.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      } else {
        const text = await file.text();
        rows = parseCsv(text);
      }

      if (!rows.length) throw new Error('Keine Zeilen gefunden (prüfe Header/Format).');

      rowsRef.current = rows;

      // Columns
      const keys = new Set();
      for (const r of rows.slice(0, 200)) Object.keys(r || {}).forEach((k) => keys.add(k));
      const cols = Array.from(keys);

      const colStats = cols.map((c) => {
        const sample = [];
        let nonEmpty = 0;
        for (const r of rows.slice(0, 200)) {
          const v = (r || {})[c];
          const vv = v == null ? '' : String(v);
          if (vv.trim() !== '') {
            nonEmpty++;
            if (sample.length < 3) sample.push(v);
          }
        }
        const type2 = inferTypeFromSamples(sample, c);
        const rec = buildRecommendations(dataset, c);
        return {
          name: c,
          type: type2,
          nonEmpty,
          inspected: Math.min(200, rows.length),
          sample,
          ...rec
        };
      });

      // Defaults: recommended, but always show at least 6 columns if possible
      const imp = {};
      const disp = {};
      const types = {};
      colStats.forEach((c) => {
        imp[c.name] = !!c.recommendImport;
        disp[c.name] = !!c.recommendDisplay;
        types[c.name] = c.type;
      });

      // ensure display implies import
      Object.keys(disp).forEach((k) => {
        if (disp[k]) imp[k] = true;
      });

      // if nothing selected, select all
      const anyImport = Object.values(imp).some(Boolean);
      if (!anyImport) colStats.forEach((c) => (imp[c.name] = true));

      setImportCols(imp);
      setDisplayCols(disp);
      setColTypes(types);
      setAnalysis({ rowCount: rows.length, columns: colStats });
      setStep('choose');
      setProgress({ phase: '', done: 0, total: 0 });
    } catch (e) {
      setMsg(e?.message || String(e));
      setProgress({ phase: '', done: 0, total: 0 });
    } finally {
      setBusy(false);
    }
  }

  function setAll(which, value) {
    if (!analysis?.columns?.length) return;
    if (which === 'import') {
      const next = { ...importCols };
      analysis.columns.forEach((c) => (next[c.name] = value));
      setImportCols(next);
      if (!value) {
        const d = { ...displayCols };
        analysis.columns.forEach((c) => (d[c.name] = false));
        setDisplayCols(d);
      }
    }
    if (which === 'display') {
      const next = { ...displayCols };
      analysis.columns.forEach((c) => (next[c.name] = value));
      // display implies import
      const imp = { ...importCols };
      if (value) analysis.columns.forEach((c) => (imp[c.name] = true));
      setDisplayCols(next);
      if (value) setImportCols(imp);
    }
  }

  function setRecommended(which) {
    if (!analysis?.columns?.length) return;
    if (which === 'import') {
      const next = { ...importCols };
      analysis.columns.forEach((c) => (next[c.name] = !!c.recommendImport));
      // keep display subset valid
      const disp = { ...displayCols };
      Object.keys(disp).forEach((k) => {
        if (disp[k] && !next[k]) disp[k] = false;
      });
      setImportCols(next);
      setDisplayCols(disp);
    }
    if (which === 'display') {
      const next = { ...displayCols };
      const imp = { ...importCols };
      analysis.columns.forEach((c) => {
        next[c.name] = !!c.recommendDisplay;
        if (next[c.name]) imp[c.name] = true;
      });
      setDisplayCols(next);
      setImportCols(imp);
    }
  }

  async function startImport() {
    setMsg('');
    setBusy(true);

    try {
      const rows = rowsRef.current || [];
      if (!rows.length) throw new Error('Keine Daten im Speicher (bitte erneut analysieren).');

      const selectedImport = Object.keys(importCols).filter((k) => importCols[k]);
      const selectedDisplay = Object.keys(displayCols).filter((k) => displayCols[k]);

      const selectedTypes = {};
      for (const c of selectedImport) selectedTypes[c] = colTypes?.[c] || 'text';

      if (!selectedImport.length) throw new Error('Bitte mindestens 1 Spalte zum Import auswählen.');
      if (selectedDisplay.some((k) => !importCols[k])) throw new Error('Anzeigespalten müssen auch importiert werden.');

      // filter rows
      const filteredRows = rows.map((r) => {
        const obj = {};
        for (const c of selectedImport) obj[c] = (r || {})[c] ?? '';
        return obj;
      });

      // init
      setProgress({ phase: 'Initialisiere Import…', done: 0, total: 1 });
      const initRes = await fetch('/api/admin/import/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          dataset,
          filename: file?.name || null,
          mimetype: file?.type || null,
          row_count: filteredRows.length,
          selected_columns: selectedImport,
          display_columns: selectedDisplay,
          column_types: selectedTypes,
          save_schema: !!saveSchema,
          schema_guess: {
            analyzed_columns: analysis?.columns?.length || 0,
            inspected_rows: Math.min(200, filteredRows.length)
          }
        })
      });
      const initJ = await initRes.json().catch(() => ({}));
      if (!initRes.ok) throw new Error(initJ?.error || 'Init fehlgeschlagen');
      const importId = initJ.import_id;
      if (!importId) throw new Error('Keine Import-ID erhalten');

      // upload chunks
      setStep('uploading');
      const batch = 500;
      const total = filteredRows.length;
      let done = 0;
      for (let i = 0; i < filteredRows.length; i += batch) {
        const chunk = filteredRows.slice(i, i + batch);
        setProgress({ phase: 'Importiere…', done, total });

        const res = await fetch('/api/admin/import/chunk', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            import_id: importId,
            dataset,
            start_index: i,
            rows: chunk
          })
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Chunk import fehlgeschlagen');

        done += chunk.length;
        setProgress({ phase: 'Importiere…', done, total });
      }

      // finalize
      setProgress({ phase: 'Finalisiere…', done: total, total });
      const finRes = await fetch('/api/admin/import/finalize', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ import_id: importId })
      });
      const finJ = await finRes.json().catch(() => ({}));
      if (!finRes.ok) throw new Error(finJ?.error || 'Finalize fehlgeschlagen');

      setMsg(`OK: ${total} Zeilen importiert (Import-ID: ${importId}).`);
      setProgress({ phase: '', done: 0, total: 0 });
      setStep('choose');
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  const progressPct = useMemo(() => {
    if (!progress.total) return 0;
    return Math.min(100, Math.round((progress.done / progress.total) * 100));
  }, [progress]);

  // formatCell comes from lib/typeDetect

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
        <div className="sub">Datei analysieren → Spalten auswählen → Import mit Fortschritt.</div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Setup / Admin-Tools</div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          Nur für Setup und „Alles löschen“ nötig, falls <code>ADMIN_ACTIONS_KEY</code> in Vercel gesetzt ist.
        </div>
        <input className="input" value={adminKey} onChange={(e) => setAdminKey(e.target.value)} placeholder="(optional, falls env gesetzt)" />
        <div className="row" style={{ marginTop: 10, flexWrap: 'wrap' }}>
          <button className="secondary" onClick={setupTables} disabled={busy}>Setup: Import-Tabellen + Admin-Log</button>
          <button className="secondary" onClick={rollbackLastImport} disabled={busy}>Letzten Import löschen</button>
          <button className="secondary" onClick={clearDataset} disabled={busy}>Alle Imports dieses Datasets löschen</button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontWeight: 800, marginBottom: 10 }}>1) Datei auswählen</div>

        <div className="row" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 220 }}>
            <div className="label">Ziel</div>
            <select className="input" value={dataset} onChange={(e) => {
              setDataset(e.target.value);
              setStep('select');
              setAnalysis(null);
              setImportCols({});
              setDisplayCols({});
              setColTypes({});
              setSaveSchema(true);
            }}>
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
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setStep('select');
                setAnalysis(null);
                setImportCols({});
                setDisplayCols({});
                setColTypes({});
                setSaveSchema(true);
              }}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              CSV: <code>;</code> oder <code>,</code> (automatisch erkannt). XLSX: erstes Tabellenblatt.
            </div>
          </div>

          <button className="primary" onClick={analyzeFile} disabled={busy || !file}>Analysieren</button>
        </div>

        {progress.phase ? (
          <div style={{ marginTop: 12 }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{progress.phase}</div>
            <div style={{ height: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ width: `${progressPct}%`, height: '100%', background: 'rgba(0,0,0,0.35)' }} />
            </div>
          </div>
        ) : null}
      </div>

      {analysis ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>2) Spalten auswählen</div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
            Datei: <strong>{file?.name}</strong> · {analysis.rowCount} Zeilen · Vorschläge sind automatisch gesetzt.
          </div>

          <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            <button className="secondary" type="button" onClick={() => setRecommended('import')}>Import: Empfohlen</button>
            <button className="secondary" type="button" onClick={() => setAll('import', true)}>Import: Alle</button>
            <button className="secondary" type="button" onClick={() => setAll('import', false)}>Import: Keine</button>
            <span className="muted" style={{ marginLeft: 8 }}>·</span>
            <button className="secondary" type="button" onClick={() => setRecommended('display')}>Anzeige: Empfohlen</button>
            <button className="secondary" type="button" onClick={() => setAll('display', true)}>Anzeige: Alle</button>
            <button className="secondary" type="button" onClick={() => setAll('display', false)}>Anzeige: Keine</button>
          </div>

          <table className="table" style={{ minWidth: 980 }}>
            <thead>
              <tr>
                <th>Spalte</th>
                <th style={{ width: 90 }}>Typ</th>
                <th style={{ width: 100 }}>Gefüllt</th>
                <th>Beispiel</th>
                <th style={{ width: 120 }}>Import</th>
                <th style={{ width: 120 }}>Anzeige</th>
              </tr>
            </thead>
            <tbody>
              {analysis.columns.map((c) => (
                <tr key={c.name}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{c.recommendImport ? 'empfohlen' : ''}</div>
                  </td>
                  <td>
                    <select
                      className="input"
                      style={{ padding: '6px 10px', fontSize: 12 }}
                      value={colTypes?.[c.name] || c.type}
                      onChange={(e) => setColTypes({ ...colTypes, [c.name]: e.target.value })}
                    >
                      <option value="text">text</option>
                      <option value="number">zahl</option>
                      <option value="date">datum</option>
                      <option value="datetime">datum+uhrzeit</option>
                      <option value="time">uhrzeit</option>
                      <option value="date_excel">datum (Excel-Zahl)</option>
                      <option value="boolean">ja/nein</option>
                      <option value="leer">leer</option>
                    </select>
                  </td>
                  <td className="muted">{pct(c.nonEmpty, c.inspected)}</td>
                  <td className="muted" style={{ fontSize: 12 }}>{c.sample.join(' · ')}</td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!importCols[c.name]}
                        onChange={(e) => {
                          const v = e.target.checked;
                          const next = { ...importCols, [c.name]: v };
                          setImportCols(next);
                          if (!v && displayCols[c.name]) {
                            setDisplayCols({ ...displayCols, [c.name]: false });
                          }
                        }}
                      />
                      <span className="muted" style={{ fontSize: 12 }}>{importCols[c.name] ? 'ja' : 'nein'}</span>
                    </label>
                  </td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                      <input
                        type="checkbox"
                        checked={!!displayCols[c.name]}
                        onChange={(e) => {
                          const v = e.target.checked;
                          const next = { ...displayCols, [c.name]: v };
                          const imp = { ...importCols };
                          if (v) imp[c.name] = true;
                          setDisplayCols(next);
                          setImportCols(imp);
                        }}
                      />
                      <span className="muted" style={{ fontSize: 12 }}>{displayCols[c.name] ? 'ja' : 'nein'}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <label className="muted" style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={!!saveSchema} onChange={(e) => setSaveSchema(e.target.checked)} />
              <span style={{ fontSize: 12 }}>Als Standard-Schema speichern (Anzeige + Typen)</span>
            </label>
            <button className="primary" onClick={startImport} disabled={busy || step === 'uploading'}>Import starten</button>
            <button className="secondary" type="button" onClick={() => { setStep('select'); setAnalysis(null); }} disabled={busy}>Neue Datei</button>
          </div>

          {analysis?.rowCount ? (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 800, marginBottom: 8 }}>Vorschau (erste Zeilen)</div>
              <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                Anzeige basiert auf deinen gewählten Anzeigespalten + Typen.
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="table" style={{ minWidth: 600 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 60 }}>#</th>
                      {Object.keys(displayCols).filter((k) => displayCols[k]).slice(0, 12).map((cname) => (
                        <th key={cname}>{cname}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(rowsRef.current || []).slice(0, 8).map((r, idx) => (
                      <tr key={idx}>
                        <td className="muted">{idx + 1}</td>
                        {Object.keys(displayCols).filter((k) => displayCols[k]).slice(0, 12).map((cname) => (
                          <td key={cname}>{formatCell((r || {})[cname], colTypes?.[cname])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                  Hinweis: Vorschau zeigt max. 12 Spalten und 8 Zeilen (für Performance).
                </div>
              </div>
            </div>
          ) : null}

          {step === 'uploading' && progress.total ? (
            <div style={{ marginTop: 12 }}>
              <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Fortschritt: {progress.done}/{progress.total} ({progressPct}%)</div>
              <div style={{ height: 10, background: 'rgba(0,0,0,0.08)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${progressPct}%`, height: '100%', background: 'rgba(0,0,0,0.35)' }} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {msg ? (
        <div className={msg.startsWith('OK') ? 'card' : 'error'}>{msg}</div>
      ) : null}

      <div className="row" style={{ flexWrap: 'wrap' }}>
        <a className="secondary" href="/admin" style={{ textDecoration: 'none' }}>Zurück</a>
        <a className="secondary" href="/database" style={{ textDecoration: 'none' }}>Zu Händler</a>
        <a className="secondary" href="/backlog" style={{ textDecoration: 'none' }}>Zu Rückstand</a>
        <a className="secondary" href="/inventory" style={{ textDecoration: 'none' }}>Zu Lager</a>
        <a className="secondary" href="/admin/log" style={{ textDecoration: 'none' }}>Zum Admin-Log</a>
      </div>
    </div>
  );
}
