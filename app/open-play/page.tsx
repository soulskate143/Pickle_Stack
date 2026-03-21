'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { loadOpenPlay, loadPlayers, saveOpenPlay } from '../lib/storage';
import { autoAssign, endGame, setCourtCount } from '../lib/stacking';
import type { OpenPlaySession, PlayerProfile, QueuedPlayer, SkillLevel, StackingMode } from '../lib/types';
import { SKILL_LABELS, SKILL_LEVELS } from '../lib/types';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function elapsed(startTime: number): string {
  const secs = Math.floor((Date.now() - startTime) / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Pickleball court SVG ─────────────────────────────────────────────────────

const FOUR_PLAYER_POSITIONS = [
  { x: 65, y: 38 },   // Team A, top
  { x: 65, y: 122 },  // Team A, bottom
  { x: 235, y: 38 },  // Team B, top
  { x: 235, y: 122 }, // Team B, bottom
];

const TWO_PLAYER_POSITIONS = [
  { x: 80, y: 80 },
  { x: 220, y: 80 },
];

function getPlayerPositions(count: number) {
  if (count === 2) return TWO_PLAYER_POSITIONS;
  if (count === 3) return FOUR_PLAYER_POSITIONS.slice(0, 3);
  return FOUR_PLAYER_POSITIONS;
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

function PickleballCourt({
  court,
  onEndGame,
  tick,
}: {
  court: OpenPlaySession['courts'][number];
  onEndGame: (courtId: number, requeue: boolean) => void;
  tick: number;
}) {
  const playing = court.game !== null;
  const players = court.game?.players ?? [];
  const positions = getPlayerPositions(players.length);

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden transition-all ${
        playing
          ? 'border-pb-green shadow-md shadow-pb-green/10'
          : 'border-pb-border opacity-70'
      }`}
    >
      {/* Court header */}
      <div className="flex items-center justify-between px-3 py-2 bg-pb-card border-b border-pb-border">
        <span className="font-bold text-pb-green text-sm uppercase tracking-wide">
          Court {court.id}
        </span>
        {playing && (
          <span className="text-xs font-mono bg-pb-green text-white px-2 py-0.5 rounded-full">
            {elapsed(court.game!.startTime)}
          </span>
        )}
        {!playing && (
          <span className="text-xs text-pb-text/40 italic">Available</span>
        )}
      </div>

      {/* SVG court */}
      <svg viewBox="0 0 300 160" className="w-full" style={{ display: 'block' }}>
        {/* Court background */}
        <rect x={10} y={8} width={280} height={144} fill="#1e3a5f" rx={3} />

        {/* Kitchen/NVZ areas */}
        <rect x={10} y={8} width={96} height={144} fill="#163a2a" />
        <rect x={194} y={8} width={96} height={144} fill="#163a2a" />

        {/* Net shadow rect */}
        <rect x={148} y={8} width={4} height={144} fill="rgba(255,255,255,0.15)" />

        {/* White boundary lines */}
        <rect x={10} y={8} width={280} height={144} fill="none" stroke="white" strokeWidth={1.5} />

        {/* NVZ lines */}
        <line x1={106} y1={8} x2={106} y2={152} stroke="white" strokeWidth={1} />
        <line x1={194} y1={8} x2={194} y2={152} stroke="white" strokeWidth={1} />

        {/* Center service lines */}
        <line x1={10} y1={80} x2={106} y2={80} stroke="white" strokeWidth={1} />
        <line x1={194} y1={80} x2={290} y2={80} stroke="white" strokeWidth={1} />

        {/* Net */}
        <line x1={150} y1={8} x2={150} y2={152} stroke="white" strokeWidth={2.5} />

        {/* Available text when empty */}
        {!playing && (
          <>
            <text
              x={80}
              y={80}
              fontSize={10}
              fill="rgba(255,255,255,0.3)"
              textAnchor="middle"
              dominantBaseline="middle"
              fontWeight="bold"
              letterSpacing={2}
            >
              AVAILABLE
            </text>
            <text
              x={220}
              y={80}
              fontSize={10}
              fill="rgba(255,255,255,0.3)"
              textAnchor="middle"
              dominantBaseline="middle"
              fontWeight="bold"
              letterSpacing={2}
            >
              AVAILABLE
            </text>
          </>
        )}

        {/* Players */}
        {playing &&
          players.map((p, i) => {
            const pos = positions[i];
            if (!pos) return null;
            const isTeamA = i < 2;
            const fill = isTeamA ? '#ea580c' : '#0891b2';
            return (
              <g key={p.id}>
                <circle cx={pos.x} cy={pos.y} r={14} fill={fill} />
                <text
                  x={pos.x}
                  y={pos.y}
                  fontSize={11}
                  fontWeight="bold"
                  fill="white"
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {p.name.charAt(0).toUpperCase()}
                </text>
                <text
                  x={pos.x}
                  y={pos.y + 24}
                  fontSize={8}
                  fill="white"
                  textAnchor="middle"
                >
                  {truncate(p.name, 10)}
                </text>
              </g>
            );
          })}
      </svg>

      {/* Team labels below court */}
      {playing && (
        <div className="flex justify-between px-3 py-1.5 bg-pb-card/80 text-xs border-t border-pb-border">
          <div className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
            <span className="text-pb-text/60">Team A</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-pb-text/60">Team B</span>
            <span className="w-2 h-2 rounded-full bg-cyan-600 inline-block" />
          </div>
        </div>
      )}

      {/* Action buttons */}
      {playing && (
        <div className="flex gap-2 px-3 py-2 bg-pb-card border-t border-pb-border">
          <button
            onClick={() => onEndGame(court.id, true)}
            className="flex-1 text-xs bg-pb-yellow hover:bg-pb-yellow/80 text-pb-text font-semibold py-1.5 rounded-lg transition-colors"
          >
            Done → Re-queue
          </button>
          <button
            onClick={() => onEndGame(court.id, false)}
            className="flex-1 text-xs bg-pb-text/10 hover:bg-pb-text/20 text-pb-text font-semibold py-1.5 rounded-lg transition-colors"
          >
            Done → Leave
          </button>
        </div>
      )}
    </div>
  );
}

// ─── On Deck panel ────────────────────────────────────────────────────────────

function OnDeckPanel({
  queue,
  onReplace,
}: {
  queue: QueuedPlayer[];
  onReplace: (skippedId: string, withId: string | 'auto') => void;
}) {
  const [replacingId, setReplacingId] = useState<string | null>(null);

  if (queue.length === 0) return null;

  const pair1 = queue.slice(0, 4);
  const pair2 = queue.slice(4, 8);
  const replacingPlayer = queue.find((p) => p.id === replacingId) ?? null;
  // All other queued players available as replacements (not just bench)
  const replacementOptions = queue.filter((p) => p.id !== replacingId);

  function handleReplace(withId: string | 'auto') {
    if (!replacingId) return;
    onReplace(replacingId, withId);
    setReplacingId(null);
  }

  function PlayerPill({
    player,
    index,
    bgClass,
    textClass,
  }: {
    player: QueuedPlayer;
    index: number;
    bgClass: string;
    textClass: string;
  }) {
    const isReplacing = replacingId === player.id;
    return (
      <span
        className={`group flex items-center gap-1 text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-full transition-all ${
          isReplacing
            ? 'bg-red-500 text-white ring-2 ring-red-300'
            : `${bgClass} ${textClass}`
        }`}
      >
        <span className="opacity-60">{index}</span>
        {player.name}
        <button
          onClick={() => setReplacingId(isReplacing ? null : player.id)}
          title={isReplacing ? 'Cancel' : 'Replace this player'}
          className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center shrink-0"
        >
          <span className="text-[9px] leading-none">{isReplacing ? '×' : '↓'}</span>
        </button>
      </span>
    );
  }

  return (
    <div className="rounded-xl border-2 border-pb-green bg-pb-green/5 p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm font-bold uppercase tracking-widest text-pb-green">
          🎯 On Deck
        </span>
        <span className="text-xs text-pb-text/50">— hover a name to replace</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Pair 1 — up next */}
        <div className="rounded-lg bg-pb-green/10 border border-pb-green/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-pb-green animate-pulse" />
            <span className="text-xs font-bold text-pb-green uppercase tracking-wide">
              Pair 1 — Up Next
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pair1.map((p, i) => (
              <PlayerPill key={p.id} player={p} index={i + 1} bgClass="bg-pb-green" textClass="text-white" />
            ))}
          </div>
        </div>

        {/* Pair 2 — prepare */}
        {pair2.length > 0 && (
          <div className="rounded-lg bg-pb-yellow/10 border border-pb-yellow/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-pb-yellow" />
              <span className="text-xs font-bold text-pb-text/70 uppercase tracking-wide">
                Pair 2 — Prepare
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pair2.map((p, i) => (
                <PlayerPill key={p.id} player={p} index={i + 5} bgClass="bg-pb-yellow/80" textClass="text-pb-text" />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Replacement picker */}
      {replacingId && replacingPlayer && (
        <div className="mt-3 pt-3 border-t border-pb-green/20">
          <p className="text-xs font-semibold text-pb-text/70 mb-2">
            Replace <span className="text-red-500">{replacingPlayer.name}</span> with:
          </p>
          <div className="flex flex-wrap gap-2">
            {/* Auto option */}
            <button
              onClick={() => handleReplace('auto')}
              className="flex items-center gap-1.5 bg-pb-green text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-pb-green/80 transition-colors"
            >
              ⚡ Auto — next in line
              {replacementOptions[0] && <span className="opacity-70">({replacementOptions[0].name})</span>}
            </button>

            {/* Pick any other queued player */}
            {replacementOptions.map((p, i) => (
              <button
                key={p.id}
                onClick={() => handleReplace(p.id)}
                className="flex items-center gap-1 bg-pb-card border border-pb-border text-pb-text text-xs font-semibold px-3 py-1.5 rounded-full hover:border-pb-green hover:bg-pb-green/10 transition-colors"
              >
                <span className="text-pb-text/40">#{i + 1}</span>
                {p.name}
                <span className="text-pb-text/40 ml-0.5">{p.skillLevel}</span>
              </button>
            ))}

            {replacementOptions.length === 0 && (
              <button
                onClick={() => handleReplace('auto')}
                className="bg-pb-text/10 text-pb-text text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-pb-text/20 transition-colors"
              >
                Skip to end of queue
              </button>
            )}

            <button
              onClick={() => setReplacingId(null)}
              className="text-xs text-pb-text/40 hover:text-pb-text px-2 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Queue list ───────────────────────────────────────────────────────────────

function formatWait(mins: number): string {
  if (mins < 60) return `~${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

function QueueList({
  queue,
  onRemove,
  activeCourts,
  courtCount,
}: {
  queue: QueuedPlayer[];
  onRemove: (id: string) => void;
  activeCourts: number;
  courtCount: number;
}) {
  if (queue.length === 0) {
    return (
      <div className="text-center py-8 text-pb-text/30 text-sm">
        No players in queue
      </div>
    );
  }

  const effectiveCourts = activeCourts > 0 ? activeCourts : courtCount;

  return (
    <ol className="space-y-2">
      {queue.map((p, i) => {
        const mins = Math.ceil((i + 1) / Math.max(effectiveCourts * 4, 1)) * 15;
        return (
          <li
            key={p.id}
            className="flex items-center gap-3 bg-pb-card border border-pb-border rounded-lg px-3 py-2"
          >
            <div className="flex flex-col items-center w-8 shrink-0">
              <span className="text-xs font-mono text-pb-text/40 leading-none">{i + 1}</span>
              <span className="text-xs text-pb-text/30 leading-none mt-0.5">{formatWait(mins)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{p.name}</div>
              <div className="text-xs text-pb-text/50">{SKILL_LABELS[p.skillLevel]}</div>
            </div>
            <button
              onClick={() => onRemove(p.id)}
              className="text-pb-text/30 hover:text-red-500 transition-colors text-lg leading-none"
              title="Remove from queue"
            >
              ×
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Add player form ──────────────────────────────────────────────────────────

function AddPlayerForm({
  onAdd,
  queue,
  session,
}: {
  onAdd: (name: string, skill: SkillLevel) => void;
  queue: QueuedPlayer[];
  session: OpenPlaySession;
}) {
  const [name, setName] = useState('');
  const [skill, setSkill] = useState<SkillLevel>('3.0');
  const [rosterOpen, setRosterOpen] = useState(false);
  const [rosterPlayers, setRosterPlayers] = useState<PlayerProfile[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (rosterOpen) {
      setRosterPlayers(loadPlayers());
    }
  }, [rosterOpen]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, skill);
    setName('');
    inputRef.current?.focus();
  }

  // Check if a roster player is already in queue or on court
  function isPlayerBusy(rp: PlayerProfile): boolean {
    if (queue.some((q) => q.name === rp.name)) return true;
    for (const court of session.courts) {
      if (court.game?.players.some((p) => p.name === rp.name)) return true;
    }
    return false;
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
          className="w-full border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
        />
        <select
          value={skill}
          onChange={(e) => setSkill(e.target.value as SkillLevel)}
          className="w-full border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
        >
          {SKILL_LEVELS.map((s) => (
            <option key={s} value={s}>
              {SKILL_LABELS[s]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-pb-green hover:bg-pb-green/80 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
        >
          + Add to Queue
        </button>
      </form>

      {/* Pick from Roster */}
      <div className="border border-pb-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setRosterOpen((o) => !o)}
          className="w-full flex items-center justify-between px-3 py-2 bg-pb-bg text-sm font-medium text-pb-text/70 hover:bg-pb-border/20 transition-colors"
        >
          <span>Pick from Roster</span>
          <span className="text-pb-text/40">{rosterOpen ? '▲' : '▼'}</span>
        </button>
        {rosterOpen && (
          <div className="p-2 bg-white">
            {rosterPlayers.length === 0 ? (
              <p className="text-xs text-pb-text/40 text-center py-2">No saved players found.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {rosterPlayers.map((rp) => {
                  const busy = isPlayerBusy(rp);
                  return (
                    <button
                      key={rp.id}
                      type="button"
                      disabled={busy}
                      onClick={() => onAdd(rp.name, rp.skillLevel)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        busy
                          ? 'bg-pb-bg border-pb-border text-pb-text/30 cursor-not-allowed'
                          : 'bg-pb-green/10 border-pb-green/30 text-pb-green hover:bg-pb-green/20'
                      }`}
                      title={busy ? 'Already in queue or on court' : `${rp.name} — ${SKILL_LABELS[rp.skillLevel]}`}
                    >
                      {rp.name}
                      <span className="ml-1 text-pb-text/40">{rp.skillLevel}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OpenPlayPage() {
  const [session, setSession] = useState<OpenPlaySession | null>(null);
  const [tick, setTick] = useState(0);

  // Load from localStorage once mounted
  useEffect(() => {
    setSession(loadOpenPlay());
  }, []);

  // Timer tick every second for court timers
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const update = useCallback((next: OpenPlaySession) => {
    setSession(next);
    saveOpenPlay(next);
  }, []);

  if (!session) {
    return <div className="p-8 text-center text-pb-text/40">Loading…</div>;
  }

  const activeCourts = session.courts.filter((c) => c.game !== null).length;
  const openCourts = session.courts.filter((c) => c.game === null).length;

  function handleAddPlayer(name: string, skillLevel: SkillLevel) {
    const player: QueuedPlayer = { id: uid(), name, skillLevel, queuedAt: Date.now() };
    update({ ...session!, queue: [...session!.queue, player] });
  }

  function handleRemovePlayer(id: string) {
    update({ ...session!, queue: session!.queue.filter((p) => p.id !== id) });
  }

  function handleEndGame(courtId: number, requeue: boolean) {
    update(endGame(session!, courtId, requeue));
  }

  function handleAutoAssign() {
    update(autoAssign(session!));
  }

  function handleCourtCount(delta: number) {
    update(setCourtCount(session!, session!.courtCount + delta));
  }

  function handleStackingMode(mode: StackingMode) {
    update({ ...session!, stackingMode: mode });
  }

  function handleReplacePlayer(skippedId: string, withId: string | 'auto') {
    const queue = session!.queue;
    const skipped = queue.find((p) => p.id === skippedId);
    if (!skipped) return;
    const skipIdx = queue.findIndex((p) => p.id === skippedId);

    if (withId === 'auto') {
      // Move skipped player to end; queue naturally shifts up
      update({ ...session!, queue: [...queue.filter((p) => p.id !== skippedId), skipped] });
    } else {
      const replacement = queue.find((p) => p.id === withId);
      if (!replacement) return;
      const without = queue.filter((p) => p.id !== skippedId && p.id !== withId);
      without.splice(skipIdx, 0, replacement);
      without.push(skipped);
      update({ ...session!, queue: without });
    }
  }

  function handleReset() {
    if (!confirm('Reset all courts and clear the queue? This cannot be undone.')) return;
    update({
      ...session!,
      courts: Array.from({ length: session!.courtCount }, (_, i) => ({ id: i + 1, game: null })),
      queue: [],
    });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-pb-green">Open Play</h1>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Stacking mode */}
          <div className="flex rounded-lg border border-pb-border overflow-hidden text-sm">
            {(['fifo', 'skill-matched'] as StackingMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleStackingMode(m)}
                className={`px-3 py-1.5 font-medium transition-colors ${
                  session.stackingMode === m
                    ? 'bg-pb-green text-white'
                    : 'bg-white text-pb-text/70 hover:bg-pb-bg'
                }`}
              >
                {m === 'fifo' ? 'FIFO' : 'Skill-Match'}
              </button>
            ))}
          </div>

          {/* Court count */}
          <div className="flex items-center gap-1 border border-pb-border rounded-lg overflow-hidden text-sm">
            <button
              onClick={() => handleCourtCount(-1)}
              className="px-3 py-1.5 bg-white hover:bg-pb-bg font-bold transition-colors"
            >
              −
            </button>
            <span className="px-2 font-semibold text-pb-green">{session.courtCount} courts</span>
            <button
              onClick={() => handleCourtCount(1)}
              className="px-3 py-1.5 bg-white hover:bg-pb-bg font-bold transition-colors"
            >
              +
            </button>
          </div>

          <button
            onClick={handleAutoAssign}
            disabled={session.queue.length < 4 && openCourts === 0}
            className="bg-pb-green hover:bg-pb-green/80 disabled:opacity-40 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            ⚡ Auto-Assign
          </button>

          <button
            onClick={handleReset}
            className="text-red-500 hover:text-red-700 text-sm font-medium px-2 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Stats banner */}
      <div className="flex gap-2 mb-8 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-green/15 text-pb-green border border-pb-green/20">
          {activeCourts} Active
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-text/5 text-pb-text/60 border border-pb-border">
          {openCourts} Open
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-yellow/20 text-pb-text border border-pb-yellow/30">
          {session.queue.length} In Queue
        </span>
      </div>

      <OnDeckPanel queue={session.queue} onReplace={handleReplacePlayer} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Courts grid */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">
            Courts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {session.courts.map((court) => (
              <PickleballCourt
                key={court.id}
                court={court}
                onEndGame={handleEndGame}
                tick={tick}
              />
            ))}
          </div>
        </div>

        {/* Queue sidebar */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">
              Add Player
            </h2>
            <AddPlayerForm
              onAdd={handleAddPlayer}
              queue={session.queue}
              session={session}
            />
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">
              Queue ({session.queue.length})
            </h2>
            <QueueList
              queue={session.queue}
              onRemove={handleRemovePlayer}
              activeCourts={activeCourts}
              courtCount={session.courtCount}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
