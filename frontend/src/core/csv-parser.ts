// CSV parsing: converts PapaParse-processed rows into a TeamMap.

import type { PointSystem } from '../types/config';
import type { RawMatchRow, TeamMap, TeamMatch } from '../types/match';
import { dateFormat } from './date-utils';
import { getPointFromResult } from './point-calculator';

/**
 * Normalizes column name aliases so that downstream code only needs to check
 * canonical field names.
 *
 * Known aliases:
 *   match_status → status      (ACL 2021 CSV)
 *   home_pk / away_pk → home_pk_score / away_pk_score  (1993-1998 CSVs)
 */
export function normalizeColumnAliases(match: RawMatchRow): void {
  if (match.status === undefined && match.match_status !== undefined) {
    match.status = match.match_status;
  }
  if (match.home_pk_score === undefined && match.home_pk !== undefined) {
    match.home_pk_score = match.home_pk;
  }
  if (match.away_pk_score === undefined && match.away_pk !== undefined) {
    match.away_pk_score = match.away_pk;
  }
}

/**
 * Returns the display status string for a match row.
 * @param match - RawMatchRow object (must be normalized first)
 * @returns Display status string
 */
function makeStatusAttr(match: RawMatchRow): string {
  if (match.status === undefined) {
    return (match.home_goal && match.away_goal) ? '試合終了' : '';
  }
  if (match.status === 'ＶＳ') return '開始前';
  return match.status.replace('速報中', '');
}

/**
 * Returns true if the match is currently being played (live).
 * @param match - RawMatchRow object (must be normalized first)
 * @returns True if the match is live, false otherwise
 */
function makeLiveAttr(match: RawMatchRow): boolean {
  return match.status?.includes('速報中') ?? false;
}

/**
 * Parses PapaParse-processed CSV rows into a TeamMap.
 *
 * @param data         - Parsed rows (PapaParse results.data)
 * @param fields       - Column names present in the CSV (PapaParse results.meta.fields)
 * @param teamList     - Ordered team list from season_map (index 3); used to pre-populate groups
 * @param defaultGroup - Group name to assign when the CSV has no 'group' column.
 *                       Pass null to read the group name from each row.
 *                       The string 'null' is treated as 'DefaultGroup' (matches original JS behavior).
 * @return TeamMap object structured as { [groupName]: { [teamName]: { df: TeamMatch[] } } }
 */
export function parseCsvResults(
  data: RawMatchRow[],
  fields: string[],
  teamList: string[],
  defaultGroup: string | null = null,
  pointSystem: PointSystem = 'standard',
): TeamMap {
  const teamMap: TeamMap = {};

  if (defaultGroup === 'null') defaultGroup = 'DefaultGroup';
  if (fields.includes('group')) defaultGroup = null;

  for (const match of data) {
    normalizeColumnAliases(match);
    const group = defaultGroup ?? match.group ?? 'DefaultGroup';

    if (!(group in teamMap)) {
      teamMap[group] = {};
      for (const teamName of teamList) {
        teamMap[group][teamName] = { df: [] };
      }
    }
    if (!(match.home_team in teamMap[group])) teamMap[group][match.home_team] = { df: [] };
    if (!(match.away_team in teamMap[group])) teamMap[group][match.away_team] = { df: [] };

    let matchDateStr = match.match_date;
    const matchDate = new Date(match.match_date);
    if (!isNaN(matchDate.getTime())) matchDateStr = dateFormat(matchDate);

    const homeGoal = match.home_goal ? parseInt(match.home_goal, 10) : null;
    const awayGoal = match.away_goal ? parseInt(match.away_goal, 10) : null;
    const sectionNo = parseInt(match.section_no, 10);
    const homePk = match.home_pk_score ? parseInt(match.home_pk_score, 10) : null;
    const awayPk = match.away_pk_score ? parseInt(match.away_pk_score, 10) : null;
    const homeScoreEx = match.home_score_ex ? parseInt(match.home_score_ex, 10) : null;
    const awayScoreEx = match.away_score_ex ? parseInt(match.away_score_ex, 10) : null;
    const hasResult = Boolean(match.home_goal && match.away_goal);
    const status = makeStatusAttr(match);
    const live = makeLiveAttr(match);

    const homeMatch: TeamMatch = {
      is_home: true,
      opponent: match.away_team,
      goal_get: homeGoal,
      goal_lose: awayGoal,
      pk_get: homePk,
      pk_lose: awayPk,
      score_ex_get: homeScoreEx,
      score_ex_lose: awayScoreEx,
      has_result: hasResult,
      point: getPointFromResult(match.home_goal, match.away_goal, false, homePk, awayPk, pointSystem),
      match_date: matchDateStr,
      section_no: sectionNo,
      stadium: match.stadium,
      start_time: match.start_time,
      status,
      live,
    };
    teamMap[group][match.home_team].df.push(homeMatch);

    const awayMatch: TeamMatch = {
      is_home: false,
      opponent: match.home_team,
      goal_get: awayGoal,
      goal_lose: homeGoal,
      pk_get: awayPk,
      pk_lose: homePk,
      score_ex_get: awayScoreEx,
      score_ex_lose: homeScoreEx,
      has_result: hasResult,
      point: getPointFromResult(match.away_goal, match.home_goal, false, awayPk, homePk, pointSystem),
      match_date: matchDateStr,
      section_no: sectionNo,
      stadium: match.stadium,
      start_time: match.start_time,
      status,
      live,
    };
    teamMap[group][match.away_team].df.push(awayMatch);
  }

  return teamMap;
}
