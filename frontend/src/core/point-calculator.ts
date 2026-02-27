// Point calculation logic from match results.
//
// Each PointSystem defines a mapping from MatchResult to points awarded.
// New scoring systems can be added by extending POINT_MAPS.

import type { PointSystem } from '../types/config';
import type { MatchResult } from '../types/match';

/** Points awarded for each match result under each scoring system. */
const POINT_MAPS: Record<PointSystem, Record<MatchResult, number>> = {
  'standard':       { win: 3, pk_win: 2, pk_loss: 1, draw: 1, loss: 0 },
  'old-two-points': { win: 2, pk_win: 1, pk_loss: 1, draw: 1, loss: 0 },
};

/** Returns the maximum points earnable per game under the given point system. */
export function getMaxPointsPerGame(ps: PointSystem = 'standard'): number {
  return POINT_MAPS[ps].win;
}

/** Returns the points awarded for a win under the given point system. */
export function getWinPoints(ps: PointSystem = 'standard'): number {
  return POINT_MAPS[ps].win;
}

/**
 * Returns the points earned by the team that scored `goalGet` goals.
 *
 * @param goalGet  - Goals scored by this team (CSV string; empty string means not played)
 * @param goalLose - Goals scored by the opponent (CSV string)
 * @param _hasExtra - Reserved for future use (extra time flag); currently unused
 * @param pkGet   - PK goals scored by this team (null if no PK shootout)
 * @param pkLose  - PK goals scored by the opponent (null if no PK shootout)
 * @param pointSystem - Scoring system to use
 */
export function getPointFromResult(
  goalGet: string,
  goalLose: string,
  _hasExtra: boolean = false,
  pkGet: number | null = null,
  pkLose: number | null = null,
  pointSystem: PointSystem = 'standard',
): number {
  if (!(goalGet && goalLose)) return 0;
  const map = POINT_MAPS[pointSystem];
  if (goalGet > goalLose) return map.win;
  if (goalGet < goalLose) return map.loss;
  // Draw after 90 min → determine by PK result
  if (pkGet !== null && pkLose !== null) {
    return pkGet > pkLose ? map.pk_win : map.pk_loss;
  }
  return map.draw;
}
