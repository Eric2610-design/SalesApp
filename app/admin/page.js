'use client';

import { useEffect, useState } from 'react';

const ADMIN_TILES = [
  { title: 'Apps', icon: '🧩', href: '/admin/apps', sub: 'Registry, aktiv/inaktiv, löschen' },
  { title: 'Installer', icon: '🛠️', href: '/admin/installer', sub: 'SQL ausführen / Setup' },
  { title: 'Benutzer', icon: '👥', href: '/admin/users', sub: 'Gruppen & Profile' },
  { title: 'Händler-Zuordnungen', icon: '📌', href: '/admin/dealer-brands', sub: 'Hersteller/Einkaufsverband pro Händler (Bulk: alle → Flyer)' },
  { title: 'Datenimport', icon: '⬆️', href: '/admin/import', sub: 'CSV/XLSX hochladen' },
  { title: 'Dataset Einstellungen', icon: '🧱', href: '/admin/datasets', sub: 'Spalten + Typen + Vorschau' },
  { title: 'Händlerseite', icon: '🏪', href: '/admin/dealer-view', sub: 'Welche Infos auf der Händlerseite' },
  { title: 'Hersteller & Einkaufsverbände', icon: '🏷️', href: '/admin/brands', sub: 'Piktogramme & Keys verwalten' },
  { title: 'Log', icon: '🧾', href: '/admin/log', sub: 'Letzte Admin-Aktionen' }
];

export default function AdminHomePage() {
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      setErr('');
      const meRes = await fetch('/api/auth/me', { cache: 'no-store' });
      const meJ = await meRes.json().catch(() => ({}));
      if (!meRes.ok) return alive && setErr('Nicht eingeloggt');
      if (!meJ?.isAdmin) return alive && setErr('Nur Admin. (ADMIN_EMAILS)');
    })();
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div className="card">
        <div className="h1">Admin</div>
        <div className="error" style={{ marginTop: 10 }}>{err}</div>
        <div style={{ marginTop: 10 }}>
          <a className="secondary" href="/" style={{ textDecoration: 'none' }}>Zurück</a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="card">
        <div className="h1">Admin</div>
        <div className="sub">Alles unter <code>/admin</code> ist hier gebündelt.</div>
      </div>

      <div className="grid">
        {ADMIN_TILES.map((t) => (
          <a key={t.href} className="app-icon" href={t.href}>
            <div className="app-emoji">{t.icon}</div>
            <div className="app-title">{t.title}</div>
            <div className="app-href">{t.sub}</div>
          </a>
        ))}
      </div>

      <div className="row">
        <a className="secondary" href="/" style={{ textDecoration: 'none' }}>Zurück</a>
      </div>
    </div>
  );
}
