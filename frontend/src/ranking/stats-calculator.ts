// Stats accumulation for team data: port of the stats part of make_html_column.
// Populates latestStats and displayStats on TeamData in place.

import type { PointSystem } from '../types/config';
import { TeamStats } from '../types/match';
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
    if (matchSortKey === 'section_no') return a.section_no - b.section_no;
    const vA = a.match_date;
    const vB = b.match_date;
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
 *
 * Uses pkGet vs pkLose comparison (not point values) to distinguish PK win
 * from PK loss, because under 'old-two-points' both award the same 1 point.
 */
export function classifyResult(
  point: number,
  pkGet: number | null,
  pkLose: number | null,
  pointSystem: PointSystem,
): MatchResult {
  const winPt = getWinPoints(pointSystem);
  if (point >= winPt) return 'win';
  if (point > 0 && pkGet !== null && pkLose !== null) {
    return pkGet > pkLose ? 'pk_win' : 'pk_loss';
  }
  if (point >= 1) return 'draw';
  return 'loss';
}

// Initializes latestStats/displayStats on teamData and accumulates them from teamData.df.
// Also sorts teamData.df. Mutates teamData in place.
// targetDate: 'YYYY/MM/DD' — matches on or before this date count toward displayStats.
export function calculateTeamStats(
  teamData: TeamData,
  targetDate: string,
  matchSortKey: MatchSortKey,
  pointSystem: PointSystem = 'standard',
): void {
  const maxPt = getMaxPointsPerGame(pointSystem);
  teamData.latestStats = new TeamStats();
  teamData.displayStats = new TeamStats();

  sortTeamMatches(teamData, targetDate, matchSortKey);

  for (const row of teamData.df) {
    if (row.status === '試合中止') continue;
    if (!row.has_result) {
      teamData.latestStats.addUnplayedMatch(row.opponent, maxPt);
      teamData.displayStats.addUnplayedMatch(row.opponent, maxPt);
    } else {
      const cls = classifyResult(row.point, row.pk_get, row.pk_lose, pointSystem);
      teamData.latestStats.recordMatch(cls, row.goal_get ?? 0, row.goal_lose ?? 0, row.point);
      if (row.match_date <= targetDate) {
        teamData.displayStats.recordMatch(cls, row.goal_get ?? 0, row.goal_lose ?? 0, row.point);
      } else {
        teamData.displayStats.addUnplayedMatch(row.opponent, maxPt);
      }
    }
  }
  teamData.latestStats.finalize();
  teamData.displayStats.finalize();
}
