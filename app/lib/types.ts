export type SkillLevel = '2.0' | '2.5' | '3.0' | '3.5' | '4.0' | '4.5' | '5.0';

export interface PlayerProfile {
  id: string;
  name: string;
  skillLevel: SkillLevel;
  createdAt: number;
}

export const SKILL_LABELS: Record<SkillLevel, string> = {
  '2.0': '2.0 - Beginner',
  '2.5': '2.5 - Novice',
  '3.0': '3.0 - Intermediate',
  '3.5': '3.5 - Adv. Intermediate',
  '4.0': '4.0 - Advanced',
  '4.5': '4.5 - Expert',
  '5.0': '5.0 - Pro',
};

export const SKILL_LEVELS: SkillLevel[] = ['2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'];

// ─── Open Play ───────────────────────────────────────────────────────────────

export interface QueuedPlayer {
  id: string;
  name: string;
  skillLevel: SkillLevel;
  queuedAt: number; // timestamp
}

export interface ActiveGame {
  players: QueuedPlayer[];
  startTime: number;
}

export interface Court {
  id: number;
  game: ActiveGame | null;
}

export type StackingMode = 'fifo' | 'skill-matched';

export interface OpenPlaySession {
  courtCount: number;
  courts: Court[];
  queue: QueuedPlayer[];
  stackingMode: StackingMode;
}

// ─── Tournament ───────────────────────────────────────────────────────────────

export type TournamentFormat = 'round-robin' | 'single-elimination';
export type MatchType = 'singles' | 'doubles';
export type WinCondition = 'sudden-death' | 'win-by-2';

export interface TournamentPlayer {
  id: string;
  name: string;
  skillLevel: SkillLevel;
}

export interface TournamentTeam {
  id: string;
  name: string;
  playerIds: string[];
}

export interface TournamentMatch {
  id: string;
  round: number;
  slot: number; // position in round (0-indexed)
  entrant1Id: string | null; // null = BYE
  entrant2Id: string | null;
  score1: number | null;
  score2: number | null;
  winnerId: string | null;
  status: 'pending' | 'in-progress' | 'completed';
  umpire?: string;
}

export interface RoundRobinStanding {
  entrantId: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface Tournament {
  id: string;
  name: string;
  location: string;
  date: string;
  format: TournamentFormat;
  matchType: MatchType;
  status: 'setup' | 'active' | 'completed';
  players: TournamentPlayer[];
  teams: TournamentTeam[];
  matches: TournamentMatch[];
  maxScore: number;
  winCondition: WinCondition;
}
