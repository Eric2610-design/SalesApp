'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { getSupabaseClient } from '../../lib/supabaseClient';

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
        const { data } = await supabase.auth.getSession();
        const token = data?.session?.access_token;
        if (!token) {
          if (alive) setItems(FALLBACK);
          return;
        }

        const res = await fetch('/api/apps/visible', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
        const j = await res.json();
        if (!res.ok) throw new Error(j?.error || 'Dock load failed');

        const dock = (j?.dock || []).map((a) => ({
          href: a.href || `/apps/${a.slug}`,
          label: a.title,
          icon: a.icon || '•',
        }));

        if (alive) setItems(dock.length ? dock : FALLBACK);
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
