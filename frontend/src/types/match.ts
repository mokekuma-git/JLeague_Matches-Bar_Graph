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
  goal_get: string;
  goal_lose: string;
  // pk_get/pk_lose: always present after parsing; null means no PK shootout.
  // Using | null (not ?) because the property is always set, but may be null.
  pk_get: number | null;
  pk_lose: number | null;
  score_ex_get: number | null;
  score_ex_lose: number | null;
  has_result: boolean;
  point: number;
  match_date: string;
  section_no: string;
  stadium: string;
  start_time: string;
  status: string;
  live: boolean;
}

// Aggregated statistics written onto TeamData by make_html_column.
// All fields are optional because they do not exist until make_html_column runs.
export interface TeamStats {
  point?: number;
  avlbl_pt?: number;
  disp_point?: number;
  disp_avlbl_pt?: number;
  goal_diff?: number;
  goal_get?: number;
  disp_goal_diff?: number;
  disp_goal_get?: number;
  win?: number;
  pk_win?: number;
  pk_loss?: number;
  lose?: number;
  draw?: number;
  all_game?: number;
  disp_win?: number;
  disp_pk_win?: number;
  disp_pk_loss?: number;
  disp_lose?: number;
  disp_draw?: number;
  disp_all_game?: number;
  rest_games?: Record<string, number>;      // opponent → remaining matches
  disp_rest_games?: Record<string, number>;
  avrg_pt?: number;
  disp_avrg_pt?: number;
}

// Full team data: match list combined with aggregated stats.
export interface TeamData extends TeamStats {
  df: TeamMatch[];
}

// group name → team name → TeamData
// Example: { "matches": { "鹿島": TeamData, "柏": TeamData } }
// For group-stage competitions: { "DefaultGroup": { ... } }
export type TeamMap = Record<string, Record<string, TeamData>>;
