import type {
  Tournament,
  TournamentGroup,
  TournamentMatch,
  TournamentPlayer,
  TournamentTeam,
  RoundRobinStanding,
  MatchType,
  WinCondition,
} from './types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  return generateRoundRobinForIds(ids);
}

function generateRoundRobinForIds(
  ids: string[],
  groupId?: string
): TournamentMatch[] {
  const n = ids.length;
  if (n < 2) return [];

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
          ...(groupId ? { groupId, phase: 'group' as const } : {}),
        });
      }
    }
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
 * Pass `orderedIds` to control seeding order (last team gets the bye when odd).
 * If omitted, ids are shuffled randomly so bye recipient is random.
 */
export function generateSingleElimination(
  tournament: Tournament,
  orderedIds?: string[]
): TournamentMatch[] {
  const ids = orderedIds ?? shuffle(getEntrantIds(tournament));
  const bracketSize = nextPowerOf2(ids.length);

  const seeds: (string | null)[] = Array(bracketSize).fill(null);
  ids.forEach((id, i) => (seeds[i] = id));

  const matches: TournamentMatch[] = [];
  let round = 1;
  let matchesInRound = bracketSize / 2;

  // Round 1: pair seeds
  const r1Matches: TournamentMatch[] = [];
  for (let i = 0; i < matchesInRound; i++) {
    const e1 = seeds[i * 2] ?? null;
    const e2 = seeds[i * 2 + 1] ?? null;

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

/** After recording a score, propagate winner to next round. Phase-aware. */
export function propagateWinner(
  matches: TournamentMatch[],
  match: TournamentMatch
): TournamentMatch[] {
  if (!match.winnerId) return matches;
  const nextRound = match.round + 1;
  const nextSlot = Math.floor(match.slot / 2);
  const isFirstInPair = match.slot % 2 === 0;
  const loserId =
    match.winnerId === match.entrant1Id ? match.entrant2Id : match.entrant1Id;

  return matches.map((m) => {
    if (
      m.round === nextRound &&
      m.slot === nextSlot &&
      !m.is3rdPlace &&
      m.phase === match.phase
    ) {
      return {
        ...m,
        entrant1Id: isFirstInPair ? match.winnerId : m.entrant1Id,
        entrant2Id: isFirstInPair ? m.entrant2Id : match.winnerId,
      };
    }
    if (m.is3rdPlace && loserId) {
      return {
        ...m,
        entrant1Id: isFirstInPair ? loserId : m.entrant1Id,
        entrant2Id: isFirstInPair ? m.entrant2Id : loserId,
      };
    }
    return m;
  });
}

/**
 * Propagates all bye winners through the bracket round by round.
 * Can be scoped to a specific phase (for group-stage playoffs).
 */
function applyByes(
  matches: TournamentMatch[],
  phase?: 'group' | 'playoff'
): TournamentMatch[] {
  const inScope = (m: TournamentMatch) =>
    phase ? m.phase === phase : m.phase === undefined;

  const scoped = matches.filter(inScope);
  if (scoped.length === 0) return matches;
  const maxRound = Math.max(...scoped.map((m) => m.round));
  let result = [...matches];

  for (let r = 1; r < maxRound; r++) {
    const completed = result.filter(
      (m) => inScope(m) && m.round === r && m.status === 'completed' && m.winnerId
    );
    for (const m of completed) {
      result = propagateWinner(result, m);
    }
    result = result.map((m) => {
      if (!inScope(m) || m.round !== r + 1 || m.status === 'completed') return m;
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

// ─── Group Stage ──────────────────────────────────────────────────────────────

/**
 * Determines how many groups to create based on team count.
 * Always returns a power of 2 for clean playoff brackets.
 * Targets group sizes of 3–5 teams.
 */
export function determineGroupCount(n: number): number {
  if (n < 4) return 1;
  if (n <= 8) return 2;   // 2 groups of 2–4
  if (n <= 16) return 4;  // 4 groups of 2–4
  return 8;               // 8 groups of 2–4
}

/**
 * Generates a group-stage tournament:
 * - Teams are randomly shuffled and split into groups.
 * - Each group plays a full round-robin.
 * - Group winners advance to a single-elimination playoff.
 * - Number of groups / playoff size is based on team count.
 */
function generateGroupStage(tournament: Tournament): Tournament {
  const ids = shuffle(getEntrantIds(tournament));
  const n = ids.length;
  const numGroups = determineGroupCount(n);

  // Distribute teams into groups (round-robin distribution for even-ish sizes)
  const groups: TournamentGroup[] = Array.from({ length: numGroups }, (_, g) => ({
    id: uid(),
    name: `Group ${String.fromCharCode(65 + g)}`, // A, B, C, D…
    entrantIds: [],
  }));

  ids.forEach((id, i) => groups[i % numGroups].entrantIds.push(id));

  const matches: TournamentMatch[] = [];

  // Round-robin within each group
  for (const group of groups) {
    matches.push(...generateRoundRobinForIds(group.entrantIds, group.id));
  }

  // Empty playoff bracket (winners TBD)
  const playoffMatches = generatePlayoffBracket(numGroups);
  matches.push(...playoffMatches);

  return { ...tournament, groups, matches, status: 'active' };
}

/** Generates an empty single-elimination playoff bracket for N group winners. */
function generatePlayoffBracket(numGroups: number): TournamentMatch[] {
  const bracketSize = nextPowerOf2(numGroups);
  const matches: TournamentMatch[] = [];
  let round = 1;
  let matchesInRound = bracketSize / 2;

  for (let i = 0; i < matchesInRound; i++) {
    const e1Idx = i * 2;
    const e2Idx = i * 2 + 1;
    const isBye1 = e1Idx >= numGroups;
    const isBye2 = e2Idx >= numGroups;

    let status: TournamentMatch['status'] = 'pending';
    let winnerId: string | null = null;
    if (isBye1 && isBye2) status = 'completed';

    matches.push({
      id: uid(),
      round,
      slot: i,
      entrant1Id: null,
      entrant2Id: null,
      score1: null,
      score2: null,
      winnerId,
      status,
      phase: 'playoff',
    });
  }

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
        phase: 'playoff',
      });
    }
    matchesInRound /= 2;
    round++;
  }

  return matches;
}

/** Computes standings for a specific group. */
export function computeGroupStandings(
  tournament: Tournament,
  groupId: string
): RoundRobinStanding[] {
  const group = tournament.groups?.find((g) => g.id === groupId);
  if (!group) return [];

  const map: Record<string, RoundRobinStanding> = {};
  for (const id of group.entrantIds) {
    map[id] = { entrantId: id, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
  }

  for (const m of tournament.matches) {
    if (m.groupId !== groupId || m.status !== 'completed' || !m.entrant1Id || !m.entrant2Id) continue;
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
    return (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
  });
}

/** Propagates a group winner into the correct playoff bracket slot. */
function propagateGroupWinner(
  matches: TournamentMatch[],
  groups: TournamentGroup[],
  groupIdx: number,
  winnerId: string
): TournamentMatch[] {
  const playoffSlot = Math.floor(groupIdx / 2);
  const isFirst = groupIdx % 2 === 0;

  let result = matches.map((m) => {
    if (m.phase === 'playoff' && m.round === 1 && m.slot === playoffSlot) {
      return {
        ...m,
        entrant1Id: isFirst ? winnerId : m.entrant1Id,
        entrant2Id: isFirst ? m.entrant2Id : winnerId,
      };
    }
    return m;
  });

  // After placing winner, check for playoff byes (if numGroups isn't power of 2)
  result = applyByes(result, 'playoff');
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
    // For group-stage, only count group phase matches
    if (tournament.format === 'group-stage' && m.phase !== 'group') continue;
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
  matchType: MatchType,
  maxScore: number = 11,
  winCondition: WinCondition = 'win-by-2',
  include3rdPlace: boolean = false
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
    maxScore,
    winCondition,
    include3rdPlace,
  };
}

export function addPlayer(
  tournament: Tournament,
  name: string,
  skillLevel: TournamentPlayer['skillLevel']
): Tournament {
  const player: TournamentPlayer = { id: uid(), name, skillLevel };
  return { ...tournament, players: [...tournament.players, player] };
}

export function addTeam(
  tournament: Tournament,
  name: string,
  playerIds: string[]
): Tournament {
  const team: TournamentTeam = { id: uid(), name, playerIds };
  return { ...tournament, teams: [...tournament.teams, team] };
}

export function generateSchedule(
  tournament: Tournament,
  orderedIds?: string[]
): Tournament {
  let matches: TournamentMatch[];

  if (tournament.format === 'round-robin') {
    matches = generateRoundRobin(tournament);
    return { ...tournament, matches, status: 'active' };
  }

  if (tournament.format === 'single-elimination') {
    matches = generateSingleElimination(tournament, orderedIds);
    if (tournament.include3rdPlace && matches.length > 0) {
      const finalRound = Math.max(...matches.map((m) => m.round));
      matches.push({
        id: uid(),
        round: finalRound,
        slot: 1,
        entrant1Id: null,
        entrant2Id: null,
        score1: null,
        score2: null,
        winnerId: null,
        status: 'pending',
        is3rdPlace: true,
      });
    }
    return { ...tournament, matches, status: 'active' };
  }

  // group-stage
  return generateGroupStage(tournament);
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

  if (tournament.format === 'single-elimination') {
    const updated = matches.find((m) => m.id === matchId)!;
    matches = propagateWinner(matches, updated);
    matches = applyByes(matches);
  }

  if (tournament.format === 'group-stage') {
    const updated = matches.find((m) => m.id === matchId)!;

    if (updated.phase === 'playoff') {
      matches = propagateWinner(matches, updated);
      matches = applyByes(matches, 'playoff');
    } else if (updated.phase === 'group' && updated.groupId && tournament.groups) {
      // Check if the entire group is now complete
      const groupMatches = matches.filter((m) => m.groupId === updated.groupId);
      const allDone = groupMatches.every((m) => m.status === 'completed');
      if (allDone) {
        const group = tournament.groups.find((g) => g.id === updated.groupId);
        if (group) {
          const groupIdx = tournament.groups.indexOf(group);
          // Find the group winner by standings
          const tempTournament = { ...tournament, matches };
          const standings = computeGroupStandings(tempTournament, group.id);
          const winnerId = standings[0]?.entrantId;
          if (winnerId) {
            matches = propagateGroupWinner(matches, tournament.groups, groupIdx, winnerId);
          }
        }
      }
    }
  }

  return { ...tournament, matches };
}
