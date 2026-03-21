import Link from 'next/link';

export default function HomePage() {
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

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
        <Link
          href="/open-play"
          className="group bg-pb-card border border-pb-border rounded-2xl p-8 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-pb-green transition-all"
        >
          <div className="text-4xl">🎾</div>
          <div>
            <h2 className="text-xl font-bold text-pb-green group-hover:text-pb-green-light transition-colors">
              Open Play
            </h2>
            <p className="text-sm text-pb-text/60 mt-1">
              Players join the queue, courts are filled automatically. No more paddle rack chaos.
            </p>
          </div>
          <ul className="text-sm text-pb-text/70 space-y-1 mt-auto">
            <li>✓ FIFO &amp; skill-matched stacking</li>
            <li>✓ Live court timers</li>
            <li>✓ One-tap game end &amp; re-queue</li>
          </ul>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pb-green group-hover:gap-2 transition-all">
            Open the stack →
          </span>
        </Link>

        <Link
          href="/tournament"
          className="group bg-pb-card border border-pb-border rounded-2xl p-8 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-pb-green transition-all"
        >
          <div className="text-4xl">🏆</div>
          <div>
            <h2 className="text-xl font-bold text-pb-green group-hover:text-pb-green-light transition-colors">
              Tournaments
            </h2>
            <p className="text-sm text-pb-text/60 mt-1">
              Run singles or doubles tournaments with round-robin or elimination formats.
            </p>
          </div>
          <ul className="text-sm text-pb-text/70 space-y-1 mt-auto">
            <li>✓ Round-robin &amp; single-elimination</li>
            <li>✓ Auto-generated brackets &amp; schedules</li>
            <li>✓ Live standings &amp; score entry</li>
          </ul>
          <span className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-pb-green group-hover:gap-2 transition-all">
            Manage tournaments →
          </span>
        </Link>
        <Link
          href="/players"
          className="group bg-pb-card border border-pb-border rounded-2xl p-8 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-pb-green transition-all"
        >
          <div className="text-4xl">👤</div>
          <div>
            <h2 className="text-xl font-bold text-pb-green group-hover:text-pb-green-light transition-colors">
              Player Profiles
            </h2>
            <p className="text-sm text-pb-text/60 mt-1">
              Manage your club roster and skill ratings. Check in players instantly.
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-pb-green group-hover:gap-2 transition-all">
            Manage roster →
          </span>
        </Link>

        <Link
          href="/kiosk"
          className="group bg-pb-card border border-pb-border rounded-2xl p-8 flex flex-col gap-4 shadow-sm hover:shadow-md hover:border-pb-green transition-all"
        >
          <div className="text-4xl">📲</div>
          <div>
            <h2 className="text-xl font-bold text-pb-green group-hover:text-pb-green-light transition-colors">
              Check-in Kiosk
            </h2>
            <p className="text-sm text-pb-text/60 mt-1">
              Tablet-friendly self check-in. Players tap their name to join the queue.
            </p>
          </div>
          <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-pb-green group-hover:gap-2 transition-all">
            Open kiosk →
          </span>
        </Link>
      </div>
    </div>
  );
}
