'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadOpenPlay, saveOpenPlay } from '../../lib/storage';
import { autoAssign, endGame, pickPlayers } from '../../lib/stacking';
import type { OpenPlaySession } from '../../lib/types';

const ALERT_MINS = 20;

// ─── Grid layout config ───────────────────────────────────────────────────────
interface GridConfig {
  templateCols: string;
  templateRows: string;
  spans: number[]; // column span per court index
}

function getGridConfig(total: number): GridConfig {
  const fill = (n: number) => Array(n).fill(1);
  if (total === 1) return { templateCols: '1fr',                    templateRows: '1fr',              spans: [1] };
  if (total === 2) return { templateCols: 'repeat(2, 1fr)',         templateRows: '1fr',              spans: fill(2) };
  if (total === 3) return { templateCols: 'repeat(3, 1fr)',         templateRows: '1fr',              spans: fill(3) };
  if (total === 4) return { templateCols: 'repeat(2, 1fr)',         templateRows: 'repeat(2, 1fr)',   spans: fill(4) };
  // 5 courts → 3 top + 2 bottom (each bottom spans 1.5 of 6 virtual cols)
  if (total === 5) return { templateCols: 'repeat(6, 1fr)',         templateRows: 'repeat(2, 1fr)',   spans: [2, 2, 2, 3, 3] };
  if (total === 6) return { templateCols: 'repeat(3, 1fr)',         templateRows: 'repeat(2, 1fr)',   spans: fill(6) };
  // 7 courts → 4 top + 3 bottom (12 virtual cols)
  if (total === 7) return { templateCols: 'repeat(12, 1fr)',        templateRows: 'repeat(2, 1fr)',   spans: [3, 3, 3, 3, 4, 4, 4] };
  if (total === 8) return { templateCols: 'repeat(4, 1fr)',         templateRows: 'repeat(2, 1fr)',   spans: fill(8) };
  if (total === 9) return { templateCols: 'repeat(3, 1fr)',         templateRows: 'repeat(3, 1fr)',   spans: fill(9) };
  if (total === 10) return { templateCols: 'repeat(5, 1fr)',        templateRows: 'repeat(2, 1fr)',   spans: fill(10) };
  if (total === 12) return { templateCols: 'repeat(4, 1fr)',        templateRows: 'repeat(3, 1fr)',   spans: fill(12) };
  // fallback: 4 cols, last-row orphan spans to fill
  const cols = 4;
  const rows = Math.ceil(total / cols);
  const orphans = total % cols;
  const spans = fill(total);
  if (orphans > 0) {
    const span = Math.floor(cols / orphans);
    for (let i = total - orphans; i < total; i++) spans[i] = span;
  }
  return { templateCols: `repeat(${cols}, 1fr)`, templateRows: `repeat(${rows}, 1fr)`, spans };
}

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function elapsed(startTime: number): string {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}


function gamesLabel(n: number) {
  if (n === 0) return { text: 'NEW', cls: 'text-emerald-400' };
  return { text: `${n} game${n === 1 ? '' : 's'}`, cls: 'text-zinc-500' };
}

function computeDeck(s: OpenPlaySession) {
  const pair1 = pickPlayers(s.queue, s.stackingMode) ?? [];
  const afterPair1 = s.queue.filter((p) => !pair1.some((q) => q.id === p.id));
  const pair2 = pickPlayers(afterPair1, s.stackingMode) ?? [];
  return { pair1, pair2 };
}

