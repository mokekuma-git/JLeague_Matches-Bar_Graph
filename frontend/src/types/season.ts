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

// Map of rank → CSS class name.
// Example: { "3": "promoted_playoff" }
export type RankClassMap = Record<string, string>;

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
export interface CompetitionEntry {
  league_display?: string;
  css_files?: string[];
  point_system?: PointSystem;
  team_rename_map?: Record<string, string>;
  tiebreak_order?: string[];
  seasons: Record<string, RawSeasonEntry>;
}

// A top-level group (e.g., jleague, international).
export interface GroupEntry {
  display_name: string;
  css_files?: string[];
  competitions: Record<string, CompetitionEntry>;
}

// The entire season_map.json: group key → GroupEntry.
export type SeasonMap = Record<string, GroupEntry>;

// Object form of a fully resolved season entry.
// Use parseSeasonEntry() for basic tuple→object conversion,
// or resolveSeasonInfo() (in season-map.ts) for full cascade resolution.
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
}

// Converts a RawSeasonEntry tuple into a basic SeasonInfo object.
// For full cascade-resolved properties, use resolveSeasonInfo() instead.
export function parseSeasonEntry(entry: RawSeasonEntry): SeasonInfo {
  const opts = entry[4] ?? {};
  return {
    teamCount: entry[0],
    promotionCount: entry[1],
    relegationCount: entry[2],
    teams: entry[3],
    rankClass: opts.rank_properties ?? {},
    groupDisplay: opts.group_display,
    urlCategory: opts.url_category,
    leagueDisplay: opts.league_display ?? '',
    pointSystem: opts.point_system ?? 'standard',
    cssFiles: opts.css_files ?? [],
    teamRenameMap: opts.team_rename_map ?? {},
    tiebreakOrder: opts.tiebreak_order ?? ['goal_diff', 'goal_get'],
  };
}
