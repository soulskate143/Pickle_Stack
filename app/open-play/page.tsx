'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'react-qr-code';
import { appendSessionLog, loadOpenPlay, loadPlayers, saveOpenPlay } from '../lib/storage';
import { assignNextToCourt, autoAssign, endGame, pickPlayers, setCourtCount } from '../lib/stacking';
import type { OpenPlaySession, PlayerProfile, QueuedPlayer, SessionLog, SkillLevel, StackingMode } from '../lib/types';
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

function formatMs(ms: number): string {
  const m = Math.round(ms / 60000);
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

// ─── Pickleball court SVG ─────────────────────────────────────────────────────

const FOUR_PLAYER_POSITIONS = [
  { x: 65, y: 38 },
  { x: 65, y: 122 },
  { x: 235, y: 38 },
  { x: 235, y: 122 },
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

const ALERT_MINS = 20; // show warning after this many minutes

function PickleballCourt({
  court,
  onEndGame,
  onDropPlayer,
  onAssignNext,
  canAssignNext,
  tick,
}: {
  court: OpenPlaySession['courts'][number];
  onEndGame: (courtId: number, requeue: boolean) => void;
  onDropPlayer: (courtId: number, playerId: string) => void;
  onAssignNext: (courtId: number) => void;
  canAssignNext: boolean;
  tick: number;
}) {
  const [dragOver, setDragOver] = useState(false);
  const playing = court.game !== null;
  const players = court.game?.players ?? [];
  const positions = getPlayerPositions(players.length);

  const gameMs = playing ? Date.now() - court.game!.startTime : 0;
  const isOvertime = playing && gameMs > ALERT_MINS * 60000;

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden transition-all ${
        dragOver
          ? 'border-pb-yellow bg-pb-yellow/5 scale-[1.01]'
          : playing
          ? isOvertime
            ? 'border-orange-400 shadow-md shadow-orange-400/20'
            : 'border-pb-green shadow-md shadow-pb-green/10'
          : 'border-pb-border border-dashed opacity-70'
      }`}
      onDragOver={(e) => { if (!playing) { e.preventDefault(); setDragOver(true); }}}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData('playerId');
        if (id && !playing) onDropPlayer(court.id, id);
      }}
    >
      {/* Court header */}
      <div className="flex items-center justify-between px-3 py-2 bg-pb-card border-b border-pb-border">
        <span className="font-bold text-pb-green text-sm uppercase tracking-wide">
          Court {court.id}
        </span>
        {playing && (
          <div className="flex items-center gap-1.5">
            {isOvertime && (
              <span className="text-[10px] font-bold text-orange-500 animate-pulse uppercase tracking-wide">
                ⏱ Long game
              </span>
            )}
            <span className={`text-xs font-mono px-2 py-0.5 rounded-full ${
              isOvertime ? 'bg-orange-500 text-white' : 'bg-pb-green text-white'
            }`}>
              {elapsed(court.game!.startTime)}
            </span>
          </div>
        )}
        {!playing && (
          canAssignNext && !dragOver
            ? <button
                onClick={() => onAssignNext(court.id)}
                className="text-xs bg-pb-green hover:bg-pb-green/80 text-white font-semibold px-3 py-1 rounded-lg transition-colors"
              >
                Assign Next →
              </button>
            : <span className="text-xs text-pb-text/40 italic">
                {dragOver ? 'Drop to assign' : 'Available'}
              </span>
        )}
      </div>

      {/* SVG court */}
      <svg viewBox="0 0 300 160" className="w-full" style={{ display: 'block' }}>
        <rect x={10} y={8} width={280} height={144} fill="#1e3a5f" rx={3} />
        <rect x={10} y={8} width={96} height={144} fill="#163a2a" />
        <rect x={194} y={8} width={96} height={144} fill="#163a2a" />
        <rect x={148} y={8} width={4} height={144} fill="rgba(255,255,255,0.15)" />
        <rect x={10} y={8} width={280} height={144} fill="none" stroke="white" strokeWidth={1.5} />
        <line x1={106} y1={8} x2={106} y2={152} stroke="white" strokeWidth={1} />
        <line x1={194} y1={8} x2={194} y2={152} stroke="white" strokeWidth={1} />
        <line x1={10} y1={80} x2={106} y2={80} stroke="white" strokeWidth={1} />
        <line x1={194} y1={80} x2={290} y2={80} stroke="white" strokeWidth={1} />
        <line x1={150} y1={8} x2={150} y2={152} stroke="white" strokeWidth={2.5} />

        {!playing && (
          <>
            <text x={80} y={80} fontSize={10} fill="rgba(255,255,255,0.3)" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" letterSpacing={2}>
              {dragOver ? 'ASSIGN' : 'AVAILABLE'}
            </text>
            <text x={220} y={80} fontSize={10} fill="rgba(255,255,255,0.3)" textAnchor="middle" dominantBaseline="middle" fontWeight="bold" letterSpacing={2}>
              {dragOver ? 'HERE' : 'AVAILABLE'}
            </text>
          </>
        )}

        {playing &&
          players.map((p, i) => {
            const pos = positions[i];
            if (!pos) return null;
            const isTeamA = i < 2;
            const fill = isTeamA ? '#ea580c' : '#0891b2';
            return (
              <g key={p.id}>
                <circle cx={pos.x} cy={pos.y} r={14} fill={fill} />
                <text x={pos.x} y={pos.y} fontSize={11} fontWeight="bold" fill="white" textAnchor="middle" dominantBaseline="middle">
                  {p.name.charAt(0).toUpperCase()}
                </text>
                <text x={pos.x} y={pos.y + 22} fontSize={8} fill="white" textAnchor="middle">
                  {truncate(p.name, 10)}
                </text>
              </g>
            );
          })}
      </svg>

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
  hasOverride,
  onClearOverride,
}: {
  queue: QueuedPlayer[];
  onReplace: (skippedId: string, withId: string | 'auto') => void;
  hasOverride: boolean;
  onClearOverride: () => void;
}) {
  const [replacingId, setReplacingId] = useState<string | null>(null);

  if (queue.length === 0) return null;

  const pair1 = queue.slice(0, 4);
  const pair2 = queue.slice(4, 8);
  const replacingPlayer = queue.find((p) => p.id === replacingId) ?? null;
  const replacementOptions = queue.filter((p) => p.id !== replacingId);

  function handleReplace(withId: string | 'auto') {
    if (!replacingId) return;
    onReplace(replacingId, withId);
    setReplacingId(null);
  }

  function PlayerPill({ player, index, bgClass, textClass }: {
    player: QueuedPlayer; index: number; bgClass: string; textClass: string;
  }) {
    const isReplacing = replacingId === player.id;
    return (
      <span
        className={`group flex items-center gap-1 text-xs font-semibold pl-2.5 pr-1.5 py-1 rounded-full transition-all ${
          isReplacing ? 'bg-red-500 text-white ring-2 ring-red-300' : `${bgClass} ${textClass}`
        }`}
      >
        <span className="opacity-60">{index}</span>
        {player.name}
        {(player.gamesPlayed ?? 0) === 0
          ? <span className="text-[9px] opacity-70">new</span>
          : <span className="text-[9px] opacity-60">{player.gamesPlayed} game{player.gamesPlayed === 1 ? '' : 's'}</span>
        }
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
    <div className={`rounded-xl border-2 p-4 mb-6 ${hasOverride ? 'border-orange-400 bg-orange-400/5' : 'border-pb-green bg-pb-green/5'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-sm font-bold uppercase tracking-widest ${hasOverride ? 'text-orange-500' : 'text-pb-green'}`}>🎯 On Deck</span>
        {hasOverride ? (
          <>
            <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-500 uppercase tracking-wide">Manual</span>
            <button
              onClick={onClearOverride}
              className="text-xs text-pb-text/40 hover:text-pb-green transition-colors ml-auto"
            >
              ↺ Reset to Auto
            </button>
          </>
        ) : (
          <span className="text-xs text-pb-text/50">— hover a name to replace</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-pb-green/10 border border-pb-green/30 p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="w-2 h-2 rounded-full bg-pb-green animate-pulse" />
            <span className="text-xs font-bold text-pb-green uppercase tracking-wide">Pair 1 — Up Next</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {pair1.map((p, i) => (
              <PlayerPill key={p.id} player={p} index={i + 1} bgClass="bg-pb-green" textClass="text-white" />
            ))}
          </div>
        </div>

        {pair2.length > 0 && (
          <div className="rounded-lg bg-pb-yellow/10 border border-pb-yellow/40 p-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-2 h-2 rounded-full bg-pb-yellow" />
              <span className="text-xs font-bold text-pb-text/70 uppercase tracking-wide">Pair 2 — Prepare</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pair2.map((p, i) => (
                <PlayerPill key={p.id} player={p} index={i + 5} bgClass="bg-pb-yellow/80" textClass="text-pb-text" />
              ))}
            </div>
          </div>
        )}
      </div>

      {replacingId && replacingPlayer && (
        <div className="mt-3 pt-3 border-t border-pb-green/20">
          <p className="text-xs font-semibold text-pb-text/70 mb-2">
            Replace <span className="text-red-500">{replacingPlayer.name}</span> with:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => handleReplace('auto')}
              className="flex items-center gap-1.5 bg-pb-green text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-pb-green/80 transition-colors"
            >
              ⚡ Auto — next in line
              {replacementOptions[0] && <span className="opacity-70">({replacementOptions[0].name})</span>}
            </button>
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

function formatWait(ms: number): string {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `~${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `~${h}h` : `~${h}h ${m}m`;
}

function QueueList({
  queue,
  onRemove,
  courts,
  courtCount,
  avgGameMs,
}: {
  queue: QueuedPlayer[];
  onRemove: (id: string) => void;
  courts: OpenPlaySession['courts'];
  courtCount: number;
  avgGameMs: number;
}) {
  if (queue.length === 0) {
    return (
      <div className="text-center py-8 text-pb-text/30 text-sm">
        No players in queue
      </div>
    );
  }

  // Remaining ms for each active court, sorted soonest-finish first
  const now = Date.now();
  const remainingMs = courts
    .filter((c) => c.game !== null)
    .map((c) => Math.max(0, avgGameMs - (now - c.game!.startTime)))
    .sort((a, b) => a - b);
  const effectiveCourts = Math.max(remainingMs.length > 0 ? remainingMs.length : courtCount, 1);

  return (
    <ol className="space-y-2">
      {queue.map((p, i) => {
        // How many court-finishes does this player need before they play?
        const finishesNeeded = Math.ceil((i + 1) / 4);
        let waitMs: number;
        if (finishesNeeded <= remainingMs.length) {
          // Can use actual remaining time of the Nth-soonest court
          waitMs = remainingMs[finishesNeeded - 1];
        } else {
          // Beyond currently active courts: base off last known finish + extra cycles
          const extra = finishesNeeded - remainingMs.length;
          const base = remainingMs.length > 0 ? remainingMs[remainingMs.length - 1] : 0;
          waitMs = base + (extra * avgGameMs) / effectiveCourts;
        }
        return (
          <li
            key={p.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('playerId', p.id)}
            className="flex items-center gap-3 bg-pb-card border border-pb-border rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing hover:border-pb-green/40 transition-colors"
          >
            <div className="flex flex-col items-center w-8 shrink-0">
              <span className="text-xs font-mono text-pb-text/40 leading-none">{i + 1}</span>
              <span className="text-xs text-pb-text/30 leading-none mt-0.5">{formatWait(waitMs)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate">{p.name}</span>
                {(p.gamesPlayed ?? 0) === 0 ? (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-pb-green/20 text-pb-green shrink-0">New</span>
                ) : (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-pb-text/10 text-pb-text/50 shrink-0">{p.gamesPlayed} game{p.gamesPlayed === 1 ? '' : 's'}</span>
                )}
              </div>
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
    if (rosterOpen) setRosterPlayers(loadPlayers());
  }, [rosterOpen]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, skill);
    setName('');
    inputRef.current?.focus();
  }

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
            <option key={s} value={s}>{SKILL_LABELS[s]}</option>
          ))}
        </select>
        <button
          type="submit"
          className="bg-pb-green hover:bg-pb-green/80 text-white font-semibold py-2 rounded-lg text-sm transition-colors"
        >
          + Add to Queue
        </button>
      </form>

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

// ─── Kiosk QR Modal ───────────────────────────────────────────────────────────

function KioskQRModal({ onClose }: { onClose: () => void }) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/kiosk` : '/kiosk';
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xs p-6 flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between w-full">
          <h2 className="text-base font-bold text-pb-green">Kiosk Check-in</h2>
          <button onClick={onClose} className="text-pb-text/30 hover:text-pb-text text-2xl leading-none">×</button>
        </div>
        <div className="bg-white p-3 rounded-xl border border-pb-border">
          <QRCode value={url} size={180} />
        </div>
        <p className="text-xs text-pb-text/50 text-center">
          Players scan this with their phone to self check-in on the kiosk page.
        </p>
        <p className="text-xs font-mono text-pb-text/40 break-all text-center">{url}</p>
      </div>
    </div>
  );
}

// ─── Session History Modal ────────────────────────────────────────────────────

function SessionHistoryModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<SessionLog[]>([]);

  useEffect(() => {
    import('../lib/storage').then(({ loadSessionHistory }) => {
      setLogs(loadSessionHistory());
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-pb-green">Session History</h2>
          <button onClick={onClose} className="text-pb-text/30 hover:text-pb-text text-2xl leading-none">×</button>
        </div>
        {logs.length === 0 ? (
          <p className="text-sm text-pb-text/40 text-center py-8">No sessions recorded yet. End a session to save history.</p>
        ) : (
          <div className="overflow-y-auto flex flex-col gap-3">
            {logs.map((log) => (
              <div key={log.id} className="border border-pb-border rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-pb-text">
                    {new Date(log.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <span className="text-xs text-pb-text/40">
                    {new Date(log.date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="flex gap-4 text-xs text-pb-text/60">
                  <span>🎾 {log.gamesPlayed} games</span>
                  <span>👤 {log.uniquePlayers.length} players</span>
                  {log.avgGameMs > 0 && <span>⏱ avg {formatMs(log.avgGameMs)}</span>}
                </div>
                {log.uniquePlayers.length > 0 && (
                  <p className="text-xs text-pb-text/40 mt-1 truncate">
                    {log.uniquePlayers.slice(0, 8).join(', ')}{log.uniquePlayers.length > 8 ? ` +${log.uniquePlayers.length - 8}` : ''}
                  </p>
                )}
              </div>
            ))}
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);
  const [deckOverride, setDeckOverride] = useState<string[] | null>(null);

  useEffect(() => {
    setSession(loadOpenPlay());
    // Poll every 2s to stay in sync with TV/kiosk changes
    const poll = setInterval(() => setSession(loadOpenPlay()), 2000);
    // Also sync immediately via storage event (cross-tab)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'pb_open_play') setSession(loadOpenPlay());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      clearInterval(poll);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

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

  // Compute auto pairs from pickPlayers
  const autoPair1 = pickPlayers(session.queue, session.stackingMode) ?? [];
  const autoPair1Ids = new Set(autoPair1.map((p) => p.id));
  const afterAutoPair1 = session.queue.filter((p) => !autoPair1Ids.has(p.id));
  const autoPair2 = pickPlayers(afterAutoPair1, session.stackingMode) ?? [];

  // Apply manual deck override if set and still valid
  const validOverride = deckOverride?.filter((id) => session.queue.some((p) => p.id === id)) ?? null;
  const overrideActive = validOverride !== null && validOverride.length >= 4;
  const pair1: QueuedPlayer[] = overrideActive
    ? validOverride.slice(0, 4).map((id) => session.queue.find((p) => p.id === id)!)
    : autoPair1;
  const pair2: QueuedPlayer[] = overrideActive
    ? validOverride.slice(4, 8).map((id) => session.queue.find((p) => p.id === id)!).filter(Boolean)
    : autoPair2;

  const pair1Ids = new Set(pair1.map((p) => p.id));
  const pair2Ids = new Set(pair2.map((p) => p.id));
  const rest = session.queue
    .filter((p) => !pair1Ids.has(p.id) && !pair2Ids.has(p.id))
    .sort((a, b) => {
      const ag = a.gamesPlayed ?? 0;
      const bg = b.gamesPlayed ?? 0;
      if (ag !== bg) return ag - bg;
      return a.queuedAt - b.queuedAt;
    });
  const sortedQueue = [...pair1, ...pair2, ...rest];
  const avgGameMs = session.gameDurations.length > 0
    ? session.gameDurations.reduce((a, b) => a + b, 0) / session.gameDurations.length
    : 15 * 60 * 1000; // default 15 min

  function handleAddPlayer(name: string, skillLevel: SkillLevel) {
    const player: QueuedPlayer = { id: uid(), name, skillLevel, queuedAt: Date.now(), gamesPlayed: 0 };
    update({ ...session!, queue: [...session!.queue, player] });
  }

  function handleRemovePlayer(id: string) {
    update({ ...session!, queue: session!.queue.filter((p) => p.id !== id) });
  }

  function handleEndGame(courtId: number, requeue: boolean) {
    let next = endGame(session!, courtId, requeue);
    if (autoAssignEnabled) {
      if (overrideActive && pair1.length === 4) {
        // Respect the manual deck override — assign override pair1 to the freed court
        const players = pair1.filter((p) => next.queue.some((q) => q.id === p.id));
        if (players.length === 4) {
          const pickedIds = new Set(players.map((p) => p.id));
          const queue = next.queue.filter((p) => !pickedIds.has(p.id));
          const courts = next.courts.map((c) =>
            c.id === courtId ? { ...c, game: { players, startTime: Date.now() } } : c
          );
          const remaining = (validOverride ?? []).slice(4);
          setDeckOverride(remaining.length >= 4 ? remaining : null);
          next = { ...next, courts, queue };
        } else {
          // Override players no longer available, fall back to auto
          next = autoAssign(next);
          setDeckOverride(null);
        }
      } else {
        next = autoAssign(next);
      }
    }
    update(next);
  }

  function handleAutoAssign() {
    setDeckOverride(null);
    update(autoAssign(session!));
  }

  function handleAssignNext(courtId: number) {
    if (overrideActive && pair1.length === 4) {
      const players = pair1;
      const pickedIds = new Set(players.map((p) => p.id));
      const queue = session!.queue.filter((p) => !pickedIds.has(p.id));
      const courts = session!.courts.map((c) =>
        c.id === courtId ? { ...c, game: { players, startTime: Date.now() } } : c
      );
      const remaining = validOverride!.slice(4);
      setDeckOverride(remaining.length >= 4 ? remaining : null);
      let next: OpenPlaySession = { ...session!, courts, queue };
      if (autoAssignEnabled) next = autoAssign(next);
      update(next);
    } else {
      let next = assignNextToCourt(session!, courtId);
      if (autoAssignEnabled) next = autoAssign(next);
      update(next);
    }
  }

  function handleCourtCount(delta: number) {
    update(setCourtCount(session!, session!.courtCount + delta));
  }

  function handleStackingMode(mode: StackingMode) {
    update({ ...session!, stackingMode: mode });
  }

  function handleReplacePlayer(skippedId: string, withId: string | 'auto') {
    const deckIds = [...pair1.map((p) => p.id), ...pair2.map((p) => p.id)];
    const isDeckPlayer = deckIds.includes(skippedId);

    if (isDeckPlayer) {
      const currentOverride = overrideActive ? validOverride! : deckIds;
      let replacementId: string;
      if (withId === 'auto') {
        const deckSet = new Set(currentOverride);
        const next = session!.queue.find((p) => !deckSet.has(p.id));
        if (!next) return;
        replacementId = next.id;
      } else {
        replacementId = withId;
      }

      const skippedIdx = currentOverride.indexOf(skippedId);
      const replacementIdx = currentOverride.indexOf(replacementId);
      const newOverride = [...currentOverride];

      if (replacementIdx !== -1) {
        // Replacement is also in the deck — swap their positions so deck stays 8 items
        newOverride[skippedIdx] = replacementId;
        newOverride[replacementIdx] = skippedId;
      } else {
        // Replacement is from the rest of the queue — just put them in the skipped slot
        newOverride[skippedIdx] = replacementId;
      }
      setDeckOverride(newOverride);
      return;
    }

    // Non-deck player: reorder in the raw queue
    const queue = session!.queue;
    const skipped = queue.find((p) => p.id === skippedId);
    if (!skipped) return;
    const skipIdx = queue.findIndex((p) => p.id === skippedId);
    if (withId === 'auto') {
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

  // Drag a queued player onto an empty court (auto-fills from queue front + this player)
  function handleDropPlayer(courtId: number, playerId: string) {
    const player = session!.queue.find((p) => p.id === playerId);
    if (!player) return;
    const court = session!.courts.find((c) => c.id === courtId);
    if (!court || court.game !== null) return;

    // Move this player to front of queue, then auto-assign this court
    const reordered = [player, ...session!.queue.filter((p) => p.id !== playerId)];
    const needed = Math.min(4, reordered.length);
    const gamePlayers = reordered.slice(0, needed);
    const remaining = reordered.slice(needed);
    const courts = session!.courts.map((c) =>
      c.id === courtId ? { ...c, game: { players: gamePlayers, startTime: Date.now() } } : c
    );
    update({ ...session!, courts, queue: remaining });
  }

  function handleReset() {
    if (!confirm('Reset all courts and clear the queue? This cannot be undone.')) return;
    update({
      ...session!,
      courts: Array.from({ length: session!.courtCount }, (_, i) => ({ id: i + 1, game: null })),
      queue: [],
    });
  }

  function handleEndSession() {
    if (!confirm('End session? This will save a history record and reset all courts and the queue.')) return;

    // Collect all player names currently in play or queued
    const allNames = new Set<string>();
    for (const court of session!.courts) {
      court.game?.players.forEach((p) => allNames.add(p.name));
    }
    session!.queue.forEach((p) => allNames.add(p.name));

    const gamesPlayed = session!.gameDurations.length;
    const log: SessionLog = {
      id: uid(),
      date: Date.now(),
      gamesPlayed,
      uniquePlayers: [...allNames],
      avgGameMs: gamesPlayed > 0
        ? session!.gameDurations.reduce((a, b) => a + b, 0) / gamesPlayed
        : 0,
    };
    appendSessionLog(log);

    update({
      ...session!,
      courts: Array.from({ length: session!.courtCount }, (_, i) => ({ id: i + 1, game: null })),
      queue: [],
      gameDurations: [],
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
          <div className="flex items-center gap-1.5">
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
            {/* Info tooltip */}
            <div className="relative group">
              <button className="w-5 h-5 rounded-full border border-pb-border bg-white text-pb-text/40 hover:text-pb-green hover:border-pb-green text-xs font-bold flex items-center justify-center transition-colors">
                i
              </button>
              <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-56 bg-zinc-800 text-white text-xs rounded-xl p-3 opacity-0 group-hover:opacity-100 transition-opacity z-50 shadow-lg">
                {session.stackingMode === 'fifo' ? (
                  <>
                    <p className="font-semibold mb-1">FIFO</p>
                    <p className="text-white/70">First In, First Out — players are assigned to courts in the exact order they joined the queue.</p>
                  </>
                ) : (
                  <>
                    <p className="font-semibold mb-1">Skill-Match</p>
                    <p className="text-white/70">Players are grouped by similar skill level so games are more competitive and balanced.</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Court count */}
          <div className="flex items-center gap-1 border border-pb-border rounded-lg overflow-hidden text-sm">
            <button onClick={() => handleCourtCount(-1)} className="px-3 py-1.5 bg-white hover:bg-pb-bg font-bold transition-colors">−</button>
            <span className="px-2 font-semibold text-pb-green">{session.courtCount} courts</span>
            <button onClick={() => handleCourtCount(1)} className="px-3 py-1.5 bg-white hover:bg-pb-bg font-bold transition-colors">+</button>
          </div>

          <button
            onClick={handleAutoAssign}
            disabled={session.queue.length < 4 && openCourts === 0}
            className="flex items-center gap-2 bg-pb-green hover:bg-pb-green/80 disabled:opacity-40 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            <span
              onClick={(e) => { e.stopPropagation(); setAutoAssignEnabled((v) => !v); }}
              className={`w-4 h-4 rounded-sm border-2 flex items-center justify-center shrink-0 cursor-pointer ${
                autoAssignEnabled ? 'bg-white border-white' : 'border-white/60 bg-transparent'
              }`}
            >
              {autoAssignEnabled && <span className="text-pb-green text-[10px] leading-none font-black">✓</span>}
            </span>
            Auto-Assign
          </button>

          <button
            onClick={() => setQrOpen(true)}
            className="text-pb-text/50 hover:text-pb-green text-sm font-medium px-2 transition-colors"
            title="Share kiosk QR code"
          >
            📲 Kiosk QR
          </button>

          <Link
            href="/tv/open-play"
            target="_blank"
            className="text-pb-text/50 hover:text-pb-green text-sm font-medium px-2 transition-colors"
            title="Open TV display"
          >
            📺 TV View
          </Link>

          <button
            onClick={() => setHistoryOpen(true)}
            className="text-pb-text/50 hover:text-pb-green text-sm font-medium px-2 transition-colors"
            title="View session history"
          >
            📋 History
          </button>

          <button
            onClick={handleEndSession}
            className="text-orange-500 hover:text-orange-700 text-sm font-medium px-2 transition-colors"
            title="Save history and reset session"
          >
            End Session
          </button>

          <button onClick={handleReset} className="text-red-500 hover:text-red-700 text-sm font-medium px-2 transition-colors">
            Reset
          </button>
        </div>
      </div>

      {/* Stats banner */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-green/15 text-pb-green border border-pb-green/20">
          {activeCourts} Active
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-text/5 text-pb-text/60 border border-pb-border">
          {openCourts} Open
        </span>
        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-yellow/20 text-pb-text border border-pb-yellow/30">
          {session.queue.length} In Queue
        </span>
        {session.gameDurations.length > 0 && (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-pb-text/5 text-pb-text/50 border border-pb-border">
            avg {formatMs(avgGameMs)} / game
          </span>
        )}
      </div>

      <p className="text-xs text-pb-text/30 mb-6">Drag a player from the queue onto an empty court to assign them directly.</p>

      <OnDeckPanel
        queue={sortedQueue}
        onReplace={handleReplacePlayer}
        hasOverride={overrideActive}
        onClearOverride={() => setDeckOverride(null)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Courts grid */}
        <div className="lg:col-span-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">Courts</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {session.courts.map((court) => (
              <PickleballCourt
                key={court.id}
                court={court}
                onEndGame={handleEndGame}
                onDropPlayer={handleDropPlayer}
                onAssignNext={handleAssignNext}
                canAssignNext={session.queue.length >= 4}
                tick={tick}
              />
            ))}
          </div>
        </div>

        {/* Queue sidebar */}
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">Add Player</h2>
            <AddPlayerForm onAdd={handleAddPlayer} queue={session.queue} session={session} />
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">
              Queue ({session.queue.length})
            </h2>
            <QueueList
              queue={sortedQueue}
              onRemove={handleRemovePlayer}
              courts={session.courts}
              courtCount={session.courtCount}
              avgGameMs={avgGameMs}
            />
          </div>
        </div>
      </div>

      {qrOpen && <KioskQRModal onClose={() => setQrOpen(false)} />}
      {historyOpen && <SessionHistoryModal onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}
