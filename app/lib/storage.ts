import type { OpenPlaySession, PlayerProfile, Tournament } from './types';

const OPEN_PLAY_KEY = 'pb_open_play';
const TOURNAMENTS_KEY = 'pb_tournaments';

function defaultOpenPlay(): OpenPlaySession {
  return {
    courtCount: 4,
    courts: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, game: null })),
    queue: [],
    stackingMode: 'fifo',
  };
}

export function loadOpenPlay(): OpenPlaySession {
  if (typeof window === 'undefined') return defaultOpenPlay();
  try {
    const raw = localStorage.getItem(OPEN_PLAY_KEY);
    if (!raw) return defaultOpenPlay();
    return JSON.parse(raw) as OpenPlaySession;
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
