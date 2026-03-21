'use client';

import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { loadPlayers, loadTournament, upsertTournament } from '../../lib/storage';
import {
  addPlayer,
  addTeam,
  computeStandings,
  generateSchedule,
  getEntrantName,
  recordScore,
} from '../../lib/tournament';
import type { PlayerProfile, SkillLevel, Tournament, TournamentMatch } from '../../lib/types';
import { SKILL_LABELS, SKILL_LEVELS } from '../../lib/types';

// ─── Bracket layout constants ─────────────────────────────────────────────────

const ENTRY_H = 32;        // height of one player row in bracket
const MATCH_H = ENTRY_H * 2; // 64px total match box height
const MATCH_W = 190;       // match box width
const R1_GAP = 8;          // gap between match boxes in round 1
const UNIT = MATCH_H + R1_GAP; // 72px — base slot unit
const CON_W = 36;          // connector arm width between rounds
const ROUND_W = MATCH_W + CON_W; // total column width per round

function getMatchTop(roundIdx: number, matchIdx: number): number {
  const slotSize = UNIT * Math.pow(2, roundIdx);
  const firstOffset = (slotSize - MATCH_H) / 2;
  return firstOffset + matchIdx * slotSize;
}

function getBracketHeight(r1Count: number): number {
  return r1Count * UNIT - R1_GAP;
}

// ─── Bracket match card ───────────────────────────────────────────────────────

function BracketMatchCard({
  match,
  tournament,
  onScore,
  tournamentId,
}: {
  match: TournamentMatch;
  tournament: Tournament;
  onScore: (m: TournamentMatch) => void;
  tournamentId: string;
}) {
  const isBye = (match.entrant1Id === null) !== (match.entrant2Id === null);
  const isDone = match.status === 'completed';
  const canScore =
    tournament.status === 'active' &&
    !isBye &&
    match.entrant1Id !== null &&
    match.entrant2Id !== null;

  function label(id: string | null, round: number): string {
    if (id) return getEntrantName(tournament, id);
    return round === 1 ? 'BYE' : 'TBD';
  }

  const n1 = label(match.entrant1Id, match.round);
  const n2 = label(match.entrant2Id, match.round);

  function scoreBox(score: number | null, isWinner: boolean) {
    if (!isDone) {
      return (
        <span className="text-[11px] w-6 text-center text-zinc-500 font-mono shrink-0">
          —
        </span>
      );
    }
    return (
      <span
        className={`text-[11px] w-6 text-center font-bold rounded shrink-0 py-px ${
          isWinner ? 'bg-orange-500 text-white' : 'bg-zinc-700 text-zinc-400'
        }`}
      >
        {score ?? 0}
      </span>
    );
  }

  const w1 = isDone && match.winnerId === match.entrant1Id;
  const w2 = isDone && match.winnerId === match.entrant2Id;

  return (
    <div
      onClick={() => canScore && onScore(match)}
      className={`relative flex flex-col rounded overflow-hidden border ${
        isDone ? 'border-zinc-600' : 'border-zinc-700'
      } ${canScore ? 'cursor-pointer hover:border-orange-500 transition-colors' : ''}`}
      style={{ height: MATCH_H, width: MATCH_W }}
    >
      {/* Player 1 row */}
      <div
        className={`flex items-center gap-1.5 px-2 border-b border-zinc-700 ${
          w1 ? 'bg-zinc-600' : 'bg-zinc-800'
        }`}
        style={{ height: ENTRY_H }}
      >
        <span
          className={`flex-1 text-[12px] truncate leading-none ${
            w1 ? 'text-white font-semibold' : 'text-zinc-300'
          }`}
        >
          {n1}
        </span>
        {scoreBox(match.score1, w1)}
      </div>
      {/* Player 2 row */}
      <div
        className={`flex items-center gap-1.5 px-2 ${w2 ? 'bg-zinc-600' : 'bg-zinc-800'}`}
        style={{ height: ENTRY_H }}
      >
        <span
          className={`flex-1 text-[12px] truncate leading-none ${
            w2 ? 'text-white font-semibold' : 'text-zinc-300'
          }`}
        >
          {n2}
        </span>
        {scoreBox(match.score2, w2)}
      </div>
      <a
        href={`/umpire/${tournamentId}/${match.id}`}
        target="_blank"
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-1 right-1.5 text-[10px] text-zinc-500 hover:text-orange-400 transition-colors"
        title="Open umpire view"
      >
        🎤
      </a>
    </div>
  );
}

