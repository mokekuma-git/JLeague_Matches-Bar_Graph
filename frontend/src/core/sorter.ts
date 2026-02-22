// Sorting and line-calculation utilities for team standings.

import type { PointSystem } from '../types/config';
import type { TeamData } from '../types/match';
import { getMaxPointsPerGame } from './point-calculator';

// Numeric fields extracted from TeamData for point/relegation line calculations.
// All fields are guaranteed to exist once makeHtmlColumn has run.
export interface PointCacheEntry {
  point: number;
  avlbl_pt: number;
  disp_point: number;
  disp_avlbl_pt: number;
  rest_games: Record<string, number>;
  disp_rest_games: Record<string, number>;
}

export type PointCache = Record<string, PointCacheEntry>;

// Narrow union types for the avlbl_pt / point field name variants.
type AvlblPtKey = 'avlbl_pt' | 'disp_avlbl_pt';
type PointKey = 'point' | 'disp_point';

/**
 * Returns (valB ?? 0) - (valA ?? 0) for descending sort.
 * @param valA - First value
 * @param valB - Second value
 * @returns Difference for descending sort
 */
export function calcCompare(valA: number | undefined, valB: number | undefined): number {
  return (valB ?? 0) - (valA ?? 0);
}

/**
 * Returns teamData[attr] or teamData[disp_attr] depending on disp. Missing values treated as 0.
 * @param teamData - TeamData object
 * @param attr     - Attribute name (e.g. 'goal_diff', 'goal_get')
 * @param disp     - Whether to use the display variant (disp_ prefix)
 * @returns Value of the attribute, or 0 if missing
 */
export function getTeamAttr(teamData: TeamData, attr: string, disp: boolean): number {
  const key = (disp ? 'disp_' : '') + attr;
  return (teamData as unknown as Record<string, number | undefined>)[key] ?? 0;
}

/**
 * Sorts team names in descending order by the given numeric field.
 * Accepts either a PointCache or a team map (Record<string, TeamData>).
 * @param key   - Field name to sort by (e.g. 'avlbl_pt' or 'disp_point')
 * @param teams - Map of team names to data (can be PointCache or TeamData)
 * @returns Sorted list of team names, highest first
 */
export function getPointSortedTeamList(
  key: AvlblPtKey | PointKey,
  teams: Record<string, unknown>,
): string[] {
  return Object.keys(teams).sort((a, b) => {
    const valA = ((teams[a] as Record<string, unknown>)[key] as number | undefined) ?? 0;
    const valB = ((teams[b] as Record<string, unknown>)[key] as number | undefined) ?? 0;
    return valB - valA;
  });
}

/**
 * Returns team names sorted by the given sort key, with goal_diff and goal_get as tiebreakers.
 * @param teams   - Single-group team map (team name → TeamData)
 * @param sortKey - Field name to sort by (e.g. 'point', 'disp_avlbl_pt')
 * @returns Sorted list of team names, highest first
 */
export function getSortedTeamList(
  teams: Record<string, TeamData>,
  sortKey: string,
): string[] {
  const disp = sortKey.startsWith('disp_');
  return Object.keys(teams).sort((a, b) => {
    const getVal = (t: string) =>
      (teams[t] as unknown as Record<string, number | undefined>)[sortKey] ?? 0;
    let compare = calcCompare(getVal(a), getVal(b));
    if (compare !== 0) return compare;

    if (sortKey.endsWith('avlbl_pt')) {
      const subKey = sortKey.replace('avlbl_pt', 'point');
      const getSubVal = (t: string) =>
        (teams[t] as unknown as Record<string, number | undefined>)[subKey] ?? 0;
      compare = calcCompare(getSubVal(a), getSubVal(b));
      if (compare !== 0) return compare;
    }

    compare = calcCompare(
      getTeamAttr(teams[a], 'goal_diff', disp),
      getTeamAttr(teams[b], 'goal_diff', disp),
    );
    if (compare !== 0) return compare;

    return calcCompare(
      getTeamAttr(teams[a], 'goal_get', disp),
      getTeamAttr(teams[b], 'goal_get', disp),
    );
  });
}

