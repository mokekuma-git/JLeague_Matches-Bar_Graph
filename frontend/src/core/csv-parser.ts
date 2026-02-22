// CSV parsing: converts PapaParse-processed rows into a TeamMap.

import type { RawMatchRow, TeamMap, TeamMatch } from '../types/match';
import { dateFormat } from './date-utils';
import { getPointFromResult } from './point-calculator';

/**
 * Returns the display status string for a match row.
 * @param match - RawMatchRow object
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
 * @param match - RawMatchRow object
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
): TeamMap {
  const teamMap: TeamMap = {};

  if (defaultGroup === 'null') defaultGroup = 'DefaultGroup';
  if (fields.includes('group')) defaultGroup = null;

  for (const match of data) {
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

    const homePk = match.home_pk_score ? parseInt(match.home_pk_score) : null;
    const awayPk = match.away_pk_score ? parseInt(match.away_pk_score) : null;
    const homeScoreEx = match.home_score_ex ? parseInt(match.home_score_ex) : null;
    const awayScoreEx = match.away_score_ex ? parseInt(match.away_score_ex) : null;
    const hasResult = Boolean(match.home_goal && match.away_goal);
    const status = makeStatusAttr(match);
    const live = makeLiveAttr(match);

    const homeMatch: TeamMatch = {
      is_home: true,
      opponent: match.away_team,
      goal_get: match.home_goal,
      goal_lose: match.away_goal,
      pk_get: homePk,
      pk_lose: awayPk,
      score_ex_get: homeScoreEx,
      score_ex_lose: awayScoreEx,
      has_result: hasResult,
      point: getPointFromResult(match.home_goal, match.away_goal, false, homePk, awayPk),
      match_date: matchDateStr,
      section_no: match.section_no,
      stadium: match.stadium,
      start_time: match.start_time,
      status,
      live,
    };
    teamMap[group][match.home_team].df.push(homeMatch);

    const awayMatch: TeamMatch = {
      is_home: false,
      opponent: match.home_team,
      goal_get: match.away_goal,
      goal_lose: match.home_goal,
      pk_get: awayPk,
      pk_lose: homePk,
      score_ex_get: awayScoreEx,
      score_ex_lose: homeScoreEx,
      has_result: hasResult,
      point: getPointFromResult(match.away_goal, match.home_goal, false, awayPk, homePk),
      match_date: matchDateStr,
      section_no: match.section_no,
      stadium: match.stadium,
      start_time: match.start_time,
      status,
      live,
    };
    teamMap[group][match.away_team].df.push(awayMatch);
  }

  return teamMap;
}
