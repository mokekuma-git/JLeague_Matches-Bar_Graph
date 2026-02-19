// Types for the structure of season_map.json.
//
// Actual shape of season_map.json:
// {
//   "1": {                               ← category (matches Python's category)
//     "2026": [10, 1, 2, ["鹿島", ...]], ← normal season
//     "2026East": [10, 0, 0, [...], {}, {"group_display": "EAST"}] ← sub-season
//   }
// }

// Map of rank → CSS class name (season_map index 4).
// Example: { "3": "promoted_playoff" }
export type RankClassMap = Record<string, string>;

// Season-specific extra info (season_map index 5).
// Example: { "group_display": "EAST", "url_category": "2j3" }
// When adding a new key, always define it here first.
export interface SeasonExtraInfo {
  group_display?: string;  // Display group name shown as groupHead text in HTML
  url_category?: string;   // Overrides the category segment in the scraping URL
}

// Raw array format as loaded from season_map.json (tuple type).
// Follows the CLAUDE.md definition:
//   [teamCount, promotionCount, relegationCount, teams, rankClass?, extra?]
export type RawSeasonEntry = [
  number,            // [0] number of teams
  number,            // [1] promotion slots
  number,            // [2] relegation slots
  string[],          // [3] team list (ordered by previous season finish)
  RankClassMap?,     // [4] optional: rank → CSS class map
  SeasonExtraInfo?,  // [5] optional: season-specific extra info
];

// category → season name → entry (represents the entire season_map.json)
export type SeasonMap = Record<string, Record<string, RawSeasonEntry>>;

// Object form of RawSeasonEntry for readable property access.
// Use parseSeasonEntry() to convert from the raw array.
export interface SeasonInfo {
  teamCount: number;
  promotionCount: number;
  relegationCount: number;
  teams: string[];
  rankClass: RankClassMap;   // Empty object {} when omitted
  extra: SeasonExtraInfo;    // Empty object {} when omitted
}

// Converts a RawSeasonEntry tuple into a SeasonInfo object.
// Usage: const info = parseSeasonEntry(SEASON_MAP['1']['2026']);
export function parseSeasonEntry(entry: RawSeasonEntry): SeasonInfo {
  return {
    teamCount: entry[0],
    promotionCount: entry[1],
    relegationCount: entry[2],
    teams: entry[3],
    rankClass: entry[4] ?? {},
    extra: entry[5] ?? {},
  };
}
