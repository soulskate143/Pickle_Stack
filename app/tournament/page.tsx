'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { deleteTournament, loadTournaments, upsertTournament } from '../lib/storage';
import { createEmptyTournament } from '../lib/tournament';
import type { MatchType, Tournament, TournamentFormat } from '../lib/types';

const FORMAT_LABELS: Record<TournamentFormat, string> = {
  'round-robin': 'Round Robin',
  'single-elimination': 'Single Elimination',
};

const STATUS_BADGE: Record<Tournament['status'], string> = {
  setup: 'bg-amber-50 text-amber-700 border border-amber-200',
  active: 'bg-green-50 text-green-700 border border-green-200',
  completed: 'bg-gray-100 text-gray-500',
};

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (t: Tournament) => void }) {
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [format, setFormat] = useState<TournamentFormat>('round-robin');
  const [matchType, setMatchType] = useState<MatchType>('doubles');
  const [maxScore, setMaxScore] = useState(11);
  const [winCondition, setWinCondition] = useState<'sudden-death' | 'win-by-2'>('win-by-2');
  const [include3rdPlace, setInclude3rdPlace] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(createEmptyTournament(name.trim(), location.trim(), date, format, matchType, maxScore, winCondition, include3rdPlace));
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-bold text-pb-green mb-4">New Tournament</h2>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tournament name *</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Saturday Open"
              className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. City Sports Complex"
              className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green"
            />
          </label>

          <div className="flex gap-3">
            <label className="flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as TournamentFormat)}
                className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green bg-white"
              >
                <option value="round-robin">Round Robin</option>
                <option value="single-elimination">Single Elimination</option>
              </select>
            </label>

            <label className="flex-1 flex flex-col gap-1 text-sm">
              <span className="font-medium">Match type</span>
              <select
                value={matchType}
                onChange={(e) => setMatchType(e.target.value as MatchType)}
                className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green bg-white"
              >
                <option value="doubles">Doubles</option>
                <option value="singles">Singles</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Max score (play to)</span>
            <select
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green bg-white"
            >
              <option value={11}>11 points</option>
              <option value={15}>15 points</option>
              <option value={21}>21 points</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Win condition</span>
            <select
              value={winCondition}
              onChange={(e) => setWinCondition(e.target.value as 'sudden-death' | 'win-by-2')}
              className="border border-pb-border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pb-green bg-white"
            >
              <option value="win-by-2">Win by 2</option>
              <option value="sudden-death">Sudden Death</option>
            </select>
          </label>

          {format === 'single-elimination' && (
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={include3rdPlace}
                onChange={(e) => setInclude3rdPlace(e.target.checked)}
                className="w-4 h-4 accent-pb-green"
              />
              <span className="font-medium">Include 3rd place consolation match</span>
            </label>
          )}

          <div className="flex gap-2 mt-2">
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
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 5;
type StatusFilter = 'all' | Tournament['status'];

export default function TournamentListPage() {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setTournaments(loadTournaments());
  }, []);

  function handleCreate(t: Tournament) {
    upsertTournament(t);
    setTournaments(loadTournaments());
  }

  function handleDelete(id: string) {
    if (!confirm('Delete this tournament?')) return;
    deleteTournament(id);
    setTournaments(loadTournaments());
  }

  const setupCount = tournaments.filter((t) => t.status === 'setup').length;
  const activeCount = tournaments.filter((t) => t.status === 'active').length;
  const completedCount = tournaments.filter((t) => t.status === 'completed').length;

  const filtered = tournaments.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (search.trim() && !t.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function handleFilterChange(f: StatusFilter) { setStatusFilter(f); setPage(0); }
  function handleSearch(v: string) { setSearch(v); setPage(0); }

  const emptyMessages: Record<StatusFilter, string> = {
    all: 'No tournaments yet. Create your first one!',
    setup: 'No tournaments in setup.',
    active: 'No active tournaments.',
    completed: 'No completed tournaments.',
  };

  const filterTabs: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'setup', label: 'Setup' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Completed' },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-pb-green">Tournaments</h1>
          <div className="flex gap-2 mt-2 flex-wrap">
            {setupCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700 border border-amber-200">
                {setupCount} setup
              </span>
            )}
            {activeCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700 border border-green-200">
                {activeCount} active
              </span>
            )}
            {completedCount > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                {completedCount} completed
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-pb-green hover:bg-pb-green/80 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors shrink-0"
        >
          + New Tournament
        </button>
      </div>

      {/* Search + filter tabs */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search tournaments…"
          className="flex-1 border border-pb-border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pb-green"
        />
        <div className="flex rounded-lg border border-pb-border overflow-hidden text-sm shrink-0">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleFilterChange(tab.id)}
              className={`px-3 py-2 font-medium transition-colors ${
                statusFilter === tab.id
                  ? 'bg-pb-green text-white'
                  : 'bg-white text-pb-text/70 hover:bg-pb-bg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tournament list */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-pb-text/30">
          <div className="text-5xl mb-4">🏆</div>
          <p>{emptyMessages[statusFilter]}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {paginated.map((t) => {
            const entrantCount = t.matchType === 'singles' ? t.players.length : t.teams.length;
            const matchDone = t.matches.filter((m) => m.status === 'completed').length;
            const matchTotal = t.matches.length;
            const progress = matchTotal > 0 ? (matchDone / matchTotal) * 100 : 0;
            return (
              <div
                key={t.id}
                className="bg-pb-card border border-pb-border rounded-xl p-4 hover:border-pb-green transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link
                        href={`/tournament/${t.id}`}
                        className="font-bold text-pb-green hover:underline truncate"
                      >
                        {t.name}
                      </Link>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${STATUS_BADGE[t.status]}`}>
                        {t.status}
                      </span>
                    </div>
                    <div className="text-xs text-pb-text/50 flex gap-3 flex-wrap mb-2">
                      <span>{t.date}</span>
                      {t.location && <span>{t.location}</span>}
                      <span>{FORMAT_LABELS[t.format]}</span>
                      <span>{t.matchType}</span>
                      <span>{entrantCount} {t.matchType === 'singles' ? 'player' : 'team'}{entrantCount !== 1 ? 's' : ''}</span>
                      {matchTotal > 0 && (
                        <span>{matchDone}/{matchTotal} matches done</span>
                      )}
                    </div>
                    {/* Progress bar */}
                    {matchTotal > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-pb-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-pb-green rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-xs text-pb-text/40 shrink-0">
                          {Math.round(progress)}%
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      href={`/tournament/${t.id}`}
                      className="text-sm font-medium text-pb-green hover:text-pb-green/80 transition-colors"
                    >
                      Manage →
                    </Link>
                    <button
                      onClick={() => handleDelete(t.id)}
                      className="text-pb-text/30 hover:text-red-500 transition-colors text-lg leading-none ml-2"
                      title="Delete tournament"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 text-sm text-pb-text/50">
              <span>
                Showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(0)}
                  disabled={safePage === 0}
                  className="px-2 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
                >«</button>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="px-3 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
                >‹ Prev</button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setPage(i)}
                    className={`w-8 h-8 rounded-lg text-sm font-semibold transition-colors ${
                      i === safePage ? 'bg-pb-green text-white' : 'hover:bg-pb-bg text-pb-text/50'
                    }`}
                  >{i + 1}</button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={safePage === totalPages - 1}
                  className="px-3 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
                >Next ›</button>
                <button
                  onClick={() => setPage(totalPages - 1)}
                  disabled={safePage === totalPages - 1}
                  className="px-2 py-1 rounded-lg hover:bg-pb-bg disabled:opacity-30 transition-colors font-medium"
                >»</button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCreate && (
        <CreateModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}
