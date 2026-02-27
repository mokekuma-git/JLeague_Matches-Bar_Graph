// Stats accumulation for team data: port of the stats part of make_html_column.
// Populates disp_* and latest fields on TeamData in place.

import type { PointSystem } from '../types/config';
import type { MatchResult, TeamData, TeamMatch } from '../types/match';
import { getMaxPointsPerGame, getWinPoints } from '../core/point-calculator';

// Priority for sorting postponed/future matches (lower = earlier in graph display).
// 0: completed, 1: postponed (no result, past date), 2: scheduled future
function getPostponedSortPriority(row: TeamMatch, targetDate: string): number {
  if (row.has_result) return 0;
  const date = row.match_date;
  if (date && /\d\d\/\d\d$/.test(date) && date <= targetDate) return 1;
  return 2;
}

// Which field of TeamMatch to use as the primary sort key within a priority group.
export type MatchSortKey = 'section_no' | 'match_date';

// Sorts teamData.df in the order used for bar graph display (preserved for later graph use).
export function sortTeamMatches(
  teamData: TeamData,
  targetDate: string,
  matchSortKey: MatchSortKey,
): void {
  teamData.df.sort((a, b) => {
    const prioA = getPostponedSortPriority(a, targetDate);
    const prioB = getPostponedSortPriority(b, targetDate);
    if (prioA !== prioB) return prioA - prioB;
    const vA = a[matchSortKey];
    const vB = b[matchSortKey];
    if (matchSortKey === 'section_no') return parseInt(vA, 10) - parseInt(vB, 10);
    if (!/\d\d\/\d\d$/.test(vA)) {
      if (!/\d\d\/\d\d$/.test(vB)) return 0;
      return 1;
    }
    if (!/\d\d\/\d\d$/.test(vB)) return -1;
    return vA < vB ? -1 : vA > vB ? 1 : 0;
  });
}

/**
 * Classifies a match result into win/pk_win/pk_loss/draw/loss.
 * Returns TeamData field names so the result can be used to index stat counters.
 */
export function classifyResult(
  point: number, pkGet: number | null, pointSystem: PointSystem,
): MatchResult {
  const winPt = getWinPoints(pointSystem);
  if (point >= winPt) return 'win';
  if (point >= 2 && pkGet !== null) return 'pk_win';
  if (point === 1 && pkGet !== null) return 'pk_loss';
  if (point === 1) return 'draw';
  return 'loss';
}

// Initializes all stat fields on teamData and accumulates them from teamData.df.
// Also sorts teamData.df. Mutates teamData in place.
// targetDate: 'YYYY/MM/DD' — matches on or before this date count toward disp_ stats.
export function calculateTeamStats(
  teamData: TeamData,
  targetDate: string,
  matchSortKey: MatchSortKey,
  pointSystem: PointSystem = 'standard',
): void {
  const maxPt = getMaxPointsPerGame(pointSystem);

  // Initialize latest stats
  teamData.point = 0;
  teamData.avlbl_pt = 0;
  teamData.goal_diff = 0;
  teamData.goal_get = 0;
  teamData.win = 0;
  teamData.pk_win = 0;
  teamData.pk_loss = 0;
  teamData.loss = 0;
  teamData.draw = 0;
  teamData.all_game = 0;
  teamData.rest_games = {};

  // Initialize display-time stats
  teamData.disp_avlbl_pt = 0;
  teamData.disp_point = 0;
  teamData.disp_goal_diff = 0;
  teamData.disp_goal_get = 0;
  teamData.disp_win = 0;
  teamData.disp_pk_win = 0;
  teamData.disp_pk_loss = 0;
  teamData.disp_loss = 0;
  teamData.disp_draw = 0;
  teamData.disp_all_game = 0;
  teamData.disp_rest_games = {};

  sortTeamMatches(teamData, targetDate, matchSortKey);

  for (const row of teamData.df) {
    if (!row.has_result) {
      // Unplayed match: counts as future for both latest and display views
      teamData.avlbl_pt += maxPt;
      teamData.disp_avlbl_pt += maxPt;
      teamData.rest_games[row.opponent] = (teamData.rest_games[row.opponent] ?? 0) + 1;
      teamData.disp_rest_games[row.opponent] = (teamData.disp_rest_games[row.opponent] ?? 0) + 1;
    } else {
      // Completed match: always counts toward latest stats
      teamData.point += row.point;
      teamData.avlbl_pt += row.point;
      teamData.all_game += 1;
      const cls = classifyResult(row.point, row.pk_get, pointSystem);
      (teamData[cls] as number) += 1;
      teamData.goal_diff += parseInt(row.goal_get, 10) - parseInt(row.goal_lose, 10);
      teamData.goal_get += parseInt(row.goal_get, 10);

      if (row.match_date <= targetDate) {
        // Within display window: also counts toward disp_ stats
        const dispKey = ('disp_' + cls) as keyof TeamData;
        (teamData[dispKey] as number) += 1;
        teamData.disp_all_game += 1;
        teamData.disp_point += row.point;
        teamData.disp_avlbl_pt += row.point;
        teamData.disp_goal_diff += parseInt(row.goal_get, 10) - parseInt(row.goal_lose, 10);
        teamData.disp_goal_get += parseInt(row.goal_get, 10);
      } else {
        // After display cutoff: treat as future for display purposes
        teamData.disp_avlbl_pt += maxPt;
        teamData.disp_rest_games[row.opponent] = (teamData.disp_rest_games[row.opponent] ?? 0) + 1;
      }
    }
  }

  teamData.avrg_pt = teamData.all_game === 0 ? 0 : teamData.point / teamData.all_game;
  teamData.disp_avrg_pt = teamData.disp_all_game === 0 ? 0 : teamData.disp_point / teamData.disp_all_game;
}
