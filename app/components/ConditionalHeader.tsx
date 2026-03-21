'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const NAV_LINKS = [
  { href: '/open-play', label: 'Open Play' },
  { href: '/tournament', label: 'Tournaments' },
  { href: '/players', label: 'Players' },
  { href: '/kiosk', label: 'Kiosk' },
];

export default function ConditionalHeader() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Prevent body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  if (pathname.startsWith('/live') || pathname.startsWith('/kiosk') || pathname.startsWith('/umpire')) return null;

  return (
    <>
      <header className="sticky top-0 z-40 bg-pb-green shadow-sm border-b border-pb-green/80">
        <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-white tracking-tight shrink-0">
            PickleStack
          </Link>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-6">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-white/80 hover:text-white font-medium transition-colors text-sm"
              >
                {l.label}
              </Link>
            ))}
            <Link
              href="/live"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 border border-white/30 text-white font-semibold text-xs px-3 py-1 rounded-full transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </Link>
          </div>

          {/* Mobile: LIVE + hamburger */}
          <div className="flex sm:hidden items-center gap-3">
            <Link
              href="/live"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-white/10 border border-white/30 text-white font-semibold text-xs px-3 py-1 rounded-full"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </Link>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              aria-label="Toggle menu"
              className="text-white p-1"
            >
              {menuOpen ? (
                // X icon
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="4" y1="4" x2="20" y2="20" />
                  <line x1="20" y1="4" x2="4" y2="20" />
                </svg>
              ) : (
                // Hamburger icon
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-30 sm:hidden" onClick={() => setMenuOpen(false)}>
          <div
            className="absolute top-14 left-0 right-0 bg-pb-green border-b border-pb-green/80 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="block px-6 py-4 text-white/90 hover:text-white hover:bg-white/10 font-medium text-base border-b border-white/10 transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
