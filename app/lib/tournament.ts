import type {
  Tournament,
  TournamentMatch,
  TournamentPlayer,
  TournamentTeam,
  RoundRobinStanding,
  MatchType,
} from './types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Returns entrant IDs: player IDs for singles, team IDs for doubles */
export function getEntrantIds(tournament: Tournament): string[] {
  if (tournament.matchType === 'singles') {
    return tournament.players.map((p) => p.id);
  }
  return tournament.teams.map((t) => t.id);
}

export function getEntrantName(tournament: Tournament, id: string): string {
  if (tournament.matchType === 'singles') {
    return tournament.players.find((p) => p.id === id)?.name ?? id;
  }
  return tournament.teams.find((t) => t.id === id)?.name ?? id;
}

// ─── Round Robin ──────────────────────────────────────────────────────────────

/**
 * Generates a round-robin schedule using the circle method.
 * Each entrant plays every other entrant exactly once.
 */
export function generateRoundRobin(tournament: Tournament): TournamentMatch[] {
  const ids = getEntrantIds(tournament);
  const n = ids.length;
  if (n < 2) return [];

  // Pad with BYE if odd
  const padded = n % 2 === 1 ? [...ids, 'BYE'] : [...ids];
  const half = padded.length / 2;
  const fixed = padded[0];
  const rotating = padded.slice(1);

  const matches: TournamentMatch[] = [];
  let round = 1;

  for (let r = 0; r < padded.length - 1; r++) {
    const roundArr = [fixed, ...rotating];
    let slot = 0;
    for (let i = 0; i < half; i++) {
      const a = roundArr[i];
      const b = roundArr[padded.length - 1 - i];
      if (a !== 'BYE' && b !== 'BYE') {
        matches.push({
          id: uid(),
          round,
          slot: slot++,
          entrant1Id: a,
          entrant2Id: b,
          score1: null,
          score2: null,
          winnerId: null,
          status: 'pending',
        });
      }
    }
    // rotate
    rotating.unshift(rotating.pop()!);
    round++;
  }

  return matches;
}

// ─── Single Elimination ───────────────────────────────────────────────────────

function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Generates a single-elimination bracket.
 * Byes are distributed to top seeds (first entrants).
 */
export function generateSingleElimination(tournament: Tournament): TournamentMatch[] {
  const ids = getEntrantIds(tournament);
  const bracketSize = nextPowerOf2(ids.length);
  const byes = bracketSize - ids.length;

  // Seed: fill first slots with real players, rest are BYE
  const seeded: (string | null)[] = [
    ...ids.slice(0, byes).map(() => null), // BYE slots (top seeds get byes)
    ...ids,
  ].slice(0, bracketSize);

  // Actually let's distribute byes properly:
  // Top seeds (first N players) get byes in round 1
  const seeds: (string | null)[] = Array(bracketSize).fill(null);
  ids.forEach((id, i) => (seeds[i] = id));

  const matches: TournamentMatch[] = [];
  let round = 1;
  let matchesInRound = bracketSize / 2;
  let roundSeeds = seeds;

  // Round 1: pair seeds
  const r1Matches: TournamentMatch[] = [];
  for (let i = 0; i < matchesInRound; i++) {
    const e1 = roundSeeds[i * 2] ?? null;
    const e2 = roundSeeds[i * 2 + 1] ?? null;

    // Auto-resolve byes
    let winnerId: string | null = null;
    let status: TournamentMatch['status'] = 'pending';
    if (e1 === null && e2 !== null) { winnerId = e2; status = 'completed'; }
    if (e2 === null && e1 !== null) { winnerId = e1; status = 'completed'; }
    if (e1 === null && e2 === null) { status = 'completed'; }

    r1Matches.push({
      id: uid(),
      round,
      slot: i,
      entrant1Id: e1,
      entrant2Id: e2,
      score1: null,
      score2: null,
      winnerId,
      status,
    });
  }
  matches.push(...r1Matches);

  // Subsequent rounds — placeholders
  matchesInRound /= 2;
  round++;
  while (matchesInRound >= 1) {
    for (let i = 0; i < matchesInRound; i++) {
      matches.push({
        id: uid(),
        round,
        slot: i,
        entrant1Id: null,
        entrant2Id: null,
        score1: null,
        score2: null,
        winnerId: null,
        status: 'pending',
      });
    }
    matchesInRound /= 2;
    round++;
  }

  return applyByes(matches);
}

