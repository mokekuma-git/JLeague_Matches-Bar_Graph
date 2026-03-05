// Point calculation logic from match results.
//
// Each PointSystem defines a mapping from MatchResult to points awarded.
// New scoring systems can be added by extending POINT_MAPS.

import { POINT_MAPS, POINT_HEIGHT_SCALE } from '../types/config';
import type { PointSystem } from '../types/config';

/** Returns the maximum points earnable per game under the given point system. */
export function getMaxPointsPerGame(ps: PointSystem = 'standard'): number {
  return POINT_MAPS[ps].win;
}

/** Returns the points awarded for a win under the given point system. */
export function getWinPoints(ps: PointSystem = 'standard'): number {
  return POINT_MAPS[ps].win;
}

/** Returns the height-unit multiplier for one earned point under the given point system.
 *  Defaults to 1 for systems not listed in POINT_HEIGHT_SCALE. */
export function getPointHeightScale(ps: PointSystem = 'standard'): number {
  return POINT_HEIGHT_SCALE[ps] ?? 1;
}

/**
 * Returns the points earned by the team that scored `goalGet` goals.
 *
 * Extra-time wins are detected via scoreExGet/scoreExLose: if extra-time data
 * is present (non-null) and the team won the match, it is classified as ex_win.
 * Note: the final score (goalGet/goalLose) already includes extra-time goals,
 * so a V-goal win still satisfies goalGet > goalLose.
 *
 * @param goalGet     - Goals scored by this team (CSV string; empty string means not played)
 * @param goalLose    - Goals scored by the opponent (CSV string)
 * @param scoreExGet  - Extra-time goals by this team (null if no extra time)
 * @param scoreExLose - Extra-time goals by the opponent (null if no extra time)
 * @param pkGet       - PK goals scored by this team (null if no PK shootout)
 * @param pkLose      - PK goals scored by the opponent (null if no PK shootout)
 * @param pointSystem - Scoring system to use
 */
export function getPointFromResult(
  goalGet: string,
  goalLose: string,
  scoreExGet: number | null = null,
  scoreExLose: number | null = null,
  pkGet: number | null = null,
  pkLose: number | null = null,
  pointSystem: PointSystem = 'standard',
): number {
  if (!(goalGet && goalLose)) return 0;
  const map = POINT_MAPS[pointSystem];
  const hasExtra = scoreExGet !== null && scoreExLose !== null;
  if (goalGet > goalLose) return hasExtra ? map.ex_win : map.win;
  if (goalGet < goalLose) return hasExtra ? map.ex_loss : map.loss;
  // Tied after 90 min → PK or draw
  if (pkGet !== null && pkLose !== null) {
    return pkGet > pkLose ? map.pk_win : map.pk_loss;
  }
  return map.draw;
}
