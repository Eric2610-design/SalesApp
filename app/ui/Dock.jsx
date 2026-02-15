'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

const FALLBACK = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/settings', label: 'Settings', icon: '⚙️' }
];

export default function Dock() {
  const pathname = usePathname();
  const [items, setItems] = useState(FALLBACK);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 12000);
        try {
          const res = await fetch('/api/apps/visible', { cache:'no-store', signal: controller.signal });
          if (!res.ok) return alive && setItems(FALLBACK);
          const j = await res.json();
          const dock = (j?.dock || []).map((a) => ({
            href: a.href || `/apps/${a.slug}`,
            label: a.title,
            icon: a.icon || '•'
          }));
          if (alive) setItems(dock.length ? dock : FALLBACK);
        } finally {
          clearTimeout(t);
        }
      } catch {
        if (alive) setItems(FALLBACK);
      }
    })();
    return () => { alive = false; };
  }, []);

  const active = (href) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <nav className="ios-dock" aria-label="Dock">
      {items.map((it) => (
        <a key={it.href} href={it.href} className={`ios-dock-item ${active(it.href) ? 'active' : ''}`}>
          <div className="ios-dock-icon">{it.icon}</div>
          <div className="ios-dock-label">{it.label}</div>
        </a>
      ))}
    </nav>
  );
}
