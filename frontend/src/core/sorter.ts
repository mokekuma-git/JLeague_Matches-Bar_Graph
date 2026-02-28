// Sorting and line-calculation utilities for team standings.

import type { PointSystem } from '../types/config';
import type { TeamData, TeamStats } from '../types/match';
import { getMaxPointsPerGame } from './point-calculator';

// Numeric fields for point/relegation line calculations (single-view snapshot).
interface PointCacheEntry {
  avlbl_pt: number;
  rest_games: Record<string, number>;
}

/**
 * Selects the appropriate stats view (latest or display-time) from TeamData.
 */
export function getStats(td: TeamData, disp: boolean): TeamStats {
  return disp ? td.displayStats : td.latestStats;
}

/**
 * Returns (valB ?? 0) - (valA ?? 0) for descending sort.
 */
export function calcCompare(valA: number | undefined, valB: number | undefined): number {
  return (valB ?? 0) - (valA ?? 0);
}

// Known tiebreaker keys that can appear in tiebreak_order.
const KNOWN_TIEBREAKERS = new Set(['head_to_head', 'goal_diff', 'goal_get', 'wins']);

// Accessor functions for stat-based tiebreakers.
const TIEBREAKER_ACCESSORS: Record<string, (s: TeamStats) => number> = {
  goal_diff: s => s.goal_diff,
  goal_get:  s => s.goal_get,
  wins:      s => s.resultCounts.win,
};

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
      const gGet = m.goal_get ?? 0;
      const gLose = m.goal_lose ?? 0;
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
  const accessor = TIEBREAKER_ACCESSORS[key];
  if (!accessor) {
    console.warn(`Unknown tiebreaker key: "${key}" — skipping`);
    return [tiedTeams];
  }

  const getValue = (t: string) => accessor(getStats(allTeams[t], disp));
  const sorted = [...tiedTeams].sort((a, b) => calcCompare(getValue(a), getValue(b)));
  return groupByEqual(sorted, getValue);
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
  const field = disp ? sortKey.slice(5) : sortKey;

  // Warn about unknown tiebreaker keys (once per call)
  for (const key of tiebreakOrder) {
    if (!KNOWN_TIEBREAKERS.has(key)) {
      console.warn(`Unknown tiebreaker key in tiebreak_order: "${key}"`);
    }
  }

  const getFieldVal = (t: string): number =>
    (getStats(teams[t], disp) as unknown as Record<string, number>)[field] ?? 0;

  // 1. Initial sort by primary key
  const primarySorted = Object.keys(teams).sort((a, b) => {
    let compare = calcCompare(getFieldVal(a), getFieldVal(b));
    if (compare !== 0) return compare;

    // For avlbl_pt sort, use point as implicit secondary before tiebreakers
    if (field === 'avlbl_pt') {
      compare = calcCompare(
        getStats(teams[a], disp).point,
        getStats(teams[b], disp).point,
      );
    }
    return compare;
  });

  // 2. Group by equal primary key value
  let groups = groupByEqual(primarySorted, (t) => {
    let val = getFieldVal(t);
    if (field === 'avlbl_pt') {
      val = val * 100000 + getStats(teams[t], disp).point;
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
 * Returns the minimum points guaranteeing a team ranks at `rank` or better.
 * A team with >= this value is confirmed to finish in the top `rank` positions.
 */
export function getSafetyLine(rank: number, disp: boolean, teams: Record<string, TeamData>): number {
  const sorted = Object.keys(teams).sort((a, b) =>
    getStats(teams[b], disp).avlbl_pt - getStats(teams[a], disp).avlbl_pt);
  if (rank >= sorted.length) return 0;
  return getStats(teams[sorted[rank]], disp).avlbl_pt + 1;
}

/**
 * Returns the current points of the team at `rank`, i.e. the threshold below which
 * a team has no possibility of reaching that rank.
 */
export function getPossibleLine(rank: number, disp: boolean, teams: Record<string, TeamData>): number {
  const sorted = Object.keys(teams).sort((a, b) =>
    getStats(teams[b], disp).point - getStats(teams[a], disp).point);
  if (rank <= 0 || rank > sorted.length) return 0;
  return getStats(teams[sorted[rank - 1]], disp).point;
}

/**
 * Returns the maximum points of the `rank`-th team after assuming `teamName` wins
 * all remaining head-to-head fixtures, reducing opponents' maximum points accordingly.
 *
 * Note: The sort order is computed BEFORE reducing opponents' points,
 * which preserves the original JS behavior.
 */
export function getSelfPossibleLine(
  rank: number,
  teamName: string,
  disp: boolean,
  teams: Record<string, TeamData>,
  pointSystem: PointSystem = 'standard',
): number {
  const idx = rank - 1;
  const cache: Record<string, PointCacheEntry> = {};
  for (const [name, td] of Object.entries(teams)) {
    if (name === teamName) continue;
    const s = getStats(td, disp);
    cache[name] = { avlbl_pt: s.avlbl_pt, rest_games: { ...s.rest_games } };
  }

  // Sort BEFORE reducing opponents' points (preserves original JS behavior).
  const pointSorted = Object.keys(cache).sort((a, b) =>
    cache[b].avlbl_pt - cache[a].avlbl_pt);

  const restGames = getStats(teams[teamName], disp).rest_games;
  for (const opponent of Object.keys(restGames)) {
    if (cache[opponent] !== undefined) {
      cache[opponent].avlbl_pt -= getMaxPointsPerGame(pointSystem) * (restGames[opponent] ?? 0);
    }
  }

  if (idx >= pointSorted.length) return 0;
  return cache[pointSorted[idx]].avlbl_pt;
}
