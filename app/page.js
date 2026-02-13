'use client';

import { useEffect, useMemo, useState } from 'react';
import { APPS } from '../lib/apps';
import { loadWidgets } from '../lib/widgetStore';

function fmtDate(v) {
  if (!v) return '—';
  try {
    const d = new Date(v);
    return d.toLocaleString('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return String(v);
  }
}

function num(v) {
  if (v == null) return '0';
  return String(v);
}

export default function HomeScreen() {
  const [widgets, setWidgets] = useState([]);
  const [kpi, setKpi] = useState(null);
  const [kpiError, setKpiError] = useState('');
  const [kpiBusy, setKpiBusy] = useState(false);

  useEffect(() => {
    const w = loadWidgets();
    setWidgets(w.length ? w : [{ type: 'kpi' }, { type: 'quicklinks' }, { type: 'hint' }]);
  }, []);

  const widgetTypes = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);

  async function loadKpi() {
    setKpiBusy(true);
    setKpiError('');
    try {
      const res = await fetch('/api/kpi/summary', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'KPI konnte nicht geladen werden');
      setKpi(data.kpi || {});
    } catch (e) {
      setKpiError(e?.message || String(e));
      setKpi(null);
    } finally {
      setKpiBusy(false);
    }
  }

  useEffect(() => {
    if (widgetTypes.has('kpi')) loadKpi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetTypes.size]);

  const dealersByCountry = kpi?.dealers_by_country || {};

  return (
    <div className="home-grid">
      <div className="card">
        <h1 className="h1">SalesApp</h1>
        <p className="sub">Apps + Widgets – iPhone/iPad-Style. Uploads & Setup in Settings.</p>

        <div style={{ marginTop: 14 }} className="app-icons">
          {APPS.filter((a) => a.id !== 'settings').map((app) => (
            <a key={app.id} className="app-icon" href={app.href}>
              <div className="emoji">{app.emoji}</div>
              <div className="label">{app.title}</div>
            </a>
          ))}
        </div>

        <div style={{ marginTop: 14 }} className="row">
          <a
            className="secondary"
            href="/settings"
            style={{ padding: '10px 12px', borderRadius: 14, border: '1px solid rgba(17,24,39,.12)' }}
          >
            Widgets & Uploads in Settings →
          </a>
        </div>
      </div>

      <div className="card">
        <h2 style={{ margin: 0 }}>Widgets</h2>
        <p className="sub" style={{ marginTop: 6 }}>Widgets stellst du unter Settings → Widgets zusammen.</p>

        <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
          {widgetTypes.has('kpi') ? (
            <div className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>KPI Übersicht</strong>
                <div className="row">
                  <a
                    className="secondary"
                    href="/settings/widgets"
                    style={{ padding: '6px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}
                  >
                    Widgets
                  </a>
                  <button className="secondary" onClick={loadKpi} disabled={kpiBusy} style={{ padding: '6px 10px' }}>
                    {kpiBusy ? '…' : 'Refresh'}
                  </button>
                </div>
              </div>

              {kpiError ? <div className="error">{kpiError}</div> : null}

              {!kpi ? (
                <div className="sub" style={{ marginTop: 10 }}>
                  {kpiBusy ? 'Lade KPIs…' : 'Keine Daten.'}
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="sub">Händler (gesamt)</span>
                    <strong>{num(kpi.dealers_total)}</strong>
                  </div>

                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span className="sub">Nach Land:</span>
                    <span className="secondary" style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(17,24,39,.12)' }}>
                      DE: <strong>{num(dealersByCountry.DE)}</strong>
                    </span>
                    <span className="secondary" style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(17,24,39,.12)' }}>
                      AT: <strong>{num(dealersByCountry.AT)}</strong>
                    </span>
                    <span className="secondary" style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(17,24,39,.12)' }}>
                      CH: <strong>{num(dealersByCountry.CH)}</strong>
                    </span>
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="sub">Außendienst-User</span>
                    <strong>{num(kpi.ad_users)}</strong>
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="sub">Rückstand (Positionen)</span>
                    <strong>{num(kpi.backlog_lines)}</strong>
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="sub">Rückstand (Kunden)</span>
                    <strong>{num(kpi.backlog_customers)}</strong>
                  </div>

                  <div className="sub">
                    Letzter Rückstands-Import: <strong>{fmtDate(kpi.backlog_latest?.created_at)}</strong>
                    {kpi.backlog_latest?.filename ? <div style={{ marginTop: 4 }}>Datei: <span style={{ fontFamily: 'ui-monospace' }}>{kpi.backlog_latest.filename}</span></div> : null}
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="sub">Lager (Zeilen)</span>
                    <strong>{num(kpi.inventory_lines)}</strong>
                  </div>

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="sub">Lager (SKUs)</span>
                    <strong>{num(kpi.inventory_skus)}</strong>
                  </div>

                  <div className="sub">
                    Letzter Lager-Import: <strong>{fmtDate(kpi.inventory_latest?.created_at)}</strong>
                    {kpi.inventory_latest?.filename ? <div style={{ marginTop: 4 }}>Datei: <span style={{ fontFamily: 'ui-monospace' }}>{kpi.inventory_latest.filename}</span></div> : null}
                  </div>
                </div>
              )}
            </div>
          ) : null}

          {widgetTypes.has('quicklinks') ? (
            <div className="card" style={{ padding: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>Quick Links</strong>
                <a
                  className="secondary"
                  href="/settings/widgets"
                  style={{ padding: '6px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}
                >
                  Bearbeiten
                </a>
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <a className="secondary" href="/database" style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}>
                  Händler
                </a>
                <a className="secondary" href="/backlog" style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}>
                  Rückstand
                </a>
                <a className="secondary" href="/inventory" style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}>
                  Lager
                </a>
                <a className="secondary" href="/settings/uploads/dealers" style={{ padding: '8px 10px', borderRadius: 12, border: '1px solid rgba(17,24,39,.12)' }}>
                  Händler Upload
                </a>
              </div>
            </div>
          ) : null}

          {widgetTypes.has('hint') ? (
            <div className="card" style={{ padding: 12 }}>
              <strong>Hinweis</strong>
              <div className="sub" style={{ marginTop: 6 }}>
                Uploads und Konfiguration liegen in <b>Settings</b>. Apps bleiben „sauber“ (Ansicht/Logik).
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
