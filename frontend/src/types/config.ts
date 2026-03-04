// Types and constants for competition configuration.

import type { MatchResult } from './match';

/** Points awarded for each match result under each scoring system. */
export const POINT_MAPS = {
  'standard':       { win: 3, pk_win: 2, pk_loss: 1, draw: 1, loss: 0 },
  'victory-count':  { win: 1, pk_win: 1, pk_loss: 0, draw: 0, loss: 0 },
} satisfies Record<string, Record<MatchResult, number>>;

// Derived from POINT_MAPS keys. To add a new scoring system, add an entry above.
export type PointSystem = keyof typeof POINT_MAPS;

/**
 * Height-unit multiplier per point: how many CSS height units (25 px each)
 * one earned point occupies in the bar graph.
 *
 * For victory-count (1993-94) each win = 1 pt, but the box should be the same
 * visual size as a 3-pt win under the standard system → scale = 3.
 */
export const POINT_HEIGHT_SCALE: Record<PointSystem, number> = {
  'standard':      1,
  'victory-count': 3,
};
