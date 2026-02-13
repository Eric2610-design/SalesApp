'use client';

import { useEffect, useMemo, useState } from 'react';

const COUNTRIES = ['ALL', 'DE', 'AT', 'CH'];

export default function DatabasePage() {
  const [country, setCountry] = useState('ALL');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const url = new URL('/api/dealers/list', window.location.origin);
      if (country !== 'ALL') url.searchParams.set('country', country);
      if (q.trim()) url.searchParams.set('q', q.trim());

      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte Daten nicht laden');
      setRows(data.rows || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearAll() {
    if (!confirm('Wirklich ALLE Händler löschen?')) return;
    setBusy(true);
    setError('');
    setToast('');
    try {
      const res = await fetch('/api/dealers/clear', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Löschen fehlgeschlagen');
      setToast(`Gelöscht: ${data.deleted}`);
      await load();
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country]);

  const countByCountry = useMemo(() => {
    const m = {};
    for (const r of rows) m[r.country_code] = (m[r.country_code] || 0) + 1;
    return m;
  }, [rows]);

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">Händlerdatenbank</h1>
          <p className="sub">Alle Händler aus Supabase. Filter nach Land, Suche.</p>
        </div>

        <div className="row">
          <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            ← Home
          </a>
          <a className="secondary" href="/admin" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
            Admin →
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

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
          <div className="row" style={{ alignItems: 'end' }}>
            <div>
              <label>Land</label><br/>
              <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ minWidth: 280 }}>
              <label>Suche</label><br/>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Ort, PLZ, Kundennr…" disabled={busy} style={{ width: '100%' }} />
            </div>

            <button className="secondary" onClick={load} disabled={busy}>
              {busy ? 'Lädt…' : 'Neu laden'}
            </button>
          </div>

          <button className="secondary" onClick={clearAll} disabled={busy}>
            Alles löschen
          </button>
        </div>

        <div className="small" style={{ marginTop: 10 }}>
          Treffer: <span className="mono">{rows.length}</span> ·
          DE: <span className="mono">{countByCountry.DE || 0}</span> ·
          AT: <span className="mono">{countByCountry.AT || 0}</span> ·
          CH: <span className="mono">{countByCountry.CH || 0}</span>
        </div>

        {toast ? <div className="toast">{toast}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <div className="tableWrap" style={{ marginTop: 12 }}>
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.country_code}</td>
                  <td className="mono">{r.customer_number}</td>
                  <td>{r.name}</td>
                  <td>{r.street}</td>
                  <td className="mono">{r.house_number}</td>
                  <td className="mono">{r.postal_code}</td>
                  <td>{r.city}</td>
                  <td style={{ textAlign: 'right' }}>
                    <a className="secondary" href={`/dealers/${r.id}`} style={{ textDecoration: 'none', padding: '6px 10px', borderRadius: 12, display: 'inline-block' }}>
                      Kundenübersicht →
                    </a>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan={8} className="small" style={{ padding: 12 }}>Keine Daten.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
