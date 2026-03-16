// CSV parsing: converts PapaParse-processed rows into a TeamMap.

import type { PointSystem } from '../types/config';
import { TeamStats } from '../types/match';
import type { RawMatchRow, TeamMap, TeamMatch } from '../types/match';
import { dateFormat } from './date-utils';
import { getPointFromResult } from './point-calculator';
import { t } from '../i18n';

/** CSV status values — not translated (must match CSV data vocabulary). */
const CSV_STATUS_FINISHED = '試合終了';
const CSV_STATUS_VS = 'ＶＳ';
const CSV_STATUS_LIVE = '速報中';

function parseOptionalInt(value: string | undefined): number | null {
  if (value == null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Returns the display status string for a match row.
 * @param match - RawMatchRow object (must be normalized first)
 * @returns Display status string
 */
function makeStatusAttr(match: RawMatchRow): string {
  if (match.status === undefined) {
    return (match.home_goal && match.away_goal) ? CSV_STATUS_FINISHED : '';
  }
  if (match.status === CSV_STATUS_VS) return t('tip.matchStatus.started');
  return match.status.replace(CSV_STATUS_LIVE, '');
}

/**
 * Returns true if the match is currently being played (live).
 * @param match - RawMatchRow object (must be normalized first)
 * @returns True if the match is live, false otherwise
 */
function makeLiveAttr(match: RawMatchRow): boolean {
  return match.status?.includes(CSV_STATUS_LIVE) ?? false;
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
  const hasGroupColumn = fields.includes('group');

  for (const match of data) {
    const csvGroup = hasGroupColumn ? match.group : undefined;
    const group = (csvGroup && csvGroup !== '') ? csvGroup : (defaultGroup ?? 'DefaultGroup');

    if (!(group in teamMap)) {
      teamMap[group] = {};
      for (const teamName of teamList) {
        teamMap[group][teamName] = { df: [], latestStats: new TeamStats(), displayStats: new TeamStats() };
      }
    }
    if (!(match.home_team in teamMap[group])) teamMap[group][match.home_team] = { df: [], latestStats: new TeamStats(), displayStats: new TeamStats() };
    if (!(match.away_team in teamMap[group])) teamMap[group][match.away_team] = { df: [], latestStats: new TeamStats(), displayStats: new TeamStats() };

    let matchDateStr = match.match_date;
    const matchDate = new Date(match.match_date);
    if (!isNaN(matchDate.getTime())) matchDateStr = dateFormat(matchDate);

    const homeGoal = parseOptionalInt(match.home_goal);
    const awayGoal = parseOptionalInt(match.away_goal);
    const sectionNo = parseOptionalInt(match.section_no) ?? 0;
    const homePk = parseOptionalInt(match.home_pk_score);
    const awayPk = parseOptionalInt(match.away_pk_score);
    const homeScoreEx = parseOptionalInt(match.home_score_ex);
    const awayScoreEx = parseOptionalInt(match.away_score_ex);
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
      point: getPointFromResult(match.home_goal, match.away_goal, homeScoreEx, awayScoreEx, homePk, awayPk, pointSystem),
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
      point: getPointFromResult(match.away_goal, match.home_goal, awayScoreEx, homeScoreEx, awayPk, homePk, pointSystem),
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
