// Pure HTML-generation helpers: tooltip content, team stats, and rank class.
// None of these functions access the DOM or global state.

import type { TeamMatch, TeamStats } from '../types/match';
import type { SeasonInfo } from '../types/season';
import { dateOnly, timeFormat } from '../core/date-utils';

/** Tooltip body for a win or future match: MM/DD + opponent + score (if played) + stadium. */
export function makeWinContent(row: TeamMatch, matchDate: string): string {
  const scoreLine = row.goal_get != null && row.goal_lose != null
    ? `<br/>${row.goal_get}-${row.goal_lose}` : '';
  return `${dateOnly(matchDate)} ${row.opponent}${scoreLine}<br/>${row.stadium}`;
}

/** Tooltip body for a 2-pt PK win: same as win but includes PK scores in parentheses. */
export function makePkWinContent(row: TeamMatch, matchDate: string): string {
  return `${dateOnly(matchDate)} ${row.opponent}<br/>${row.goal_get}-${row.goal_lose} (${row.pk_get}-${row.pk_lose})<br/>${row.stadium}`;
}

/** Tooltip body for a 1-pt draw or PK loss: minimal—MM/DD and opponent only. */
export function makeDrawContent(row: TeamMatch, matchDate: string): string {
  return `${dateOnly(matchDate)} ${row.opponent}`;
}

/** Full match details for draw/loss tooltips: section number, time, date, opponent, score, stadium. */
export function makeFullContent(row: TeamMatch, matchDate: string): string {
  return `(${row.section_no}) ${timeFormat(row.start_time)}<br/>${dateOnly(matchDate)} ${row.opponent}<br/>${row.goal_get}-${row.goal_lose} ${row.stadium}`;
}

/**
 * Generates the stats HTML shown in the team name tooltip.
 * Caller selects the appropriate TeamStats (latestStats or displayStats).
 * hasPk=true → includes PK win/loss counts (omitted when the season has no PK matches).
 */
export function makeTeamStats(stats: TeamStats, disp: boolean, hasPk = false): string {
  const label = disp ? '表示時の状態' : '最新の状態';
  const rc = stats.resultCounts;
  const pkLine = hasPk ? ` ${rc.pk_win}PK勝 ${rc.pk_loss}PK負` : '';
  return `${label}<br/>${rc.win}勝 ${rc.draw}分 ${rc.loss}敗${pkLine}<br/>`
    + `勝点${stats.point}, 最大${stats.avlbl_pt}<br/>`
    + `${stats.goal_get}得点, ${stats.goal_get - stats.goal_diff}失点<br/>`
    + `得失点差: ${stats.goal_diff}`;
}

/** Joins loss-match content strings with <hr/> dividers. */
export function joinLossBox(lossBox: string[]): string {
  return lossBox.join('<hr/>');
}

/**
 * Returns the CSS class name for a given rank within a season.
 * Priority: custom rankClass entry → 'promoted' → 'relegated' → '' (no class).
 */
export function getRankClass(rank: number, seasonInfo: SeasonInfo): string {
  const custom = seasonInfo.rankClass[String(rank)];
  if (custom) return custom;
  if (rank <= seasonInfo.promotionCount) return 'promoted';
  if (rank > seasonInfo.teamCount - seasonInfo.relegationCount) return 'relegated';
  return '';
}

