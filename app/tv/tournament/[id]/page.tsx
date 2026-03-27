'use client';

import Link from 'next/link';
import { use, useEffect, useRef, useState } from 'react';
import { loadTournament } from '../../../lib/storage';
import { computeGroupStandings, computeStandings, getEntrantName } from '../../../lib/tournament';
import type { RoundRobinStanding, Tournament, TournamentMatch } from '../../../lib/types';

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// ─── TV Bracket layout constants (larger than normal for readability) ──────────
const ENTRY_H = 48;
const MATCH_H = ENTRY_H * 2 + 2; // +2 for divider border
const MATCH_W = 260;
const R1_GAP = 16;
const UNIT = MATCH_H + R1_GAP;
const CON_W = 52;
const ROUND_W = MATCH_W + CON_W;

function getMatchTop(ri: number, mi: number): number {
  const slotSize = UNIT * Math.pow(2, ri);
  return (slotSize - MATCH_H) / 2 + mi * slotSize;
}

function getBracketHeight(r1Count: number): number {
  return r1Count * UNIT - R1_GAP;
}

function roundLabel(ri: number, total: number): string {
  const fromEnd = total - 1 - ri;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-Finals';
  if (fromEnd === 2) return 'Quarter-Finals';
  return `Round ${ri + 1}`;
}

// ─── TV Match Card (no umpire link, read-only) ────────────────────────────────
function TVMatchCard({ match, tournament }: { match: TournamentMatch; tournament: Tournament }) {
  const isDone = match.status === 'completed';
  const inProgress = match.status === 'in-progress';

  function label(id: string | null): string {
    if (id) return getEntrantName(tournament, id);
    return match.round === 1 ? 'BYE' : 'TBD';
  }

  const n1 = label(match.entrant1Id);
  const n2 = label(match.entrant2Id);
  const w1 = isDone && match.winnerId === match.entrant1Id;
  const w2 = isDone && match.winnerId === match.entrant2Id;

  return (
    <div
      className={`rounded overflow-hidden border ${
        inProgress
          ? 'border-pb-green shadow-lg shadow-pb-green/30'
          : isDone
          ? 'border-zinc-600'
          : 'border-zinc-700'
      }`}
      style={{ width: MATCH_W, height: MATCH_H }}
    >
      {/* Entry 1 */}
      <div
        className={`flex items-center gap-2 px-3 border-b border-zinc-700 ${
          w1 ? 'bg-pb-green' : inProgress ? 'bg-zinc-700' : isDone ? 'bg-zinc-700/60' : 'bg-zinc-800'
        }`}
        style={{ height: ENTRY_H }}
      >
        <span className={`flex-1 text-base font-semibold truncate ${w1 ? 'text-white' : 'text-zinc-200'}`}>
          {n1}
        </span>
        {isDone && (
          <span className={`text-base font-bold font-mono w-8 text-center shrink-0 ${w1 ? 'text-white' : 'text-zinc-500'}`}>
            {match.score1 ?? 0}
          </span>
        )}
        {w1 && <span className="text-yellow-400 text-sm shrink-0">🏆</span>}
      </div>

      {/* Entry 2 */}
      <div
        className={`flex items-center gap-2 px-3 ${
          w2 ? 'bg-pb-green' : inProgress ? 'bg-zinc-700' : isDone ? 'bg-zinc-700/60' : 'bg-zinc-800'
        }`}
        style={{ height: ENTRY_H }}
      >
        <span className={`flex-1 text-base font-semibold truncate ${w2 ? 'text-white' : 'text-zinc-200'}`}>
          {n2}
        </span>
        {isDone && (
          <span className={`text-base font-bold font-mono w-8 text-center shrink-0 ${w2 ? 'text-white' : 'text-zinc-500'}`}>
            {match.score2 ?? 0}
          </span>
        )}
        {w2 && <span className="text-yellow-400 text-sm shrink-0">🏆</span>}
      </div>
    </div>
  );
}

