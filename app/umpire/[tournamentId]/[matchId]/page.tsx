'use client';

import { use, useEffect, useState } from 'react';
import { loadTournament, upsertTournament } from '../../../lib/storage';
import { getEntrantName, recordScore } from '../../../lib/tournament';
import type { Tournament, TournamentMatch } from '../../../lib/types';

function checkWinner(s1: number, s2: number, maxScore: number, winCondition: string): 'e1' | 'e2' | null {
  if (winCondition === 'sudden-death') {
    if (s1 >= maxScore && s1 > s2) return 'e1';
    if (s2 >= maxScore && s2 > s1) return 'e2';
  } else {
    if (s1 >= maxScore && s1 - s2 >= 2) return 'e1';
    if (s2 >= maxScore && s2 - s1 >= 2) return 'e2';
  }
  return null;
}

export default function UmpirePage({
  params,
}: {
  params: Promise<{ tournamentId: string; matchId: string }>;
}) {
  const { tournamentId, matchId } = use(params);

  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [match, setMatch] = useState<TournamentMatch | null>(null);
  const [s1, setS1] = useState(0);
  const [s2, setS2] = useState(0);
  const [winner, setWinner] = useState<'e1' | 'e2' | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editS1, setEditS1] = useState(0);
  const [editS2, setEditS2] = useState(0);
  const [umpireName, setUmpireName] = useState('');

  useEffect(() => {
    const t = loadTournament(tournamentId);
    if (!t) return;
    const m = t.matches.find((x) => x.id === matchId) ?? null;
    setTournament(t);
    setMatch(m);
    if (m) {
      const init1 = m.score1 ?? 0;
      const init2 = m.score2 ?? 0;
      setS1(init1);
      setS2(init2);
      setEditS1(init1);
      setEditS2(init2);
      setUmpireName(m.umpire ?? '');
      const maxScore = t.maxScore ?? 11;
      const winCondition = t.winCondition ?? 'win-by-2';
      setWinner(checkWinner(init1, init2, maxScore, winCondition));
    }
  }, [tournamentId, matchId]);

  if (!tournament || !match) {
    return (
      <div className="min-h-screen bg-[#1b2d25] flex items-center justify-center text-white/40 text-sm">
        Match not found.{' '}
        <a href={`/tournament/${tournamentId}`} className="underline ml-1">Go back</a>
      </div>
    );
  }

  const maxScore = tournament.maxScore ?? 11;
  const winCondition = tournament.winCondition ?? 'win-by-2';
  const name1 = match.entrant1Id ? getEntrantName(tournament, match.entrant1Id) : 'Player 1';
  const name2 = match.entrant2Id ? getEntrantName(tournament, match.entrant2Id) : 'Player 2';

  function saveScores(next1: number, next2: number, t: Tournament, m: TournamentMatch) {
    const updatedMatches = t.matches.map((x) =>
      x.id === m.id ? { ...x, score1: next1, score2: next2 } : x
    );
    const updatedTournament: Tournament = { ...t, matches: updatedMatches };
    upsertTournament(updatedTournament);
    setTournament(updatedTournament);
    setMatch({ ...m, score1: next1, score2: next2 });
  }

  function addPoint(side: 1 | 2) {
    const next1 = side === 1 ? s1 + 1 : s1;
    const next2 = side === 2 ? s2 + 1 : s2;
    setS1(next1);
    setS2(next2);
    const w = checkWinner(next1, next2, maxScore, winCondition);
    setWinner(w);
    saveScores(next1, next2, tournament!, match!);
  }

  function removePoint(side: 1 | 2) {
    const next1 = side === 1 ? Math.max(0, s1 - 1) : s1;
    const next2 = side === 2 ? Math.max(0, s2 - 1) : s2;
    setS1(next1);
    setS2(next2);
    setWinner(null);
    saveScores(next1, next2, tournament!, match!);
  }

  function applyEdit() {
    setS1(editS1);
    setS2(editS2);
    const w = checkWinner(editS1, editS2, maxScore, winCondition);
    setWinner(w);
    setShowEdit(false);
    saveScores(editS1, editS2, tournament!, match!);
  }

  function confirmWinner() {
    const updated = recordScore(tournament!, matchId, s1, s2);
    upsertTournament(updated);
    window.location.href = `/tournament/${tournament!.id}`;
  }

  function saveUmpireName() {
    const t = tournament!;
    const m = match!;
    const updatedMatches = t.matches.map((x) =>
      x.id === m.id ? { ...x, umpire: umpireName } : x
    );
    const updatedTournament: Tournament = { ...t, matches: updatedMatches };
    upsertTournament(updatedTournament);
    setTournament(updatedTournament);
    setMatch({ ...m, umpire: umpireName });
  }

  return (
    <div className="min-h-screen bg-[#1b2d25] flex flex-col text-white select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/20">
        <div>
          <p className="text-xs text-white/40">{tournament.name}</p>
          <p className="text-sm font-semibold">{name1} vs {name2}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={umpireName}
            onChange={(e) => setUmpireName(e.target.value)}
            onBlur={saveUmpireName}
            placeholder="Umpire name"
            className="bg-white/10 text-white text-xs px-2 py-1 rounded-lg placeholder-white/30 focus:outline-none focus:ring-1 focus:ring-white/30 w-28"
          />
          <button
            onClick={() => { setEditS1(s1); setEditS2(s2); setShowEdit(true); }}
            className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1 rounded-lg transition-colors"
          >
            Edit
          </button>
          <a
            href={`/tournament/${tournament.id}`}
            className="text-xs text-white/40 hover:text-white transition-colors"
          >
            ← Exit
          </a>
        </div>
      </div>

      {/* Scoring panels */}
      <div className="flex flex-1">
        {/* Left panel - entrant1 */}
        <button
          onClick={() => addPoint(1)}
          className="flex-1 flex flex-col items-center justify-center gap-4 bg-orange-600/10 hover:bg-orange-600/20 active:bg-orange-600/30 transition-colors border-r border-white/10"
        >
          <p className="text-2xl font-bold text-white px-4 text-center leading-tight">{name1}</p>
          <p className="text-[8rem] font-black text-orange-400 leading-none">{s1}</p>
          <button
            onClick={(e) => { e.stopPropagation(); removePoint(1); }}
            className="text-sm bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-xl text-white/60 transition-colors"
          >
            −1
          </button>
        </button>

        {/* Right panel - entrant2 */}
        <button
          onClick={() => addPoint(2)}
          className="flex-1 flex flex-col items-center justify-center gap-4 bg-cyan-600/10 hover:bg-cyan-600/20 active:bg-cyan-600/30 transition-colors"
        >
          <p className="text-2xl font-bold text-white px-4 text-center leading-tight">{name2}</p>
          <p className="text-[8rem] font-black text-cyan-400 leading-none">{s2}</p>
          <button
            onClick={(e) => { e.stopPropagation(); removePoint(2); }}
            className="text-sm bg-white/10 hover:bg-white/20 px-4 py-1.5 rounded-xl text-white/60 transition-colors"
          >
            −1
          </button>
        </button>
      </div>

      {/* Win condition bar */}
      <div className="text-center py-2 text-xs text-white/30">
        Play to {maxScore} · {winCondition === 'win-by-2' ? 'Win by 2' : 'Sudden Death'}
      </div>

      {/* Winner overlay */}
      {winner && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#1b2d25] border border-white/20 rounded-2xl p-8 text-center max-w-sm w-full mx-4">
            <p className="text-5xl mb-3">🏆</p>
            <p className="text-2xl font-black text-white mb-1">{winner === 'e1' ? name1 : name2}</p>
            <p className="text-white/50 mb-6">wins {winner === 'e1' ? `${s1}–${s2}` : `${s2}–${s1}`}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setWinner(null)}
                className="flex-1 border border-white/20 text-white/60 rounded-xl py-2.5 text-sm"
              >
                Keep playing
              </button>
              <button
                onClick={confirmWinner}
                className="flex-1 bg-pb-green hover:bg-pb-green/80 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
              >
                ✓ Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {showEdit && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-[#1b2d25] border border-white/20 rounded-2xl p-6 w-full max-w-xs">
            <h3 className="font-bold text-white mb-4">Edit Score</h3>
            <div className="flex flex-col gap-3 mb-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-white/50 truncate">{name1}</span>
                <input
                  type="number"
                  min={0}
                  value={editS1}
                  onChange={(e) => setEditS1(Number(e.target.value))}
                  className="w-full bg-white/10 text-white text-center text-2xl font-bold rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-orange-400"
                />
              </div>
              <div className="text-center text-white/30 font-bold text-lg leading-none">–</div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-white/50 truncate">{name2}</span>
                <input
                  type="number"
                  min={0}
                  value={editS2}
                  onChange={(e) => setEditS2(Number(e.target.value))}
                  className="w-full bg-white/10 text-white text-center text-2xl font-bold rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEdit(false)}
                className="flex-1 border border-white/20 text-white/60 rounded-xl py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={applyEdit}
                className="flex-1 bg-pb-green text-white rounded-xl py-2 text-sm font-semibold"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
