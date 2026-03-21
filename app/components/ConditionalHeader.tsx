'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function ConditionalHeader() {
  const pathname = usePathname();
  if (pathname.startsWith('/live') || pathname.startsWith('/kiosk')) return null;

  return (
    <header className="bg-pb-green shadow-sm border-b border-pb-green/80">
      <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-white tracking-tight">
          PickleStack
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/open-play"
            className="text-white/80 hover:text-white font-medium transition-colors text-sm"
          >
            Open Play
          </Link>
          <Link
            href="/tournament"
            className="text-white/80 hover:text-white font-medium transition-colors text-sm"
          >
            Tournaments
          </Link>
          <Link
            href="/players"
            className="text-white/80 hover:text-white font-medium transition-colors text-sm"
          >
            Players
          </Link>
          <Link
            href="/kiosk"
            className="text-white/80 hover:text-white font-medium transition-colors text-sm"
          >
            Kiosk
          </Link>
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
      </nav>
    </header>
  );
}
