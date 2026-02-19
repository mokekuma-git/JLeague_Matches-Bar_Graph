// Stats accumulation for team data: port of the stats part of make_html_column.
// Populates disp_* and latest fields on TeamData in place.

import type { TeamData, TeamMatch } from '../types/match';

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
    if (matchSortKey === 'section_no') return parseInt(vA) - parseInt(vB);
    if (!/\d\d\/\d\d$/.test(vA)) {
      if (!/\d\d\/\d\d$/.test(vB)) return 0;
      return 1;
    }
    if (!/\d\d\/\d\d$/.test(vB)) return -1;
    return vA < vB ? -1 : vA > vB ? 1 : 0;
  });
}

// Initializes all stat fields on teamData and accumulates them from teamData.df.
// Also sorts teamData.df. Mutates teamData in place.
// targetDate: 'YYYY/MM/DD' — matches on or before this date count toward disp_ stats.
export function calculateTeamStats(
  teamData: TeamData,
  targetDate: string,
  matchSortKey: MatchSortKey,
): void {
  // Initialize latest stats
  teamData.point = 0;
  teamData.avlbl_pt = 0;
  teamData.goal_diff = 0;
  teamData.goal_get = 0;
  teamData.win = 0;
  teamData.pk_win = 0;
  teamData.pk_loss = 0;
  teamData.lose = 0;
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
  teamData.disp_lose = 0;
  teamData.disp_draw = 0;
  teamData.disp_all_game = 0;
  teamData.disp_rest_games = {};

  sortTeamMatches(teamData, targetDate, matchSortKey);

  for (const row of teamData.df) {
    if (!row.has_result) {
      // Unplayed match: counts as future for both latest and display views
      teamData.avlbl_pt += 3;
      teamData.disp_avlbl_pt += 3;
      teamData.rest_games[row.opponent] = (teamData.rest_games[row.opponent] ?? 0) + 1;
      teamData.disp_rest_games[row.opponent] = (teamData.disp_rest_games[row.opponent] ?? 0) + 1;
    } else {
      // Completed match: always counts toward latest stats
      teamData.point += row.point;
      teamData.avlbl_pt += row.point;
      teamData.all_game += 1;
      if (row.point === 3) teamData.win += 1;
      else if (row.point === 2) teamData.pk_win += 1;
      else if (row.point === 1 && row.pk_get !== null) teamData.pk_loss += 1;
      else if (row.point === 1) teamData.draw += 1;
      else teamData.lose += 1;
      teamData.goal_diff += parseInt(row.goal_get) - parseInt(row.goal_lose);
      teamData.goal_get += parseInt(row.goal_get);

      if (row.match_date <= targetDate) {
        // Within display window: also counts toward disp_ stats
        if (row.point === 3) teamData.disp_win += 1;
        else if (row.point === 2) teamData.disp_pk_win += 1;
        else if (row.point === 1 && row.pk_get !== null) teamData.disp_pk_loss += 1;
        else if (row.point === 1) teamData.disp_draw += 1;
        else teamData.disp_lose += 1;
        teamData.disp_all_game += 1;
        teamData.disp_point += row.point;
        teamData.disp_avlbl_pt += row.point;
        teamData.disp_goal_diff += parseInt(row.goal_get) - parseInt(row.goal_lose);
        teamData.disp_goal_get += parseInt(row.goal_get);
      } else {
        // After display cutoff: treat as future for display purposes
        teamData.disp_avlbl_pt += 3;
        teamData.disp_rest_games[row.opponent] = (teamData.disp_rest_games[row.opponent] ?? 0) + 1;
      }
    }
  }

  teamData.avrg_pt = teamData.all_game === 0 ? 0 : teamData.point / teamData.all_game;
  teamData.disp_avrg_pt = teamData.disp_all_game === 0 ? 0 : teamData.disp_point / teamData.disp_all_game;
}
