'use client';

import { useEffect, useMemo, useState } from 'react';

function keyMap(list) {
  const m = new Map();
  for (const it of list || []) {
    const k = String(it?.key || '').trim().toLowerCase();
    if (k) m.set(k, it);
  }
  return m;
}

function normKey(v) {
  return String(v ?? '').trim().toLowerCase();
}

export default function DealerBrandsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [manufacturers, setManufacturers] = useState([]);
  const [buyingGroups, setBuyingGroups] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [q, setQ] = useState('');
  const [bulkManufacturer, setBulkManufacturer] = useState('flyer');
  const [busy, setBusy] = useState(false);

  const mMap = useMemo(() => keyMap(manufacturers), [manufacturers]);
  const bgMap = useMemo(() => keyMap(buyingGroups), [buyingGroups]);

  async function load(nextQ) {
    setLoading(true);
    setErr('');
    try {
      const url = new URL('/api/admin/dealer-brands', window.location.origin);
      if (nextQ) url.searchParams.set('q', nextQ);
      url.searchParams.set('limit', '400');
      const res = await fetch(url.toString());
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Fehler');
      setManufacturers(j.manufacturers || []);
      setBuyingGroups(j.buying_groups || []);
      setDealers(j.dealers || []);
      if (j?.manufacturers?.some((x) => normKey(x.key) === 'flyer')) setBulkManufacturer('flyer');
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function bulkAssign() {
    if (!bulkManufacturer) return;
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/dealer-brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_assign_manufacturer', manufacturer_key: bulkManufacturer })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Fehler');
      await load(q);
      alert(`OK: ${j.count} Händler aktualisiert.`);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveDealer(d) {
    setBusy(true);
    setErr('');
    try {
      const manufacturer_keys = String(d._mk || '')
        .split(/[,;\n]+/g)
        .map((x) => normKey(x))
        .filter(Boolean);
      const buying_group_key = normKey(d._bg || '') || null;
      const res = await fetch('/api/admin/dealer-brands', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dealer_key: d.dealer_key, manufacturer_keys, buying_group_key })
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Fehler');
      await load(q);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ margin: 0 }}>Händler-Zuordnungen</h1>
        <a className="muted" href="/admin" style={{ fontSize: 12 }}>← Admin</a>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="label">Suche</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, PLZ, Ort, Kundennummer…" />
          </div>
          <div style={{ minWidth: 260 }}>
            <div className="label">Bulk: Hersteller zu ALLEN Händlern hinzufügen</div>
            <div className="row" style={{ gap: 10 }}>
              <select className="input" value={bulkManufacturer} onChange={(e) => setBulkManufacturer(e.target.value)} disabled={busy || loading}>
                {manufacturers.map((m) => (
                  <option key={m.key} value={m.key}>{m.name} ({m.key})</option>
                ))}
              </select>
              <button className="btn" onClick={bulkAssign} disabled={busy || loading || !bulkManufacturer}>{busy ? '…' : 'Bulk setzen'}</button>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              Tipp: Das ist der schnelle "1. Schritt" (z.B. alle Händler → Flyer).
            </div>
          </div>
        </div>
        {err ? <div className="note" style={{ marginTop: 10, borderColor: 'rgba(185,28,28,.35)', background: 'rgba(185,28,28,.06)' }}>{err}</div> : null}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Händler</h2>
          <div className="muted" style={{ fontSize: 12 }}>{loading ? 'Lade…' : `${dealers.length} Einträge`}</div>
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          Hersteller-Keys: Komma/Zeilen getrennt (z.B. <code>flyer</code>, <code>riese-mueller</code>). Einkaufsverband: Key aus der Liste.
        </div>

        <table className="table" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 110 }}>Kunde</th>
              <th>Händler</th>
              <th style={{ width: 90 }}>PLZ</th>
              <th style={{ width: 160 }}>Ort</th>
              <th style={{ minWidth: 260 }}>Hersteller</th>
              <th style={{ width: 220 }}>Einkaufsverband</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {dealers.map((d) => {
              const mk = d.manufacturer_keys || [];
              const mkText = (d._mk != null) ? d._mk : mk.join(', ');
              const bg = d.buying_group_key || '';
              const bgText = (d._bg != null) ? d._bg : bg;
              return (
                <tr key={d.id}>
                  <td className="mono">{d.dealer_key}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name || '—'}</div>
                      <div style={{ display: 'flex', gap: 6, minWidth: 0 }}>
                        {mk.slice(0, 3).map((k) => {
                          const it = mMap.get(normKey(k));
                          if (!it?.icon_data_url) return null;
                          return <img key={k} src={it.icon_data_url} alt={it.name || k} title={it.name || k} style={{ width: 18, height: 18 }} />;
                        })}
                      </div>
                    </div>
                  </td>
                  <td className="mono">{d.zip || '—'}</td>
                  <td>{d.city || '—'}</td>
                  <td>
                    <input
                      className="input"
                      value={mkText}
                      disabled={busy}
                      onChange={(e) => setDealers((prev) => prev.map(x => x.id === d.id ? { ...x, _mk: e.target.value } : x))}
                      placeholder="flyer, ..."
                    />
                  </td>
                  <td>
                    <select
                      className="input"
                      value={bgText}
                      disabled={busy}
                      onChange={(e) => setDealers((prev) => prev.map(x => x.id === d.id ? { ...x, _bg: e.target.value } : x))}
                    >
                      <option value="">—</option>
                      {buyingGroups.map((g) => (
                        <option key={g.key} value={g.key}>{g.name} ({g.key})</option>
                      ))}
                    </select>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn" onClick={() => saveDealer(d)} disabled={busy}>Speichern</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
