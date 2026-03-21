'use client';

import { useEffect, useState } from 'react';
import { deletePlayer, loadPlayers, loadTournaments, upsertPlayer } from '../lib/storage';
import type { PlayerProfile, SkillLevel, Tournament } from '../lib/types';
import { SKILL_LABELS, SKILL_LEVELS } from '../lib/types';

const PAGE_SIZE = 10;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

const SKILL_COLORS: Record<string, string> = {
  '2.0': 'bg-zinc-100 text-zinc-600',
  '2.5': 'bg-blue-50 text-blue-700',
  '3.0': 'bg-green-50 text-green-700',
  '3.5': 'bg-teal-50 text-teal-700',
  '4.0': 'bg-yellow-50 text-yellow-700',
  '4.5': 'bg-orange-50 text-orange-700',
  '5.0': 'bg-red-50 text-red-700',
};

function SkillBadge({ level }: { level: SkillLevel }) {
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2.5 py-0.5 rounded-full ${SKILL_COLORS[level] ?? 'bg-zinc-100 text-zinc-600'}`}>
      {level}
    </span>
  );
}

type SortKey = 'name' | 'skill' | 'createdAt';
type SortDir = 'asc' | 'desc';

function AddPlayerForm({ onAdd }: { onAdd: (name: string, skill: SkillLevel) => void }) {
  const [name, setName] = useState('');
  const [skill, setSkill] = useState<SkillLevel>('3.0');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, skill);
    setName('');
  }

  return (
    <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Player name"
        className="flex-1 border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
      />
      <select
        value={skill}
        onChange={(e) => setSkill(e.target.value as SkillLevel)}
        className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
      >
        {SKILL_LEVELS.map((s) => (
          <option key={s} value={s}>{SKILL_LABELS[s]}</option>
        ))}
      </select>
      <button
        type="submit"
        className="bg-pb-green hover:bg-pb-green/80 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors whitespace-nowrap"
      >
        + Add Player
      </button>
    </form>
  );
}

function EditSkillInline({
  current,
  onSave,
  onCancel,
}: {
  current: SkillLevel;
  onSave: (s: SkillLevel) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState<SkillLevel>(current);
  return (
    <div className="flex items-center gap-2">
      <select
        value={val}
        onChange={(e) => setVal(e.target.value as SkillLevel)}
        autoFocus
        className="border border-pb-border rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
      >
        {SKILL_LEVELS.map((s) => (
          <option key={s} value={s}>{SKILL_LABELS[s]}</option>
        ))}
      </select>
      <button onClick={() => onSave(val)} className="text-xs bg-pb-green text-white px-2 py-1 rounded-lg font-semibold hover:bg-pb-green/80 transition-colors">Save</button>
      <button onClick={onCancel} className="text-xs text-pb-text/40 hover:text-pb-text px-1 transition-colors">Cancel</button>
    </div>
  );
}

// ─── Player stats helpers ─────────────────────────────────────────────────────

interface PlayerStat {
  name: string;
  wins: number;
  losses: number;
  tournamentsPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
}

function computePlayerStats(tournaments: Tournament[]): Record<string, PlayerStat> {
  const stats: Record<string, PlayerStat> = {};

  function getOrCreate(name: string): PlayerStat {
    if (!stats[name]) stats[name] = { name, wins: 0, losses: 0, tournamentsPlayed: 0, pointsFor: 0, pointsAgainst: 0 };
    return stats[name];
  }

  for (const t of tournaments) {
    // Gather all entrant names that played
    const entrantNames: Record<string, string[]> = {}; // entrantId -> player names
    if (t.matchType === 'singles') {
      for (const p of t.players) entrantNames[p.id] = [p.name];
    } else {
      for (const team of t.teams) {
        entrantNames[team.id] = team.playerIds.map((pid) => t.players.find((p) => p.id === pid)?.name ?? '').filter(Boolean);
      }
    }

    const participated = new Set<string>();

    for (const m of t.matches) {
      if (m.status !== 'completed' || !m.entrant1Id || !m.entrant2Id || m.is3rdPlace) continue;
      const names1 = entrantNames[m.entrant1Id] ?? [];
      const names2 = entrantNames[m.entrant2Id] ?? [];
      const isE1Win = m.winnerId === m.entrant1Id;

      for (const n of names1) {
        participated.add(n);
        const s = getOrCreate(n);
        if (isE1Win) s.wins++; else s.losses++;
        s.pointsFor += m.score1 ?? 0;
        s.pointsAgainst += m.score2 ?? 0;
      }
      for (const n of names2) {
        participated.add(n);
        const s = getOrCreate(n);
        if (!isE1Win) s.wins++; else s.losses++;
        s.pointsFor += m.score2 ?? 0;
        s.pointsAgainst += m.score1 ?? 0;
      }
    }

    for (const name of participated) getOrCreate(name).tournamentsPlayed++;
  }
  return stats;
}

// ─── Head-to-head helpers ─────────────────────────────────────────────────────

interface H2HMatch {
  tournamentName: string;
  score: string;
  winner: string;
}

function getH2H(tournaments: Tournament[], nameA: string, nameB: string): H2HMatch[] {
  const results: H2HMatch[] = [];
  const na = nameA.toLowerCase();
  const nb = nameB.toLowerCase();

  for (const t of tournaments) {
    const entrantNames: Record<string, string[]> = {};
    if (t.matchType === 'singles') {
      for (const p of t.players) entrantNames[p.id] = [p.name];
    } else {
      for (const team of t.teams) {
        entrantNames[team.id] = team.playerIds.map((pid) => t.players.find((p) => p.id === pid)?.name ?? '').filter(Boolean);
      }
    }

    for (const m of t.matches) {
      if (m.status !== 'completed' || !m.entrant1Id || !m.entrant2Id) continue;
      const names1 = (entrantNames[m.entrant1Id] ?? []).map((n) => n.toLowerCase());
      const names2 = (entrantNames[m.entrant2Id] ?? []).map((n) => n.toLowerCase());
      const hasA1 = names1.some((n) => n === na), hasA2 = names2.some((n) => n === na);
      const hasB1 = names1.some((n) => n === nb), hasB2 = names2.some((n) => n === nb);
      if ((hasA1 && hasB2) || (hasA2 && hasB1)) {
        const winnerNames = m.winnerId ? (entrantNames[m.winnerId] ?? []).join(' / ') : '—';
        results.push({
          tournamentName: t.name,
          score: `${m.score1 ?? '?'} – ${m.score2 ?? '?'}`,
          winner: winnerNames,
        });
      }
    }
  }
  return results;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type PageView = 'roster' | 'stats' | 'h2h';

export default function PlayersPage() {
  const [players, setPlayers] = useState<PlayerProfile[] | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [view, setView] = useState<PageView>('roster');
  const [search, setSearch] = useState('');
  const [skillFilter, setSkillFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [h2hA, setH2hA] = useState('');
  const [h2hB, setH2hB] = useState('');

  useEffect(() => {
    setPlayers(loadPlayers());
    setTournaments(loadTournaments());
  }, []);

  if (players === null) return <div className="p-8 text-center text-pb-text/40">Loading…</div>;

  function handleAdd(name: string, skillLevel: SkillLevel) {
    const player: PlayerProfile = { id: uid(), name, skillLevel, createdAt: Date.now() };
    upsertPlayer(player);
    setPlayers(loadPlayers());
  }

  function handleUpdateSkill(id: string, skillLevel: SkillLevel) {
    const player = players!.find((p) => p.id === id);
    if (!player) return;
    upsertPlayer({ ...player, skillLevel });
    setPlayers(loadPlayers());
    setEditingId(null);
  }

  function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the roster?`)) return;
    deletePlayer(id);
    setPlayers(loadPlayers());
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  }

  function handleSearch(v: string) { setSearch(v); setPage(0); }
  function handleFilter(v: string) { setSkillFilter(v); setPage(0); }

  // Filter
  const filtered = players
    .filter((p) => p.name.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => skillFilter === 'all' || p.skillLevel === skillFilter);

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
    else if (sortKey === 'skill') cmp = SKILL_LEVELS.indexOf(a.skillLevel) - SKILL_LEVELS.indexOf(b.skillLevel);
    else if (sortKey === 'createdAt') cmp = a.createdAt - b.createdAt;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const presentSkills = Array.from(new Set(players.map((p) => p.skillLevel))).sort();

  // Skill distribution for stats bar
  const skillCounts = SKILL_LEVELS.reduce((acc, s) => {
    acc[s] = players.filter((p) => p.skillLevel === s).length;
    return acc;
  }, {} as Record<string, number>);

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-pb-text/20 ml-1">↕</span>;
    return <span className="text-pb-green ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const playerStats = computePlayerStats(tournaments);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">

      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-pb-green">Player Profiles</h1>
          <p className="text-sm text-pb-text/60 mt-0.5">
            {players.length} registered player{players.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex border-b border-pb-border mb-6">
        {([['roster', 'Roster'], ['stats', 'Stats'], ['h2h', 'Head-to-Head']] as [PageView, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === v ? 'border-pb-green text-pb-green' : 'border-transparent text-pb-text/50 hover:text-pb-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Stats view */}
      {view === 'stats' && (
        <div>
          {Object.keys(playerStats).length === 0 ? (
            <p className="text-sm text-pb-text/40 py-8 text-center">No tournament match data yet. Complete some matches to see stats.</p>
          ) : (
            <div className="bg-pb-card border border-pb-border rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_5rem_5rem_5rem_6rem] gap-x-4 px-4 py-2.5 bg-pb-bg border-b border-pb-border text-xs font-bold uppercase tracking-wide text-pb-text/40">
                <span>Player</span>
                <span className="text-center">W</span>
                <span className="text-center">L</span>
                <span className="text-center">Win %</span>
                <span className="text-center">Tournaments</span>
              </div>
              <div className="divide-y divide-pb-border">
                {Object.values(playerStats)
                  .sort((a, b) => (b.wins / Math.max(b.wins + b.losses, 1)) - (a.wins / Math.max(a.wins + a.losses, 1)))
                  .map((s) => {
                    const total = s.wins + s.losses;
                    const pct = total > 0 ? Math.round((s.wins / total) * 100) : 0;
                    return (
                      <div key={s.name} className="grid grid-cols-[1fr_5rem_5rem_5rem_6rem] gap-x-4 px-4 py-3 items-center hover:bg-pb-bg/50 transition-colors">
                        <div className="font-semibold text-sm truncate">{s.name}</div>
                        <div className="text-center text-sm font-bold text-pb-green">{s.wins}</div>
                        <div className="text-center text-sm text-pb-text/50">{s.losses}</div>
                        <div className="text-center text-sm font-semibold">{pct}%</div>
                        <div className="text-center text-sm text-pb-text/50">{s.tournamentsPlayed}</div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Head-to-head view */}
      {view === 'h2h' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row gap-2 items-end">
            <label className="flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium text-pb-text/70">Player A</span>
              <input
                list="h2h-players"
                value={h2hA}
                onChange={(e) => setH2hA(e.target.value)}
                placeholder="Type a player name…"
                className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
              />
            </label>
            <span className="text-pb-text/40 font-bold text-lg pb-2">vs</span>
            <label className="flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium text-pb-text/70">Player B</span>
              <input
                list="h2h-players"
                value={h2hB}
                onChange={(e) => setH2hB(e.target.value)}
                placeholder="Type a player name…"
                className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
              />
            </label>
            <datalist id="h2h-players">
              {players.map((p) => <option key={p.id} value={p.name} />)}
            </datalist>
          </div>

          {h2hA && h2hB && h2hA !== h2hB && (() => {
            const matches = getH2H(tournaments, h2hA, h2hB);
            const aWins = matches.filter((m) => m.winner.toLowerCase().includes(h2hA.toLowerCase())).length;
            const bWins = matches.filter((m) => m.winner.toLowerCase().includes(h2hB.toLowerCase())).length;
            return (
              <div>
                <div className="flex items-center justify-center gap-6 py-4 bg-pb-green/5 rounded-xl border border-pb-green/20 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-black text-pb-green">{aWins}</div>
                    <div className="text-xs text-pb-text/60 font-medium truncate max-w-[100px]">{h2hA}</div>
                  </div>
                  <div className="text-pb-text/30 font-bold">—</div>
                  <div className="text-center">
                    <div className="text-2xl font-black text-pb-green">{bWins}</div>
                    <div className="text-xs text-pb-text/60 font-medium truncate max-w-[100px]">{h2hB}</div>
                  </div>
                </div>
                {matches.length === 0 ? (
                  <p className="text-sm text-pb-text/40 text-center py-4">No completed matches found between these players.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {matches.map((m, i) => (
                      <div key={i} className="border border-pb-border rounded-xl px-4 py-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-pb-text">{m.score}</span>
                          <span className="text-xs text-pb-green font-medium">🏆 {m.winner}</span>
                        </div>
                        <p className="text-xs text-pb-text/40 mt-0.5">{m.tournamentName}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {h2hA && h2hB && h2hA === h2hB && (
            <p className="text-sm text-pb-text/40 text-center">Select two different players.</p>
          )}
        </div>
      )}

      {/* Roster view */}
      {view === 'roster' && <>

      {/* Skill distribution */}
      {players.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 mb-6">
          {SKILL_LEVELS.map((s) => (
            <button
              key={s}
              onClick={() => handleFilter(skillFilter === s ? 'all' : s)}
              className={`rounded-xl p-2 text-center border transition-all ${
                skillFilter === s
                  ? 'border-pb-green bg-pb-green/10'
                  : 'border-pb-border bg-pb-card hover:border-pb-green/50'
              }`}
            >
              <div className="text-lg font-bold text-pb-green">{skillCounts[s] ?? 0}</div>
              <div className={`text-[11px] font-bold mt-0.5 ${SKILL_COLORS[s]?.split(' ')[1] ?? 'text-zinc-500'}`}>{s}</div>
            </button>
          ))}
        </div>
      )}

      {/* Add player */}
      <div className="bg-pb-card border border-pb-border rounded-xl p-4 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-pb-text/50 mb-3">Add New Player</h2>
        <AddPlayerForm onAdd={handleAdd} />
      </div>

      {/* Search + filter */}
      {players.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search players…"
              className="w-full border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green pr-8"
            />
            {search && (
              <button onClick={() => handleSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-pb-text/30 hover:text-pb-text text-lg">×</button>
            )}
          </div>
          <select
            value={skillFilter}
            onChange={(e) => handleFilter(e.target.value)}
            className="border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
          >
            <option value="all">All levels</option>
            {presentSkills.map((s) => (
              <option key={s} value={s}>{SKILL_LABELS[s]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Empty states */}
      {players.length === 0 ? (
        <div className="text-center py-16 text-pb-text/30 text-sm">No players yet. Add your first player above.</div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-10 text-pb-text/30 text-sm">No players match your search.</div>
      ) : (
        <>
          {/* Table */}
          <div className="bg-pb-card border border-pb-border rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1.5rem_1fr_11rem_6rem_auto] gap-x-4 px-4 py-2.5 bg-pb-bg border-b border-pb-border text-xs font-bold uppercase tracking-wide text-pb-text/40">
              <span>#</span>
              <button onClick={() => handleSort('name')} className="text-left flex items-center hover:text-pb-text transition-colors">
                Name <SortIcon k="name" />
              </button>
              <button onClick={() => handleSort('skill')} className="flex items-center hover:text-pb-text transition-colors">
                Skill <SortIcon k="skill" />
              </button>
              <button onClick={() => handleSort('createdAt')} className="flex items-center hover:text-pb-text transition-colors">
                Joined <SortIcon k="createdAt" />
              </button>
              <span>Actions</span>
            </div>

            {/* Rows */}
            <div className="divide-y divide-pb-border">
              {paginated.map((player, i) => (
                <div
                  key={player.id}
                  className="grid grid-cols-[1.5rem_1fr_11rem_6rem_auto] gap-x-4 px-4 py-3 items-center hover:bg-pb-bg/50 transition-colors"
                >
                  {/* Row number */}
                  <span className="text-xs text-pb-text/30 font-mono">
                    {safePage * PAGE_SIZE + i + 1}
                  </span>

                  {/* Name */}
                  <div className="font-semibold text-sm truncate">{player.name}</div>

                  {/* Skill */}
                  <div>
                    {editingId === player.id ? (
                      <EditSkillInline
                        current={player.skillLevel}
                        onSave={(s) => handleUpdateSkill(player.id, s)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <SkillBadge level={player.skillLevel} />
                        <span className="text-xs text-pb-text/40 hidden sm:block w-28 truncate">
                          {SKILL_LABELS[player.skillLevel].split(' - ')[1]}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Joined date */}
                  <span className="text-xs text-pb-text/40">
                    {new Date(player.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {editingId !== player.id && (
                      <button
                        onClick={() => setEditingId(player.id)}
                        className="text-xs text-pb-text/40 hover:text-pb-green transition-colors px-2 py-1 rounded-lg hover:bg-pb-bg"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(player.id, player.name)}
                      className="text-pb-text/20 hover:text-red-500 transition-colors text-lg leading-none"
                      title="Remove player"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination footer */}
          <div className="flex items-center justify-between mt-4 text-sm text-pb-text/50">
            <span>
              Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={safePage === 0}
                className="px-2 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="px-3 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
              >
                ‹ Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                    i === safePage
                      ? 'bg-pb-green text-white'
                      : 'hover:bg-pb-bg text-pb-text/50'
                  }`}
                >
                  {i + 1}
                </button>
              ))}

              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={safePage === totalPages - 1}
                className="px-3 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
              >
                Next ›
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={safePage === totalPages - 1}
                className="px-2 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
              >
                »
              </button>
            </div>
          </div>
        </>
      )}
      </>}
    </div>
  );
}
