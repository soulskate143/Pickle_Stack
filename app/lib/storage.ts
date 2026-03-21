import type { OpenPlaySession, PlayerProfile, SessionLog, Tournament } from './types';

const OPEN_PLAY_KEY = 'pb_open_play';
const TOURNAMENTS_KEY = 'pb_tournaments';
const SESSION_HISTORY_KEY = 'pb_session_history';

function defaultOpenPlay(): OpenPlaySession {
  return {
    courtCount: 4,
    courts: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, game: null })),
    queue: [],
    stackingMode: 'fifo',
    gameDurations: [],
  };
}

export function loadOpenPlay(): OpenPlaySession {
  if (typeof window === 'undefined') return defaultOpenPlay();
  try {
    const raw = localStorage.getItem(OPEN_PLAY_KEY);
    if (!raw) return defaultOpenPlay();
    const parsed = JSON.parse(raw) as OpenPlaySession;
    // migrate old sessions missing gameDurations
    if (!parsed.gameDurations) parsed.gameDurations = [];
    return parsed;
  } catch {
    return defaultOpenPlay();
  }
}

export function saveOpenPlay(session: OpenPlaySession): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(OPEN_PLAY_KEY, JSON.stringify(session));
}

export function loadTournaments(): Tournament[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(TOURNAMENTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Tournament[];
  } catch {
    return [];
  }
}

export function saveTournaments(tournaments: Tournament[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOURNAMENTS_KEY, JSON.stringify(tournaments));
}

export function loadTournament(id: string): Tournament | null {
  return loadTournaments().find((t) => t.id === id) ?? null;
}

export function upsertTournament(tournament: Tournament): void {
  const all = loadTournaments();
  const idx = all.findIndex((t) => t.id === tournament.id);
  if (idx >= 0) {
    all[idx] = tournament;
  } else {
    all.push(tournament);
  }
  saveTournaments(all);
}

export function deleteTournament(id: string): void {
  saveTournaments(loadTournaments().filter((t) => t.id !== id));
}

// ─── Players ──────────────────────────────────────────────────────────────────

const PLAYERS_KEY = 'pb_players';

export function loadPlayers(): PlayerProfile[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(PLAYERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PlayerProfile[];
  } catch {
    return [];
  }
}

export function savePlayers(players: PlayerProfile[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
}

export function upsertPlayer(player: PlayerProfile): void {
  const all = loadPlayers();
  const idx = all.findIndex((p) => p.id === player.id);
  if (idx >= 0) {
    all[idx] = player;
  } else {
    all.push(player);
  }
  savePlayers(all);
}

export function deletePlayer(id: string): void {
  savePlayers(loadPlayers().filter((p) => p.id !== id));
}

// ─── Session History ──────────────────────────────────────────────────────────

export function loadSessionHistory(): SessionLog[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(SESSION_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as SessionLog[]) : [];
  } catch {
    return [];
  }
}

export function appendSessionLog(log: SessionLog): void {
  if (typeof window === 'undefined') return;
  const all = loadSessionHistory();
  all.unshift(log); // newest first
  // keep last 50 sessions
  localStorage.setItem(SESSION_HISTORY_KEY, JSON.stringify(all.slice(0, 50)));
}
