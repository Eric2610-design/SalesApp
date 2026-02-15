'use client';

import { useEffect, useMemo, useState } from 'react';

export default function DealerDetailPage({ params }) {
  const dealerId = params.id;

  const [dealer, setDealer] = useState(null);
  const [backlog, setBacklog] = useState({ ok: false, rows: [], display_columns: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const dRes = await fetch(`/api/dealers/get?id=${encodeURIComponent(dealerId)}`);
      const dData = await dRes.json();
      if (!dRes.ok) throw new Error(dData?.error || 'Kunde nicht gefunden');

      setDealer(dData.dealer);

      const cust = dData.dealer?.customer_number;
      if (cust) {
        const bRes = await fetch(`/api/backlog/by-customer?customer_number=${encodeURIComponent(cust)}`);
        const bData = await bRes.json();
        if (bRes.ok) setBacklog(bData);
        else setBacklog({ ok: false, rows: [], display_columns: [] });
      } else {
        setBacklog({ ok: false, rows: [], display_columns: [] });
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [dealerId]);

  const displayCols = useMemo(() => backlog?.display_columns || [], [backlog]);

  return (
    <div className="container">
      <div className="header" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
        <div>
          <h1 className="h1">Kundenübersicht</h1>
          <p className="sub">Händlerdetails + Auftragsrückstand (Matching über Kundennummer).</p>
        </div>
        <div className="row">
          <a className="secondary" href="/database" style={{ textDecoration:'none', padding:'10px 12px', borderRadius:12, display:'inline-block' }}>← Datenbank</a>
          <a className="secondary" href="/backlog" style={{ textDecoration:'none', padding:'10px 12px', borderRadius:12, display:'inline-block' }}>Auftragsrückstand</a>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="card">
          <h2 style={{ marginTop:0 }}>Händler</h2>
          {dealer ? (
            <>
              <div className="small">Land: <span className="mono">{dealer.country_code}</span></div>
              <div className="small">Kundennr: <span className="mono">{dealer.customer_number}</span></div>
              <div style={{ marginTop:10 }}>
                <div><b>{dealer.name || '—'}</b></div>
                <div className="small" style={{ marginTop:6 }}>
                  {dealer.street || ''} {dealer.house_number || ''}<br/>
                  <span className="mono">{dealer.postal_code || ''}</span> {dealer.city || ''}
                </div>
              </div>
            </>
          ) : (
            <div className="small">{busy ? 'Lädt…' : '—'}</div>
          )}
        </div>

        <div className="card">
          <h2 style={{ marginTop:0 }}>Auftragsrückstand</h2>
          <div className="small">
            {backlog?.ok ? `Zeilen: ${backlog.rows?.length || 0}` : 'Kein Rückstand geladen oder keine Treffer.'}
          </div>

          {!backlog?.ok ? (
            <div className="small" style={{ marginTop:10 }}>
              Tipp: Erst unter <a href="/backlog">/backlog</a> importieren.
            </div>
          ) : null}

          {backlog?.ok && (backlog.rows?.length || 0) > 0 ? (
            <div className="tableWrap" style={{ marginTop:12 }}>
              <table style={{ minWidth:900 }}>
                <thead>
                  <tr>
                    {displayCols.map((c) => <th key={c}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {backlog.rows.map((r) => (
                    <tr key={r.id}>
                      {displayCols.map((c) => <td key={c}>{String((r.data || {})[c] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
