'use client';

import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { digitsOnly, splitCustomerNumberAndName, splitStreetAndHouseNumber } from '../lib/parseUtils';

const COUNTRIES = ['DE', 'AT', 'CH'];

function guessDelimiter(text) {
  if (text.includes(';') && !text.includes(',')) return ';';
  return ',';
}

function toAoaFromFile(file) {
  return new Promise((resolve, reject) => {
    const name = (file?.name || '').toLowerCase();
    const reader = new FileReader();

    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
    reader.onload = () => {
      try {
        if (name.endsWith('.csv') || name.endsWith('.txt')) {
          const text = String(reader.result || '');
          const delim = guessDelimiter(text);
          const rows = text
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => l.split(delim).map((c) => c.trim()));
          resolve(rows);
          return;
        }

        const data = new Uint8Array(reader.result);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });
        resolve(aoa);
      } catch (e) {
        reject(e);
      }
    };

    if (name.endsWith('.csv') || name.endsWith('.txt')) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}

export default function Home() {
  const [country, setCountry] = useState('DE');
  const [aoa, setAoa] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const [hasHeader, setHasHeader] = useState(true);

  const [map, setMap] = useState({
    customer_number: 0,
    name: 1,
    street: 2,
    house_number: -1,
    postal_code: 3,
    city: 4,
  });

  const headers = useMemo(() => {
    const first = aoa?.[0] || [];
    if (!first.length) return [];
    return first.map((h, i) => ({ i, label: String(h || `Spalte ${i + 1}`) }));
  }, [aoa]);

  const previewRows = useMemo(() => {
    if (!aoa?.length) return [];
    const start = hasHeader ? 1 : 0;
    return aoa.slice(start, start + 8);
  }, [aoa, hasHeader]);

  async function onPickFile(f) {
    setToast('');
    setError('');
    setStatus('Lese Datei…');

    if (!f) {
      setAoa([]);
      setStatus('');
      return;
    }

    try {
      const rows = await toAoaFromFile(f);
      const cleaned = (rows || []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
      setAoa(cleaned);
      setStatus(`Geladen: ${cleaned.length} Zeilen`);
    } catch (e) {
      setError(e?.message || String(e));
      setAoa([]);
      setStatus('');
    }
  }

  function colLabel(idx) {
    if (idx === -1) return '—';
    const h = headers.find((x) => x.i === idx)?.label;
    return h ? `${h}` : `Spalte ${idx + 1}`;
  }

  function setField(field, idx) {
    setMap((m) => ({ ...m, [field]: idx }));
  }

  async function upload() {
    setToast('');
    setError('');

    if (!aoa?.length) return setError('Bitte zuerst eine Datei auswählen.');
    if (!COUNTRIES.includes(country)) return setError('Bitte Land auswählen.');

    const required = ['customer_number', 'postal_code', 'city'];
    for (const k of required) {
      if (map[k] == null || map[k] === -1) return setError(`Bitte Spalte für "${k}" auswählen.`);
    }

    const start = hasHeader ? 1 : 0;
    const rows = [];

    for (let r = start; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const get = (idx) => (idx == null || idx === -1 ? '' : String(row[idx] ?? '').trim());

      let customer_number = get(map.customer_number);
      let name = map.name === -1 ? '' : get(map.name);

      if (customer_number && !name) {
        const split = splitCustomerNumberAndName(customer_number);
        if (split.customer_number && split.name) {
          customer_number = split.customer_number;
          name = split.name;
        }
      }

      const postal_code = digitsOnly(get(map.postal_code));
      const city = get(map.city);

      let street = map.street === -1 ? '' : get(map.street);
      let house_number = map.house_number === -1 ? '' : get(map.house_number);

      if (street && !house_number && map.house_number === -1) {
        const split = splitStreetAndHouseNumber(street);
        street = split.street;
        house_number = split.house_number;
      }

      if (!customer_number && !name && !postal_code && !city && !street) continue;

      rows.push({
        country_code: country,
        customer_number,
        name,
        street,
        house_number,
        postal_code,
        city,
      });
    }

    if (!rows.length) return setError('Keine Datenzeilen gefunden.');

    setBusy(true);
    try {
      const res = await fetch('/api/dealers/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Upload fehlgeschlagen');

      setToast(`Import OK: ${data.inserted} neu, ${data.updated} aktualisiert, ${data.skipped} übersprungen`);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">SalesApp – Händler Import</h1>
          <p className="sub">Datei hochladen, Spalten zuordnen, Händler in Supabase speichern.</p>
        </div>

        <div className="row">
          <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Datenbank ansehen →
          </a>
          <a className="secondary" href="/users" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Benutzer →
          </a>
          <a className="secondary" href="/backlog" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Auftragsrückstand →
          </a>
          <a className="secondary" href="/inventory" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Lagerbestand →
          </a>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1) Datei auswählen</h2>

          <div className="row" style={{ alignItems: 'end' }}>
            <div>
              <label>Land</label><br/>
              <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 260 }}>
              <label>Datei (XLSX/CSV)</label><br/>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.txt"
                onChange={(e) => onPickFile(e.target.files?.[0] || null)}
                disabled={busy}
                style={{ width: '100%' }}
              />
            </div>

            <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
              erste Zeile ist Header
            </label>
          </div>

          {status ? <div className="small" style={{ marginTop: 10 }}>{status}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {toast ? <div className="toast">{toast}</div> : null}

          <hr className="sep" />

          <h2 style={{ margin: 0 }}>2) Spalten zuordnen</h2>
          <div className="small" style={{ marginTop: 6 }}>Hausnummer kann leer bleiben (wird ggf. aus Straße getrennt).</div>

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Kundennummer</label><br/>
              <select value={map.customer_number} onChange={(e) => setField('customer_number', Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Kunde (Name)</label><br/>
              <select value={map.name} onChange={(e) => setField('name', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>— (aus Kundennummer splitten)</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Straße</label><br/>
              <select value={map.street} onChange={(e) => setField('street', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>—</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Hausnummer</label><br/>
              <select value={map.house_number} onChange={(e) => setField('house_number', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>— (aus Straße trennen)</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>PLZ</label><br/>
              <select value={map.postal_code} onChange={(e) => setField('postal_code', Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Ort</label><br/>
              <select value={map.city} onChange={(e) => setField('city', Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={upload} disabled={busy || !aoa.length}>
              {busy ? 'Importiere…' : 'In Datenbank importieren'}
            </button>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Vorschau</h2>
          <div className="small" style={{ marginBottom: 10 }}>
            {aoa.length ? `Zeilen: ${aoa.length} · Vorschau: ${previewRows.length}` : 'Noch keine Datei geladen.'}
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  {(aoa?.[0] || []).slice(0, 10).map((h, i) => (
                    <th key={i}>{String(h || `Spalte ${i + 1}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => (
                  <tr key={idx}>
                    {(r || []).slice(0, 10).map((c, i) => (
                      <td key={i}>{String(c ?? '')}</td>
                    ))}
                  </tr>
                ))}
                {!previewRows.length ? (
                  <tr><td className="small" style={{ padding: 12 }} colSpan={10}>Keine Vorschau verfügbar.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
