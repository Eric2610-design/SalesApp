'use client';

import { useEffect, useMemo, useState } from 'react';

function fmtTerr(t) {
  const from = String(t.from_prefix ?? '');
  const to = String(t.to_prefix ?? '');
  const len = Number(t.prefix_len) || 0;
  const pad = (s) => (len ? String(s).padStart(len, '0') : String(s));
  return `${pad(from)}-${pad(to)} (${len})`;
}

export default function UserOverviewPage({ params }) {
  const userId = params.id;

  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setBusy(true);
    setError('');
    try {
      const url = new URL('/api/users/overview', window.location.origin);
      url.searchParams.set('user_id', userId);
      const res = await fetch(url.toString());
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Konnte Übersicht nicht laden');
      setData(j);
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

  const user = data?.user;
  const territories = data?.territories || [];
  const dealers = data?.dealers || [];

  const top10 = useMemo(() => dealers.filter(d => (d.backlog_lines || 0) > 0).slice(0, 10), [dealers]);

  const isAD = String(user?.group?.name || '').toLowerCase() === 'aussendienst';

  return (
    <div className="container">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h1 className="h1">User Übersicht</h1>
          <p className="sub">User-ID: <span className="mono">{userId}</span></p>
        </div>
        <div className="row">
          <a className="secondary" href="/users" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12 }}>← Benutzer</a>
          <a className="secondary" href="/database" style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12 }}>Datenbank →</a>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Profil</h2>

          {!user ? (
            <div className="small">{busy ? 'Lädt…' : 'Kein Profil gefunden (app_users)'}</div>
          ) : (
            <>
              <div className="row" style={{ gap: 18 }}>
                <div>
                  <div className="small">E-Mail</div>
                  <div className="mono">{user.email}</div>
                </div>
                <div>
                  <div className="small">Name</div>
                  <div>{user.display_name || '—'}</div>
                </div>
                <div>
                  <div className="small">Gruppe</div>
                  <div className="mono">{user.group?.name || '—'}</div>
                </div>
                <div>
                  <div className="small">Land</div>
                  <div className="mono">{user.country_code || '—'}</div>
                </div>
              </div>

              {isAD ? (
                <>
                  <hr className="sep" />
                  <h3 style={{ marginTop: 0 }}>Gebiete</h3>
                  <div className="row">
                    {territories.length ? territories.map((t) => (
                      <span key={t.id} className="mono" style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(255,255,255,.14)', background: 'rgba(255,255,255,.06)' }}>
                        {t.country_code} {fmtTerr(t)}
                      </span>
                    )) : <span className="small">Keine Gebiete</span>}
                  </div>
                </>
              ) : (
                <div className="small" style={{ marginTop: 10 }}>
                  Hinweis: Diese Übersicht ist v.a. für <span className="mono">Aussendienst</span> gedacht. Für andere Rollen wird kein Gebiet/Dealer-Match berechnet.
                </div>
              )}
            </>
          )}

          <div className="row" style={{ marginTop: 12 }}>
            <button onClick={load} disabled={busy}>{busy ? 'Lädt…' : 'Neu laden'}</button>
          </div>

          {error ? <div className="error">{error}</div> : null}
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Übersicht Gebiet</h2>

          <div className="row" style={{ gap: 18 }}>
            <div>
              <div className="small">Händler im Gebiet</div>
              <div className="mono" style={{ fontSize: 20 }}>{data?.dealers_count ?? 0}</div>
            </div>
            <div>
              <div className="small">Händler mit Rückstand</div>
              <div className="mono" style={{ fontSize: 20 }}>{data?.dealers_with_backlog ?? 0}</div>
            </div>
            <div>
              <div className="small">Rückstand Positionen (gesamt)</div>
              <div className="mono" style={{ fontSize: 20 }}>{data?.backlog_total_lines ?? 0}</div>
            </div>
          </div>

          <div className="small" style={{ marginTop: 10 }}>
            Rückstand basiert auf dem zuletzt importierten Auftragsrückstand (falls vorhanden).
          </div>

          <hr className="sep" />

          <h3 style={{ marginTop: 0 }}>Top Händler (Rückstand)</h3>
          {!top10.length ? (
            <div className="small">Keine Rückstände gefunden.</div>
          ) : (
            <div className="tableWrap">
              <table style={{ minWidth: 520 }}>
                <thead>
                  <tr>
                    <th>Händler</th>
                    <th>PLZ</th>
                    <th>Ort</th>
                    <th>Rückstand</th>
                  </tr>
                </thead>
                <tbody>
                  {top10.map((d) => (
                    <tr key={d.dealer_id}>
                      <td>
                        <a href={`/dealers/${d.dealer_id}`} style={{ textDecoration: 'none' }}>{d.name}</a>
                      </td>
                      <td className="mono">{d.postal_code || ''}</td>
                      <td>{d.city || ''}</td>
                      <td className="mono">{d.backlog_lines || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ gridColumn: '1 / -1' }}>
          <h2 style={{ marginTop: 0 }}>Händler im Gebiet</h2>
          <div className="small">Klick auf einen Händler öffnet die Kundenübersicht (Stammdaten + Rückstand).</div>

          <div className="tableWrap" style={{ marginTop: 10 }}>
            <table style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th>Land</th>
                  <th>Kundennr</th>
                  <th>Name</th>
                  <th>PLZ</th>
                  <th>Ort</th>
                  <th>Rückstand</th>
                </tr>
              </thead>
              <tbody>
                {dealers.map((d) => (
                  <tr key={d.dealer_id}>
                    <td className="mono">{d.country_code}</td>
                    <td className="mono">{d.customer_number}</td>
                    <td>
                      <a href={`/dealers/${d.dealer_id}`} style={{ textDecoration: 'none' }}>{d.name}</a>
                    </td>
                    <td className="mono">{d.postal_code || ''}</td>
                    <td>{d.city || ''}</td>
                    <td className="mono">{d.backlog_lines || 0}</td>
                  </tr>
                ))}
                {!dealers.length ? (
                  <tr><td colSpan={6} className="small" style={{ padding: 12 }}>Keine Händler gefunden (oder kein Gebiet zugeordnet).</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <a className="secondary" href={`/users/${userId}/dealers`} style={{ textDecoration: 'none', padding: '10px 12px', borderRadius: 12, display: 'inline-block' }}>
              Roh-Matches ansehen →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
