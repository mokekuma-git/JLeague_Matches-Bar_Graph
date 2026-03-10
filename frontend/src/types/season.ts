// Types for the structure of season_map.json (4-tier hierarchy).
//
// Shape of season_map.json:
// {
//   "jleague": {                            ← group
//     "display_name": "Jリーグ",
//     "css_files": ["team_style.css"],
//     "competitions": {
//       "J1": {                             ← competition
//         "league_display": "J1リーグ",
//         "seasons": {
//           "2026East": [10, 1, 0, [...], {"group_display": "EAST"}]  ← entry
//         }
//       }
//     }
//   }
// }

import type { PointSystem } from './config';

// Which views a competition/season supports.
export type ViewType = 'league' | 'bracket';

// Map of rank → CSS class name.
// Example: { "3": "promoted_playoff" }
export type RankClassMap = Record<string, string>;

// Configuration for the cross-group standing comparison table.
// Extracts the Nth-place team from each group for side-by-side comparison.
export interface CrossGroupStanding {
  position: number;            // Which rank to extract (1-indexed)
  exclude_from_rank?: number;  // Exclude teams ranked at this position or below (e.g. 4 = exclude 4th+)
  advance_count?: number;      // How many teams advance; highlights top N rows (default: 0)
}

// Data source reference for display at the bottom of the page.
export interface DataSource {
  label: string;
  url: string;
}

// An independent bracket section within a multi-section tournament.
// Each section is rendered as a separate bracket tree on the same page.
export interface BracketSection {
  label: string;                    // Section heading (e.g. "1st Round Group A")
  bracket_order: (string | null)[];  // Bracket position order (null = bye slot)
  round_filter?: string[];          // Filter CSV rows by round column
  bracket_round_start?: string;     // Override start round for this section
}

// Merged optional dict at season entry index 4.
// Combines what was previously separate at index 4 (RankClassMap) and index 5 (SeasonExtraInfo).
export interface SeasonEntryOptions {
  rank_properties?: RankClassMap;
  group_display?: string;
  url_category?: string;
  league_display?: string;
  point_system?: PointSystem;
  css_files?: string[];
  team_rename_map?: Record<string, string>;
  tiebreak_order?: string[];
  season_start_month?: number;
  shown_groups?: string[];
  cross_group_standing?: CrossGroupStanding;
  group_team_count?: Record<string, number>;
  note?: string | string[];
  data_source?: DataSource;
  promotion_label?: string;
  bracket_order?: string[];
  bracket_round_start?: string;
  bracket_sections?: BracketSection[];
  view_type?: ViewType[];
}

// Raw array format as loaded from season_map.json (tuple type).
//   [teamCount, promotionCount, relegationCount, teams, options?]
export type RawSeasonEntry = [
  number,               // [0] number of teams
  number,               // [1] promotion slots
  number,               // [2] relegation slots
  string[],             // [3] team list (ordered by previous season finish)
  SeasonEntryOptions?,  // [4] optional: merged properties
];

// A single competition within a group (e.g., J1 within jleague).
// Extends SeasonEntryOptions because cascade allows any option at this level.
export interface CompetitionEntry extends SeasonEntryOptions {
  seasons: Record<string, RawSeasonEntry>;
}

// A top-level group (e.g., jleague, international).
// Extends SeasonEntryOptions because cascade allows any option at this level.
export interface GroupEntry extends SeasonEntryOptions {
  display_name?: string;  // defaults to group key when omitted
  competitions: Record<string, CompetitionEntry>;
}

// The entire season_map.json: group key → GroupEntry.
export type SeasonMap = Record<string, GroupEntry>;

// Object form of a fully resolved season entry.
// Use resolveSeasonInfo() (in season-map.ts) for cascade resolution.
export interface SeasonInfo {
  teamCount: number;
  promotionCount: number;
  relegationCount: number;
  teams: string[];
  rankClass: RankClassMap;
  groupDisplay?: string;
  urlCategory?: string;
  leagueDisplay: string;
  pointSystem: PointSystem;
  cssFiles: string[];
  teamRenameMap: Record<string, string>;
  tiebreakOrder: string[];
  seasonStartMonth: number;
  shownGroups?: string[];
  crossGroupStanding?: CrossGroupStanding;
  groupTeamCount?: Record<string, number>;
  dataSource?: DataSource;
  notes: string[];
  promotionLabel: string;
  viewTypes: ViewType[];
}