// ─── Scaled Bracket ───────────────────────────────────────────────────────────
function ScaledBracket({
  tournament,
  phaseFilter,
}: {
  tournament: Tournament;
  phaseFilter?: 'playoff';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const allMatches = phaseFilter
    ? tournament.matches.filter((m) => m.phase === phaseFilter)
    : tournament.matches.filter((m) => !m.phase);

  const match3rd = !phaseFilter
    ? (tournament.matches.find((m) => m.is3rdPlace) ?? null)
    : null;

  const rounds = Array.from(
    new Set(allMatches.filter((m) => !m.is3rdPlace).map((m) => m.round))
  ).sort((a, b) => a - b);

  if (rounds.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-600 text-2xl tracking-widest font-bold uppercase">
        No bracket yet
      </div>
    );
  }

  const matchesByRound = rounds.map((r) =>
    allMatches.filter((m) => m.round === r && !m.is3rdPlace).sort((a, b) => a.slot - b.slot)
  );

  const r1Count = matchesByRound[0].length;
  const totalH = getBracketHeight(r1Count);
  const totalW = rounds.length * ROUND_W;
  const totalRounds = rounds.length;

  // Connector paths
  const connectorPaths: string[] = [];
  for (let ri = 0; ri < matchesByRound.length - 1; ri++) {
    const pairs = Math.floor(matchesByRound[ri].length / 2);
    for (let pi = 0; pi < pairs; pi++) {
      const topCenter = getMatchTop(ri, pi * 2) + MATCH_H / 2;
      const botCenter = getMatchTop(ri, pi * 2 + 1) + MATCH_H / 2;
      const midY = (topCenter + botCenter) / 2;
      const x1 = ri * ROUND_W + MATCH_W;
      const xMid = x1 + CON_W / 2;
      const x2 = (ri + 1) * ROUND_W;
      connectorPaths.push(
        `M ${x1} ${topCenter} H ${xMid} V ${midY} M ${x1} ${botCenter} H ${xMid} V ${midY} M ${xMid} ${midY} H ${x2}`
      );
    }
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    function compute() {
      if (!containerRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      const pad = 64;
      setScale(Math.min((width - pad) / totalW, (height - pad) / totalH));
    }
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [totalW, totalH]);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col items-center justify-center min-h-0 overflow-hidden p-6"
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          width: totalW,
        }}
      >
        {/* Round labels */}
        <div className="flex mb-4" style={{ width: totalW }}>
          {rounds.map((_, ri) => (
            <div key={ri} className="text-center" style={{ width: ROUND_W }}>
              <span className="text-sm font-bold uppercase tracking-widest text-zinc-400">
                {roundLabel(ri, totalRounds)}
              </span>
            </div>
          ))}
        </div>

        {/* Bracket canvas */}
        <div style={{ position: 'relative', width: totalW, height: totalH }}>
          <svg
            style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
            width={totalW}
            height={totalH}
          >
            {connectorPaths.map((d, i) => (
              <path key={i} d={d} stroke="#52525b" strokeWidth={2} fill="none" />
            ))}
          </svg>

          {matchesByRound.map((roundMatches, ri) =>
            roundMatches.map((match, mi) => (
              <div
                key={match.id}
                style={{ position: 'absolute', top: getMatchTop(ri, mi), left: ri * ROUND_W }}
              >
                <TVMatchCard match={match} tournament={tournament} />
              </div>
            ))
          )}
        </div>

        {/* 3rd place */}
        {match3rd && (
          <div className="mt-10">
            <div className="text-sm font-bold uppercase tracking-widest text-zinc-400 mb-3">
              3rd Place
            </div>
            <TVMatchCard match={match3rd} tournament={tournament} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Round-Robin TV ───────────────────────────────────────────────────────────
function RoundRobinTV({ tournament }: { tournament: Tournament }) {
  const standings = computeStandings(tournament);
  const totalMatches = tournament.matches.length;
  const doneMatches = tournament.matches.filter((m) => m.status === 'completed').length;
  const inProgress = tournament.matches.filter((m) => m.status === 'in-progress');

  return (
    <div className="flex-1 flex gap-6 p-8 min-h-0 overflow-hidden">
      {/* Standings table */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Standings</div>
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex-1">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-700 bg-zinc-800">
                <th className="text-left py-3 px-4 text-zinc-500 text-sm font-bold uppercase tracking-wide w-10">#</th>
                <th className="text-left py-3 px-4 text-zinc-500 text-sm font-bold uppercase tracking-wide">Player / Team</th>
                <th className="text-center py-3 px-4 text-zinc-500 text-sm font-bold uppercase tracking-wide w-20">W</th>
                <th className="text-center py-3 px-4 text-zinc-500 text-sm font-bold uppercase tracking-wide w-20">L</th>
                <th className="text-center py-3 px-4 text-zinc-500 text-sm font-bold uppercase tracking-wide w-24">PF</th>
                <th className="text-center py-3 px-4 text-zinc-500 text-sm font-bold uppercase tracking-wide w-24">PA</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s: RoundRobinStanding, i: number) => {
                const name = getEntrantName(tournament, s.entrantId);
                const isLeader = i === 0;
                return (
                  <tr
                    key={s.entrantId}
                    className={`border-b border-zinc-800 ${isLeader ? 'bg-pb-green/10' : i % 2 === 0 ? '' : 'bg-zinc-900/50'}`}
                  >
                    <td className={`py-5 px-4 text-center text-xl font-bold ${isLeader ? 'text-pb-green' : 'text-zinc-600'}`}>
                      {i + 1}
                    </td>
                    <td className={`py-5 px-4 text-2xl font-bold ${isLeader ? 'text-pb-green' : 'text-white'}`}>
                      {name}
                    </td>
                    <td className="py-5 px-4 text-center text-2xl font-bold text-white tabular-nums">{s.wins}</td>
                    <td className="py-5 px-4 text-center text-2xl text-zinc-500 tabular-nums">{s.losses}</td>
                    <td className="py-5 px-4 text-center text-xl text-zinc-400 tabular-nums">{s.pointsFor}</td>
                    <td className="py-5 px-4 text-center text-xl text-zinc-400 tabular-nums">{s.pointsAgainst}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Right panel: progress + live matches */}
      <div className="w-80 xl:w-96 shrink-0 flex flex-col gap-5">
        {/* Progress */}
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
          <div className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-3">
            Match Progress
          </div>
          <div className="flex items-baseline gap-2 mb-4">
            <span className="text-5xl font-black tabular-nums text-white">{doneMatches}</span>
            <span className="text-zinc-500 text-lg">/ {totalMatches}</span>
          </div>
          <div className="h-4 bg-zinc-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-pb-green rounded-full transition-all duration-700"
              style={{ width: totalMatches ? `${(doneMatches / totalMatches) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {/* In-progress matches */}
        {inProgress.length > 0 && (
          <div className="rounded-2xl bg-pb-green/5 border border-pb-green/30 p-6 flex-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-pb-green animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-widest text-pb-green">
                Now Playing
              </span>
            </div>
            <div className="space-y-5">
              {inProgress.slice(0, 5).map((m) => (
                <div key={m.id} className="text-base">
                  <div className="text-white font-semibold">
                    {m.entrant1Id ? getEntrantName(tournament, m.entrant1Id) : 'TBD'}
                  </div>
                  <div className="text-zinc-600 text-xs pl-2 my-0.5">vs</div>
                  <div className="text-white font-semibold">
                    {m.entrant2Id ? getEntrantName(tournament, m.entrant2Id) : 'TBD'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Group Stage TV ───────────────────────────────────────────────────────────
function GroupStageTV({ tournament }: { tournament: Tournament }) {
  const hasPlayoff = tournament.matches.some((m) => m.phase === 'playoff');
  const groups = tournament.groups ?? [];

  if (hasPlayoff) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="text-center py-3 text-xs font-bold uppercase tracking-widest text-zinc-500">
          Playoff Bracket
        </div>
        <ScaledBracket tournament={tournament} phaseFilter="playoff" />
      </div>
    );
  }

  const groupCols = Math.min(groups.length, 4);

  return (
    <div className="flex-1 p-8 min-h-0 overflow-hidden">
      <div
        className="grid gap-6 h-full"
        style={{ gridTemplateColumns: `repeat(${groupCols}, 1fr)` }}
      >
        {groups.map((group) => {
          const standings = computeGroupStandings(tournament, group.id);
          return (
            <div key={group.id} className="flex flex-col min-h-0">
              <div className="text-lg font-bold text-pb-green mb-3">{group.name}</div>
              <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden flex-1">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-700 bg-zinc-800">
                      <th className="text-left py-3 px-4 text-zinc-500 text-xs font-bold uppercase tracking-wide w-10">#</th>
                      <th className="text-left py-3 px-4 text-zinc-500 text-xs font-bold uppercase tracking-wide">Name</th>
                      <th className="text-center py-3 px-3 text-zinc-500 text-xs font-bold uppercase tracking-wide w-14">W</th>
                      <th className="text-center py-3 px-3 text-zinc-500 text-xs font-bold uppercase tracking-wide w-14">L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((s: RoundRobinStanding, i: number) => (
                      <tr
                        key={s.entrantId}
                        className={`border-b border-zinc-800 ${i === 0 ? 'bg-pb-green/10' : ''}`}
                      >
                        <td className={`py-4 px-4 text-center font-bold text-lg ${i === 0 ? 'text-pb-green' : 'text-zinc-600'}`}>
                          {i + 1}
                        </td>
                        <td className={`py-4 px-4 font-semibold text-xl ${i === 0 ? 'text-pb-green' : 'text-white'}`}>
                          {getEntrantName(tournament, s.entrantId)}
                        </td>
                        <td className="py-4 px-3 text-center text-xl font-bold text-white tabular-nums">{s.wins}</td>
                        <td className="py-4 px-3 text-center text-xl text-zinc-500 tabular-nums">{s.losses}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TournamentTVPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const now = useNow();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);

  useEffect(() => {
    setTournament(loadTournament(id));
    const interval = setInterval(() => setTournament(loadTournament(id)), 10000);
    return () => clearInterval(interval);
  }, [id]);

  if (tournament === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-3xl tracking-widest">
        LOADING…
      </div>
    );
  }

  if (tournament === null) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-white/40 text-2xl">Tournament not found.</p>
        <Link href="/tournament" className="text-pb-green text-sm hover:underline">
          ← Back to Tournaments
        </Link>
      </div>
    );
  }

  const timeStr = now?.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) ?? '--:--';
  const formatLabel =
    tournament.format === 'round-robin'
      ? 'Round Robin'
      : tournament.format === 'single-elimination'
      ? 'Single Elimination'
      : 'Group Stage';

  const statusDot =
    tournament.status === 'active'
      ? '● Live'
      : tournament.status === 'completed'
      ? '✓ Completed'
      : 'Setup';

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Header ── */}
      <header className="shrink-0 flex items-center justify-between px-8 bg-gradient-to-r from-zinc-900 to-zinc-800 border-b border-zinc-700/50" style={{ minHeight: 80 }}>
        <div className="flex flex-col">
          <div className="text-2xl font-black text-white">{tournament.name}</div>
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-500 mt-0.5">
            {formatLabel} · {tournament.location} · {tournament.date}
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black font-mono tabular-nums text-emerald-400 leading-none">{timeStr}</div>
          <div className={`text-[11px] font-bold uppercase tracking-[0.2em] mt-1 ${
            tournament.status === 'active' ? 'text-emerald-400 animate-pulse' :
            tournament.status === 'completed' ? 'text-zinc-400' : 'text-zinc-600'
          }`}>
            {statusDot}
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      {tournament.format === 'single-elimination' && (
        <ScaledBracket tournament={tournament} />
      )}
      {tournament.format === 'round-robin' && (
        <RoundRobinTV tournament={tournament} />
      )}
      {tournament.format === 'group-stage' && (
        <GroupStageTV tournament={tournament} />
      )}

      <Link
        href={`/tournament/${tournament.id}`}
        className="fixed bottom-3 right-3 text-white/20 hover:text-white/50 text-xs transition-colors"
      >
        ← Manage tournament
      </Link>
    </div>
  );
}
