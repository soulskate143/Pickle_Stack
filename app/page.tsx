'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// ─── Install banner ───────────────────────────────────────────────────────────

function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => void } | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showIOSSteps, setShowIOSSteps] = useState(false);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }
    // Dismissed before
    if (localStorage.getItem('pwa-banner-dismissed') === '1') {
      setDismissed(true);
      return;
    }
    // iOS detection
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window.navigator as unknown as { standalone?: boolean }).standalone;
    setIsIOS(ios);

    // Android/Chrome install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt: () => void });
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    localStorage.setItem('pwa-banner-dismissed', '1');
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    setDeferredPrompt(null);
    setDismissed(true);
  }

  if (isInstalled || dismissed) return null;
  if (!deferredPrompt && !isIOS) return null;

  return (
    <div className="w-full bg-pb-green/10 border border-pb-green/30 rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📲</span>
          <div>
            <p className="font-bold text-pb-green text-sm">Install PickleStack on your device</p>
            <p className="text-xs text-pb-text/60 mt-0.5">
              Works offline — no internet needed after the first visit.
            </p>
          </div>
        </div>
        <button onClick={dismiss} className="text-pb-text/30 hover:text-pb-text text-xl leading-none shrink-0">×</button>
      </div>

      {/* Android/Chrome — one-tap install */}
      {deferredPrompt && (
        <button
          onClick={install}
          className="w-full bg-pb-green hover:bg-pb-green/80 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors"
        >
          + Add to Home Screen
        </button>
      )}

      {/* iOS — manual steps */}
      {isIOS && (
        <div>
          <button
            onClick={() => setShowIOSSteps((v) => !v)}
            className="w-full border border-pb-green/40 text-pb-green font-semibold py-2.5 rounded-xl text-sm transition-colors hover:bg-pb-green/10"
          >
            {showIOSSteps ? 'Hide steps ▲' : 'How to install on iPhone / iPad ▼'}
          </button>
          {showIOSSteps && (
            <ol className="mt-3 flex flex-col gap-2 text-sm text-pb-text/70">
              <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-pb-green text-white text-xs font-bold flex items-center justify-center mt-0.5">1</span>Tap the <strong>Share</strong> button <span className="text-lg leading-none">⎙</span> at the bottom of Safari</li>
              <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-pb-green text-white text-xs font-bold flex items-center justify-center mt-0.5">2</span>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
              <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full bg-pb-green text-white text-xs font-bold flex items-center justify-center mt-0.5">3</span>Tap <strong>Add</strong> — PickleStack will appear on your home screen</li>
            </ol>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Guide content ────────────────────────────────────────────────────────────

const GUIDES = {
  'open-play': {
    title: 'Open Play — How it works',
    icon: '🎾',
    steps: [
      {
        label: 'Add players to the roster',
        detail: 'Go to Player Profiles first and register everyone who plays at your club with their skill level.',
      },
      {
        label: 'Set your court count',
        detail: 'Use the − / + buttons at the top of Open Play to match the number of courts available that day.',
      },
      {
        label: 'Check players in',
        detail: 'Add players manually in the Queue sidebar, pick from Roster, or let players self-check-in via the Kiosk page.',
      },
      {
        label: 'Auto-assign courts',
        detail: 'Hit ⚡ Auto-Assign and the system fills open courts from the queue — FIFO or skill-matched, your choice.',
      },
      {
        label: 'End a game',
        detail: 'Tap "Done → Re-queue" to send players back to the bottom of the queue, or "Done → Leave" if they\'re done for the day.',
      },
      {
        label: 'Use the On Deck panel',
        detail: 'The On Deck panel shows the next 8 players. Hover a name and click ↓ to skip or replace a player who needs to sit out.',
      },
    ],
  },
  tournaments: {
    title: 'Tournaments — How it works',
    icon: '🏆',
    steps: [
      {
        label: 'Create a tournament',
        detail: 'Click "+ New Tournament", enter a name, date, location, format (Round Robin or Single Elimination), and match type (Singles or Doubles).',
      },
      {
        label: 'Add players',
        detail: 'Inside the tournament, add players one by one or use "Import from Roster" to pull from your saved player profiles.',
      },
      {
        label: 'Create teams (Doubles only)',
        detail: 'Select two players from the dropdown to form a team. The team name is auto-filled but you can rename it.',
      },
      {
        label: 'Generate the schedule',
        detail: 'Click ⚡ Generate Schedule. The system creates all matches automatically — round-robin pools or elimination bracket.',
      },
      {
        label: 'Start the tournament',
        detail: 'Click "Start Tournament" to activate it. Matches become clickable so you can enter scores.',
      },
      {
        label: 'Enter scores & track standings',
        detail: 'Click any match to record the score. Standings update live. For elimination, winners auto-advance to the next round.',
      },
    ],
  },
  players: {
    title: 'Player Profiles — How it works',
    icon: '👤',
    steps: [
      {
        label: 'Add a player',
        detail: 'Enter a name and select a skill level (2.0 Beginner → 5.0 Elite), then click "+ Add Player".',
      },
      {
        label: 'Skill levels explained',
        detail: '2.0 = Beginner, 2.5 = Advanced Beginner, 3.0 = Intermediate, 3.5 = Adv. Intermediate, 4.0 = Advanced, 4.5 = Expert, 5.0 = Elite.',
      },
      {
        label: 'Edit a skill level',
        detail: 'Click "Edit" on any player row to update their skill level inline — no page reload needed.',
      },
      {
        label: 'Used across the app',
        detail: 'Registered players appear in the Kiosk for self check-in and in Open Play\'s "Pick from Roster" section.',
      },
      {
        label: 'Import into tournaments',
        detail: 'When setting up a tournament, use "Import from Roster" to quickly add your registered players without re-typing names.',
      },
    ],
  },
  kiosk: {
    title: 'Check-in Kiosk — How it works',
    icon: '📲',
    steps: [
      {
        label: 'Set up a shared device',
        detail: 'Open the Kiosk page on a tablet or laptop placed at your court entrance. The nav header is hidden for a clean full-screen look.',
      },
      {
        label: 'Players tap their name',
        detail: 'Players find their name on the grid and tap it to instantly join the Open Play queue.',
      },
      {
        label: 'Status is shown in real time',
        detail: '"Queued" badge (green) = waiting in queue. "Playing" badge (grey) = currently on a court. Both states disable the button.',
      },
      {
        label: 'Auto-refreshes every 5 seconds',
        detail: 'The kiosk polls for session changes automatically so statuses stay current without anyone refreshing manually.',
      },
      {
        label: 'Manage from Open Play',
        detail: 'While players self-check-in on the kiosk, you manage court assignments from the Open Play page on your own device.',
      },
    ],
  },
} as const;

type GuideKey = keyof typeof GUIDES;

// ─── Guide modal ──────────────────────────────────────────────────────────────

function GuideModal({ guideKey, onClose }: { guideKey: GuideKey; onClose: () => void }) {
  const guide = GUIDES[guideKey];
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <span className="text-3xl">{guide.icon}</span>
          <h2 className="text-lg font-bold text-pb-green">{guide.title}</h2>
        </div>

        <ol className="flex flex-col gap-4">
          {guide.steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-pb-green text-white text-xs font-bold flex items-center justify-center mt-0.5">
                {i + 1}
              </span>
              <div>
                <p className="font-semibold text-sm text-pb-text">{step.label}</p>
                <p className="text-sm text-pb-text/60 mt-0.5">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-pb-green hover:bg-pb-green/80 text-white font-semibold py-2 rounded-xl text-sm transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  href,
  icon,
  title,
  description,
  features,
  actionLabel,
  guideKey,
  onGuide,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  features?: string[];
  actionLabel: string;
  guideKey: GuideKey;
  onGuide: (key: GuideKey) => void;
}) {
  return (
    <div className="group bg-pb-card border border-pb-border rounded-2xl p-8 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-pb-green transition-all">
      <div className="text-4xl">{icon}</div>
      <div>
        <h2 className="text-xl font-bold text-pb-green">{title}</h2>
        <p className="text-sm text-pb-text/60 mt-1">{description}</p>
      </div>
      {features && (
        <ul className="text-sm text-pb-text/70 space-y-1 mt-auto">
          {features.map((f) => <li key={f}>✓ {f}</li>)}
        </ul>
      )}
      <div className="mt-2 flex items-center gap-3">
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm font-semibold text-pb-green hover:gap-2 transition-all"
        >
          {actionLabel} →
        </Link>
        <button
          onClick={() => onGuide(guideKey)}
          className="text-sm font-medium text-pb-text/40 hover:text-pb-green border border-pb-border hover:border-pb-green/50 rounded-lg px-3 py-1 transition-colors"
        >
          Guide
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [activeGuide, setActiveGuide] = useState<GuideKey | null>(null);

  return (
    <div className="max-w-4xl mx-auto px-4 py-16 flex flex-col items-center gap-12">
      {/* Hero */}
      <div className="text-center">
        <h1 className="text-5xl font-bold text-pb-green mb-4">PickleStack</h1>
        <p className="text-lg text-pb-text/70 max-w-md mx-auto">
          Automated court stacking for open play &amp; full tournament management — so your stack
          master can actually play.
        </p>
      </div>

      <InstallBanner />

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
        <FeatureCard
          href="/open-play"
          icon="🎾"
          title="Open Play"
          description="Players join the queue, courts are filled automatically. No more paddle rack chaos."
          features={['FIFO & skill-matched stacking', 'Live court timers', 'One-tap game end & re-queue']}
          actionLabel="Open the stack"
          guideKey="open-play"
          onGuide={setActiveGuide}
        />
        <FeatureCard
          href="/tournament"
          icon="🏆"
          title="Tournaments"
          description="Run singles or doubles tournaments with round-robin or elimination formats."
          features={['Round-robin & single-elimination', 'Auto-generated brackets & schedules', 'Live standings & score entry']}
          actionLabel="Manage tournaments"
          guideKey="tournaments"
          onGuide={setActiveGuide}
        />
        <FeatureCard
          href="/players"
          icon="👤"
          title="Player Profiles"
          description="Manage your club roster and skill ratings. Check in players instantly."
          actionLabel="Manage roster"
          guideKey="players"
          onGuide={setActiveGuide}
        />
        <FeatureCard
          href="/kiosk"
          icon="📲"
          title="Check-in Kiosk"
          description="Tablet-friendly self check-in. Players tap their name to join the queue."
          actionLabel="Open kiosk"
          guideKey="kiosk"
          onGuide={setActiveGuide}
        />
      </div>

      {activeGuide && (
        <GuideModal guideKey={activeGuide} onClose={() => setActiveGuide(null)} />
      )}
    </div>
  );
}
