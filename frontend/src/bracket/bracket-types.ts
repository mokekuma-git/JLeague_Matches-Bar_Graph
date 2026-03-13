/** Per-leg match detail for H&A aggregate nodes. */
export interface LegDetail {
  matchDate?: string;
  stadium?: string;
  homeTeam: string;
  awayTeam: string;
  homeGoal?: number;
  awayGoal?: number;
  homePkScore?: number;
  awayPkScore?: number;
  homeScoreEx?: number;
  awayScoreEx?: number;
  leg?: string;
}

/** How the winner of a bracket node was decided. */
export type DecidedBy =
  | 'score'             // Single match, regular time
  | 'extra_time'        // Single match, decided in extra time
  | 'penalties'         // Single match, decided by PK
  | 'aggregate_score'   // H&A aggregate, total goals differ
  | 'aggregate_away_goals' // H&A aggregate tied, decided by away goals
  | 'aggregate_extra_time' // H&A aggregate tied after regulation, decided in ET
  | 'aggregate_penalties' // H&A aggregate tied, decided by PK
  | 'pending';          // Not yet decided

/** A single node in the tournament bracket tree. */
export interface BracketNode {
  round: string;
  matchNumber?: number;
  homeTeam: string | null;
  awayTeam: string | null;
  homeGoal?: number;
  awayGoal?: number;
  homePkScore?: number;
  awayPkScore?: number;
  homeScoreEx?: number;
  awayScoreEx?: number;
  matchDate?: string;
  stadium?: string;
  status: string;
  winner: string | null;
  /** How the winner was decided. null for byes (no match played). */
  decidedBy: DecidedBy | null;
  /** Per-leg details for H&A aggregate nodes. Undefined for single-match nodes. */
  legs?: LegDetail[];
  /** [upper child, lower child] — null for first-round byes or leaf nodes. */
  children: [BracketNode | null, BracketNode | null];
}
