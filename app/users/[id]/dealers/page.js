'use client';

import { useEffect, useState } from 'react';

export default function AdDealersPage({ params }) {
  const userId = params.id;

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const url = new URL('/api/users/dealers', window.location.origin);
      url.searchParams.set('user_id', userId);

      const res = await fetch(url.toString());
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte Händler nicht laden');

      setRows(data.rows || []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="h1">Händler für Außendienst</h1>
          <p className="sub">AD User-ID: <span className="mono">{userId}</span></p>
        </div>
        <a className="secondary" href="/users" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10 }}>
          ← Zurück
        </a>
      </div>

      <div className="card">
        <button onClick={load} disabled={busy}>Neu laden</button>
        {error ? <div className="error" style={{ marginTop: 10 }}>{error}</div> : null}

        <div className="small" style={{ marginTop: 10 }}>
          {busy ? 'Lädt…' : `Treffer: ${rows.length}`}
        </div>

        <div className="tableWrap" style={{ marginTop: 10 }}>
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
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.dealer_id}>
                  <td className="mono">{r.country_code}</td>
                  <td className="mono">{r.customer_number}</td>
                  <td>{r.name}</td>
                  <td>{r.street}</td>
                  <td className="mono">{r.house_number}</td>
                  <td className="mono">{r.postal_code}</td>
                  <td>{r.city}</td>
                  <td className="mono">{r.from_prefix}-{r.to_prefix}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan={8} className="small" style={{ padding: 12 }}>Keine Treffer.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
