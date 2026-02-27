// Sorting and line-calculation utilities for team standings.

import type { PointSystem } from '../types/config';
import type { TeamData } from '../types/match';
import { getMaxPointsPerGame } from './point-calculator';

// Numeric fields extracted from TeamData for point/relegation line calculations.
// All fields are guaranteed to exist once buildTeamColumn has run.
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

// Known tiebreaker keys that can appear in tiebreak_order.
const KNOWN_TIEBREAKERS = new Set(['head_to_head', 'goal_diff', 'goal_get', 'wins']);

/**
 * Groups team names by equal value of `keyFn`. Preserves order of the first
 * occurrence of each distinct value.
 */
function groupByEqual(teamNames: string[], keyFn: (t: string) => number): string[][] {
  const groups: string[][] = [];
  const map = new Map<number, string[]>();
  for (const t of teamNames) {
    const v = keyFn(t);
    let arr = map.get(v);
    if (!arr) {
      arr = [];
      map.set(v, arr);
      groups.push(arr);
    }
    arr.push(t);
  }
  return groups;
}

/**
 * Computes head-to-head (H2H) mini-table points and goal difference
 * among the given tied teams, using match data from the full team map.
 *
 * Returns a map of team name → { h2hPoints, h2hGoalDiff } or null
 * if any pair has zero completed head-to-head matches (insufficient data).
 */
function computeH2H(
  tiedTeams: string[],
  allTeams: Record<string, TeamData>,
  disp: boolean,
): Map<string, { h2hPoints: number; h2hGoalDiff: number }> | null {
  const tiedSet = new Set(tiedTeams);
  const result = new Map<string, { h2hPoints: number; h2hGoalDiff: number }>();
  for (const t of tiedTeams) {
    result.set(t, { h2hPoints: 0, h2hGoalDiff: 0 });
  }

  // Track which pairs have at least one completed match
  const pairHasMatch = new Set<string>();

  for (const teamName of tiedTeams) {
    const td = allTeams[teamName];
    if (!td) continue;
    for (const m of td.df) {
      if (!tiedSet.has(m.opponent)) continue;
      if (!m.has_result) continue;
      // In disp mode, only count matches within the display window
      // (matches after targetDate have has_result=true but we rely on
      // the caller having already computed stats with the correct targetDate)
      if (disp && m.match_date > (td as unknown as Record<string, string>)['_targetDate']) continue;

      const pairKey = [teamName, m.opponent].sort().join('|');
      pairHasMatch.add(pairKey);

      const entry = result.get(teamName)!;
      entry.h2hPoints += m.point;
      const gGet = parseInt(m.goal_get, 10) || 0;
      const gLose = parseInt(m.goal_lose, 10) || 0;
      entry.h2hGoalDiff += gGet - gLose;
    }
  }

  // Check that every pair of tied teams has at least one H2H match
  for (let i = 0; i < tiedTeams.length; i++) {
    for (let j = i + 1; j < tiedTeams.length; j++) {
      const pairKey = [tiedTeams[i], tiedTeams[j]].sort().join('|');
      if (!pairHasMatch.has(pairKey)) return null; // insufficient data
    }
  }

  return result;
}

/**
 * Resolves a single tiebreaker for a group of tied teams, splitting them
 * into sub-groups. Returns the list of sub-groups (each sorted internally).
 */
function applyTiebreaker(
  tiedTeams: string[],
  key: string,
  allTeams: Record<string, TeamData>,
  disp: boolean,
): string[][] {
  if (tiedTeams.length <= 1) return [tiedTeams];

  if (key === 'head_to_head') {
    const h2h = computeH2H(tiedTeams, allTeams, disp);
    if (!h2h) return [tiedTeams]; // fallthrough: treat as still-tied

    // First sort by H2H points, then by H2H goal difference
    const sorted = [...tiedTeams].sort((a, b) => {
      const diff = h2h.get(b)!.h2hPoints - h2h.get(a)!.h2hPoints;
      if (diff !== 0) return diff;
      return h2h.get(b)!.h2hGoalDiff - h2h.get(a)!.h2hGoalDiff;
    });

    return groupByEqual(sorted, (t) => {
      const e = h2h.get(t)!;
      // Combine points and goal diff into a single comparable value.
      // Points have much higher weight to ensure they are compared first.
      return e.h2hPoints * 10000 + e.h2hGoalDiff;
    });
  }

  // Stat-based tiebreakers
  const attrMap: Record<string, string> = {
    goal_diff: 'goal_diff',
    goal_get: 'goal_get',
    wins: 'win',
  };
  const attr = attrMap[key];
  if (!attr) {
    console.warn(`Unknown tiebreaker key: "${key}" — skipping`);
    return [tiedTeams];
  }

  const sorted = [...tiedTeams].sort((a, b) =>
    calcCompare(getTeamAttr(allTeams[a], attr, disp), getTeamAttr(allTeams[b], attr, disp)),
  );
  return groupByEqual(sorted, (t) => getTeamAttr(allTeams[t], attr, disp));
}

/**
 * Returns team names sorted by the given sort key, with configurable tiebreakers.
 * @param teams         - Single-group team map (team name → TeamData)
 * @param sortKey       - Field name to sort by (e.g. 'point', 'disp_avlbl_pt')
 * @param tiebreakOrder - Ordered list of tiebreaker keys (default: ['goal_diff', 'goal_get'])
 * @returns Sorted list of team names, highest first
 */
export function getSortedTeamList(
  teams: Record<string, TeamData>,
  sortKey: string,
  tiebreakOrder: string[] = ['goal_diff', 'goal_get'],
): string[] {
  const disp = sortKey.startsWith('disp_');

  // Warn about unknown tiebreaker keys (once per call)
  for (const key of tiebreakOrder) {
    if (!KNOWN_TIEBREAKERS.has(key)) {
      console.warn(`Unknown tiebreaker key in tiebreak_order: "${key}"`);
    }
  }

  // 1. Initial sort by primary key
  const primarySorted = Object.keys(teams).sort((a, b) => {
    const getVal = (t: string) =>
      (teams[t] as unknown as Record<string, number | undefined>)[sortKey] ?? 0;
    let compare = calcCompare(getVal(a), getVal(b));
    if (compare !== 0) return compare;

    // For avlbl_pt sort, use point as implicit secondary before tiebreakers
    if (sortKey.endsWith('avlbl_pt')) {
      const subKey = sortKey.replace('avlbl_pt', 'point');
      const getSubVal = (t: string) =>
        (teams[t] as unknown as Record<string, number | undefined>)[subKey] ?? 0;
      compare = calcCompare(getSubVal(a), getSubVal(b));
    }
    return compare;
  });

  // 2. Group by equal primary key value
  let groups = groupByEqual(primarySorted, (t) => {
    let val = (teams[t] as unknown as Record<string, number | undefined>)[sortKey] ?? 0;
    if (sortKey.endsWith('avlbl_pt')) {
      const subKey = sortKey.replace('avlbl_pt', 'point');
      const subVal = (teams[t] as unknown as Record<string, number | undefined>)[subKey] ?? 0;
      val = val * 100000 + subVal;
    }
    return val;
  });

  // 3. Apply tiebreakers to each group of tied teams
  for (const key of tiebreakOrder) {
    const newGroups: string[][] = [];
    for (const group of groups) {
      if (group.length <= 1) {
        newGroups.push(group);
      } else {
        newGroups.push(...applyTiebreaker(group, key, teams, disp));
      }
    }
    groups = newGroups;
  }

  // 4. Flatten
  return groups.flat();
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
