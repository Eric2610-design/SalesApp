'use client';

import { useEffect, useMemo, useState } from 'react';
import { APPS } from '../lib/apps';
import { loadWidgets } from '../lib/widgetStore';

export default function HomeScreen() {
  const [widgets, setWidgets] = useState([]);

  useEffect(() => {
    const w = loadWidgets();
    setWidgets(w.length ? w : [{ type: 'quicklinks' }, { type: 'hint' }]);
  }, []);

  const widgetTypes = useMemo(() => new Set(widgets.map((w) => w.type)), [widgets]);

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
