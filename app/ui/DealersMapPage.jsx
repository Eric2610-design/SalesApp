'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';

const DealersMapLeaflet = dynamic(() => import('./DealersMapLeaflet'), { ssr: false });

function inBounds(m, b) {
  if (!b) return true;
  return m.lat >= b.south && m.lat <= b.north && m.lng >= b.west && m.lng <= b.east;
}

export default function DealersMapPage() {
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [all, setAll] = useState([]);
  const [counts, setCounts] = useState(null);
  const [mapConfig, setMapConfig] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [onlyBacklog, setOnlyBacklog] = useState(false);
  const [q, setQ] = useState('');
  const [brands, setBrands] = useState({ manufacturers: [], buying_groups: [], error: '' });

  const mIconByKey = useMemo(() => {
    const m = new Map();
    for (const x of (brands.manufacturers || [])) {
      const k = String(x?.key || '').trim().toLowerCase();
      if (k) m.set(k, x?.icon_data || '');
    }
    return m;
  }, [brands.manufacturers]);

  const bgIconByKey = useMemo(() => {
    const m = new Map();
    for (const x of (brands.buying_groups || [])) {
      const k = String(x?.key || '').trim().toLowerCase();
      if (k) m.set(k, x?.icon_data || '');
    }
    return m;
  }, [brands.buying_groups]);

  function Logo({ src, alt }) {
    if (!src) return null;
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={alt || ''} src={src} style={{ width: 18, height: 18, objectFit: 'contain' }} />;
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const res = await fetch('/api/dealers/map', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Karte laden fehlgeschlagen');
        if (!alive) return;
        setAll(Array.isArray(j?.markers) ? j.markers : []);
        setCounts(j?.counts || null);
        setMapConfig(j?.config || null);
      } catch (e) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/brands', { cache: 'no-store' });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.error || 'Brands laden fehlgeschlagen');
        if (!alive) return;
        setBrands({ manufacturers: j?.manufacturers || [], buying_groups: j?.buying_groups || [], error: j?.error || '' });
      } catch (e) {
        if (!alive) return;
        setBrands({ manufacturers: [], buying_groups: [], error: e?.message || String(e) });
      }
    })();
    return () => { alive = false; };
  }, []);

  const mapMarkers = useMemo(() => {
    return onlyBacklog ? (all || []).filter((m) => m.hasBacklog) : (all || []);
  }, [all, onlyBacklog]);

  const visible = useMemo(() => {
    const base = mapMarkers.filter((m) => inBounds(m, bounds));
    const qq = q.trim().toLowerCase();
    if (!qq) return base;
    return base.filter((m) => {
      const s = `${m.name || ''} ${m.zip || ''} ${m.city || ''}`.toLowerCase();
      return s.includes(qq);
    });
  }, [mapMarkers, bounds, q]);

  const stats = useMemo(() => {
    const total = mapMarkers.length;
    const inView = visible.length;
    const withBacklog = mapMarkers.filter((m) => m.hasBacklog).length;
    return { total, inView, withBacklog };
  }, [mapMarkers, visible]);

  if (err) {
    return (
      <div className="error">
        {err}
        <div style={{ marginTop: 10 }}>
          <a className="secondary" href="/login" style={{ textDecoration: 'none' }}>Zum Login</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">Händlerkarte</div>
        <div className="sub">
          OpenStreetMap · Marker sind anklickbar (Link zur Händler-Übersicht)
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ minWidth: 260, flex: 1 }}>
            <div className="label">Suche in sichtbaren Händlern</div>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, PLZ, Ort…" />
          </div>

          <label className="row" style={{ gap: 8, alignItems: 'center', userSelect: 'none' }}>
            <input type="checkbox" checked={onlyBacklog} onChange={(e) => setOnlyBacklog(e.target.checked)} />
            <span style={{ fontSize: 13 }}>Nur Händler mit Rückstand</span>
          </label>

          <div className="muted" style={{ fontSize: 12 }}>
            {loading ? 'Lade…' : (
              <>
                Im Ausschnitt: <strong>{stats.inView}</strong> · Gesamt (mit Koordinaten): <strong>{stats.total}</strong>
                {counts?.no_coords ? <> · ohne Koordinaten: <strong>{counts.no_coords}</strong></> : null}
                {mapConfig?.latKey || mapConfig?.lngKey ? (<> · Lat/Lng: <strong>{mapConfig?.latKey || '—'}</strong>/<strong>{mapConfig?.lngKey || '—'}</strong> <span className="muted">({mapConfig?.latKey_source || '—'}/{mapConfig?.lngKey_source || '—'})</span></>) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <DealersMapLeaflet
        markers={mapMarkers}
        brands={{ mIconByKey, bgIconByKey }}
        onBounds={(b) => setBounds(b)}
        height={520}
      />

      <div className="card" style={{ padding: 14 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 900 }}>Händler im Kartenausschnitt</div>
          <div className="muted" style={{ fontSize: 12 }}>{visible.length} Treffer</div>
        </div>

        {!visible.length ? (
          <>
            <div className="muted" style={{ marginTop: 10 }}>Keine Händler im aktuellen Ausschnitt.</div>
            {(!loading && (all || []).length === 0) ? (
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                Hinweis: Wenn du sicher bist, dass Koordinaten vorhanden sind, prüfe bitte im Admin-Bereich bei <strong>Dataset → Händler → Geodaten</strong> die Lat/Lng-Spalten (z.B. <code>lat</code> und <code>ln</code>/<code>lng</code>).
              </div>
            ) : null}
          </>
        ) : (
          <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
            {visible.slice(0, 250).map((m) => (
              <div key={m.id} className="card" style={{ padding: 12 }}>
	                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
	                  <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
	                    <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
	                      <div style={{ fontWeight: 900, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
	                      <div className="row" style={{ gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
	                        {(m.manufacturer_keys || []).slice(0, 6).map((k) => (
	                          <Logo key={k} src={mIconByKey.get(String(k).toLowerCase())} alt={k} />
	                        ))}
	                      </div>
	                    </div>
	                    <div className="muted" style={{ fontSize: 12 }}>{[m.zip, m.city].filter(Boolean).join(' ')}</div>
	                  </div>
	                  <div className="row" style={{ gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
	                    {m.buying_group_key ? <Logo src={bgIconByKey.get(String(m.buying_group_key).toLowerCase())} alt={m.buying_group_key} /> : null}
	                    {m.hasBacklog ? <span className="muted" style={{ fontSize: 12 }}>Rückstand</span> : null}
	                    <a className="secondary" href={`/dealers/${m.id}`} style={{ textDecoration: 'none', padding: '8px 10px', fontSize: 12 }}>Details</a>
	                  </div>
	                </div>
              </div>
            ))}

            {visible.length > 250 ? (
              <div className="muted" style={{ fontSize: 12 }}>Es werden max. 250 Händler in der Liste angezeigt.</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
