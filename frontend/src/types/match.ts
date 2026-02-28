// Raw CSV row as returned by PapaParse.
// Field names match the CSV header columns in docs/csv/*.csv exactly.
// Some competitions use different column names (aliases); these are normalized
// in csv-parser.ts before processing.
export interface RawMatchRow {
  match_date: string;
  section_no: string;
  match_index_in_section: string;
  start_time: string;
  stadium: string;
  home_team: string;
  home_goal: string;
  away_goal: string;
  away_team: string;
  status: string;
  group?: string;           // Only in group-stage CSVs (column may be absent)
  home_pk_score?: string;   // Only in matches with PK shootout (column may be absent)
  away_pk_score?: string;
  home_score_ex?: string;   // Extra-time score (column may be absent; Tier 4 preparation)
  away_score_ex?: string;
  // Column aliases used in some competition CSVs:
  match_status?: string;    // ACL 2021 CSV uses this instead of 'status'
  home_pk?: string;         // 1993-1998 CSVs may use this instead of 'home_pk_score'
  away_pk?: string;
}

// Per-match data from a single team's perspective, produced by parse_csvresults.
export interface TeamMatch {
  is_home: boolean;
  opponent: string;
  goal_get: number | null;   // null = unplayed match
  goal_lose: number | null;
  // pk_get/pk_lose: always present after parsing; null means no PK shootout.
  // Using | null (not ?) because the property is always set, but may be null.
  pk_get: number | null;
  pk_lose: number | null;
  score_ex_get: number | null;
  score_ex_lose: number | null;
  has_result: boolean;
  point: number;
  match_date: string;
  section_no: number;
  stadium: string;
  start_time: string;
  status: string;
  live: boolean;
}

// Classification of a single match result.
// Used as both classifyResult() return type and TeamStats.resultCounts key.
export type MatchResult = 'win' | 'pk_win' | 'pk_loss' | 'draw' | 'loss';

// Aggregated statistics for a single view (latest or display-time).
// Managed as two instances on TeamData: latestStats (full season) and displayStats (up to targetDate).
export class TeamStats {
  point = 0;
  avlbl_pt = 0;
  goal_diff = 0;
  goal_get = 0;
  all_game = 0;
  rest_games: Record<string, number> = {};
  avrg_pt = 0;

  /** Per-result-type match counts. Key = MatchResult literal. */
  readonly resultCounts: Record<MatchResult, number> = {
    win: 0, pk_win: 0, pk_loss: 0, draw: 0, loss: 0,
  };

  /** Record a completed match. */
  recordMatch(result: MatchResult, goalGet: number, goalLose: number, matchPoint: number): void {
    this.point += matchPoint;
    this.avlbl_pt += matchPoint;
    this.all_game += 1;
    this.goal_diff += goalGet - goalLose;
    this.goal_get += goalGet;
    this.resultCounts[result] += 1;
  }

  /** Record an unplayed or beyond-cutoff match. */
  addUnplayedMatch(opponent: string, maxPt: number): void {
    this.avlbl_pt += maxPt;
    this.rest_games[opponent] = (this.rest_games[opponent] ?? 0) + 1;
  }

  /** Compute derived fields after all matches recorded. */
  finalize(): void {
    this.avrg_pt = this.all_game === 0 ? 0 : this.point / this.all_game;
  }
}

// Full team data: match list combined with aggregated stats.
export interface TeamData {
  df: TeamMatch[];
  latestStats: TeamStats;    // latest (full season)
  displayStats: TeamStats;   // display-time (up to targetDate)
}

// group name → team name → TeamData
// Example: { "matches": { "鹿島": TeamData, "柏": TeamData } }
// For group-stage competitions: { "DefaultGroup": { ... } }
export type TeamMap = Record<string, Record<string, TeamData>>;
