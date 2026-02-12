'use client';

import { useMemo, useState } from 'react';
import { getSheetPreview, parseDealerRowsFromSheet } from '../lib/parseClient';

const COUNTRY_OPTIONS = [
  { value: 'DE', label: 'Deutschland (DE)' },
  { value: 'AT', label: 'Österreich (AT)' },
  { value: 'CH', label: 'Schweiz (CH)' },
];

function MappingSelect({ label, columns, value, onChange }) {
  return (
    <div>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        <option value={-1}>— nicht vorhanden —</option>
        {columns.map((c) => (
          <option key={c.idx} value={c.idx}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function Page() {
  const [country, setCountry] = useState('DE');
  const [file, setFile] = useState(null);

  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({ customer_number: 0, name: 1, street: 2, postal_code: 3, city: 4 });

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const canUpload = !!preview && !busy;

  async function loadPreview(f) {
    setMsg(null);
    setPreview(null);
    setBusy(true);
    try {
      const p = await getSheetPreview(f);
      setPreview(p);
      setMapping(p.suggestedMapping);
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleFileChange(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    if (f) await loadPreview(f);
  }

  const sampleTable = useMemo(() => {
    if (!preview) return null;
    const cols = preview.columns;
    const rows = preview.sampleRows;

    return (
      <table className="table">
        <thead>
          <tr>
            {cols.slice(0, 8).map((c) => (
              <th key={c.idx}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.slice(0, 8).map((c) => (
                <td key={c.idx}>{r?.[c.idx] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }, [preview]);

  async function upload() {
    if (!preview) return;
    setBusy(true);
    setMsg(null);
    try {
      const dealers = parseDealerRowsFromSheet({
        rows: preview.rows,
        hasHeader: preview.hasHeader,
        mapping,
        countryCode: country,
      });

      const cleaned = dealers
        .filter((d) => d.customer_number)
        .map((d) => ({
          ...d,
          postal_code: String(d.postal_code || '').trim(),
          customer_number: String(d.customer_number || '').trim(),
        }));

      const res = await fetch('/api/dealers/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealers: cleaned }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Upload fehlgeschlagen');

      setMsg({ type: 'success', text: `OK: ${json.upserted} Datensätze upserted.` });
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Händler importieren</h1>

      <div className="row">
        <div>
          <label>Land</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Datei (XLSX oder CSV)</label>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} />
        </div>
      </div>

      {msg?.text && (
        <p className={msg.type === 'error' ? 'error' : 'success'} style={{ marginTop: 12 }}>
          {msg.text}
        </p>
      )}

      {preview && (
        <>
          <div className="hr" />

          <div className="kpi">
            <span className="badge">Header erkannt: <b>{String(preview.hasHeader)}</b></span>
            <span className="badge">Zeilen gesamt: <b>{preview.rows.length}</b></span>
            <span className="badge">Spalten: <b>{preview.columns.length}</b></span>
          </div>

          <h2>Spalten zuordnen</h2>
          <div className="row3">
            <MappingSelect label="Kundennummer" columns={preview.columns} value={mapping.customer_number} onChange={(v) => setMapping((m) => ({ ...m, customer_number: v }))} />
            <MappingSelect label="Kunde / Name" columns={preview.columns} value={mapping.name} onChange={(v) => setMapping((m) => ({ ...m, name: v }))} />
            <MappingSelect label="Straße (mit Hausnummer)" columns={preview.columns} value={mapping.street} onChange={(v) => setMapping((m) => ({ ...m, street: v }))} />
            <MappingSelect label="PLZ" columns={preview.columns} value={mapping.postal_code} onChange={(v) => setMapping((m) => ({ ...m, postal_code: v }))} />
            <MappingSelect label="Ort" columns={preview.columns} value={mapping.city} onChange={(v) => setMapping((m) => ({ ...m, city: v }))} />
          </div>

          <h2>Vorschau</h2>
          <div className="muted">Es werden die ersten Zeilen angezeigt (max. 8).</div>
          {sampleTable}

          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="primary" disabled={!canUpload} onClick={upload}>
              {busy ? 'Lade…' : 'In Supabase speichern'}
            </button>
            <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
              Datenbank ansehen →
            </a>
          </div>
        </>
      )}
    </main>
  );
}
