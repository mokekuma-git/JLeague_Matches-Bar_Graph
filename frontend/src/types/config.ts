// Types for competition configuration.

// Points calculation rule.
// PK win/loss is detected automatically from the presence of
// home_pk_score/away_pk_score columns in the CSV, so it is not included here.
// Head-to-head tiebreaking is configured via tiebreak_order, not PointSystem.
export type PointSystem =
  | 'standard'        // win 3 / draw 1 / loss 0  (standard J.League rule)
  | 'old-two-points'  // win 2 / draw 1 / loss 0  (pre-1995 world football)
  ;
