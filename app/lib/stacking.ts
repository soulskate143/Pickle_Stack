import type { Court, OpenPlaySession, QueuedPlayer, StackingMode } from './types';

const PLAYERS_PER_COURT = 4; // doubles

/** Pick the next 4 players from queue using the selected mode */
export function pickPlayers(queue: QueuedPlayer[], mode: StackingMode): QueuedPlayer[] | null {
  if (queue.length < PLAYERS_PER_COURT) return null;

  if (mode === 'fifo') {
    // Prioritize players with fewer games played; FIFO within same count
    const sorted = [...queue].sort((a, b) => {
      const ag = a.gamesPlayed ?? 0;
      const bg = b.gamesPlayed ?? 0;
      if (ag !== bg) return ag - bg;
      return a.queuedAt - b.queuedAt;
    });

    // Distribute new/lowest-tier players: cap at 2 per group so they mix
    // with experienced players instead of always clustering together.
    const minGames = sorted[0]?.gamesPlayed ?? 0;
    const minTier = sorted.filter((p) => (p.gamesPlayed ?? 0) === minGames);
    const rest = sorted.filter((p) => (p.gamesPlayed ?? 0) !== minGames);

    if (minTier.length >= 2 && rest.length >= 2) {
      // Mix 2 lowest-games + 2 most-overdue from rest (already sorted by gamesPlayed→queuedAt)
      // Cap minTier at 2 so new players always mix with experienced ones.
      const pick2Min = minTier.slice(0, 2);
      // From rest, prefer the next tier's longest-waiting players (not just top-2 blindly)
      const nextMinGames = Math.min(...rest.map((p) => p.gamesPlayed ?? 0));
      const nextTier = rest.filter((p) => (p.gamesPlayed ?? 0) === nextMinGames);
      const pick2Rest = nextTier.length >= 2 ? nextTier.slice(0, 2) : rest.slice(0, 2);
      return [...pick2Min, ...pick2Rest];
    }

    return sorted.slice(0, PLAYERS_PER_COURT);
  }

  // Skill-matched: find 4 consecutive (by skill) players with minimal spread.
  // Tiebreaker: prefer the window whose longest-waiting player has waited the most.
  // Starvation: if a player outside the best group has waited 2.5× longer than the
  // best group's oldest wait AND at least 25 minutes, force them in via their best window.
  const STALE_MIN_MS = 25 * 60 * 1000;
  const STALE_MULTIPLIER = 2.5;
  const now = Date.now();

  const sorted = [...queue].sort((a, b) => parseFloat(a.skillLevel) - parseFloat(b.skillLevel));
  let bestGroup: QueuedPlayer[] | null = null;
  let bestSpread = Infinity;
  let bestOldestWait = 0;

  for (let i = 0; i <= sorted.length - PLAYERS_PER_COURT; i++) {
    const group = sorted.slice(i, i + PLAYERS_PER_COURT);
    const spread =
      parseFloat(group[group.length - 1].skillLevel) - parseFloat(group[0].skillLevel);
    const oldestWait = Math.max(...group.map((p) => now - p.queuedAt));

    if (spread < bestSpread || (spread === bestSpread && oldestWait > bestOldestWait)) {
      bestSpread = spread;
      bestGroup = group;
      bestOldestWait = oldestWait;
    }
  }

  // Starvation check: find anyone outside the best group who has been waiting
  // significantly longer, and substitute them via their tightest available window.
  if (bestGroup) {
    const bestIds = new Set(bestGroup.map((p) => p.id));
    const stale = queue
      .filter((p) => !bestIds.has(p.id))
      .find(
        (p) =>
          now - p.queuedAt > STALE_MIN_MS &&
          now - p.queuedAt > STALE_MULTIPLIER * bestOldestWait,
      );

    if (stale) {
      const staleIdx = sorted.findIndex((p) => p.id === stale.id);
      const winStart = Math.max(0, staleIdx - PLAYERS_PER_COURT + 1);
      const winEnd = Math.min(sorted.length - PLAYERS_PER_COURT, staleIdx);
      let staleGroup: QueuedPlayer[] | null = null;
      let staleBest = Infinity;

      for (let i = winStart; i <= winEnd; i++) {
        const group = sorted.slice(i, i + PLAYERS_PER_COURT);
        if (!group.some((p) => p.id === stale.id)) continue;
        const spread =
          parseFloat(group[group.length - 1].skillLevel) - parseFloat(group[0].skillLevel);
        if (spread < staleBest) {
          staleBest = spread;
          staleGroup = group;
        }
      }

      if (staleGroup) return staleGroup;
    }
  }

  return bestGroup;
}

/** Auto-assign players from queue to all empty courts */
export function autoAssign(session: OpenPlaySession): OpenPlaySession {
  let queue = [...session.queue];
  const courts: Court[] = session.courts.map((c) => ({ ...c }));

  for (const court of courts) {
    if (court.game !== null) continue;
    const players = pickPlayers(queue, session.stackingMode);
    if (!players) break;

    court.game = { players, startTime: Date.now() };
    const pickedIds = new Set(players.map((p) => p.id));
    queue = queue.filter((p) => !pickedIds.has(p.id));
  }

  return { ...session, courts, queue };
}

/** End game on a court — players go back to queue (end) or are removed */
export function endGame(
  session: OpenPlaySession,
  courtId: number,
  requeuePlayers: boolean
): OpenPlaySession {
  const court = session.courts.find((c) => c.id === courtId);
  const courts = session.courts.map((c) => {
    if (c.id !== courtId) return c;
    return { ...c, game: null };
  });

  const finishedPlayers = court?.game?.players ?? [];

  // Record game duration for wait time estimates
  const gameDurations = [...(session.gameDurations ?? [])];
  if (court?.game?.startTime) {
    gameDurations.push(Date.now() - court.game.startTime);
    if (gameDurations.length > 20) gameDurations.splice(0, gameDurations.length - 20);
  }

  let queue = [...session.queue];
  if (requeuePlayers) {
    const requeued = finishedPlayers.map((p) => ({
      ...p,
      gamesPlayed: (p.gamesPlayed ?? 0) + 1,
      queuedAt: Date.now(),
    }));
    queue = [...queue, ...requeued];
  }

  return { ...session, courts, queue, gameDurations };
}

/** Assign the next players from queue to a specific empty court */
export function assignNextToCourt(session: OpenPlaySession, courtId: number): OpenPlaySession {
  const court = session.courts.find((c) => c.id === courtId);
  if (!court || court.game !== null) return session;

  const players = pickPlayers(session.queue, session.stackingMode);
  if (!players) return session;

  const pickedIds = new Set(players.map((p) => p.id));
  const queue = session.queue.filter((p) => !pickedIds.has(p.id));
  const courts = session.courts.map((c) =>
    c.id === courtId ? { ...c, game: { players, startTime: Date.now() } } : c
  );

  return { ...session, courts, queue };
}

/** Set court count — add or trim courts */
export function setCourtCount(session: OpenPlaySession, count: number): OpenPlaySession {
  const clamped = Math.max(1, Math.min(20, count));
  let courts = [...session.courts];

  if (clamped > courts.length) {
    for (let i = courts.length + 1; i <= clamped; i++) {
      courts.push({ id: i, game: null });
    }
  } else {
    courts = courts.slice(0, clamped);
  }

  return { ...session, courtCount: clamped, courts };
}
