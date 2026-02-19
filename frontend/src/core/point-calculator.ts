// Point calculation logic from match results.
//
// Scoring rules:
//   Win:         3 points
//   Loss:        0 points
//   Draw:        1 point
//   PK win:      2 points  (draw after 90 min, won on PK)
//   PK loss:     1 point   (draw after 90 min, lost on PK)

/**
 * Returns the points earned by the team that scored `goalGet` goals.
 *
 * @param goalGet  - Goals scored by this team (CSV string; empty string means not played)
 * @param goalLose - Goals scored by the opponent (CSV string)
 * @param _hasExtra - Reserved for future use (extra time flag); currently unused
 * @param pkGet   - PK goals scored by this team (null if no PK shootout)
 * @param pkLose  - PK goals scored by the opponent (null if no PK shootout)
 */
export function getPointFromResult(
  goalGet: string,
  goalLose: string,
  _hasExtra: boolean = false,
  pkGet: number | null = null,
  pkLose: number | null = null,
): number {
  if (!(goalGet && goalLose)) return 0;
  if (goalGet > goalLose) return 3;
  if (goalGet < goalLose) return 0;
  // Draw after 90 min → determine by PK result
  if (pkGet !== null && pkLose !== null) {
    return pkGet > pkLose ? 2 : 1;
  }
  return 1;
}
