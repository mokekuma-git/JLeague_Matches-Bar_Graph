// Types for competition configuration.

// Points calculation rule.
// PK win/loss is detected automatically from the presence of
// home_pk_score/away_pk_score columns in the CSV, so it is not included here.
export type PointSystem =
  | 'standard'        // win 3 / draw 1 / loss 0  (standard J.League rule)
  | 'group-stage'     // standard + head-to-head tiebreaker within group (World Cup qualifiers, etc.)
  | 'old-two-points'  // win 2 / draw 1 / loss 0  (used in 1993–1994, etc.)
  ;
