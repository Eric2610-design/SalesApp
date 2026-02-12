'use client';

import { useEffect, useMemo, useState } from 'react';

const COUNTRIES = [
  { value: '', label: 'Alle Länder' },
  { value: 'DE', label: 'DE' },
  { value: 'AT', label: 'AT' },
  { value: 'CH', label: 'CH' },
];

export default function DatabasePage() {
  const [country, setCountry] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [msg, setMsg] = useState(null);

  async function load() {
    setBusy(true);
    setMsg(null);
    try {
      const url = new URL('/api/dealers/list', window.location.origin);
      if (country) url.searchParams.set('country', country);
      if (q.trim()) url.searchParams.set('q', q.trim());
      url.searchParams.set('limit', '1000');

      const res = await fetch(url.toString());
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Fehler beim Laden');

      setRows(json.dealers || []);
      setCount(json.count || 0);
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => rows, [rows]);

  async function clearAll() {
    if (!confirm('Wirklich ALLE Händler löschen?')) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/dealers/clear', { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Löschen fehlgeschlagen');
      await load();
      setMsg({ type: 'success', text: 'Datenbank geleert.' });
    } catch (e) {
      setMsg({ type: 'error', text: e?.message || String(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="card">
      <h1>Datenbank</h1>

      <div className="row">
        <div>
          <label>Land</label>
          <select value={country} onChange={(e) => setCountry(e.target.value)}>
            {COUNTRIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Suche (Nr, Name, Ort)</label>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="z.B. 60, München, Bike…" />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="primary" disabled={busy} onClick={load}>{busy ? 'Lade…' : 'Aktualisieren'}</button>
        <button className="danger" disabled={busy} onClick={clearAll}>Alles löschen</button>
        <a className="secondary" href="/">← Import</a>
      </div>

      {msg?.text && (
        <p className={msg.type === 'error' ? 'error' : 'success'} style={{ marginTop: 12 }}>
          {msg.text}
        </p>
      )}

      <div className="hr" />
      <div className="kpi">
        <span className="badge">Treffer: <b>{filtered.length}</b></span>
        <span className="badge">Count (Server): <b>{count}</b></span>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Land</th>
            <th>Kundennr.</th>
            <th>Name</th>
            <th>Straße</th>
            <th>Nr.</th>
            <th>PLZ</th>
            <th>Ort</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((d) => (
            <tr key={d.id}>
              <td>{d.country_code}</td>
              <td>{d.customer_number}</td>
              <td>{d.name}</td>
              <td>{d.street}</td>
              <td>{d.house_number}</td>
              <td>{d.postal_code}</td>
              <td>{d.city}</td>
            </tr>
          ))}
          {!filtered.length && (
            <tr>
              <td colSpan={7} className="muted">Keine Daten.</td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
