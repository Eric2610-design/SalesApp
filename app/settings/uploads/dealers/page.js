'use client';

import { useEffect, useMemo, useState } from 'react';
import { toAoaFromFile } from '../../../../lib/fileToAoa';
import { digitsOnly, splitCustomerNumberAndName, splitStreetAndHouseNumber } from '../../../../lib/parseUtils';

function normalizeCountry(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const u = s.toUpperCase();

  if (u === 'DE' || u === 'AT' || u === 'CH') return u;
  if (u === 'DEU' || u.includes('DEUTSCHLAND') || u.includes('GERMANY')) return 'DE';
  if (u === 'AUT' || u.includes('ÖSTERREICH') || u.includes('OESTERREICH') || u.includes('AUSTRIA')) return 'AT';
  if (u === 'CHE' || u.includes('SCHWEIZ') || u.includes('SWITZERLAND')) return 'CH';

  // Sometimes the column contains something like "DE - Deutschland"
  const m = u.match(/\b(DE|AT|CH)\b/);
  if (m) return m[1];

  return '';
}

function bestGuessMap(headers) {
  // headers: array of strings
  const find = (rxList) => {
    const idx = headers.findIndex((h) => rxList.some((rx) => rx.test(h)));
    return idx >= 0 ? idx : -1;
  };

  const h = headers.map((x) => String(x || '').toLowerCase());

  const guess = {
    country_code: find([/\bland\b/, /\bcountry\b/, /\blk\b/, /\bkürzel\b/, /\biso\b/].map(r=>new RegExp(r.source, 'i'))),
    customer_number: find([/kunden\s*nummer/, /kundennr/, /kdnr/, /customer\s*no/, /customer\s*number/, /konto\s*nr/, /account\s*no/].map(r=>new RegExp(r.source,'i'))),
    name: find([/kunde\b/, /kundenname/, /name\b/, /customer\b/].map(r=>new RegExp(r.source,'i'))),
    street: find([/straße/, /strasse/, /street/].map(r=>new RegExp(r.source,'i'))),
    house_number: find([/haus\s*nr/, /h\.?nr\.?/, /number\b/].map(r=>new RegExp(r.source,'i'))),
    postal_code: find([/plz/, /post\s*code/, /postal/].map(r=>new RegExp(r.source,'i'))),
    city: find([/ort\b/, /stadt/, /city/].map(r=>new RegExp(r.source,'i'))),
  };

  return guess;
}