// ─── Bracket view ─────────────────────────────────────────────────────────────

function BracketView({
  tournament,
  onChange,
}: {
  tournament: Tournament;
  onChange: (t: Tournament) => void;
}) {
  const [scoringMatch, setScoringMatch] = useState<TournamentMatch | null>(null);

  const rounds = Array.from(new Set(tournament.matches.map((m) => m.round)))
    .sort((a, b) => a - b);

  if (rounds.length === 0) {
    return <p className="text-sm text-zinc-400 py-6">No bracket generated yet.</p>;
  }

  const matchesByRound = rounds.map((r) =>
    tournament.matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot)
  );

  const r1Count = matchesByRound[0].length;
  const totalH = getBracketHeight(r1Count);
  const totalW = rounds.length * ROUND_W;

  // Build SVG connector paths between adjacent rounds
  const connectorPaths: string[] = [];
  for (let ri = 0; ri < matchesByRound.length - 1; ri++) {
    const roundMatches = matchesByRound[ri];
    const pairs = Math.floor(roundMatches.length / 2);
    for (let pi = 0; pi < pairs; pi++) {
      const topIdx = pi * 2;
      const botIdx = pi * 2 + 1;
      const topCenter = getMatchTop(ri, topIdx) + MATCH_H / 2;
      const botCenter = getMatchTop(ri, botIdx) + MATCH_H / 2;
      const midY = (topCenter + botCenter) / 2;
      const x1 = ri * ROUND_W + MATCH_W;
      const xMid = x1 + CON_W / 2;
      const x2 = (ri + 1) * ROUND_W;
      connectorPaths.push(
        `M ${x1} ${topCenter} H ${xMid} V ${midY} M ${x1} ${botCenter} H ${xMid} V ${midY} M ${xMid} ${midY} H ${x2}`
      );
    }
  }

  // Round labels
  const totalRounds = rounds.length;
  function roundLabel(ri: number): string {
    const fromEnd = totalRounds - 1 - ri;
    if (fromEnd === 0) return 'Final';
    if (fromEnd === 1) return 'Semi-Finals';
    if (fromEnd === 2) return 'Quarter-Finals';
    return `Round ${ri + 1}`;
  }

  function handleSave(matchId: string, s1: number, s2: number) {
    onChange(recordScore(tournament, matchId, s1, s2));
  }

  return (
    <div className="rounded-xl bg-zinc-900 p-4 overflow-x-auto">
      {/* Round labels */}
      <div className="flex mb-2" style={{ width: totalW }}>
        {rounds.map((_, ri) => (
          <div key={ri} className="text-center" style={{ width: ROUND_W }}>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
              {roundLabel(ri)}
            </span>
          </div>
        ))}
      </div>

      {/* Bracket canvas */}
      <div style={{ position: 'relative', width: totalW, height: totalH }}>
        {/* SVG connector lines */}
        <svg
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          width={totalW}
          height={totalH}
        >
          {connectorPaths.map((d, i) => (
            <path key={i} d={d} stroke="#52525b" strokeWidth={1.5} fill="none" />
          ))}
        </svg>

        {/* Match cards */}
        {matchesByRound.map((roundMatches, ri) =>
          roundMatches.map((match, mi) => (
            <div
              key={match.id}
              style={{
                position: 'absolute',
                top: getMatchTop(ri, mi),
                left: ri * ROUND_W,
              }}
            >
              <BracketMatchCard
                match={match}
                tournament={tournament}
                onScore={setScoringMatch}
                tournamentId={tournament.id}
              />
            </div>
          ))
        )}
      </div>

      {scoringMatch && (
        <ScoreModal
          match={scoringMatch}
          tournament={tournament}
          onSave={handleSave}
          onClose={() => setScoringMatch(null)}
        />
      )}
    </div>
  );
}

