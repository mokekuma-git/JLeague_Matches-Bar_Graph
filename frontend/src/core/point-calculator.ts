// Point calculation logic from match results.
//
// Scoring rules vary by PointSystem:
//   standard:       Win 3 / Draw 1 / Loss 0 / PK-win 2 / PK-loss 1
//   old-two-points: Win 2 / Draw 1 / Loss 0  (no PK in this system)

import type { PointSystem } from '../types/config';

/** Returns the maximum points earnable per game under the given point system. */
export function getMaxPointsPerGame(ps: PointSystem = 'standard'): number {
  return ps === 'old-two-points' ? 2 : 3;
}

/** Returns the points awarded for a win under the given point system. */
export function getWinPoints(ps: PointSystem = 'standard'): number {
  return ps === 'old-two-points' ? 2 : 3;
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
  const winPts = getWinPoints(pointSystem);
  if (goalGet > goalLose) return winPts;
  if (goalGet < goalLose) return 0;
  // Draw after 90 min → determine by PK result
  if (pkGet !== null && pkLose !== null) {
    return pkGet > pkLose ? winPts - 1 : 1;
  }
  return 1;
}
