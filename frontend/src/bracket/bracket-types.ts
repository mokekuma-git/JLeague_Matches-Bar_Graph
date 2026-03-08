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
  /** [upper child, lower child] — null for first-round byes or leaf nodes. */
  children: [BracketNode | null, BracketNode | null];
}
