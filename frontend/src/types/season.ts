// Types for the structure of season_map.yaml (4-tier hierarchy).
//
// Shape of season_map.yaml:
// {
//   "jleague": {                            ← family (CompetitionFamily)
//     "display_name": "Jリーグ",
//     "css_files": ["team_style.css"],
//     "competitions": {
//       "J1": {                             ← competition
//         "league_display": "J1リーグ",
//         "seasons": {
//           "2026East": {"team_count": 10, ...}  ← entry
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

export type AggregateTiebreakCriterion = 'wins' | 'away_goals' | 'penalties';

// An independent bracket block within a multi-block tournament.
// Each block is rendered as a separate bracket tree on the same page.
export interface BracketBlock {
  label: string;                    // Section heading (e.g. "1st Round Group A")
  bracket_order?: (string | null)[];  // Bracket position order (null = bye slot)
  round_filter?: string[];          // Filter CSV rows by round column
  bracket_round_start?: string;     // Override start round for this section
  matchup_pairs?: boolean;          // Render as independent matchup pairs (no elimination tree)
  bracket_pairing_orders?: number[][]; // Per level reorder of child matches before pairing
}

// Optional properties that can appear at family, competition, or season level.
// Used by cascade resolution (family → competition → season).
export interface SeasonEntryOptions {
  teams?: string[];
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
  group_team_count?: number | Record<string, number>;
  note?: string | string[];
  data_source?: DataSource;
  promotion_label?: string;
  aggregate_tiebreak_order?: AggregateTiebreakCriterion[];
  bracket_order?: (string | null)[];
  bracket_round_start?: string;
  round_start_options?: string[];
  default_round_filter?: string[];
  bracket_blocks?: BracketBlock[];
  bracket_pairing_orders?: number[][];
  view_type?: ViewType[];
}

// Object format as loaded from season_map.yaml.
// Required fields + optional cascade properties (flattened).
export interface RawSeasonEntry extends SeasonEntryOptions {
  team_count?: number;
  promotion_count?: number;
  relegation_count?: number;
  teams?: string[];
}

// A single competition within a family (e.g., J1 within jleague).
// Extends SeasonEntryOptions because cascade allows any option at this level.
export interface CompetitionEntry extends SeasonEntryOptions {
  team_count?: number;
  promotion_count?: number;
  relegation_count?: number;
  seasons: Record<string, RawSeasonEntry>;
}

// A top-level competition family (e.g., jleague, national).
// Extends SeasonEntryOptions because cascade allows any option at this level.
export interface CompetitionFamilyEntry extends SeasonEntryOptions {
  display_name?: string;  // defaults to family key when omitted
  competitions: Record<string, CompetitionEntry>;
}

// The entire season_map.yaml: family key → CompetitionFamilyEntry.
export type SeasonMap = Record<string, CompetitionFamilyEntry>;

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
