'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabaseClient } from '../../lib/supabaseClient';
import { getAccessToken } from '../../lib/authedFetch';

const FALLBACK = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Dock() {
  const pathname = usePathname();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [items, setItems] = useState(FALLBACK);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const token = await getAccessToken(supabase, 4000);
        if (!token) {
          if (alive) setItems(FALLBACK);
          return;
        }

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 8000);

        try {
          const res = await fetch('/api/apps/visible', {
            headers: { authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: controller.signal,
          });
          const j = await res.json();
          if (!res.ok) throw new Error(j?.error || 'Dock load failed');

          const dock = (j?.dock || []).map((a) => ({
            href: a.href || `/apps/${a.slug}`,
            label: a.title,
            icon: a.icon || '•',
          }));

          if (alive) setItems(dock.length ? dock : FALLBACK);
        } finally {
          clearTimeout(t);
        }
      } catch {
        if (alive) setItems(FALLBACK);
      }
    }

    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      alive = false;
      sub.subscription?.unsubscribe?.();
    };
  }, [supabase]);

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
