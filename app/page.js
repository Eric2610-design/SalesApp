'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSheetPreview, parseDealerRowsFromSheet } from '../lib/parseClient';

const COUNTRIES = [
  { code: 'DE', label: 'Deutschland (DE)' },
  { code: 'AT', label: 'Österreich (AT)' },
  { code: 'CH', label: 'Schweiz (CH)' },
];

function fmt(n) {
  return new Intl.NumberFormat('de-CH').format(n);
}

function MappingSelect({ label, columns, value, onChange, disabled }) {
  return (
    <div style={{ minWidth: 220 }}>
      <label>{label}</label>
      <br />
      <select value={String(value)} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled}>
        <option value={-1}>(keine)</option>
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
  const [countryCode, setCountryCode] = useState('DE');
  const [file, setFile] = useState(null);

  const [sheet, setSheet] = useState(null); // {rows, hasHeader, columns, sampleRows, suggestedMapping}
  const [mapping, setMapping] = useState({
    customer_number: 0,
    name: 1,
    street: 2,
    postal_code: 3,
    city: 4,
  });

  const [parsed, setParsed] = useState([]); // local preview rows
  const [dbRows, setDbRows] = useState([]); // rows fetched from supabase
  const [filterCountry, setFilterCountry] = useState('ALL');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  // When a file is selected -> load preview + suggested column mapping
  useEffect(() => {
    async function run() {
      if (!file) {
        setSheet(null);
        return;
      }
      setBusy(true);
      setError('');
      setToast('');
      try {
        const prev = await getSheetPreview(file);
        setSheet(prev);
        setMapping(prev.suggestedMapping);
        setToast('Datei geladen. Bitte Spalten zuordnen und dann „Parsen“ klicken.');
      } catch (e) {
        setError(e?.message || String(e));
      } finally {
        setBusy(false);
      }
    }
    run();
  }, [file]);

  const counts = useMemo(() => {
    const all = [...parsed, ...dbRows];
    const by = { DE: 0, AT: 0, CH: 0 };
    for (const r of all) {
      if (r?.country_code && by[r.country_code] !== undefined) by[r.country_code] += 1;
    }
    return { total: all.length, ...by };
  }, [parsed, dbRows]);

  const visibleRows = useMemo(() => {
    const rows = dbRows.length ? dbRows : parsed;
    const s = q.trim().toLowerCase();

    return rows.filter((r) => {
      if (filterCountry !== 'ALL' && r.country_code !== filterCountry) return false;
      if (!s) return true;
      return (
        String(r.customer_number || '').toLowerCase().includes(s) ||
        String(r.name || '').toLowerCase().includes(s) ||
        String(r.city || '').toLowerCase().includes(s) ||
        String(r.street || '').toLowerCase().includes(s)
      );
    });
  }, [dbRows, parsed, filterCountry, q]);

  async function onParseClick() {
    setError('');
    setToast('');

    if (!sheet?.rows?.length) {
      setError('Bitte zuerst eine Datei auswählen.');
      return;
    }

    if (mapping.customer_number === -1 && mapping.name === -1) {
      setError('Bitte mindestens Kundennummer oder Kunde/Name zuordnen.');
      return;
    }

    setBusy(true);
    try {
      const rows = parseDealerRowsFromSheet({
        rows: sheet.rows,
        hasHeader: sheet.hasHeader,
        mapping,
        countryCode,
      });

      setParsed((prev) => {
        const map = new Map();
        for (const r of [...prev, ...rows]) {
          const key = `${r.country_code}::${r.customer_number || ''}::${r.name || ''}`;
          map.set(key, r);
        }
        return Array.from(map.values());
      });

      const missingCn = rows.filter((r) => !r.customer_number).length;
      setToast(
        missingCn
          ? `Geparst: ${fmt(rows.length)} Zeilen (${countryCode}). Hinweis: ${fmt(missingCn)} ohne Kundennummer (werden nicht in DB importiert).`
          : `Geparst: ${fmt(rows.length)} Zeilen (${countryCode}).`
      );
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

    const importable = parsed.filter((r) => r.customer_number);
    if (!importable.length) {
      setError('Keine importierbaren Zeilen (Kundennummer fehlt). Prüfe das Mapping.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch('/api/dealers/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rows: importable }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import fehlgeschlagen');

      setToast(`Import OK: ${fmt(data.upserted ?? importable.length)} upserted.`);
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

      setDbRows(data.rows || []);
      setToast(`Geladen: ${fmt((data.rows || []).length)} Händler aus DB.`);
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
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">SalesApp – Händler Import</h1>
          <p className="sub">
            Upload deiner Händlerlisten (DE/AT/CH), Spalten frei zuordnen, automatische Trennung Straße/Hausnummer, Import
            nach Supabase, Ansicht & Filter.
          </p>
        </div>

        <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
          Datenbank ansehen →
        </a>
      </div>

      <div className="grid">
        <div className="card">
          <h2>1) Datei hochladen</h2>

          <div className="row" style={{ marginBottom: 10 }}>
            <div>
              <label>Land</label>
              <br />
              <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)} disabled={busy}>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Datei (xlsx/xls/csv)</label>
              <br />
              <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} disabled={busy} />
            </div>
          </div>

          <h2>2) Spalten zuordnen</h2>
          <div className="small">
            Nach dem Upload werden Spalten erkannt und du kannst per Dropdown festlegen, was was ist (z.B. A=Kundennr,
            B=Kunde, C=Straße, D=PLZ, E=Ort).
          </div>

          {sheet ? (
            <>
              <div className="row" style={{ marginTop: 10 }}>
                <MappingSelect label="Kundennummer" columns={sheet.columns} value={mapping.customer_number} onChange={(v) => setMapping((m) => ({ ...m, customer_number: v }))} disabled={busy} />
                <MappingSelect label="Kunde / Name" columns={sheet.columns} value={mapping.name} onChange={(v) => setMapping((m) => ({ ...m, name: v }))} disabled={busy} />
                <MappingSelect label="Straße (mit Nr)" columns={sheet.columns} value={mapping.street} onChange={(v) => setMapping((m) => ({ ...m, street: v }))} disabled={busy} />
                <MappingSelect label="PLZ" columns={sheet.columns} value={mapping.postal_code} onChange={(v) => setMapping((m) => ({ ...m, postal_code: v }))} disabled={busy} />
                <MappingSelect label="Ort" columns={sheet.columns} value={mapping.city} onChange={(v) => setMapping((m) => ({ ...m, city: v }))} disabled={busy} />
              </div>

              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={onParseClick} disabled={busy}>Parsen</button>
                <button className="secondary" onClick={clearLocal} disabled={busy}>Vorschau leeren</button>
              </div>

              <div className="small" style={{ marginTop: 10 }}>
                Header erkannt: <span className="mono">{sheet.hasHeader ? 'ja' : 'nein'}</span> · Vorschau der ersten Zeilen:
              </div>

              <div className="tableWrap" style={{ marginTop: 8 }}>
                <table style={{ minWidth: 700 }}>
                  <thead>
                    <tr>
                      {sheet.columns.slice(0, 10).map((c) => (
                        <th key={c.idx}>{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.sampleRows.map((r, i) => (
                      <tr key={i}>
                        {r.slice(0, 10).map((cell, j) => (
                          <td key={j} style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="small" style={{ marginTop: 10 }}>Wähle eine Datei, um die Spaltenzuordnung zu sehen.</div>
          )}

          <div className="kpis">
            <div className="kpi">Total: <span className="mono">{fmt(counts.total)}</span></div>
            <div className="kpi">DE: <span className="mono">{fmt(counts.DE)}</span></div>
            <div className="kpi">AT: <span className="mono">{fmt(counts.AT)}</span></div>
            <div className="kpi">CH: <span className="mono">{fmt(counts.CH)}</span></div>
          </div>

          <div className="toast">{toast}</div>
          {error ? <div className="error">{error}</div> : null}

          <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '14px 0' }} />

          <h2>3) In Supabase importieren</h2>
          <div className="small">Import passiert serverseitig (Service Role Key bleibt geheim). Upsert per (country_code, customer_number).</div>
          <div className="row" style={{ marginTop: 10 }}>
            <button onClick={importToDb} disabled={busy || !parsed.length}>In DB importieren</button>
            <button className="secondary" onClick={() => refreshFromDb(filterCountry === 'ALL' ? undefined : filterCountry)} disabled={busy}>Aus DB laden</button>
          </div>
        </div>

        <div className="card">
          <h2>4) Händler ansehen & filtern</h2>

          <div className="row" style={{ marginBottom: 10 }}>
            <div>
              <label>Land-Filter</label>
              <br />
              <select value={filterCountry} onChange={(e) => setFilterCountry(e.target.value)} disabled={busy}>
                <option value="ALL">Alle</option>
                <option value="DE">DE</option>
                <option value="AT">AT</option>
                <option value="CH">CH</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: 220 }}>
              <label>Suche (Kundennr, Name, Ort, Straße)</label>
              <br />
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
