// Types for competition and category configuration.
//
// Corresponds to the Python-side "category" concept.
// Keys in season_map.json ("1", "2", "3", etc.) map to CategoryConfig.category.

// Points calculation rule.
// PK win/loss is detected automatically from the presence of
// home_pk_score/away_pk_score columns in the CSV, so it is not included here.
export type PointSystem =
  | 'standard'        // win 3 / draw 1 / loss 0  (standard J.League rule)
  | 'group-stage'     // standard + head-to-head tiebreaker within group (World Cup qualifiers, etc.)
  | 'old-two-points'  // win 2 / draw 1 / loss 0  (used in 1993–1994, etc.)
  ;

// Sub-season (group) configuration.
// Corresponds to the suffix part of a season name in season_map.
// Example: season name "2026East" → id: "East", name: "EAST"
export interface GroupConfig {
  id: string;    // Suffix part of the season name ("East", "EastA", etc.)
  name: string;  // Display name in HTML ("EAST", "EAST-A", etc.)
}

// Category (competition type) configuration.
// The "category" field name is kept consistent with the Python side.
export interface CategoryConfig {
  category: string;                   // Same as Python's category ("1", "2", "3")
  name: string;                       // Display name ("J1リーグ", "J2J3百年構想リーグ", etc.)
  groups?: GroupConfig[];             // Present only when the season has groups
  pointSystem: PointSystem;
  hasPromotion: boolean;
  hasRelegation: boolean;
  rankingTable: boolean;
  teamRenameMap?: Record<string, string>; // Display name mapping (old name → current name, etc.)
  csvPattern: string;                 // Pattern string for CSV file paths
  seasonMapKey: string;               // Category key in season_map.json
}
