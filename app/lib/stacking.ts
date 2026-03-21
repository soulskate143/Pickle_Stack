import type { Court, OpenPlaySession, QueuedPlayer, StackingMode } from './types';

const PLAYERS_PER_COURT = 4; // doubles

/** Pick the next 4 players from queue using the selected mode */
function pickPlayers(queue: QueuedPlayer[], mode: StackingMode): QueuedPlayer[] | null {
  if (queue.length < PLAYERS_PER_COURT) return null;

  if (mode === 'fifo') {
    return queue.slice(0, PLAYERS_PER_COURT);
  }

  // Skill-matched: find 4 consecutive (by skill) players with minimal spread
  const sorted = [...queue].sort((a, b) => parseFloat(a.skillLevel) - parseFloat(b.skillLevel));
  let bestGroup: QueuedPlayer[] | null = null;
  let bestSpread = Infinity;

  for (let i = 0; i <= sorted.length - PLAYERS_PER_COURT; i++) {
    const group = sorted.slice(i, i + PLAYERS_PER_COURT);
    const spread =
      parseFloat(group[group.length - 1].skillLevel) - parseFloat(group[0].skillLevel);
    if (spread < bestSpread) {
      bestSpread = spread;
      bestGroup = group;
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
  const courts = session.courts.map((c) => {
    if (c.id !== courtId) return c;
    return { ...c, game: null };
  });

  const finishedPlayers =
    session.courts.find((c) => c.id === courtId)?.game?.players ?? [];

  let queue = [...session.queue];
  if (requeuePlayers) {
    // Re-queue with fresh timestamp (go to back of line)
    const requeued = finishedPlayers.map((p) => ({ ...p, queuedAt: Date.now() }));
    queue = [...queue, ...requeued];
  }

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
