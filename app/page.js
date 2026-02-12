'use client';

import { useMemo, useState } from 'react';
import { parseDealerRowsFromFile } from '../lib/parseClient';

const COUNTRIES = [
  { code: 'DE', label: 'Deutschland (DE)' },
  { code: 'AT', label: 'Österreich (AT)' },
  { code: 'CH', label: 'Schweiz (CH)' },
];

function fmt(n) {
  return new Intl.NumberFormat('de-CH').format(n);
}

export default function Page() {
  const [countryCode, setCountryCode] = useState('DE');
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState([]); // local preview rows
  const [dbRows, setDbRows] = useState([]); // rows fetched from supabase
  const [filterCountry, setFilterCountry] = useState('ALL');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const counts = useMemo(() => {
    const all = [...parsed, ...dbRows];
    const by = { DE: 0, AT: 0, CH: 0 };
    for (const r of all) {
      if (r?.country_code && by[r.country_code] !== undefined) by[r.country_code]++;
    }
    return { total: all.length, ...by };
  }, [parsed, dbRows]);

  const visibleRows = useMemo(() => {
    const rows = dbRows.length ? dbRows : parsed;
    const filtered = rows.filter(r => {
      if (filterCountry !== 'ALL' && r.country_code !== filterCountry) return false;
      if (!q.trim()) return true;
      const s = q.trim().toLowerCase();
      return (
        String(r.customer_number || '').toLowerCase().includes(s) ||
        String(r.name || '').toLowerCase().includes(s) ||
        String(r.city || '').toLowerCase().includes(s) ||
        String(r.street || '').toLowerCase().includes(s)
      );
    });
    return filtered;
  }, [dbRows, parsed, filterCountry, q]);

  async function onParseClick() {
    setError('');
    setToast('');
    if (!file) return;
    setBusy(true);
    try {
      const rows = await parseDealerRowsFromFile(file, countryCode);
      setParsed(prev => {
        // merge, dedupe by (country_code + customer_number)
        const map = new Map();
        for (const r of [...prev, ...rows]) {
          const key = `${r.country_code}::${r.customer_number}`;
          map.set(key, r);
        }
        return Array.from(map.values());
      });
      setToast(`Geparst: ${fmt(rows.length)} Zeilen (${countryCode}).`);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importToDb() {
    setError('');
    setToast('');
    if (!parsed.length) {
      setError('Es gibt noch keine geparsten Daten zum Importieren.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/dealers/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: parsed })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import fehlgeschlagen');
      setToast(`Import OK: ${fmt(data.upserted)} upserted.`);
      await refreshFromDb(filterCountry === 'ALL' ? undefined : filterCountry);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshFromDb(country) {
    setError('');
    setToast('');
    setBusy(true);
    try {
      const url = new URL('/api/dealers/list', window.location.origin);
      if (country) url.searchParams.set('country', country);
      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte Händler nicht laden');
      setDbRows(data.rows);
      setToast(`Geladen: ${fmt(data.rows.length)} Händler aus DB.`);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  function clearLocal() {
    setParsed([]);
    setToast('Lokale Vorschau geleert.');
    setError('');
  }

  return (
    <div className="container">
      <div className="header">
        <div>
          <h1 className="h1">SalesApp – Händler Import</h1>
          <p className="sub">Upload deiner Flyer-Händlerlisten (DE/AT/CH), automatisches Trennen von Kundennr./Name und Straße/Hausnummer, Import nach Supabase, Ansicht & Filter.</p>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>1) Datei hochladen & parsen</h2>

          <div className="row" style={{ marginBottom: 10 }}>
            <div>
              <label>Land</label><br />
              <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} disabled={busy}>
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label>Datei (xlsx/xls/csv)</label><br />
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
            </div>
          </div>

          <div className="row">
            <button onClick={onParseClick} disabled={busy || !file}>Parsen</button>
            <button className="secondary" onClick={clearLocal} disabled={busy}>Vorschau leeren</button>
          </div>

          <div className="kpis">
            <div className="kpi">Total: <span className="mono">{fmt(counts.total)}</span></div>
            <div className="kpi">DE: <span className="mono">{fmt(counts.DE)}</span></div>
            <div className="kpi">AT: <span className="mono">{fmt(counts.AT)}</span></div>
            <div className="kpi">CH: <span className="mono">{fmt(counts.CH)}</span></div>
          </div>

          <div className="toast">{toast}</div>
          {error ? <div className="error">{error}</div> : null}

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />

          <h2>2) In Supabase importieren</h2>
          <div className="small">Der Import passiert serverseitig über eine API-Route (Service Role Key bleibt geheim). Upsert-Logik per (country_code, customer_number).</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={importToDb} disabled={busy || !parsed.length}>In DB importieren</button>
            <button className="secondary" onClick={() => refreshFromDb(filterCountry === 'ALL' ? undefined : filterCountry)} disabled={busy}>Aus DB laden</button>
          </div>
        </div>

        <div className="card">
          <h2>3) Händler ansehen & filtern</h2>

          <div className="row" style={{ marginBottom: 10 }}>
            <div>
              <label>Land-Filter</label><br />
              <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} disabled={busy}>
                <option value="ALL">Alle</option>
                <option value="DE">DE</option>
                <option value="AT">AT</option>
                <option value="CH">CH</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Suche (Kundennr, Name, Ort, Straße)</label><br />
              <input type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. 10023 oder Zürich" disabled={busy} style={{ width: '100%' }} />
            </div>
          </div>

          <div className="small" style={{ marginBottom: 8 }}>
            Anzeige: <span className="mono">{fmt(visibleRows.length)}</span> {dbRows.length ? 'aus DB' : 'aus Vorschau'}
          </div>

          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>Land</th>
                  <th>Kundennr</th>
                  <th>Name</th>
                  <th>Straße</th>
                  <th>Nr</th>
                  <th>PLZ</th>
                  <th>Ort</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.slice(0, 1000).map((r, idx) => (
                  <tr key={`${r.country_code}-${r.customer_number}-${idx}`}>
                    <td className="mono">{r.country_code}</td>
                    <td className="mono">{r.customer_number}</td>
                    <td>{r.name}</td>
                    <td>{r.street}</td>
                    <td className="mono">{r.house_number}</td>
                    <td className="mono">{r.postal_code}</td>
                    <td>{r.city}</td>
                  </tr>
                ))}
                {!visibleRows.length ? (
                  <tr><td colSpan={7} className="small" style={{ padding: 12 }}>Noch keine Daten. Erst Datei parsen oder aus DB laden.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Hinweis: Zur Performance werden max. 1000 Zeilen gerendert.
          </div>
        </div>
      </div>
    </div>
  );
}