export default function DealerUpload() {
  const [aoa, setAoa] = useState([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasHeader, setHasHeader] = useState(true);

  const headers = useMemo(() => {
    const first = aoa?.[0] || [];
    if (!first.length) return [];
    return first.map((h, i) => ({ i, label: String(h || `Spalte ${i + 1}`) }));
  }, [aoa]);

  const headerStrings = useMemo(() => (aoa?.[0] || []).map((x) => String(x || '')), [aoa]);

  const [map, setMap] = useState({
    country_code: -1,
    customer_number: 0,
    name: 1,
    street: 2,
    house_number: -1,
    postal_code: 3,
    city: 4,
  });

  // Auto-guess mapping once we have headers
  useEffect(() => {
    if (!headers.length || !hasHeader) return;
    const g = bestGuessMap(headerStrings);

    setMap((m) => ({
      ...m,
      country_code: g.country_code !== -1 ? g.country_code : m.country_code,
      customer_number: g.customer_number !== -1 ? g.customer_number : m.customer_number,
      name: g.name !== -1 ? g.name : m.name,
      street: g.street !== -1 ? g.street : m.street,
      house_number: g.house_number !== -1 ? g.house_number : m.house_number,
      postal_code: g.postal_code !== -1 ? g.postal_code : m.postal_code,
      city: g.city !== -1 ? g.city : m.city,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers.length, hasHeader]);

  const previewRows = useMemo(() => {
    if (!aoa?.length) return [];
    const start = hasHeader ? 1 : 0;
    return aoa.slice(start, start + 8);
  }, [aoa, hasHeader]);

  async function onPickFile(file) {
    setToast('');
    setError('');
    setStatus('Lese Datei…');
    setAoa([]);

    if (!file) {
      setStatus('');
      return;
    }

    try {
      const rows = await toAoaFromFile(file);
      const cleaned = (rows || []).filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));
      setAoa(cleaned);
      setStatus(`Geladen: ${cleaned.length} Zeilen`);
      setToast('Datei geladen. Bitte Spalten zuordnen und importieren.');
    } catch (e) {
      setError(e?.message || String(e));
      setStatus('');
      setAoa([]);
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

    const required = ['country_code', 'customer_number', 'postal_code', 'city'];
    for (const k of required) {
      if (map[k] == null || map[k] === -1) return setError(`Bitte Spalte für "${k}" auswählen.`);
    }

    const start = hasHeader ? 1 : 0;
    const rows = [];
    let missingCountry = 0;

    for (let r = start; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const get = (idx) => (idx == null || idx === -1 ? '' : String(row[idx] ?? '').trim());

      let country_code = normalizeCountry(get(map.country_code));
      if (!country_code) missingCountry++;

      let customer_number = get(map.customer_number);
      let name = map.name === -1 ? '' : get(map.name);

      // Optional: split "12345. Händlername" if user mapped only one column
      if (customer_number && !name) {
        const split = splitCustomerNumberAndName(customer_number);
        if (split.customer_number && split.name) {
          customer_number = split.customer_number;
          name = split.name;
        }
      }

      let postal_code = digitsOnly(get(map.postal_code));
      let city = get(map.city);

      let street = map.street === -1 ? '' : get(map.street);
      let house_number = map.house_number === -1 ? '' : get(map.house_number);
      if (street && !house_number && map.house_number === -1) {
        const split = splitStreetAndHouseNumber(street);
        street = split.street;
        house_number = split.house_number;
      }

      if (!customer_number && !name && !postal_code && !city && !street) continue;

      rows.push({
        country_code,
        customer_number,
        name,
        street,
        house_number,
        postal_code,
        city,
      });
    }

    if (!rows.length) return setError('Keine Datenzeilen gefunden.');
    if (missingCountry === rows.length) return setError('Kein Land erkannt. Bitte "Land" Spalte korrekt auswählen (DE/AT/CH).');

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
          <h1 className="h1">Händler Upload</h1>
          <p className="sub">Land wird jetzt aus der Datei übernommen (Spalte „Land“ / „Country“).</p>
        </div>

        <div className="row">
          <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, display: 'inline-block', border: '1px solid rgba(17,24,39,.12)' }}>
            Händler ansehen →
          </a>
          <a className="secondary" href="/settings/uploads" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 14, display: 'inline-block', border: '1px solid rgba(17,24,39,.12)' }}>
            Zurück zu Uploads →
          </a>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>1) Datei auswählen</h2>

          <div className="row" style={{ alignItems: 'end' }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <label>Datei (XLSX/CSV)</label><br />
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

          {status ? <div className="sub" style={{ marginTop: 10 }}>{status}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          {toast ? <div className="toast">{toast}</div> : null}

          <hr className="sep" />

          <h2 style={{ margin: 0 }}>2) Spalten zuordnen</h2>
          <div className="sub" style={{ marginTop: 6 }}>
            Pflicht: <b>Land</b>, <b>Kundennummer</b>, <b>PLZ</b>, <b>Ort</b>. Hausnummer kann leer bleiben (wird ggf. aus Straße getrennt).
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Land (DE/AT/CH)</label><br />
              <select value={map.country_code} onChange={(e) => setField('country_code', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>— auswählen —</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Kundennummer</label><br />
              <select value={map.customer_number} onChange={(e) => setField('customer_number', Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Kunde (Name)</label><br />
              <select value={map.name} onChange={(e) => setField('name', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>— (aus Kundennummer splitten)</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Straße</label><br />
              <select value={map.street} onChange={(e) => setField('street', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>—</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Hausnummer</label><br />
              <select value={map.house_number} onChange={(e) => setField('house_number', Number(e.target.value))} disabled={!headers.length || busy}>
                <option value={-1}>— (aus Straße trennen)</option>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>PLZ</label><br />
              <select value={map.postal_code} onChange={(e) => setField('postal_code', Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>

            <div>
              <label>Ort</label><br />
              <select value={map.city} onChange={(e) => setField('city', Number(e.target.value))} disabled={!headers.length || busy}>
                {headers.map((h) => <option key={h.i} value={h.i}>{colLabel(h.i)}</option>)}
              </select>
            </div>
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <button onClick={upload} disabled={busy || !aoa.length}>
              {busy ? 'Importiere…' : 'In Datenbank importieren'}
            </button>
            <div className="sub">Land wird pro Zeile aus der Datei gespeichert.</div>
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Vorschau</h2>
          <div className="sub" style={{ marginBottom: 10 }}>
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
                  <tr><td className="sub" style={{ padding: 12 }} colSpan={10}>Keine Vorschau verfügbar.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="sub" style={{ marginTop: 10 }}>
            Erwartetes Format in der Land-Spalte: <b>DE</b>, <b>AT</b>, <b>CH</b> (oder „Deutschland/Österreich/Schweiz“).
          </div>
        </div>
      </div>
    </div>
  );
}