/**
 * Builds a shallow point/rest-games cache from team data.
 * Used to create a mutable snapshot for safety/possible line calculations.
 * @param teams - Single-group team map (team name → TeamData)
 * @returns PointCache with numeric fields guaranteed to exist (defaulting to 0 or empty object)
 */
export function makePointCache(teams: Record<string, TeamData>): PointCache {
  const cache: PointCache = {};
  for (const teamName of Object.keys(teams)) {
    const td = teams[teamName];
    cache[teamName] = {
      point:           td.point           ?? 0,
      avlbl_pt:        td.avlbl_pt        ?? 0,
      disp_point:      td.disp_point      ?? 0,
      disp_avlbl_pt:   td.disp_avlbl_pt   ?? 0,
      rest_games:      td.rest_games      ?? {},
      disp_rest_games: td.disp_rest_games ?? {},
    };
  }
  return cache;
}

/**
 * Returns the minimum points guaranteeing a team ranks at `rank` or better.
 * A team with >= this value is confirmed to finish in the top `rank` positions.
 * @param rank  - 1-based target rank
 * @param disp  - Use display-time stats when true, latest stats when false
 * @param teams - Single-group team map
 * @returns Minimum points guaranteeing a finish at `rank` or better
 */
export function getSafetyLine(rank: number, disp: boolean, teams: Record<string, TeamData>): number {
  const key: AvlblPtKey = disp ? 'disp_avlbl_pt' : 'avlbl_pt';
  const sorted = getPointSortedTeamList(key, teams);
  // rank >= sorted.length means no competition at that position → any score guarantees it
  if (rank >= sorted.length) return 0;
  return (teams[sorted[rank]][key] ?? 0) + 1;
}

/**
 * Returns the current points of the team at `rank`, i.e. the threshold below which
 * a team has no possibility of reaching that rank.
 * @param rank  - 1-based target rank
 * @param disp  - Use display-time stats when true, latest stats when false
 * @param teams - Single-group team map
 * @returns Current points of the team at `rank`, or 0 if rank exceeds number of teams
 */
export function getPossibleLine(rank: number, disp: boolean, teams: Record<string, TeamData>): number {
  const key: PointKey = disp ? 'disp_point' : 'point';
  const sorted = getPointSortedTeamList(key, teams);
  // rank out of bounds → every team has a chance at that position
  if (rank <= 0 || rank > sorted.length) return 0;
  return teams[sorted[rank - 1]][key] ?? 0;
}

/**
 * Returns the maximum points of the `rank`-th team after assuming `teamName` wins
 * all remaining head-to-head fixtures, reducing opponents' maximum points accordingly.
 * Used to determine whether `teamName` can reach `rank` by their own results alone.
 *
 * Note: The sort order is computed BEFORE reducing opponents' points,
 * which preserves the original JS behavior.
 *
 * @param rank     - 1-based target rank
 * @param teamName - Team to test self-sufficiency for
 * @param disp     - Use display-time stats when true, latest stats when false
 * @param teams    - Single-group team map
 * @return Maximum points of the `rank`-th team after assuming `teamName` wins all remaining head-to-head fixtures
 */
export function getSelfPossibleLine(
  rank: number,
  teamName: string,
  disp: boolean,
  teams: Record<string, TeamData>,
  pointSystem: PointSystem = 'standard',
): number {
  const avlblPtKey: AvlblPtKey = disp ? 'disp_avlbl_pt' : 'avlbl_pt';
  const restGamesKey = disp ? 'disp_rest_games' : 'rest_games';
  const idx = rank - 1;

  const cache = makePointCache(teams);
  delete cache[teamName];

  // Sort BEFORE reducing opponents' points (preserves original JS behavior).
  const pointSorted = getPointSortedTeamList(avlblPtKey, cache);

  const restGames = teams[teamName][restGamesKey] ?? {};
  for (const opponent of Object.keys(restGames)) {
    if (cache[opponent] !== undefined) {
      cache[opponent][avlblPtKey] -= getMaxPointsPerGame(pointSystem) * (restGames[opponent] ?? 0);
    }
  }

  // idx out of bounds → target rank doesn't exist among competitors
  if (idx >= pointSorted.length) return 0;
  return cache[pointSorted[idx]][avlblPtKey];
}
