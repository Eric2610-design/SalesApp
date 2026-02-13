'use client';

import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'Home', icon: '⌂' },
  { href: '/database', label: 'Händler', icon: '🏪' },
  { href: '/backlog', label: 'Rückstand', icon: '📦' },
  { href: '/inventory', label: 'Lager', icon: '🏭' },
  { href: '/users', label: 'Benutzer', icon: '👥' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Dock() {
  const pathname = usePathname();

  const active = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

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