// ─── Score entry modal ────────────────────────────────────────────────────────

function ScoreModal({
  match,
  tournament,
  onSave,
  onClose,
}: {
  match: TournamentMatch;
  tournament: Tournament;
  onSave: (matchId: string, s1: number, s2: number) => void;
  onClose: () => void;
}) {
  const maxScore = tournament.maxScore ?? 11;
  const winCondition = tournament.winCondition ?? 'win-by-2';
  const [s1, setS1] = useState(match.score1?.toString() ?? '');
  const [s2, setS2] = useState(match.score2?.toString() ?? '');
  const name1 = match.entrant1Id ? getEntrantName(tournament, match.entrant1Id) : 'BYE';
  const name2 = match.entrant2Id ? getEntrantName(tournament, match.entrant2Id) : 'BYE';

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n1 = parseInt(s1, 10);
    const n2 = parseInt(s2, 10);
    if (isNaN(n1) || isNaN(n2) || n1 < 0 || n2 < 0) return;
    const winner = n1 > n2 ? n1 : n2;
    const loser = n1 > n2 ? n2 : n1;
    let valid = false;
    if (winCondition === 'sudden-death') valid = winner >= maxScore;
    else valid = winner >= maxScore && winner - loser >= 2;
    if (!valid && !confirm(`Score doesn't match win condition (play to ${maxScore}${winCondition === 'win-by-2' ? ', win by 2' : ''}). Save anyway?`)) return;
    onSave(match.id, n1, n2);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-pb-green">Enter Score</h2>
          <span className="text-xs text-pb-text/40 bg-pb-bg px-2 py-0.5 rounded-full font-medium">
            Play to {maxScore} · {winCondition === 'win-by-2' ? 'Win by 2' : 'Sudden Death'}
          </span>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4 mt-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-medium text-pb-text/70 truncate">{name1}</span>
              <input
                autoFocus
                type="number"
                min={0}
                max={maxScore}
                value={s1}
                onChange={(e) => setS1(e.target.value)}
                className="border border-pb-border rounded-lg px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-pb-green"
              />
            </div>
            <span className="text-pb-text/40 font-bold mt-4">vs</span>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-xs font-medium text-pb-text/70 truncate">{name2}</span>
              <input
                type="number"
                min={0}
                max={maxScore}
                value={s2}
                onChange={(e) => setS2(e.target.value)}
                className="border border-pb-border rounded-lg px-3 py-2 text-center text-lg font-bold focus:outline-none focus:ring-2 focus:ring-pb-green"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-pb-border rounded-lg py-2 text-sm font-medium hover:bg-pb-bg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 bg-pb-green hover:bg-pb-green/80 text-white rounded-lg py-2 text-sm font-semibold transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Round-robin visual view ──────────────────────────────────────────────────

const RR_MATCH_W = 200;

function RoundRobinView({
  tournament,
  onChange,
}: {
  tournament: Tournament;
  onChange: (t: Tournament) => void;
}) {
  const [scoringMatch, setScoringMatch] = useState<TournamentMatch | null>(null);

  const rounds = Array.from(new Set(tournament.matches.map((m) => m.round))).sort(
    (a, b) => a - b
  );
  const standings = computeStandings(tournament);
  const totalMatches = tournament.matches.length;
  const doneMatches = tournament.matches.filter((m) => m.status === 'completed').length;

  function handleSave(matchId: string, s1: number, s2: number) {
    onChange(recordScore(tournament, matchId, s1, s2));
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-zinc-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-pb-green rounded-full transition-all"
            style={{ width: totalMatches ? `${(doneMatches / totalMatches) * 100}%` : '0%' }}
          />
        </div>
        <span className="text-xs text-pb-text/50 shrink-0">
          {doneMatches}/{totalMatches} matches
        </span>
      </div>

      {/* Round columns */}
      <div className="rounded-xl bg-zinc-900 p-4 overflow-x-auto">
        {/* Column headers */}
        <div className="flex gap-3 mb-3" style={{ minWidth: rounds.length * (RR_MATCH_W + 12) }}>
          {rounds.map((r) => (
            <div key={r} className="shrink-0 text-center" style={{ width: RR_MATCH_W }}>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                Round {r}
              </span>
            </div>
          ))}
        </div>

        {/* Match cards per round */}
        <div className="flex gap-3 items-start" style={{ minWidth: rounds.length * (RR_MATCH_W + 12) }}>
          {rounds.map((r) => {
            const roundMatches = tournament.matches
              .filter((m) => m.round === r)
              .sort((a, b) => a.slot - b.slot);
            return (
              <div key={r} className="flex flex-col gap-2 shrink-0" style={{ width: RR_MATCH_W }}>
                {roundMatches.map((match) => (
                  <BracketMatchCard
                    key={match.id}
                    match={match}
                    tournament={tournament}
                    onScore={setScoringMatch}
                    tournamentId={tournament.id}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inline standings */}
      {standings.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-pb-text/50 mb-2">
            Standings
          </h3>
          <div className="rounded-xl border border-pb-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-pb-bg">
                <tr className="text-left text-xs text-pb-text/50">
                  <th className="px-4 py-2 font-semibold">#</th>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold text-center">W</th>
                  <th className="px-4 py-2 font-semibold text-center">L</th>
                  <th className="px-4 py-2 font-semibold text-center">+/−</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-pb-border/50">
                {standings.map((s, i) => (
                  <tr key={s.entrantId} className={i === 0 ? 'bg-pb-green/5' : ''}>
                    <td className="px-4 py-2 text-pb-text/40 text-xs">{i + 1}</td>
                    <td className="px-4 py-2 font-medium flex items-center gap-2">
                      {i === 0 && <span className="text-pb-yellow text-base leading-none">🥇</span>}
                      {i === 1 && <span className="text-pb-text/40 text-base leading-none">🥈</span>}
                      {i === 2 && <span className="text-pb-text/40 text-base leading-none">🥉</span>}
                      <span className={i === 0 ? 'text-pb-green font-bold' : ''}>
                        {getEntrantName(tournament, s.entrantId)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center font-semibold text-pb-green">{s.wins}</td>
                    <td className="px-4 py-2 text-center text-pb-text/60">{s.losses}</td>
                    <td className="px-4 py-2 text-center text-pb-text/60">
                      {s.pointsFor - s.pointsAgainst > 0 ? '+' : ''}
                      {s.pointsFor - s.pointsAgainst}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {scoringMatch && (
        <ScoreModal
          match={scoringMatch}
          tournament={tournament}
          onSave={handleSave}
          onClose={() => setScoringMatch(null)}
        />
      )}
    </div>
  );
}

// ─── Import from Roster modal ─────────────────────────────────────────────────

function ImportRosterModal({
  tournament,
  onChange,
  onClose,
}: {
  tournament: Tournament;
  onChange: (t: Tournament) => void;
  onClose: () => void;
}) {
  const [rosterPlayers, setRosterPlayers] = useState<PlayerProfile[]>([]);

  useEffect(() => {
    setRosterPlayers(loadPlayers());
  }, []);

  function isAlreadyAdded(rp: PlayerProfile): boolean {
    return tournament.players.some((p) => p.id === rp.id || p.name === rp.name);
  }

  function handleAdd(rp: PlayerProfile) {
    if (isAlreadyAdded(rp)) return;
    onChange(addPlayer(tournament, rp.name, rp.skillLevel));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-pb-green">Import from Roster</h2>
          <button
            onClick={onClose}
            className="text-pb-text/40 hover:text-pb-text transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        {rosterPlayers.length === 0 ? (
          <p className="text-sm text-pb-text/40 text-center py-8">No saved players found in roster.</p>
        ) : (
          <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
            {rosterPlayers.map((rp) => {
              const added = isAlreadyAdded(rp);
              return (
                <button
                  key={rp.id}
                  type="button"
                  disabled={added}
                  onClick={() => handleAdd(rp)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    added
                      ? 'bg-pb-bg border-pb-border text-pb-text/30 cursor-not-allowed'
                      : 'bg-pb-green/10 border-pb-green/30 text-pb-green hover:bg-pb-green/20'
                  }`}
                  title={added ? 'Already in tournament' : `${rp.name} — ${SKILL_LABELS[rp.skillLevel]}`}
                >
                  {rp.name}
                  <span className="ml-1.5 text-xs opacity-60">{rp.skillLevel}</span>
                  {added && <span className="ml-1 text-xs">✓</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-pb-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-pb-green hover:bg-pb-green/80 text-white rounded-lg text-sm font-semibold transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Setup tab ────────────────────────────────────────────────────────────────

function SetupTab({
  tournament,
  onChange,
}: {
  tournament: Tournament;
  onChange: (t: Tournament) => void;
}) {
  const isDoubles = tournament.matchType === 'doubles';
  const [playerName, setPlayerName] = useState('');
  const [playerSkill, setPlayerSkill] = useState<SkillLevel>('3.0');
  const [teamName, setTeamName] = useState('');
  const [teamNameEdited, setTeamNameEdited] = useState(false);
  const [teamP1, setTeamP1] = useState('');
  const [teamP2, setTeamP2] = useState('');
  const [showImportRoster, setShowImportRoster] = useState(false);
  const [playerPage, setPlayerPage] = useState(0);
  const [teamPage, setTeamPage] = useState(0);
  const LIST_SIZE = 5;

  // Auto-generate team name from selected players (unless user has manually edited it)
  useEffect(() => {
    if (teamNameEdited) return;
    const p1 = tournament.players.find((p) => p.id === teamP1);
    const p2 = tournament.players.find((p) => p.id === teamP2);
    const parts = [p1?.name, p2?.name].filter(Boolean);
    setTeamName(parts.length > 0 ? parts.join(' / ') : '');
  }, [teamP1, teamP2, tournament.players, teamNameEdited]);

  function submitPlayer(e: React.FormEvent) {
    e.preventDefault();
    if (!playerName.trim()) return;
    onChange(addPlayer(tournament, playerName.trim(), playerSkill));
    setPlayerName('');
    setPlayerPage(Math.floor(tournament.players.length / LIST_SIZE));
  }

  function submitTeam(e: React.FormEvent) {
    e.preventDefault();
    if (!teamName.trim()) return;
    const playerIds = [teamP1, teamP2].filter(Boolean);
    onChange(addTeam(tournament, teamName.trim(), playerIds));
    setTeamName('');
    setTeamNameEdited(false);
    setTeamP1('');
    setTeamP2('');
    setTeamPage(Math.floor(tournament.teams.length / LIST_SIZE));
  }

  function removePlayer(id: string) {
    onChange({ ...tournament, players: tournament.players.filter((p) => p.id !== id) });
  }

  function removeTeam(id: string) {
    onChange({ ...tournament, teams: tournament.teams.filter((t) => t.id !== id) });
  }

  function handleGenerate() {
    const entrantCount = isDoubles ? tournament.teams.length : tournament.players.length;
    if (entrantCount < 2) {
      alert(`Need at least 2 ${isDoubles ? 'teams' : 'players'} to generate a schedule.`);
      return;
    }
    onChange(generateSchedule(tournament));
  }

  const canGenerate =
    (isDoubles ? tournament.teams.length : tournament.players.length) >= 2 &&
    tournament.status === 'setup';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Players */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-pb-text">Players ({tournament.players.length})</h3>
          <button
            type="button"
            onClick={() => setShowImportRoster(true)}
            className="text-xs text-pb-green hover:text-pb-green/80 font-medium border border-pb-green/30 rounded-lg px-2.5 py-1 transition-colors bg-pb-green/5 hover:bg-pb-green/10"
          >
            Import from Roster
          </button>
        </div>
        <form onSubmit={submitPlayer} className="flex flex-col gap-2 mb-3">
          <input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Player name"
            className="border border-pb-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pb-green"
          />
          <select
            value={playerSkill}
            onChange={(e) => setPlayerSkill(e.target.value as SkillLevel)}
            className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
          >
            {SKILL_LEVELS.map((s) => (
              <option key={s} value={s}>{SKILL_LABELS[s]}</option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-pb-green hover:bg-pb-green/80 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
          >
            + Add Player
          </button>
        </form>
        {(() => {
          const totalPlayerPages = Math.max(1, Math.ceil(tournament.players.length / LIST_SIZE));
          const safePlayerPage = Math.min(playerPage, totalPlayerPages - 1);
          const paginatedPlayers = tournament.players.slice(safePlayerPage * LIST_SIZE, safePlayerPage * LIST_SIZE + LIST_SIZE);
          return (
            <>
              <ul className="space-y-1">
                {paginatedPlayers.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm bg-pb-card border border-pb-border rounded-lg px-3 py-1.5">
                    <span className="flex-1 font-medium">{p.name}</span>
                    <span className="text-xs text-pb-text/50">{p.skillLevel}</span>
                    <button onClick={() => removePlayer(p.id)} className="text-pb-text/30 hover:text-red-500 transition-colors">×</button>
                  </li>
                ))}
              </ul>
              {totalPlayerPages > 1 && (
                <div className="flex items-center justify-between mt-2 text-xs text-pb-text/50">
                  <span>{safePlayerPage * LIST_SIZE + 1}–{Math.min((safePlayerPage + 1) * LIST_SIZE, tournament.players.length)} of {tournament.players.length}</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setPlayerPage((p) => Math.max(0, p - 1))} disabled={safePlayerPage === 0} className="px-2 py-0.5 rounded hover:bg-pb-bg disabled:opacity-30">‹</button>
                    {Array.from({ length: totalPlayerPages }, (_, i) => (
                      <button key={i} onClick={() => setPlayerPage(i)} className={`w-6 h-6 rounded text-xs font-semibold ${i === safePlayerPage ? 'bg-pb-green text-white' : 'hover:bg-pb-bg'}`}>{i + 1}</button>
                    ))}
                    <button onClick={() => setPlayerPage((p) => Math.min(totalPlayerPages - 1, p + 1))} disabled={safePlayerPage === totalPlayerPages - 1} className="px-2 py-0.5 rounded hover:bg-pb-bg disabled:opacity-30">›</button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Teams — doubles only */}
      {isDoubles && (
        <div>
          <h3 className="font-semibold text-pb-text mb-3">Teams ({tournament.teams.length})</h3>
          <form onSubmit={submitTeam} className="flex flex-col gap-2 mb-3">
            <select
              value={teamP1}
              onChange={(e) => { setTeamP1(e.target.value); setTeamNameEdited(false); }}
              className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
            >
              <option value="">Player 1</option>
              {tournament.players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={teamP2}
              onChange={(e) => { setTeamP2(e.target.value); setTeamNameEdited(false); }}
              className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
            >
              <option value="">Player 2</option>
              {tournament.players.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              value={teamName}
              onChange={(e) => { setTeamName(e.target.value); setTeamNameEdited(true); }}
              placeholder="Team name (auto-filled)"
              className="border border-pb-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pb-green"
            />
            <button
              type="submit"
              className="bg-pb-green hover:bg-pb-green/80 text-white text-sm font-semibold py-2 rounded-lg transition-colors"
            >
              + Add Team
            </button>
          </form>
          {(() => {
            const totalTeamPages = Math.max(1, Math.ceil(tournament.teams.length / LIST_SIZE));
            const safeTeamPage = Math.min(teamPage, totalTeamPages - 1);
            const paginatedTeams = tournament.teams.slice(safeTeamPage * LIST_SIZE, safeTeamPage * LIST_SIZE + LIST_SIZE);
            return (
              <>
                <ul className="space-y-1">
                  {paginatedTeams.map((t) => (
                    <li key={t.id} className="flex items-center gap-2 text-sm bg-pb-card border border-pb-border rounded-lg px-3 py-1.5">
                      <span className="flex-1 font-medium">{t.name}</span>
                      <button onClick={() => removeTeam(t.id)} className="text-pb-text/30 hover:text-red-500 transition-colors">×</button>
                    </li>
                  ))}
                </ul>
                {totalTeamPages > 1 && (
                  <div className="flex items-center justify-between mt-2 text-xs text-pb-text/50">
                    <span>{safeTeamPage * LIST_SIZE + 1}–{Math.min((safeTeamPage + 1) * LIST_SIZE, tournament.teams.length)} of {tournament.teams.length}</span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setTeamPage((p) => Math.max(0, p - 1))} disabled={safeTeamPage === 0} className="px-2 py-0.5 rounded hover:bg-pb-bg disabled:opacity-30">‹</button>
                      {Array.from({ length: totalTeamPages }, (_, i) => (
                        <button key={i} onClick={() => setTeamPage(i)} className={`w-6 h-6 rounded text-xs font-semibold ${i === safeTeamPage ? 'bg-pb-green text-white' : 'hover:bg-pb-bg'}`}>{i + 1}</button>
                      ))}
                      <button onClick={() => setTeamPage((p) => Math.min(totalTeamPages - 1, p + 1))} disabled={safeTeamPage === totalTeamPages - 1} className="px-2 py-0.5 rounded hover:bg-pb-bg disabled:opacity-30">›</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Max score */}
      <div className="md:col-span-2 border-t border-pb-border pt-6">
        <label className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-pb-text">Max score (play to)</p>
            <p className="text-xs text-pb-text/50 mt-0.5">Shown in score entry and enforced as the winning score.</p>
          </div>
          <select
            value={tournament.maxScore ?? 11}
            onChange={(e) => onChange({ ...tournament, maxScore: Number(e.target.value) })}
            disabled={tournament.status !== 'setup'}
            className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green disabled:opacity-50"
          >
            <option value={11}>11 points</option>
            <option value={15}>15 points</option>
            <option value={21}>21 points</option>
          </select>
        </label>
        {/* Win condition */}
        <div className="flex items-center justify-between gap-4 mt-3">
          <div>
            <p className="text-sm font-semibold text-pb-text">Win condition</p>
            <p className="text-xs text-pb-text/50 mt-0.5">How the winner is determined at max score.</p>
          </div>
          <select
            value={tournament.winCondition ?? 'win-by-2'}
            onChange={(e) => onChange({ ...tournament, winCondition: e.target.value as 'sudden-death' | 'win-by-2' })}
            disabled={tournament.status !== 'setup'}
            className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green disabled:opacity-50"
          >
            <option value="win-by-2">Win by 2</option>
            <option value="sudden-death">Sudden Death</option>
          </select>
        </div>
      </div>

      {/* Generate */}
      <div className="md:col-span-2 border-t border-pb-border pt-6 flex items-center justify-between gap-4">
        <p className="text-sm text-pb-text/60">
          {canGenerate
            ? 'Ready to generate the schedule.'
            : `Add at least 2 ${isDoubles ? 'teams' : 'players'} to generate.`}
        </p>
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="bg-pb-green hover:bg-pb-green/80 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors shrink-0"
        >
          ⚡ Generate Schedule
        </button>
      </div>

      {showImportRoster && (
        <ImportRosterModal
          tournament={tournament}
          onChange={onChange}
          onClose={() => setShowImportRoster(false)}
        />
      )}
    </div>
  );
}

// ─── Standings tab ────────────────────────────────────────────────────────────

function StandingsTab({ tournament }: { tournament: Tournament }) {
  const standings = computeStandings(tournament);
  if (standings.length === 0) {
    return <p className="text-sm text-pb-text/40 py-6">No matches played yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-pb-text/50 border-b border-pb-border">
            <th className="pb-2 pr-4 font-semibold">#</th>
            <th className="pb-2 pr-4 font-semibold">Name</th>
            <th className="pb-2 pr-4 font-semibold text-center">W</th>
            <th className="pb-2 pr-4 font-semibold text-center">L</th>
            <th className="pb-2 pr-4 font-semibold text-center">PF</th>
            <th className="pb-2 font-semibold text-center">PA</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s, i) => (
            <tr
              key={s.entrantId}
              className={`border-b border-pb-border/50 ${i === 0 ? 'font-bold text-pb-green' : ''}`}
            >
              <td className="py-2 pr-4 text-pb-text/40">{i + 1}</td>
              <td className="py-2 pr-4">{getEntrantName(tournament, s.entrantId)}</td>
              <td className="py-2 pr-4 text-center">{s.wins}</td>
              <td className="py-2 pr-4 text-center">{s.losses}</td>
              <td className="py-2 pr-4 text-center">{s.pointsFor}</td>
              <td className="py-2 text-center">{s.pointsAgainst}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = 'setup' | 'schedule' | 'standings';

export default function TournamentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [tab, setTab] = useState<Tab>('setup');

  useEffect(() => {
    const t = loadTournament(id);
    if (t) {
      setTournament(t);
      if (t.status !== 'setup') setTab('schedule');
    }
  }, [id]);

  function handleChange(updated: Tournament) {
    upsertTournament(updated);
    setTournament(updated);
  }

  if (!tournament) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-pb-text/40">
        Tournament not found.{' '}
        <Link href="/tournament" className="text-pb-green underline">Back to list</Link>
      </div>
    );
  }

  const isElim = tournament.format === 'single-elimination';

  const tabs: { id: Tab; label: string }[] = [
    { id: 'setup', label: 'Setup' },
    { id: 'schedule', label: isElim ? 'Bracket' : 'Schedule' },
    ...(!isElim ? [{ id: 'standings' as Tab, label: 'Standings' }] : []),
  ];

  const completedMatches = tournament.matches.filter((m) => m.status === 'completed').length;
  const allDone = tournament.matches.length > 0 && completedMatches === tournament.matches.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href="/tournament" className="text-sm text-pb-text/50 hover:text-pb-green transition-colors">
          ← Tournaments
        </Link>
        <div className="flex items-start justify-between mt-2 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-pb-green">{tournament.name}</h1>
            <div className="text-sm text-pb-text/60 mt-0.5 flex gap-3 flex-wrap">
              {tournament.date && <span>{tournament.date}</span>}
              {tournament.location && <span>{tournament.location}</span>}
              <span className="capitalize">{tournament.format.replace('-', ' ')}</span>
              <span className="capitalize">{tournament.matchType}</span>
            </div>
          </div>
          {allDone && tournament.status !== 'completed' && (
            <button
              onClick={() => handleChange({ ...tournament, status: 'completed' })}
              className="bg-pb-yellow hover:bg-pb-yellow/80 text-pb-text font-semibold text-sm px-4 py-2 rounded-lg transition-colors shrink-0"
            >
              ✓ Mark Complete
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-pb-border mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-pb-green text-pb-green'
                : 'border-transparent text-pb-text/50 hover:text-pb-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'setup' && <SetupTab tournament={tournament} onChange={handleChange} />}

      {tab === 'schedule' && tournament.matches.length === 0 && (
        <p className="text-sm text-pb-text/40 py-6">Generate a schedule from the Setup tab first.</p>
      )}
      {tab === 'schedule' && tournament.matches.length > 0 && isElim && (
        <BracketView tournament={tournament} onChange={handleChange} />
      )}
      {tab === 'schedule' && tournament.matches.length > 0 && !isElim && (
        <RoundRobinView tournament={tournament} onChange={handleChange} />
      )}

      {tab === 'standings' && <StandingsTab tournament={tournament} />}
    </div>
  );
}