/** After recording a score for a match, propagate winner to next round */
export function propagateWinner(matches: TournamentMatch[], match: TournamentMatch): TournamentMatch[] {
  if (!match.winnerId) return matches;
  const nextRound = match.round + 1;
  const nextSlot = Math.floor(match.slot / 2);
  const isFirstInPair = match.slot % 2 === 0;

  return matches.map((m) => {
    if (m.round !== nextRound || m.slot !== nextSlot) return m;
    return {
      ...m,
      entrant1Id: isFirstInPair ? match.winnerId : m.entrant1Id,
      entrant2Id: isFirstInPair ? m.entrant2Id : match.winnerId,
    };
  });
}

/**
 * Propagates all bye winners through the bracket round by round.
 * If a match ends up with only one real entrant (the other side was all byes),
 * that entrant is auto-advanced as well. Handles cascading byes.
 */
function applyByes(matches: TournamentMatch[]): TournamentMatch[] {
  const maxRound = Math.max(...matches.map((m) => m.round));
  let result = [...matches];

  for (let r = 1; r < maxRound; r++) {
    // Propagate all completed matches in this round
    const completed = result.filter((m) => m.round === r && m.status === 'completed' && m.winnerId);
    for (const m of completed) {
      result = propagateWinner(result, m);
    }
    // Auto-advance any next-round match that now has exactly one real entrant
    result = result.map((m) => {
      if (m.round !== r + 1 || m.status === 'completed') return m;
      if (m.entrant1Id && !m.entrant2Id) {
        return { ...m, winnerId: m.entrant1Id, status: 'completed' as const };
      }
      if (!m.entrant1Id && m.entrant2Id) {
        return { ...m, winnerId: m.entrant2Id, status: 'completed' as const };
      }
      return m;
    });
  }

  return result;
}

// ─── Standings ────────────────────────────────────────────────────────────────

export function computeStandings(tournament: Tournament): RoundRobinStanding[] {
  const entrantIds = getEntrantIds(tournament);
  const map: Record<string, RoundRobinStanding> = {};
  for (const id of entrantIds) {
    map[id] = { entrantId: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
  }

  for (const m of tournament.matches) {
    if (m.status !== 'completed' || !m.entrant1Id || !m.entrant2Id) continue;
    const s1 = m.score1 ?? 0;
    const s2 = m.score2 ?? 0;
    map[m.entrant1Id].pointsFor += s1;
    map[m.entrant1Id].pointsAgainst += s2;
    map[m.entrant2Id].pointsFor += s2;
    map[m.entrant2Id].pointsAgainst += s1;
    if (m.winnerId === m.entrant1Id) {
      map[m.entrant1Id].wins++;
      map[m.entrant2Id].losses++;
    } else {
      map[m.entrant2Id].wins++;
      map[m.entrant1Id].losses++;
    }
  }

  return Object.values(map).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    const diffA = a.pointsFor - a.pointsAgainst;
    const diffB = b.pointsFor - b.pointsAgainst;
    return diffB - diffA;
  });
}

export function createEmptyTournament(
  name: string,
  location: string,
  date: string,
  format: Tournament['format'],
  matchType: MatchType
): Tournament {
  return {
    id: uid(),
    name,
    location,
    date,
    format,
    matchType,
    status: 'setup',
    players: [],
    teams: [],
    matches: [],
  };
}

export function addPlayer(tournament: Tournament, name: string, skillLevel: TournamentPlayer['skillLevel']): Tournament {
  const player: TournamentPlayer = { id: uid(), name, skillLevel };
  const players = [...tournament.players, player];

  // Auto-create team for doubles if in doubles mode
  let teams = tournament.teams;
  if (tournament.matchType === 'doubles') {
    // Teams are managed separately
  }

  return { ...tournament, players };
}

export function addTeam(tournament: Tournament, name: string, playerIds: string[]): Tournament {
  const team: TournamentTeam = { id: uid(), name, playerIds };
  return { ...tournament, teams: [...tournament.teams, team] };
}

export function generateSchedule(tournament: Tournament): Tournament {
  let matches: TournamentMatch[];
  if (tournament.format === 'round-robin') {
    matches = generateRoundRobin(tournament);
  } else {
    matches = generateSingleElimination(tournament);
  }
  return { ...tournament, matches, status: 'active' };
}

export function recordScore(
  tournament: Tournament,
  matchId: string,
  score1: number,
  score2: number
): Tournament {
  let matches = tournament.matches.map((m) => {
    if (m.id !== matchId) return m;
    const winnerId =
      score1 > score2 ? m.entrant1Id :
      score2 > score1 ? m.entrant2Id :
      null;
    return { ...m, score1, score2, winnerId, status: 'completed' as const };
  });

  // Propagate winner for single-elimination, then auto-advance any resulting byes
  if (tournament.format === 'single-elimination') {
    const updated = matches.find((m) => m.id === matchId)!;
    matches = propagateWinner(matches, updated);
    matches = applyByes(matches);
  }

  return { ...tournament, matches };
}
