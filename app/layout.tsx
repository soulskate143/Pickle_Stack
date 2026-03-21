import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import ConditionalHeader from './components/ConditionalHeader';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'PickleStack',
  description: 'Pickleball open play stacking & tournament management',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-pb-bg text-pb-text antialiased">
        <ConditionalHeader />

        <main className="flex-1">{children}</main>

        <footer className="bg-pb-green border-t border-pb-green py-3 text-center text-xs text-white/70">
          Valencia Pickle Club &mdash; Keep the courts moving
        </footer>
      </body>
    </html>
  );
}
