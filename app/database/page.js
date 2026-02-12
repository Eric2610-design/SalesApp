'use client';

import { useEffect, useMemo, useState } from 'react';

const COUNTRIES = [
  { code: 'ALL', label: 'Alle' },
  { code: 'DE', label: 'DE' },
  { code: 'AT', label: 'AT' },
  { code: 'CH', label: 'CH' },
];

function fmt(n) {
  return new Intl.NumberFormat('de-CH').format(n);
}

export default function DatabasePage() {
  const [country, setCountry] = useState('ALL');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('country_code');
  const [dir, setDir] = useState('asc');
  const [limit, setLimit] = useState(200);
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const page = useMemo(() => Math.floor(offset / limit) + 1, [offset, limit]);
  const totalPages = useMemo(() => {
    if (count == null) return null;
    return Math.max(1, Math.ceil(count / limit));
  }, [count, limit]);

  async function load() {
    setBusy(true);
    setError('');
    try {
      const url = new URL('/api/dealers/list', window.location.origin);
      if (country !== 'ALL') url.searchParams.set('country', country);
      if (q.trim()) url.searchParams.set('q', q.trim());
      url.searchParams.set('sort', sort);
      url.searchParams.set('dir', dir);
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('offset', String(offset));

      const res = await fetch(url.toString(), { method: 'GET' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Konnte Daten nicht laden');

      setRows(data.rows || []);
      setCount(typeof data.count === 'number' ? data.count : null);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, q, sort, dir, limit]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [country, q, sort, dir, limit, offset]);

  const from = count == null ? null : Math.min(offset + 1, count);
  const to = count == null ? null : Math.min(offset + rows.length, count);

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">Händlerdatenbank</h1>
          <p className="sub">Alle Händler aus Supabase – mit Suche, Länderfilter und Pagination.</p>
        </div>
        <a className="secondary" href="/" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 10, display: 'inline-block' }}>
          ← Import
        </a>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 12, alignItems: 'end' }}>
          <div>
            <label>Land</label><br />
            <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy}>
              {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </select>
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <label>Suche</label><br />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Kundennr, Name, Ort, Straße …"
              disabled={busy}
              style={{ width: '100%' }}
            />
          </div>

          <div>
            <label>Sortierung</label><br />
            <select value={sort} onChange={(e) => setSort(e.target.value)} disabled={busy}>
              <option value="country_code">Land</option>
              <option value="customer_number">Kundennr</option>
              <option value="name">Name</option>
              <option value="postal_code">PLZ</option>
              <option value="city">Ort</option>
              <option value="created_at">Erstellt</option>
            </select>
          </div>

          <div>
            <label>Richtung</label><br />
            <select value={dir} onChange={(e) => setDir(e.target.value)} disabled={busy}>
              <option value="asc">↑ asc</option>
              <option value="desc">↓ desc</option>
            </select>
          </div>

          <div>
            <label>Pro Seite</label><br />
            <select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))} disabled={busy}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
            </select>
          </div>

          <button onClick={load} disabled={busy}>Neu laden</button>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <div className="small" style={{ marginBottom: 10 }}>
          {count == null ? (
            <>Geladen: <span className="mono">{fmt(rows.length)}</span></>
          ) : (
            <>Anzeige: <span className="mono">{fmt(from)}</span>–<span className="mono">{fmt(to)}</span> von <span className="mono">{fmt(count)}</span> (Seite <span className="mono">{fmt(page)}</span>{totalPages ? <> / <span className="mono">{fmt(totalPages)}</span></> : null})</>
          )}
          {busy ? <> · Lädt…</> : null}
        </div>

        <div className="row" style={{ marginBottom: 10 }}>
          <button className="secondary" onClick={() => setOffset(o => Math.max(0, o - limit))} disabled={busy || offset === 0}>
            ← Zurück
          </button>
          <button className="secondary" onClick={() => setOffset(o => o + limit)} disabled={busy || (count != null && offset + limit >= count)}>
            Weiter →
          </button>
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
              {rows.map((r, idx) => (
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
              {!rows.length ? (
                <tr><td colSpan={7} className="small" style={{ padding: 12 }}>Keine Treffer.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
