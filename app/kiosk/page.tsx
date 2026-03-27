'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadOpenPlay, loadPlayers, saveOpenPlay } from '../lib/storage';
import type { OpenPlaySession, PlayerProfile, QueuedPlayer } from '../lib/types';
import { SKILL_LABELS } from '../lib/types';

const PAGE_SIZE = 12;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-pb-green text-white font-bold px-8 py-4 rounded-2xl shadow-2xl text-xl">
      ✓ {message}
    </div>
  );
}

const SKILL_COLORS: Record<string, string> = {
  '2.0': 'text-zinc-400',
  '2.5': 'text-blue-500',
  '3.0': 'text-green-600',
  '3.5': 'text-teal-600',
  '4.0': 'text-yellow-600',
  '4.5': 'text-orange-500',
  '5.0': 'text-red-500',
};

export default function KioskPage() {
  const [players, setPlayers] = useState<PlayerProfile[] | null>(null);
  const [session, setSession] = useState<OpenPlaySession | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [skillFilter, setSkillFilter] = useState<string>('all');

  useEffect(() => {
    setPlayers(loadPlayers());
    setSession(loadOpenPlay());
    // Auto-refresh session every 5s so status stays current
    const id = setInterval(() => setSession(loadOpenPlay()), 5000);
    return () => clearInterval(id);
  }, []);

  if (players === null || session === null) {
    return (
      <div className="min-h-screen bg-pb-bg flex items-center justify-center text-pb-text/40 text-2xl">
        Loading…
      </div>
    );
  }

  const queueNames = new Set(session.queue.map((p) => p.name.toLowerCase()));
  const courtNames = new Set(
    session.courts.flatMap((c) => c.game?.players.map((p) => p.name.toLowerCase()) ?? [])
  );

  function handleCheckIn(player: PlayerProfile) {
    const fresh = loadOpenPlay();
    const alreadyQueued = fresh.queue.some((p) => p.name.toLowerCase() === player.name.toLowerCase());
    const onCourt = fresh.courts.some((c) =>
      c.game?.players.some((p) => p.name.toLowerCase() === player.name.toLowerCase())
    );
    if (alreadyQueued || onCourt) return;

    const queued: QueuedPlayer = {
      id: uid(),
      name: player.name,
      skillLevel: player.skillLevel,
      queuedAt: Date.now(),
      gamesPlayed: 0,
    };
    const updated: OpenPlaySession = { ...fresh, queue: [...fresh.queue, queued] };
    saveOpenPlay(updated);
    setSession(updated);
    setToast(`${player.name} checked in!`);
  }

  // Filter + sort
  const filtered = players
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => skillFilter === 'all' || p.skillLevel === skillFilter)
    .sort((a, b) => a.name.localeCompare(b.name));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Reset to page 0 when search/filter changes
  function handleSearch(v: string) { setSearch(v); setPage(0); }
  function handleFilter(v: string) { setSkillFilter(v); setPage(0); }

  const activeCourts = session.courts.filter((c) => c.game !== null).length;
  const queueCount = session.queue.length;

  // Unique skill levels present in the roster
  const presentSkills = Array.from(new Set(players.map((p) => p.skillLevel))).sort();

  return (
    <div className="min-h-screen bg-pb-bg text-pb-text flex flex-col">

      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 bg-pb-green border-b border-pb-green/80 shrink-0">
        <Link href="/open-play" className="text-white/70 hover:text-white transition-colors font-semibold text-lg flex items-center gap-2">
          ← Back
        </Link>
        <span className="text-xl font-bold text-white tracking-tight">PickleStack</span>
        <div className="flex items-center gap-6 text-right">
          <div>
            <div className="text-2xl font-bold text-white">{activeCourts}</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wide">Courts active</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{queueCount}</div>
            <div className="text-[11px] text-white/50 uppercase tracking-wide">In queue</div>
          </div>
        </div>
      </header>

      {/* Title */}
      <div className="text-center pt-6 pb-4 px-4">
        <h1 className="text-3xl font-bold text-pb-text">Tap your name to check in</h1>
        <p className="text-pb-text/50 text-base mt-1">Join the open play queue</p>
      </div>

      {/* Search + filter bar */}
      <div className="px-4 pb-4 max-w-5xl mx-auto w-full flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-pb-text/30 text-lg">🔍</span>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name…"
            className="w-full bg-white border border-pb-border text-pb-text placeholder-pb-text/30 rounded-2xl pl-11 pr-5 py-4 text-lg focus:outline-none focus:ring-2 focus:ring-pb-green"
          />
          {search && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-pb-text/30 hover:text-pb-text text-xl"
            >
              ×
            </button>
          )}
        </div>

        {/* Skill filter */}
        <select
          value={skillFilter}
          onChange={(e) => handleFilter(e.target.value)}
          className="bg-white border border-pb-border text-pb-text rounded-2xl px-4 py-4 text-base focus:outline-none focus:ring-2 focus:ring-pb-green"
        >
          <option value="all">All levels</option>
          {presentSkills.map((s) => (
            <option key={s} value={s}>{SKILL_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {/* No players prompt */}
      {players.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
          <p className="text-pb-text/50 text-xl">No players registered yet.</p>
          <Link href="/players" className="bg-pb-green hover:bg-pb-green/80 text-white font-bold px-6 py-3 rounded-2xl text-lg transition-colors">
            Add Players →
          </Link>
        </div>
      )}

      {/* Player grid */}
      {players.length > 0 && (
        <div className="flex-1 flex flex-col px-4 max-w-5xl mx-auto w-full">

          {/* Results count */}
          <div className="flex items-center justify-between mb-3 text-sm text-pb-text/50">
            <span>{filtered.length} player{filtered.length !== 1 ? 's' : ''}{skillFilter !== 'all' ? ` · ${SKILL_LABELS[skillFilter as keyof typeof SKILL_LABELS]}` : ''}</span>
            {filtered.length > 0 && (
              <span>Page {safePage + 1} of {totalPages}</span>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-16 text-pb-text/30 text-xl">No players match your search.</div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {paginated.map((player) => {
                const nameLower = player.name.toLowerCase();
                const inQueue = queueNames.has(nameLower);
                const onCourt = courtNames.has(nameLower);
                const disabled = inQueue || onCourt;
                const skillColor = SKILL_COLORS[player.skillLevel] ?? 'text-zinc-400';

                return (
                  <button
                    key={player.id}
                    onClick={() => handleCheckIn(player)}
                    disabled={disabled}
                    className={`
                      relative flex flex-col items-center justify-center gap-1.5
                      rounded-2xl border-2 px-3 py-5 min-h-[90px]
                      text-center transition-all active:scale-95 select-none
                      ${inQueue
                        ? 'border-pb-green bg-pb-green/10 cursor-default'
                        : onCourt
                        ? 'border-pb-border bg-pb-bg opacity-50 cursor-default'
                        : 'border-pb-border bg-white hover:border-pb-green hover:bg-pb-green/5 cursor-pointer'
                      }
                    `}
                  >
                    {/* Status badge */}
                    {inQueue && (
                      <span className="absolute top-2 right-2 text-[10px] bg-pb-green text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                        Queued
                      </span>
                    )}
                    {onCourt && (
                      <span className="absolute top-2 right-2 text-[10px] bg-pb-text/20 text-pb-text px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wide">
                        Playing
                      </span>
                    )}

                    {/* Avatar initial */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold mb-0.5
                      ${inQueue ? 'bg-pb-green/20 text-pb-green' : onCourt ? 'bg-pb-border text-pb-text/40' : 'bg-pb-green text-white'}
                    `}>
                      {player.name.charAt(0).toUpperCase()}
                    </div>

                    <span className="font-bold text-base leading-tight text-pb-text">{player.name}</span>
                    <span className={`text-xs font-semibold ${skillColor}`}>
                      {player.skillLevel}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 py-6 mt-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-5 py-2.5 bg-white border border-pb-border hover:bg-pb-bg disabled:opacity-30 rounded-xl text-sm font-semibold transition-colors text-pb-text"
              >
                ← Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition-colors ${
                      i === safePage
                        ? 'bg-pb-green text-white'
                        : 'bg-white border border-pb-border hover:bg-pb-bg text-pb-text/50'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage === totalPages - 1}
                className="px-5 py-2.5 bg-white border border-pb-border hover:bg-pb-bg disabled:opacity-30 rounded-xl text-sm font-semibold transition-colors text-pb-text"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
