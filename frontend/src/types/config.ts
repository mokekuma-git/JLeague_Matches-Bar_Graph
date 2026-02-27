// Types and constants for competition configuration.

import type { MatchResult } from './match';

/** Points awarded for each match result under each scoring system. */
export const POINT_MAPS = {
  'standard':       { win: 3, pk_win: 2, pk_loss: 1, draw: 1, loss: 0 },
  'old-two-points': { win: 2, pk_win: 1, pk_loss: 1, draw: 1, loss: 0 },
} satisfies Record<string, Record<MatchResult, number>>;

// Derived from POINT_MAPS keys. To add a new scoring system, add an entry above.
export type PointSystem = keyof typeof POINT_MAPS;
