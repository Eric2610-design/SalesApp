'use client';

import { useEffect, useState } from 'react';
import { loadWidgets, saveWidgets } from '../../../lib/widgetStore';

const OPTIONS = [
  { type: 'quicklinks', title: 'Quick Links' },
  { type: 'hint', title: 'Hinweis' },
];

export default function WidgetsSettingsPage() {
  const [widgets, setWidgets] = useState([]);

  useEffect(() => {
    setWidgets(loadWidgets());
  }, []);

  function toggle(type) {
    const exists = widgets.some((w) => w.type === type);
    const next = exists ? widgets.filter((w) => w.type !== type) : [...widgets, { type }];
    setWidgets(next);
    saveWidgets(next);
  }

  return (
    <div className="card">
      <h1 className="h1">Widgets</h1>
      <p className="sub">Wähle aus, was auf dem Homescreen angezeigt wird.</p>

      <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
        {OPTIONS.map((o) => (
          <label
            key={o.type}
            className="card"
            style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <strong>{o.title}</strong>
              <div className="sub" style={{ marginTop: 4 }}>
                Widget-Typ: {o.type}
              </div>
            </div>
            <input type="checkbox" checked={widgets.some((w) => w.type === o.type)} onChange={() => toggle(o.type)} />
          </label>
        ))}
      </div>
    </div>
  );
}
