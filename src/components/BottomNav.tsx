import { NavLink } from 'react-router-dom';
import { Home, ListMusic, Music2, Settings, Video } from 'lucide-react';
import { useT } from '../lib/i18n';

export function BottomNav() {
  const t = useT();
  const items = [
    { to: '/', label: t('nav.home'), icon: Home, end: true },
    { to: '/music', label: t('nav.music'), icon: Music2, end: false },
    { to: '/videos', label: t('nav.videos'), icon: Video, end: false },
    { to: '/playlists', label: t('nav.playlists'), icon: ListMusic, end: false },
    { to: '/settings', label: t('nav.settings'), icon: Settings, end: false },
  ];

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-bg/95 backdrop-blur-md"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="mx-auto flex h-16 max-w-2xl items-stretch">
        {items.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                `tap flex h-full flex-col items-center justify-center gap-1 text-[10px] font-semibold tracking-wide transition-colors ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-12 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-accent/15' : ''
                    }`}
                  >
                    <Icon size={20} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                  </span>
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