export default function OpenPlayTVPage() {
  const now = useNow();
  const [session, setSession] = useState<OpenPlaySession | null>(null);
  const [deck, setDeck] = useState<{ pair1: ReturnType<typeof pickPlayers>; pair2: ReturnType<typeof pickPlayers> }>({ pair1: [], pair2: [] });
  const [flashCourt, setFlashCourt] = useState<number | null>(null);

  useEffect(() => {
    const s = loadOpenPlay();
    if (s) { setSession(s); setDeck(computeDeck(s)); }
    // Poll only updates session (timers/courts), not the locked deck
    const id = setInterval(() => setSession(loadOpenPlay()), 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const digit = parseInt(e.key);
      if (isNaN(digit) || digit < 1) return;
      const current = loadOpenPlay();
      if (!current) return;
      const court = current.courts.find((c) => c.id === digit);
      if (!court || court.game === null) return;
      let next = endGame(current, digit, true);
      next = autoAssign(next);
      saveOpenPlay(next);
      setSession(next);
      setDeck(computeDeck(next)); // recompute deck only on game end
      setFlashCourt(digit);
      setTimeout(() => setFlashCourt(null), 800);
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);


  if (!session || !now) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-3xl tracking-widest">
        LOADING…
      </div>
    );
  }

  const timeStr = now.toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const activeCourts = session.courts.filter((c) => c.game !== null).length;
  const queueCount = session.queue.length;
  const nextPair1 = deck.pair1 ?? [];
  const nextPair2 = deck.pair2 ?? [];

  const courtCount = session.courts.length;
  const grid = getGridConfig(courtCount);

  // Scale court content based on how many courts are shown
  const tier = courtCount === 1 ? 4 : courtCount === 2 ? 3 : courtCount <= 4 ? 2 : 1;
  const sz = {
    body:      tier >= 3 ? 'px-8 py-8 gap-8'   : tier === 2 ? 'px-5 py-4 gap-3' : 'px-5 py-3 gap-2',
    name:      tier === 4 ? 'text-5xl' : tier === 3 ? 'text-4xl' : tier === 2 ? 'text-2xl' : 'text-xl',
    games:     tier >= 3 ? 'text-lg'  : 'text-xs',
    teamLabel: tier >= 3 ? 'text-sm'  : 'text-[10px]',
    dot:       tier >= 3 ? 'w-3 h-3'  : 'w-2 h-2',
    pl:        tier >= 3 ? 'pl-5'     : 'pl-3.5',
    vs:        tier >= 3 ? 'text-base': 'text-xs',
    header:    tier >= 3 ? 'text-3xl' : 'text-xl',
    timer:     tier >= 3 ? 'text-3xl' : 'text-xl',
    open:      tier >= 3 ? 'text-6xl' : 'text-3xl',
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── TOP BAR ── */}
      <header className="shrink-0 flex items-center justify-between px-8 py-0 bg-gradient-to-r from-emerald-900 to-emerald-800 border-b border-emerald-700/50" style={{ minHeight: 80 }}>
        {/* Brand */}
        <div className="flex flex-col">
          <span className="text-2xl font-black tracking-tight text-white">PickleStack</span>
          <span className="text-xs font-bold uppercase tracking-[0.25em] text-emerald-400 mt-0.5">Open Play</span>
        </div>

        {/* Clock */}
        <div className="text-center">
          <div className="text-5xl font-black font-mono tabular-nums tracking-tight text-white leading-none">
            {timeStr}
          </div>
          <div className="text-sm text-emerald-300/70 mt-1 font-medium">{dateStr}</div>
        </div>

        {/* Stats */}
        <div className="flex gap-10">
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums leading-none">
              {activeCourts}
              <span className="text-emerald-600 text-2xl">/{session.courtCount}</span>
            </div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400/70 mt-1">Courts Active</div>
          </div>
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums leading-none">{queueCount}</div>
            <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400/70 mt-1">In Queue</div>
          </div>
        </div>
      </header>

      {/* ── BODY ── */}
      <div className="flex-1 flex min-h-0">

        {/* Courts grid */}
        <div className="flex-1 p-5 min-w-0">
          <div
            className="grid gap-4 h-full"
            style={{
              gridTemplateColumns: grid.templateCols,
              gridTemplateRows: grid.templateRows,
            }}
          >
            {session.courts.map((court, idx) => {
              const playing = court.game !== null;
              const players = court.game?.players ?? [];
              const teamA = players.slice(0, 2);
              const teamB = players.slice(2, 4);
              const gameMs = playing ? Date.now() - court.game!.startTime : 0;
              const isOvertime = playing && gameMs > ALERT_MINS * 60000;
              const isFlashing = flashCourt === court.id;

              return (
                <div
                  key={court.id}
                  style={grid.spans[idx] > 1 ? { gridColumn: `span ${grid.spans[idx]}` } : undefined}
                  className={`rounded-2xl flex flex-col overflow-hidden border-2 transition-colors duration-150 ${
                    isFlashing
                      ? 'border-white bg-white/10'
                      : playing
                        ? isOvertime
                          ? 'border-orange-500 bg-zinc-900'
                          : 'border-emerald-500 bg-zinc-900'
                        : 'border-zinc-700 bg-zinc-900/60'
                  }`}
                >
                  {/* Court header */}
                  <div
                    className={`shrink-0 flex items-center justify-between px-5 py-3 ${
                      playing
                        ? isOvertime
                          ? 'bg-orange-600'
                          : 'bg-emerald-700'
                        : 'bg-zinc-800'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`font-black ${sz.header} uppercase tracking-[0.2em] text-white`}>
                        Court {court.id}
                      </span>
                      {playing && court.id <= 9 && (
                        <span className="text-[10px] font-black bg-white/20 text-white/60 rounded px-1 py-0.5 leading-none">
                          {court.id}
                        </span>
                      )}
                    </div>
                    {playing && (
                      <span className={`font-mono ${sz.timer} font-bold tabular-nums text-white ${isOvertime ? 'animate-pulse' : ''}`}>
                        ⏱ {elapsed(court.game!.startTime)}{isOvertime ? ' ⚠️' : ''}
                      </span>
                    )}
                    {!playing && (
                      <span className="text-zinc-500 text-sm font-semibold uppercase tracking-widest">Available</span>
                    )}
                  </div>

                  {/* Court body */}
                  {playing ? (
                    <div className={`flex-1 flex flex-col justify-center min-h-0 overflow-hidden ${sz.body}`}>

                      {/* Team A */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`${sz.dot} rounded-full bg-orange-500 shrink-0`} />
                          <span className={`${sz.teamLabel} font-bold uppercase tracking-[0.2em] text-orange-400`}>Team A</span>
                        </div>
                        <div className={`flex flex-col ${sz.pl}`}>
                          {teamA.map((p) => {
                            const g = gamesLabel(p.gamesPlayed ?? 0);
                            return (
                              <div key={p.id} className="flex items-baseline gap-2">
                                <span className={`${sz.name} font-black text-white leading-snug`}>{p.name}</span>
                                <span className={`${sz.games} font-bold ${g.cls}`}>{g.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* VS divider */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-zinc-700" />
                        <span className={`text-zinc-600 ${sz.vs} font-black tracking-[0.3em]`}>VS</span>
                        <div className="flex-1 h-px bg-zinc-700" />
                      </div>

                      {/* Team B */}
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`${sz.dot} rounded-full bg-cyan-400 shrink-0`} />
                          <span className={`${sz.teamLabel} font-bold uppercase tracking-[0.2em] text-cyan-400`}>Team B</span>
                        </div>
                        <div className={`flex flex-col ${sz.pl}`}>
                          {teamB.map((p) => {
                            const g = gamesLabel(p.gamesPlayed ?? 0);
                            return (
                              <div key={p.id} className="flex items-baseline gap-2">
                                <span className={`${sz.name} font-black text-white leading-snug`}>{p.name}</span>
                                <span className={`${sz.games} font-bold ${g.cls}`}>{g.text}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center">
                      <span className={`text-zinc-700 ${sz.open} font-black uppercase tracking-[0.4em]`}>OPEN</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── SIDEBAR ── */}
        <div className="w-80 xl:w-96 shrink-0 border-l border-zinc-800 flex flex-col bg-zinc-950">

          {/* On Deck */}
          <div className="flex-1 flex flex-col p-6 border-b border-zinc-800 min-h-0 overflow-hidden">
            <div className="flex items-center gap-2 mb-5">
              <span className="w-1.5 h-4 rounded-full bg-emerald-500" />
              <span className="text-xs font-black uppercase tracking-[0.25em] text-emerald-400">On Deck</span>
            </div>

            {nextPair1.length > 0 ? (
              <div className="space-y-4 flex-1">

                {/* Up Next */}
                <div className="rounded-xl border border-emerald-600/40 bg-emerald-950/60 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Up Next</span>
                  </div>
                  <div className="space-y-2.5">
                    {nextPair1.map((p, i) => {
                      const g = gamesLabel(p.gamesPlayed ?? 0);
                      return (
                        <div key={p.id} className="flex items-center gap-3">
                          <span className="text-zinc-600 text-sm tabular-nums w-5 shrink-0">{i + 1}.</span>
                          <span className="text-white font-bold text-lg flex-1">{p.name}</span>
                          <span className={`text-xs font-bold shrink-0 ${g.cls}`}>{g.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Standby */}
                {nextPair2.length > 0 && (
                  <div className="rounded-xl border border-yellow-600/30 bg-yellow-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-2 h-2 rounded-full bg-yellow-500" />
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-yellow-500">Standby</span>
                    </div>
                    <div className="space-y-2.5">
                      {nextPair2.map((p, i) => {
                        const g = gamesLabel(p.gamesPlayed ?? 0);
                        return (
                          <div key={p.id} className="flex items-center gap-3">
                            <span className="text-zinc-600 text-sm tabular-nums w-5 shrink-0">{i + 5}.</span>
                            <span className="text-white font-bold text-lg flex-1">{p.name}</span>
                            <span className={`text-xs font-bold shrink-0 ${g.cls}`}>{g.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-zinc-700 text-base font-semibold">
                No players in queue
              </div>
            )}
          </div>

          {/* Queue count */}
          <div className="shrink-0 p-6">
            <div className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-600 mb-3">Queue</div>
            <div className="flex items-end gap-3 leading-none">
              <span className="text-7xl font-black tabular-nums text-white">{queueCount}</span>
              <span className="text-zinc-500 text-base pb-2">
                player{queueCount !== 1 ? 's' : ''}<br />waiting
              </span>
            </div>
            {queueCount > 8 && (
              <div className="text-zinc-700 text-sm mt-2">
                +{queueCount - 8} more after standby
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Subtle operator link */}
      <Link
        href="/open-play"
        className="fixed bottom-3 right-4 text-white/10 hover:text-white/40 text-xs transition-colors"
      >
        ← Operator
      </Link>
    </div>
  );
}
